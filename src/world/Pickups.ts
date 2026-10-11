import * as THREE from "three";

export type PickupKind = "health" | "ammo";

export interface Pickup {
  mesh: THREE.Mesh;
  kind: PickupKind;
  ttl: number;
  baseY: number;
  phase: number;
}

const MAX_ITEMS = 8;
const LIFETIME = 20;
const GRAB_RADIUS = 1.5;

export class Pickups {
  private items: Pickup[] = [];
  private scene: THREE.Scene;
  private geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  private mats: Record<PickupKind, THREE.Material> = {
    health: new THREE.MeshStandardMaterial({
      color: 0x30d060,
      emissive: 0x104a20,
    }),
    ammo: new THREE.MeshStandardMaterial({
      color: 0xffc040,
      emissive: 0x504010,
    }),
  };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  list(): readonly Pickup[] {
    return this.items;
  }

  spawn(kind: PickupKind, x: number, z: number): void {
    if (this.items.length >= MAX_ITEMS) this.remove(0);
    const mesh = new THREE.Mesh(this.geo, this.mats[kind]);
    mesh.position.set(x, 0.6, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.items.push({
      mesh,
      kind,
      ttl: LIFETIME,
      baseY: 0.6,
      phase: Math.random() * 6,
    });
  }

  reset(): void {
    while (this.items.length) this.remove(0);
  }

  /** `collect` returns true if the pickup was consumed (e.g. false when health is full). */
  update(
    dt: number,
    pos: THREE.Vector3,
    collect: (kind: PickupKind) => boolean,
  ): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.ttl -= dt;
      it.phase += dt * 3;
      it.mesh.rotation.y += dt * 2;
      it.mesh.position.y = it.baseY + Math.sin(it.phase) * 0.12;
      it.mesh.visible = it.ttl > 5 || Math.floor(it.ttl * 6) % 2 === 0; // blink when expiring

      const dx = it.mesh.position.x - pos.x;
      const dz = it.mesh.position.z - pos.z;
      if (dx * dx + dz * dz < GRAB_RADIUS * GRAB_RADIUS && collect(it.kind)) {
        this.remove(i);
      } else if (it.ttl <= 0) {
        this.remove(i);
      }
    }
  }

  private remove(i: number): void {
    this.scene.remove(this.items[i].mesh);
    this.items.splice(i, 1);
  }
}
