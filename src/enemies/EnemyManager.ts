import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { Enemy } from "./Enemy";

const MAX_ALIVE = 12;
const SPAWN_RADIUS = 25;

export class EnemyManager {
  wave = 0;
  onWave: (wave: number) => void = () => {};
  onPlayerHit: (damage: number) => void = () => {};

  private world: RAPIER.World;
  private scene: THREE.Scene;
  private controller: RAPIER.KinematicCharacterController;
  private byCollider = new Map<number, Enemy>();
  private toSpawn = 0;
  private spawnTimer = 0;
  private waveDelay = 2;

  constructor(world: RAPIER.World, scene: THREE.Scene) {
    this.world = world;
    this.scene = scene;
    this.controller = world.createCharacterController(0.02);
    this.controller.setSlideEnabled(true);
    this.controller.enableSnapToGround(0.3);
  }

  getByCollider(handle: number): Enemy | undefined {
    return this.byCollider.get(handle);
  }

  reset(): void {
    for (const e of this.byCollider.values()) e.dispose();
    this.byCollider.clear();
    this.wave = 0;
    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.waveDelay = 2;
  }

  update(dt: number, target: THREE.Vector3): void {
    let alive = 0;
    for (const [handle, e] of this.byCollider) {
      e.update(dt, target, this.controller, this.onPlayerHit);
      if (!e.isDead) alive++;
      if (e.removable) {
        e.dispose();
        this.byCollider.delete(handle);
      }
    }

    // Wave logic
    if (this.toSpawn === 0 && alive === 0) {
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) {
        this.wave++;
        this.toSpawn = 3 + this.wave * 2;
        this.waveDelay = 3;
        this.onWave(this.wave);
      }
    }
    if (this.toSpawn > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && alive < MAX_ALIVE) {
        this.spawn();
        this.toSpawn--;
        this.spawnTimer = 0.8;
      }
    }
  }

  private spawn(): void {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2.5 + Math.min(this.wave * 0.2, 2);
    const e = new Enemy(
      this.world,
      this.scene,
      Math.cos(angle) * SPAWN_RADIUS,
      Math.sin(angle) * SPAWN_RADIUS,
      speed,
    );
    this.byCollider.set(e.collider.handle, e);
  }
}
