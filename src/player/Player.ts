import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { Input } from "../core/Input";

const EYE_OFFSET = 0.65; // above capsule center (center is 0.8 above feet)
const SENSITIVITY = 0.0022;
const GRAVITY = 20;
const JUMP_SPEED = 8;
const BASE_FOV = 75;
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
  onStep: () => void = () => {};

  private camera: THREE.PerspectiveCamera;
  private input: Input;
  private controller: RAPIER.KinematicCharacterController;

  private yaw = 0;
  private pitch = 0;
  private vel = new THREE.Vector3();
  private grounded = false;
  private prev = new THREE.Vector3();
  private curr = new THREE.Vector3();

  private aimAmount = 0;
  private sprinting = false;
  private strafeInput = 0;
  private shake = 0;
  private bobPhase = 0;
  private bobAmp = 0;
  private lastStep = 0;
  private roll = 0;

  constructor(
    world: RAPIER.World,
    camera: THREE.PerspectiveCamera,
    input: Input,
  ) {
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

  get facing(): number {
    return this.yaw;
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

  /** 0..1 aim-down-sights amount (zooms FOV, slows look and movement). */
  setAim(a: number): void {
    this.aimAmount = a;
  }

  addRecoil(pitch: number, yaw: number): void {
    this.pitch = Math.min(1.5, this.pitch + pitch);
    this.yaw += yaw;
  }

  heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  damage(amount: number): void {
    if (this.health <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.shake = Math.max(this.shake, Math.min(1, 0.4 + amount / 30));
  }

  reset(): void {
    this.health = this.maxHealth;
    this.body.setTranslation(SPAWN, true);
    this.body.setNextKinematicTranslation(SPAWN);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.shake = 0;
    this.bobAmp = 0;
    this.aimAmount = 0;
    this.curr.set(SPAWN.x, SPAWN.y + EYE_OFFSET, SPAWN.z);
    this.prev.copy(this.curr);
  }

  update(dt: number): void {
    this.prev.copy(this.curr);

    // Look (slower while aiming)
    const sens = SENSITIVITY * (1 - 0.55 * this.aimAmount);
    const d = this.input.consumeMouseDelta();
    this.yaw -= d.x * sens;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - d.y * sens));

    // Horizontal movement
    const fwd =
      (this.input.isDown("KeyW") ? 1 : 0) - (this.input.isDown("KeyS") ? 1 : 0);
    const side =
      (this.input.isDown("KeyD") ? 1 : 0) - (this.input.isDown("KeyA") ? 1 : 0);
    this.strafeInput = side;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * fwd + cos * side;
    let wz = -cos * fwd - sin * side;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }

    this.sprinting =
      this.input.isDown("ShiftLeft") && fwd > 0 && this.aimAmount < 0.3;
    const speed = this.sprinting ? 9 : this.aimAmount > 0.5 ? 3.5 : 6;
    const accel = (this.grounded ? 60 : 15) * dt;
    this.vel.x = moveToward(this.vel.x, wx * speed, accel);
    this.vel.z = moveToward(this.vel.z, wz * speed, accel);

    // Vertical movement
    const fallSpeed = this.vel.y;
    const wasGrounded = this.grounded;
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
    if (!wasGrounded && this.grounded && fallSpeed < -5)
      this.shake = Math.max(this.shake, 0.3); // hard landing

    const t = this.body.translation();
    const next = { x: t.x + m.x, y: t.y + m.y, z: t.z + m.z };
    this.body.setNextKinematicTranslation(next);
    this.curr.set(next.x, next.y + EYE_OFFSET, next.z);

    // Head bob, footsteps, shake decay
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const bobTarget = this.grounded ? Math.min(hs / 6, 1.5) : 0;
    this.bobAmp += (bobTarget - this.bobAmp) * Math.min(1, 10 * dt);
    if (this.grounded) this.bobPhase += hs * dt * 2.2;
    const step = Math.floor(this.bobPhase / Math.PI);
    if (step !== this.lastStep) {
      this.lastStep = step;
      if (this.bobAmp > 0.3) this.onStep();
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  /** Call every render frame; alpha comes from the game loop. */
  applyCamera(alpha: number): void {
    const cam = this.camera;
    cam.position.lerpVectors(this.prev, this.curr, alpha);
    cam.position.y -= Math.abs(Math.sin(this.bobPhase)) * 0.045 * this.bobAmp;

    const targetRoll = -this.strafeInput * 0.02 * Math.min(this.bobAmp, 1);
    this.roll += (targetRoll - this.roll) * 0.1;
    const sh = this.shake;
    cam.rotation.set(
      this.pitch + (Math.random() - 0.5) * sh * 0.04,
      this.yaw + (Math.random() - 0.5) * sh * 0.04,
      this.roll + (Math.random() - 0.5) * sh * 0.03,
      "YXZ",
    );

    const targetFov = BASE_FOV + (this.sprinting ? 7 : 0) - 30 * this.aimAmount;
    if (Math.abs(cam.fov - targetFov) > 0.01) {
      cam.fov += (targetFov - cam.fov) * 0.12;
      cam.updateProjectionMatrix();
    }
  }
}
