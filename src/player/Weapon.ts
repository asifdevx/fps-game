import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { Sound, type GunKind } from "../audio/Sound";
import { Input } from "../core/Input";
import { Particles } from "../effects/Particles";
import { Enemy } from "../enemies/Enemy";
import { EnemyManager } from "../enemies/EnemyManager";
import { Player } from "./Player";

interface WeaponDef {
  name: string;
  mag: number;
  reserve: number;
  maxReserve: number;
  interval: number; // seconds between shots
  reload: number;
  damage: number; // per pellet
  pellets: number;
  spread: number;
  auto: boolean;
  recoil: number;
  kick: number; // viewmodel kickback
  range: number;
  sound: GunKind;
  len: number; // viewmodel dimensions
  thick: number;
  color: number;
}

// Tweak these numbers to rebalance the game.
export const DEFS: WeaponDef[] = [
  {
    name: "Rifle",
    mag: 30,
    reserve: 90,
    maxReserve: 180,
    interval: 0.09,
    reload: 1.6,
    damage: 22,
    pellets: 1,
    spread: 0.012,
    auto: true,
    recoil: 0.012,
    kick: 0.06,
    range: 100,
    sound: "rifle",
    len: 0.55,
    thick: 0.08,
    color: 0x222222,
  },
  {
    name: "Pistol",
    mag: 12,
    reserve: 60,
    maxReserve: 120,
    interval: 0.22,
    reload: 1.1,
    damage: 34,
    pellets: 1,
    spread: 0.004,
    auto: false,
    recoil: 0.02,
    kick: 0.08,
    range: 100,
    sound: "pistol",
    len: 0.28,
    thick: 0.07,
    color: 0x3a3a3a,
  },
  {
    name: "Shotgun",
    mag: 6,
    reserve: 24,
    maxReserve: 48,
    interval: 0.85,
    reload: 2.2,
    damage: 14,
    pellets: 8,
    spread: 0.09,
    auto: false,
    recoil: 0.06,
    kick: 0.14,
    range: 40,
    sound: "shotgun",
    len: 0.65,
    thick: 0.09,
    color: 0x4a3a2a,
  },
];

const HEADSHOT_MULT = 2;

export interface WeaponDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  world: RAPIER.World;
  player: Player;
  enemies: EnemyManager;
  input: Input;
  particles: Particles;
  sound: Sound;
}

export class Weapon {
  reloading = false;
  aiming = false;
  /** 0..1 smoothed aim-down-sights amount. */
  aim = 0;
  onHit: (
    enemy: Enemy,
    killed: boolean,
    headshot: boolean,
    damage: number,
    point: THREE.Vector3,
  ) => void = () => {};

  private world: RAPIER.World;
  private player: Player;
  private enemies: EnemyManager;
  private input: Input;
  private particles: Particles;
  private sound: Sound;

  private cur = 0;
  private mags = DEFS.map((d) => d.mag);
  private reserves = DEFS.map((d) => d.reserve);
  private cooldown = 0;
  private reloadTimer = 0;
  private kick = 0;
  private flashTime = 0;
  private swap = 0;
  private gun = new THREE.Group();
  private models: THREE.Group[] = [];
  private flashes: THREE.Mesh[] = [];
  private light: THREE.PointLight;
  private tmpDir = new THREE.Vector3();

  constructor(d: WeaponDeps) {
    this.world = d.world;
    this.player = d.player;
    this.enemies = d.enemies;
    this.input = d.input;
    this.particles = d.particles;
    this.sound = d.sound;

    const dark = new THREE.MeshStandardMaterial({ color: 0x151515 });
    DEFS.forEach((def, i) => {
      const m = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(def.thick, def.thick * 1.2, def.len),
        new THREE.MeshStandardMaterial({ color: def.color }),
      );
      const grip = new THREE.Mesh(
        new THREE.BoxGeometry(def.thick * 0.9, 0.16, 0.08),
        dark,
      );
      grip.position.set(0, -0.11, def.len * 0.2);
      const bl = def.len * 0.35;
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, bl, 8),
        dark,
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, def.thick * 0.2, -(def.len / 2 + bl / 2));
      const flash = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffdd66 }),
      );
      flash.position.set(0, def.thick * 0.2, -(def.len / 2 + bl) - 0.03);
      flash.visible = false;
      m.add(body, grip, barrel, flash);
      if (def.sound === "shotgun") {
        const pump = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 0.07, 0.18),
          dark,
        );
        pump.position.set(0, -0.07, -def.len * 0.25);
        m.add(pump);
      }
      m.visible = i === 0;
      this.gun.add(m);
      this.models.push(m);
      this.flashes.push(flash);
    });

    // Permanent light (intensity 0 until a shot) so the light count never changes
    this.light = new THREE.PointLight(0xffcc66, 0, 8);
    this.light.position.set(0, 0, -0.9);
    this.gun.add(this.light);

    this.gun.position.set(0.22, -0.22, -0.5);
    d.camera.add(this.gun);
  }

  get name(): string {
    return DEFS[this.cur].name;
  }
  get index(): number {
    return this.cur;
  }
  get ammo(): number {
    return this.mags[this.cur];
  }
  get reserve(): number {
    return this.reserves[this.cur];
  }

  /** Gives every weapon `mags` magazines' worth of reserve ammo. */
  addAmmoAll(mags: number): void {
    DEFS.forEach((def, i) => {
      this.reserves[i] = Math.min(
        def.maxReserve,
        this.reserves[i] + Math.ceil(def.mag * mags),
      );
    });
  }

  reset(): void {
    DEFS.forEach((def, i) => {
      this.mags[i] = def.mag;
      this.reserves[i] = def.reserve;
    });
    this.models[this.cur].visible = false;
    this.cur = 0;
    this.models[0].visible = true;
    this.reloading = false;
    this.cooldown = 0;
    this.swap = 0;
    this.aim = 0;
  }

  update(dt: number): void {
    const def = DEFS[this.cur];
    this.cooldown -= dt;
    this.swap = Math.max(0, this.swap - dt * 4);

    for (let i = 0; i < DEFS.length; i++) {
      if (i !== this.cur && this.input.wasPressed(`Digit${i + 1}`))
        this.select(i);
    }

    this.aiming =
      this.input.isButtonDown(2) && !this.reloading && this.swap < 0.3;

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    } else if (
      this.input.wasPressed("KeyR") &&
      this.mags[this.cur] < def.mag &&
      this.reserves[this.cur] > 0
    ) {
      this.startReload();
    } else if (this.swap <= 0.5 && this.cooldown <= 0) {
      const wants = def.auto
        ? this.input.isButtonDown(0)
        : this.input.wasButtonPressed(0);
      if (wants) {
        if (this.mags[this.cur] > 0) {
          this.fire();
        } else {
          this.sound.empty();
          this.cooldown = 0.25;
          if (this.reserves[this.cur] > 0) this.startReload();
        }
      }
    }

    // Viewmodel animation
    const k = 1 - Math.exp(-18 * dt);
    this.kick += (0 - this.kick) * k;
    this.aim += ((this.aiming ? 1 : 0) - this.aim) * (1 - Math.exp(-14 * dt));
    this.gun.position.set(
      0.22 * (1 - this.aim),
      -0.22 + 0.06 * this.aim - this.swap * 0.35,
      -0.5 + this.kick,
    );
    this.gun.rotation.x +=
      ((this.reloading ? -0.9 : 0) - this.gun.rotation.x) * k;

    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) {
        this.flashes[this.cur].visible = false;
        this.light.intensity = 0;
      }
    }
  }

  private select(i: number): void {
    this.models[this.cur].visible = false;
    this.flashes[this.cur].visible = false;
    this.cur = i;
    this.models[i].visible = true;
    this.reloading = false;
    this.swap = 1;
    this.light.intensity = 0;
  }

  private startReload(): void {
    this.reloading = true;
    this.reloadTimer = DEFS[this.cur].reload;
    this.sound.reload(DEFS[this.cur].reload);
  }

  private finishReload(): void {
    const def = DEFS[this.cur];
    const take = Math.min(
      def.mag - this.mags[this.cur],
      this.reserves[this.cur],
    );
    this.mags[this.cur] += take;
    this.reserves[this.cur] -= take;
    this.reloading = false;
  }

  private fire(): void {
    const def = DEFS[this.cur];
    this.mags[this.cur]--;
    this.cooldown = def.interval;
    this.kick = def.kick;
    this.flashTime = 0.045;
    this.flashes[this.cur].visible = true;
    this.light.intensity = 6;
    this.sound.shoot(def.sound);
    this.player.addRecoil(
      def.recoil * (1 - 0.4 * this.aim),
      (Math.random() - 0.5) * def.recoil * 0.5,
    );

    const origin = this.player.eye;
    const spread = def.spread * (1 - 0.65 * this.aim);
    const hits = new Map<
      Enemy,
      { dmg: number; head: boolean; point: THREE.Vector3 }
    >();

    for (let p = 0; p < def.pellets; p++) {
      const dir = this.player.getAim(this.tmpDir);
      dir.x += (Math.random() - 0.5) * spread;
      dir.y += (Math.random() - 0.5) * spread;
      dir.z += (Math.random() - 0.5) * spread;
      dir.normalize();

      const ray = new RAPIER.Ray(
        { x: origin.x, y: origin.y, z: origin.z },
        { x: dir.x, y: dir.y, z: dir.z },
      );
      const hit = this.world.castRay(
        ray,
        def.range,
        true,
        undefined,
        undefined,
        undefined,
        this.player.body,
      );
      if (!hit) continue;

      const px = origin.x + dir.x * hit.timeOfImpact;
      const py = origin.y + dir.y * hit.timeOfImpact;
      const pz = origin.z + dir.z * hit.timeOfImpact;

      const enemy = this.enemies.getByCollider(hit.collider.handle);
      if (enemy && !enemy.isDead) {
        const head = enemy.isHead(py);
        const dmg = def.damage * (head ? HEADSHOT_MULT : 1);
        const e = hits.get(enemy);
        if (e) {
          e.dmg += dmg;
          e.head = e.head || head;
        } else {
          hits.set(enemy, { dmg, head, point: new THREE.Vector3(px, py, pz) });
        }
        this.particles.burst(px, py, pz, "blood", head ? 10 : 5, 3);
      } else {
        this.particles.burst(px, py, pz, "spark", 4, 2.5);
      }
    }

    if (hits.size === 0) return;
    const aimDir = this.player.getAim(this.tmpDir); // knockback direction
    for (const [enemy, h] of hits) {
      const killed = enemy.takeDamage(h.dmg, aimDir);
      this.onHit(enemy, killed, h.head, h.dmg, h.point);
    }
  }
}
