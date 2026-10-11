import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { Input } from "../core/Input";

const EYE_OFFSET = 0.65; // above capsule center (center is 0.8 above feet)
const SENSITIVITY = 0.0022;
const GRAVITY = 20;
const JUMP_SPEED = 8;
const SPAWN = { x: 0, y: 0.9, z: 8 };

function moveToward(v: number, target: number, maxDelta: number): number {
  const d = target - v;
  return Math.abs(d) <= maxDelta ? target : v + Math.sign(d) * maxDelta;
}

export class Player {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly maxHealth = 100;
  health = 100;
  onHurt: () => void = () => {};

  private world: RAPIER.World;
  private camera: THREE.PerspectiveCamera;
  private input: Input;
  private controller: RAPIER.KinematicCharacterController;

  private yaw = 0;
  private pitch = 0;
  private vel = new THREE.Vector3();
  private grounded = false;
  private prev = new THREE.Vector3();
  private curr = new THREE.Vector3();

  constructor(
    world: RAPIER.World,
    camera: THREE.PerspectiveCamera,
    input: Input,
  ) {
    this.world = world;
    this.camera = camera;
    this.input = input;

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        SPAWN.x,
        SPAWN.y,
        SPAWN.z,
      ),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(0.45, 0.35),
      this.body,
    );

    this.controller = world.createCharacterController(0.02);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setSlideEnabled(true);
    this.controller.enableAutostep(0.4, 0.2, false);
    this.controller.enableSnapToGround(0.3);
    this.controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);

    this.curr.set(SPAWN.x, SPAWN.y + EYE_OFFSET, SPAWN.z);
    this.prev.copy(this.curr);
  }

  /** Eye position at the latest physics tick. */
  get eye(): THREE.Vector3 {
    return this.curr;
  }

  /** Writes the current aim direction into `out`. */
  getAim(out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return out.set(
      -Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cp,
    );
  }

  addRecoil(pitch: number, yaw: number): void {
    this.pitch = Math.min(1.5, this.pitch + pitch);
    this.yaw += yaw;
  }

  damage(amount: number): void {
    if (this.health <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.onHurt();
  }

  reset(): void {
    this.health = this.maxHealth;
    this.body.setTranslation(SPAWN, true);
    this.body.setNextKinematicTranslation(SPAWN);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.curr.set(SPAWN.x, SPAWN.y + EYE_OFFSET, SPAWN.z);
    this.prev.copy(this.curr);
  }

  update(dt: number): void {
    this.prev.copy(this.curr);

    // Look
    const d = this.input.consumeMouseDelta();
    this.yaw -= d.x * SENSITIVITY;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - d.y * SENSITIVITY));

    // Horizontal movement
    const fwd =
      (this.input.isDown("KeyW") ? 1 : 0) - (this.input.isDown("KeyS") ? 1 : 0);
    const side =
      (this.input.isDown("KeyD") ? 1 : 0) - (this.input.isDown("KeyA") ? 1 : 0);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * fwd + cos * side;
    let wz = -cos * fwd - sin * side;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }

    const speed = this.input.isDown("ShiftLeft") ? 9 : 6;
    const accel = (this.grounded ? 60 : 15) * dt;
    this.vel.x = moveToward(this.vel.x, wx * speed, accel);
    this.vel.z = moveToward(this.vel.z, wz * speed, accel);

    // Vertical movement
    if (this.grounded && this.vel.y <= 0) {
      this.vel.y = 0;
      if (this.input.wasPressed("Space")) this.vel.y = JUMP_SPEED;
    } else {
      this.vel.y -= GRAVITY * dt;
    }

    // Collide and slide
    const desired = {
      x: this.vel.x * dt,
      y: this.vel.y * dt,
      z: this.vel.z * dt,
    };
    this.controller.computeColliderMovement(this.collider, desired);
    const m = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    if (this.vel.y > 0 && m.y < desired.y - 0.001) this.vel.y = 0; // bonked ceiling

    const t = this.body.translation();
    const next = { x: t.x + m.x, y: t.y + m.y, z: t.z + m.z };
    this.body.setNextKinematicTranslation(next);
    this.curr.set(next.x, next.y + EYE_OFFSET, next.z);
  }

  /** Call every render frame; alpha comes from the game loop. */
  applyCamera(alpha: number): void {
    this.camera.position.lerpVectors(this.prev, this.curr, alpha);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }
}
