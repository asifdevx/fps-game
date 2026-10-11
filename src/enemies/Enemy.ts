import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";

export type EnemyKind = "grunt" | "runner" | "tank" | "shooter";
export type EnemyState = "chase" | "attack" | "dead";

interface Spec {
  health: number;
  speed: number;
  damage: number;
  scale: number;
  color: number;
  dot: string; // radar color
  score: number;
  ranged: boolean;
}

export const SPECS: Record<EnemyKind, Spec> = {
  grunt: {
    health: 60,
    speed: 2.8,
    damage: 10,
    scale: 1,
    color: 0xb03030,
    dot: "#ff5050",
    score: 100,
    ranged: false,
  },
  runner: {
    health: 30,
    speed: 5.5,
    damage: 6,
    scale: 0.85,
    color: 0xd0a020,
    dot: "#ffd030",
    score: 120,
    ranged: false,
  },
  tank: {
    health: 240,
    speed: 1.8,
    damage: 25,
    scale: 1.4,
    color: 0x4a3a7a,
    dot: "#b070ff",
    score: 300,
    ranged: false,
  },
  shooter: {
    health: 45,
    speed: 2.4,
    damage: 8,
    scale: 1,
    color: 0x2a8a8a,
    dot: "#30e0e0",
    score: 150,
    ranged: true,
  },
};

export interface EnemyContext {
  target: THREE.Vector3; // player eye position
  playerCollider: RAPIER.Collider;
  controller: RAPIER.KinematicCharacterController;
  /** `from` is a scratch vector: read it immediately, don't store it. */
  onAttack: (damage: number, from: THREE.Vector3, ranged: boolean) => void;
}

const ATTACK_RANGE = 1.6;
const ATTACK_INTERVAL = 1.0;
const DEATH_TIME = 0.4;

export class Enemy {
  readonly kind: EnemyKind;
  readonly spec: Spec;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly mesh = new THREE.Group();
  health: number;
  state: EnemyState = "chase";

  private world: RAPIER.World;
  private scene: THREE.Scene;
  private speed: number;
  private skin: THREE.MeshStandardMaterial;

  private attackCooldown = 0.5;
  private shootTimer = 1 + Math.random();
  private losTimer = 0;
  private hasLos = false;
  private windup = false;
  private orbitDir = Math.random() < 0.5 ? 1 : -1;
  private orbitTimer = 1 + Math.random() * 2;
  private flash = 0;
  private deathTimer = 0;
  private knock = new THREE.Vector3();
  private stuck = 0;
  private strafeTime = 0;
  private strafeDir = 1;
  private pos = new THREE.Vector3();

  constructor(
    world: RAPIER.World,
    scene: THREE.Scene,
    kind: EnemyKind,
    x: number,
    z: number,
    speedMul: number,
  ) {
    this.world = world;
    this.scene = scene;
    this.kind = kind;
    this.spec = SPECS[kind];
    this.health = this.spec.health;
    this.speed = this.spec.speed * speedMul;
    const s = this.spec.scale;

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        x,
        0.8 * s + 0.05,
        z,
      ),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(0.45 * s, 0.35 * s),
      this.body,
    );

    this.skin = new THREE.MeshStandardMaterial({ color: this.spec.color });
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
    const parts: THREE.Mesh[] = [torso, legs, head];
    if (this.spec.ranged) {
      const gun = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x222222 }),
      );
      gun.position.set(0.4, 1.0, 0.3);
      parts.push(gun);
    }
    for (const p of parts) {
      p.castShadow = true;
      this.mesh.add(p);
    }
    this.mesh.scale.setScalar(s);
    scene.add(this.mesh);
    this.syncMesh();
  }

  get isDead(): boolean {
    return this.state === "dead";
  }

  get removable(): boolean {
    return this.state === "dead" && this.deathTimer >= DEATH_TIME;
  }

  /** World-space Y check against this enemy's head height. */
  isHead(y: number): boolean {
    const s = this.spec.scale;
    return y - (this.body.translation().y - 0.8 * s) > 1.3 * s;
  }

  /** Returns true if this hit killed the enemy. `dir` pushes it back. */
  takeDamage(amount: number, dir?: THREE.Vector3): boolean {
    if (this.isDead) return false;
    this.health -= amount;
    this.flash = 0.08;
    if (dir) {
      const f = this.kind === "tank" ? 0.8 : 3;
      this.knock.x += dir.x * f;
      this.knock.z += dir.z * f;
    }
    if (this.health <= 0) {
      this.state = "dead";
      this.windup = false;
      this.collider.setEnabled(false);
      return true;
    }
    return false;
  }

  update(dt: number, ctx: EnemyContext): void {
    this.flash = Math.max(0, this.flash - dt);
    this.skin.emissive.setHex(
      this.flash > 0 ? 0xffffff : this.windup ? 0xff3300 : 0x000000,
    );

    const s = this.spec.scale;
    if (this.state === "dead") {
      this.deathTimer += dt;
      this.mesh.scale.y = s * Math.max(0.05, 1 - this.deathTimer / DEATH_TIME);
      return;
    }

    const t = this.body.translation();
    const dx = ctx.target.x - t.x;
    const dz = ctx.target.z - t.z;
    const dist = Math.hypot(dx, dz) || 0.0001;
    const nx = dx / dist;
    const nz = dz / dist;
    this.mesh.rotation.y = Math.atan2(dx, dz);

    const sp = this.speed;
    let mx = 0;
    let mz = 0;

    if (this.spec.ranged) {
      this.updateLos(dt, ctx, t);
      const inRange = dist < 16 && this.hasLos;
      if (!inRange) {
        this.state = "chase";
        this.windup = false;
        mx = nx * sp;
        mz = nz * sp;
      } else {
        this.state = "attack";
        this.orbitTimer -= dt;
        if (this.orbitTimer <= 0) {
          this.orbitDir *= -1;
          this.orbitTimer = 1.5 + Math.random() * 2;
        }
        if (dist < 7) {
          mx = -nx * sp * 0.8; // back away
          mz = -nz * sp * 0.8;
        } else {
          mx = -nz * this.orbitDir * sp * 0.6; // circle-strafe
          mz = nx * this.orbitDir * sp * 0.6;
        }
        this.shootTimer -= dt;
        this.windup = this.shootTimer < 0.4; // red glow = incoming shot
        if (this.shootTimer <= 0) {
          this.shootTimer = 1.4 + Math.random() * 0.8;
          this.windup = false;
          this.pos.set(t.x, t.y + 0.6 * s, t.z);
          if (Math.random() < 0.7)
            ctx.onAttack(this.spec.damage, this.pos, true);
        }
      }
    } else if (dist > ATTACK_RANGE * s) {
      this.state = "chase";
      mx = nx * sp;
      mz = nz * sp;
    } else {
      this.state = "attack";
      this.attackCooldown -= dt;
      if (this.attackCooldown <= 0) {
        this.attackCooldown = ATTACK_INTERVAL;
        this.pos.set(t.x, t.y + 0.6 * s, t.z);
        ctx.onAttack(this.spec.damage, this.pos, false);
      }
    }

    // Sidestep when wedged against an obstacle
    if (this.strafeTime > 0) {
      this.strafeTime -= dt;
      mx += -nz * this.strafeDir * sp * 0.9;
      mz += nx * this.strafeDir * sp * 0.9;
    }

    // Knockback
    mx += this.knock.x;
    mz += this.knock.z;
    this.knock.multiplyScalar(Math.exp(-8 * dt));

    const desired = { x: mx * dt, y: -3 * dt, z: mz * dt };
    ctx.controller.computeColliderMovement(this.collider, desired);
    const m = ctx.controller.computedMovement();

    const wanted = Math.hypot(desired.x, desired.z);
    const got = Math.hypot(m.x, m.z);
    if (this.state === "chase" && wanted > 0.001 && got < wanted * 0.3) {
      this.stuck += dt;
      if (this.stuck > 0.25) {
        this.stuck = 0;
        this.strafeTime = 0.7;
        this.strafeDir = Math.random() < 0.5 ? 1 : -1;
      }
    } else {
      this.stuck = Math.max(0, this.stuck - dt);
    }

    const nxp = t.x + m.x;
    const nyp = t.y + m.y;
    const nzp = t.z + m.z;
    this.body.setNextKinematicTranslation({ x: nxp, y: nyp, z: nzp });
    this.syncMesh(nxp, nyp, nzp);
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.world.removeRigidBody(this.body); // also removes its collider
  }

  /** Throttled line-of-sight raycast to the player. */
  private updateLos(
    dt: number,
    ctx: EnemyContext,
    t: { x: number; y: number; z: number },
  ): void {
    this.losTimer -= dt;
    if (this.losTimer > 0) return;
    this.losTimer = 0.15;
    const ox = t.x;
    const oy = t.y + 0.6 * this.spec.scale;
    const oz = t.z;
    const dx = ctx.target.x - ox;
    const dy = ctx.target.y - oy;
    const dz = ctx.target.z - oz;
    const d = Math.hypot(dx, dy, dz) || 1;
    const ray = new RAPIER.Ray(
      { x: ox, y: oy, z: oz },
      { x: dx / d, y: dy / d, z: dz / d },
    );
    const hit = this.world.castRay(
      ray,
      d + 0.5,
      true,
      undefined,
      undefined,
      undefined,
      this.body,
    );
    this.hasLos = !!hit && hit.collider.handle === ctx.playerCollider.handle;
  }

  private syncMesh(x?: number, y?: number, z?: number): void {
    const t = this.body.translation();
    this.mesh.position.set(
      x ?? t.x,
      (y ?? t.y) - 0.8 * this.spec.scale,
      z ?? t.z,
    );
  }
}
