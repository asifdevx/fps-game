import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";

// x, z, width, height, depth
const CRATES: [number, number, number, number, number][] = [
  [6, -4, 3, 1.2, 3],
  [-8, -10, 2, 2.4, 2],
  [0, -14, 6, 1.2, 1],
  [12, 6, 2.5, 2.5, 2.5],
  [-12, 4, 4, 1.2, 2],
  [-3, 2, 1, 3, 1],
];

export class Level {
  private scene: THREE.Scene;
  private world: RAPIER.World;

  constructor(scene: THREE.Scene, world: RAPIER.World) {
    this.scene = scene;
    this.world = world;

    scene.background = new THREE.Color(0x87a7c4);
    scene.fog = new THREE.Fog(0x87a7c4, 20, 70);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(20, 30, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -35;
    c.right = 35;
    c.top = 35;
    c.bottom = -35;
    c.far = 80;
    scene.add(sun);

    // Floor: visual plane + collider whose top surface sits at y = 0
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x4a5560 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(60, 60, 0x2c343b, 0x2c343b);
    grid.position.y = 0.01;
    scene.add(grid);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(30, 0.5, 30).setTranslation(0, -0.5, 0),
    );

    // Perimeter walls
    this.box(0, -30.5, 62, 5, 1, 0x30363c);
    this.box(0, 30.5, 62, 5, 1, 0x30363c);
    this.box(-30.5, 0, 1, 5, 62, 0x30363c);
    this.box(30.5, 0, 1, 5, 62, 0x30363c);

    for (const [x, z, w, h, d] of CRATES) this.box(x, z, w, h, d, 0x8a6b45);
  }

  /** Box sitting on the floor, centered at (x, z). Adds mesh and collider. */
  private box(
    x: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: number,
  ): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color }),
    );
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(
        x,
        h / 2,
        z,
      ),
    );
  }
}
