import * as THREE from "three";

export type ParticleKind = "spark" | "blood" | "dust";

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  ttl: number;
  life: number;
}

/** Fixed pool of tiny cubes, so effects never allocate during play. */
export class Particles {
  private pool: Particle[] = [];
  private next = 0;
  private mats: Record<ParticleKind, THREE.Material> = {
    spark: new THREE.MeshBasicMaterial({ color: 0xffd060 }),
    blood: new THREE.MeshBasicMaterial({ color: 0xaa1010 }),
    dust: new THREE.MeshBasicMaterial({ color: 0x9a9a9a }),
  };

  constructor(scene: THREE.Scene, size = 220) {
    const geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    for (let i = 0; i < size; i++) {
      const mesh = new THREE.Mesh(geo, this.mats.spark);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, vel: new THREE.Vector3(), ttl: 0, life: 1 });
    }
  }

  burst(
    x: number,
    y: number,
    z: number,
    kind: ParticleKind,
    count: number,
    speed: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.next];
      this.next = (this.next + 1) % this.pool.length;
      p.mesh.material = this.mats[kind];
      p.mesh.position.set(x, y, z);
      p.mesh.scale.setScalar(1);
      p.mesh.visible = true;
      p.vel
        .set(
          Math.random() - 0.5,
          Math.random() * 0.8 + 0.2,
          Math.random() - 0.5,
        )
        .normalize()
        .multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      p.life = p.ttl = 0.25 + Math.random() * 0.35;
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (p.ttl <= 0) continue;
      p.ttl -= dt;
      if (p.ttl <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.03) {
        p.mesh.position.y = 0.03;
        p.vel.y *= -0.3;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
      p.mesh.scale.setScalar(p.ttl / p.life);
    }
  }
}
