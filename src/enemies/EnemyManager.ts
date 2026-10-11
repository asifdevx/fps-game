import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { Enemy, type EnemyContext, type EnemyKind } from "./Enemy";

const MAX_ALIVE = 14;
const SPAWN_RADIUS = 25;

export class EnemyManager {
  wave = 0;
  onWave: (wave: number) => void = () => {};
  onWaveClear: (wave: number) => void = () => {};
  onPlayerHit: (damage: number, from: THREE.Vector3, ranged: boolean) => void =
    () => {};

  private world: RAPIER.World;
  private scene: THREE.Scene;
  private ctx: EnemyContext;
  private byCollider = new Map<number, Enemy>();
  private queue: EnemyKind[] = [];
  private inWave = false;
  private spawnTimer = 0;
  private waveDelay = 2;
  private speedMul = 1;

  constructor(
    world: RAPIER.World,
    scene: THREE.Scene,
    playerCollider: RAPIER.Collider,
  ) {
    this.world = world;
    this.scene = scene;
    const controller = world.createCharacterController(0.02);
    controller.setSlideEnabled(true);
    controller.enableSnapToGround(0.3);
    this.ctx = {
      target: new THREE.Vector3(),
      playerCollider,
      controller,
      onAttack: (d, f, r) => this.onPlayerHit(d, f, r),
    };
  }

  getByCollider(handle: number): Enemy | undefined {
    return this.byCollider.get(handle);
  }

  list(): IterableIterator<Enemy> {
    return this.byCollider.values();
  }

  reset(): void {
    for (const e of this.byCollider.values()) e.dispose();
    this.byCollider.clear();
    this.wave = 0;
    this.queue = [];
    this.inWave = false;
    this.spawnTimer = 0;
    this.waveDelay = 2;
  }

  update(dt: number, target: THREE.Vector3): void {
    this.ctx.target.copy(target);

    let alive = 0;
    for (const [handle, e] of this.byCollider) {
      e.update(dt, this.ctx);
      if (!e.isDead) alive++;
      if (e.removable) {
        e.dispose();
        this.byCollider.delete(handle);
      }
    }

    if (!this.inWave) {
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) {
        this.wave++;
        this.queue = this.buildQueue(this.wave);
        this.speedMul = 1 + Math.min(this.wave * 0.04, 0.5);
        this.inWave = true;
        this.onWave(this.wave);
      }
    } else if (this.queue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && alive < MAX_ALIVE) {
        this.spawn(this.queue.shift()!);
        this.spawnTimer = Math.max(0.35, 0.9 - this.wave * 0.04);
      }
    } else if (alive === 0) {
      this.inWave = false;
      this.waveDelay = 4;
      this.onWaveClear(this.wave);
    }
  }

  private buildQueue(wave: number): EnemyKind[] {
    const q: EnemyKind[] = [];
    const total = 4 + wave * 2;
    for (let i = 0; i < total; i++) {
      const r = Math.random();
      if (wave >= 4 && r < 0.12) q.push("tank");
      else if (wave >= 3 && r < 0.32) q.push("shooter");
      else if (wave >= 2 && r < 0.57) q.push("runner");
      else q.push("grunt");
    }
    // Boss wave: extra tanks arrive first
    if (wave % 5 === 0) for (let i = 0; i < wave / 5; i++) q.unshift("tank");
    return q;
  }

  private spawn(kind: EnemyKind): void {
    let x = 0;
    let z = 0;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      x = Math.cos(a) * SPAWN_RADIUS;
      z = Math.sin(a) * SPAWN_RADIUS;
      if (Math.hypot(x - this.ctx.target.x, z - this.ctx.target.z) > 14) break; // not on top of the player
    }
    const e = new Enemy(this.world, this.scene, kind, x, z, this.speedMul);
    this.byCollider.set(e.collider.handle, e);
  }
}
