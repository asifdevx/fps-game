import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { Input } from "../core/Input";
import { Enemy } from "../enemies/Enemy";
import { EnemyManager } from "../enemies/EnemyManager";
import { Player } from "./Player";

const MAG_SIZE = 30;
const MAX_RESERVE = 150;
const FIRE_INTERVAL = 0.1;
const RELOAD_TIME = 1.6;
const DAMAGE = 25;
const HEADSHOT_MULT = 2;
const SPREAD = 0.012;
const RANGE = 100;

export class Weapon {
  ammo = MAG_SIZE;
  reserve = 90;
  reloading = false;
  onHit: (enemy: Enemy, killed: boolean, headshot: boolean) => void = () => {};

  private world: RAPIER.World;
  private player: Player;
  private enemies: EnemyManager;
  private input: Input;

  private cooldown = 0;
  private reloadTimer = 0;
  private kick = 0;
  private flashTime = 0;
  private gun = new THREE.Group();
  private flash: THREE.Mesh;

  // Pooled impact markers, so shooting never allocates
  private impacts: { mesh: THREE.Mesh; ttl: number }[] = [];
  private nextImpact = 0;

  private tmpDir = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    world: RAPIER.World,
    player: Player,
    enemies: EnemyManager,
    input: Input,
  ) {
    this.world = world;
    this.player = player;
    this.enemies = enemies;
    this.input = input;

    // Viewmodel, attached to the camera
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.1, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x222222 }),
    );
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.16, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a }),
    );
    grip.position.set(0, -0.11, 0.12);
    this.flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffdd66 }),
    );
    this.flash.position.set(0, 0, -0.32);
    this.flash.visible = false;
    this.gun.add(body, grip, this.flash);
    this.gun.position.set(0.22, -0.22, -0.5);
    camera.add(this.gun);

    const impactGeo = new THREE.SphereGeometry(0.06, 6, 6);
    const impactMat = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(impactGeo, impactMat);
      mesh.visible = false;
      scene.add(mesh);
      this.impacts.push({ mesh, ttl: 0 });
    }
  }

  addReserve(n: number): void {
    this.reserve = Math.min(MAX_RESERVE, this.reserve + n);
  }

  reset(): void {
    this.ammo = MAG_SIZE;
    this.reserve = 90;
    this.reloading = false;
    this.cooldown = 0;
  }

  update(dt: number): void {
    this.cooldown -= dt;

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    } else if (
      this.input.wasPressed("KeyR") &&
      this.ammo < MAG_SIZE &&
      this.reserve > 0
    ) {
      this.startReload();
    } else if (this.input.isButtonDown(0) && this.cooldown <= 0) {
      if (this.ammo > 0) this.fire();
      else if (this.reserve > 0) this.startReload();
    }

    // Viewmodel animation
    const k = 1 - Math.exp(-18 * dt);
    this.kick += (0 - this.kick) * k;
    this.gun.position.z = -0.5 + this.kick;
    const targetRot = this.reloading ? -0.9 : 0;
    this.gun.rotation.x += (targetRot - this.gun.rotation.x) * k;

    if (this.flashTime > 0) {
      this.flashTime -= dt;
      this.flash.visible = this.flashTime > 0;
    }

    for (const imp of this.impacts) {
      if (imp.ttl > 0) {
        imp.ttl -= dt;
        if (imp.ttl <= 0) imp.mesh.visible = false;
      }
    }
  }

  private startReload(): void {
    this.reloading = true;
    this.reloadTimer = RELOAD_TIME;
  }

  private finishReload(): void {
    const take = Math.min(MAG_SIZE - this.ammo, this.reserve);
    this.ammo += take;
    this.reserve -= take;
    this.reloading = false;
  }

  private fire(): void {
    this.ammo--;
    this.cooldown = FIRE_INTERVAL;
    this.kick = 0.06;
    this.flashTime = 0.04;
    this.flash.visible = true;
    this.player.addRecoil(0.012, (Math.random() - 0.5) * 0.006);

    // Hitscan: one ray from the eye along the aim direction, with spread
    const origin = this.player.eye;
    const dir = this.player.getAim(this.tmpDir);
    dir.x += (Math.random() - 0.5) * SPREAD;
    dir.y += (Math.random() - 0.5) * SPREAD;
    dir.z += (Math.random() - 0.5) * SPREAD;
    dir.normalize();

    const ray = new RAPIER.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: dir.x, y: dir.y, z: dir.z },
    );
    const hit = this.world.castRay(
      ray,
      RANGE,
      true,
      undefined,
      undefined,
      undefined,
      this.player.body,
    );
    if (!hit) return;

    const px = origin.x + dir.x * hit.timeOfImpact;
    const py = origin.y + dir.y * hit.timeOfImpact;
    const pz = origin.z + dir.z * hit.timeOfImpact;
    this.spawnImpact(px, py, pz);

    const enemy = this.enemies.getByCollider(hit.collider.handle);
    if (enemy && !enemy.isDead) {
      const feetY = enemy.body.translation().y - 0.8;
      const headshot = py - feetY > 1.3;
      const killed = enemy.takeDamage(
        headshot ? DAMAGE * HEADSHOT_MULT : DAMAGE,
      );
      this.onHit(enemy, killed, headshot);
    }
  }

  private spawnImpact(x: number, y: number, z: number): void {
    const imp = this.impacts[this.nextImpact];
    this.nextImpact = (this.nextImpact + 1) % this.impacts.length;
    imp.mesh.position.set(x, y, z);
    imp.mesh.visible = true;
    imp.ttl = 0.15;
  }
}
