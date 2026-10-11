import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";

export type EnemyState = "chase" | "attack" | "dead";

const ATTACK_RANGE = 1.6;
const ATTACK_INTERVAL = 1.0;
const ATTACK_DAMAGE = 10;
const DEATH_TIME = 0.4;

export class Enemy {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly mesh = new THREE.Group();
  health = 60;
  state: EnemyState = "chase";

  private world: RAPIER.World;
  private scene: THREE.Scene;
  private speed: number;
  private attackCooldown = 0.5;
  private flash = 0;
  private deathTimer = 0;
  private skin = new THREE.MeshStandardMaterial({ color: 0xb03030 });

  constructor(
    world: RAPIER.World,
    scene: THREE.Scene,
    x: number,
    z: number,
    speed: number,
  ) {
    this.world = world;
    this.scene = scene;
    this.speed = speed;

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, 0.85, z),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(0.45, 0.35),
      this.body,
    );

    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.9, 0.4),
      this.skin,
    );
    torso.position.y = 0.9;
    const legs = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.45, 0.3),
      this.skin,
    );
    legs.position.y = 0.225;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.35, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xd9a066 }),
    );
    head.position.y = 1.5;
    for (const m of [torso, legs, head]) m.castShadow = true;
    this.mesh.add(torso, legs, head);
    scene.add(this.mesh);
    this.syncMesh();
  }

  get isDead(): boolean {
    return this.state === "dead";
  }

  /** True once the death animation has finished and it can be removed. */
  get removable(): boolean {
    return this.state === "dead" && this.deathTimer >= DEATH_TIME;
  }

  /** Returns true if this hit killed the enemy. */
  takeDamage(amount: number): boolean {
    if (this.isDead) return false;
    this.health -= amount;
    this.flash = 0.08;
    if (this.health <= 0) {
      this.state = "dead";
      this.collider.setEnabled(false);
      return true;
    }
    return false;
  }

  update(
    dt: number,
    target: THREE.Vector3,
    controller: RAPIER.KinematicCharacterController,
    onAttack: (damage: number) => void,
  ): void {
    this.flash = Math.max(0, this.flash - dt);
    this.skin.emissive.setHex(this.flash > 0 ? 0xffffff : 0x000000);

    if (this.state === "dead") {
      this.deathTimer += dt;
      this.mesh.scale.y = Math.max(0.05, 1 - this.deathTimer / DEATH_TIME);
      return;
    }

    const t = this.body.translation();
    const dx = target.x - t.x;
    const dz = target.z - t.z;
    const dist = Math.hypot(dx, dz);
    this.mesh.rotation.y = Math.atan2(dx, dz);

    let mx = 0;
    let mz = 0;
    if (dist > ATTACK_RANGE) {
      this.state = "chase";
      mx = (dx / dist) * this.speed * dt;
      mz = (dz / dist) * this.speed * dt;
    } else {
      this.state = "attack";
      this.attackCooldown -= dt;
      if (this.attackCooldown <= 0) {
        this.attackCooldown = ATTACK_INTERVAL;
        onAttack(ATTACK_DAMAGE);
      }
    }

    controller.computeColliderMovement(this.collider, {
      x: mx,
      y: -3 * dt,
      z: mz,
    });
    const m = controller.computedMovement();
    this.body.setNextKinematicTranslation({
      x: t.x + m.x,
      y: t.y + m.y,
      z: t.z + m.z,
    });
    this.syncMesh(t.x + m.x, t.y + m.y, t.z + m.z);
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.world.removeRigidBody(this.body); // also removes its collider
  }

  private syncMesh(x?: number, y?: number, z?: number): void {
    const t = this.body.translation();
    this.mesh.position.set(x ?? t.x, (y ?? t.y) - 0.8, z ?? t.z);
  }
}
