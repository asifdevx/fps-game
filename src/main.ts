import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { Sound } from "./audio/Sound";
import { GameLoop } from "./core/GameLoop";
import { Input } from "./core/Input";
import { Particles } from "./effects/Particles";
import { SPECS } from "./enemies/Enemy";
import { EnemyManager } from "./enemies/EnemyManager";
import { Player } from "./player/Player";
import { Weapon } from "./player/Weapon";
import "./style.css";
import { HUD } from "./ui/HUD";
import { setupTouchControls } from "./ui/TouchControls";
import { Level } from "./world/Level";
import { Pickups, type PickupKind } from "./world/Pickups";
const BEST_KEY = "fps-best-score";
const loadBest = (): number => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};
const saveBest = (v: number): void => {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    /* storage unavailable */
  }
};

const DAY = new THREE.Color(0x87a7c4);
const DUSK = new THREE.Color(0xc4785a);
const NIGHT = new THREE.Color(0x0d1020);

async function boot(): Promise<void> {
  await RAPIER.init();

  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(
    Math.min(
      window.devicePixelRatio,
      window.matchMedia("(pointer: coarse)").matches ? 1.5 : 2,
    ),
  );
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.05,
    200,
  );
  scene.add(camera); // needed so the weapon viewmodel (a camera child) renders

  const input = new Input(document.body);
  setupTouchControls(input);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  new Level(scene, world);

  // Grab the lights Level created so the atmosphere can change over time
  const hemi = scene.children.find(
    (o): o is THREE.HemisphereLight => o instanceof THREE.HemisphereLight,
  );
  const sun = scene.children.find(
    (o): o is THREE.DirectionalLight => o instanceof THREE.DirectionalLight,
  );
  const bg = new THREE.Color(DAY);
  scene.background = bg;
  const fog = scene.fog as THREE.Fog;

  const sound = new Sound();
  const particles = new Particles(scene);
  const pickups = new Pickups(scene);
  const player = new Player(world, camera, input);
  const enemies = new EnemyManager(world, scene, player.collider);
  const weapon = new Weapon({
    scene,
    camera,
    world,
    player,
    enemies,
    input,
    particles,
    sound,
  });
  const hud = new HUD();

  let score = 0;
  let best = loadBest();
  let state: "playing" | "over" = "playing";
  let combo = 0;
  let comboTimer = 0;
  let slowT = 0;
  let atmoT = 0;
  let atmoTarget = 0;
  let lastWeapon = -1;
  const tmp = new THREE.Vector3();

  const mult = (): number => 1 + Math.min(Math.max(combo - 1, 0), 8) * 0.25;

  // --- Events ---
  player.onStep = () => sound.step();

  enemies.onPlayerHit = (dmg, from, ranged) => {
    player.damage(dmg);
    // Angle of the attacker relative to where the player is facing
    const dx = from.x - player.eye.x;
    const dz = from.z - player.eye.z;
    const yaw = player.facing;
    const ang = Math.atan2(
      dx * Math.cos(yaw) + dz * -Math.sin(yaw),
      dx * -Math.sin(yaw) + dz * -Math.cos(yaw),
    );
    hud.hurt(ang);
    if (ranged) sound.enemyShot();
    sound.hurt();
  };

  enemies.onWave = (w) => {
    hud.setWave(w);
    weapon.addAmmoAll(1);
    atmoTarget = Math.min(1, (w - 1) / 9);
    hud.banner(w % 5 === 0 ? `WAVE ${w} · BOSS WAVE` : `WAVE ${w}`);
    sound.wave();
  };

  enemies.onWaveClear = (w) => {
    const bonus = w * 250;
    score += bonus;
    player.heal(25);
    slowT = 0.8; // brief slow-mo for enemies
    hud.banner(`WAVE ${w} CLEARED  +${bonus}`);
  };

  weapon.onHit = (enemy, killed, headshot, damage, point) => {
    hud.hitMarker(killed);
    sound.hit(headshot);

    tmp.copy(point).project(camera);
    hud.damageNumber(
      (tmp.x * 0.5 + 0.5) * window.innerWidth,
      (-tmp.y * 0.5 + 0.5) * window.innerHeight,
      String(Math.round(damage)),
      headshot,
    );

    if (!killed) return;
    sound.kill();
    combo++;
    comboTimer = 3;
    score += Math.round(
      SPECS[enemy.kind].score * (headshot ? 1.5 : 1) * mult(),
    );

    const p = enemy.body.translation();
    particles.burst(p.x, p.y, p.z, "blood", 18, 4);
    const r = Math.random();
    if (enemy.kind === "tank" || r < 0.14) pickups.spawn("health", p.x, p.z);
    else if (r < 0.34) pickups.spawn("ammo", p.x, p.z);
  };

  const collect = (kind: PickupKind): boolean => {
    if (kind === "health") {
      if (player.health >= player.maxHealth) return false;
      player.heal(30);
    } else {
      weapon.addAmmoAll(1);
    }
    sound.pickup();
    return true;
  };

  function restart(): void {
    player.reset();
    enemies.reset();
    weapon.reset();
    pickups.reset();
    score = 0;
    combo = 0;
    comboTimer = 0;
    slowT = 0;
    atmoTarget = 0;
    state = "playing";
    hud.hideGameOver();
    hud.setWave(0);
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyR" && state === "over") restart();
  });
  document.getElementById("gameover")!.addEventListener("click", () => {
    if (state === "over") restart();
  });
  window.addEventListener("pointerdown", () => sound.init()); // browsers require a gesture for audio
  window.addEventListener("touchend", () => sound.init());
  window.addEventListener("contextmenu", (e) => e.preventDefault()); // right click = aim
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const update = (dt: number): void => {
    if (state === "playing" && input.isLocked) {
      const ts = slowT > 0 ? 0.35 : 1; // enemies and effects slow down, the player doesn't
      slowT = Math.max(0, slowT - dt);

      player.update(dt);
      weapon.update(dt);
      player.setAim(weapon.aim);
      enemies.update(dt * ts, player.eye);
      pickups.update(dt, player.eye, collect);
      particles.update(dt * ts);
      world.step(); // after every kinematic body has queued its move

      if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) combo = 0;
      }

      // Sky, fog and lighting drift from day to dusk to night as waves progress
      atmoT += (atmoTarget - atmoT) * Math.min(1, dt * 0.8);
      if (atmoT < 0.5) bg.lerpColors(DAY, DUSK, atmoT * 2);
      else bg.lerpColors(DUSK, NIGHT, (atmoT - 0.5) * 2);
      fog.color.copy(bg);
      if (hemi) hemi.intensity = 1.1 - 0.7 * atmoT;
      if (sun) {
        sun.intensity = 1.8 - 1.4 * atmoT;
        sun.position.y = 30 - 18 * atmoT; // lower sun, longer shadows
      }

      if (player.health <= 0) {
        state = "over";
        input.release();
        sound.gameOver();
        const isNew = score > best;
        if (isNew) {
          best = score;
          saveBest(best);
        }
        hud.showGameOver(score, enemies.wave, best, isNew);
      }
    } else {
      input.consumeMouseDelta(); // avoid a camera jump when resuming
    }
    input.endTick();
  };

  const render = (alpha: number): void => {
    player.applyCamera(alpha);
    hud.setHealth(player.health, player.maxHealth);
    hud.setAmmo(weapon.ammo, weapon.reserve, weapon.reloading);
    hud.setScore(score);
    hud.setCombo(mult(), combo, comboTimer / 3);
    hud.setCrosshair(weapon.aim);
    if (weapon.index !== lastWeapon) {
      lastWeapon = weapon.index;
      hud.setWeapon(weapon.index, weapon.name);
    }

    hud.radarBegin(player.eye.x, player.eye.z, player.facing);
    for (const e of enemies.list()) {
      if (e.isDead) continue;
      const t = e.body.translation();
      hud.radarDot(t.x, t.z, SPECS[e.kind].dot, e.kind === "tank" ? 4.5 : 3);
    }
    for (const p of pickups.list()) {
      hud.radarDot(
        p.mesh.position.x,
        p.mesh.position.z,
        p.kind === "health" ? "#40ff80" : "#ffd040",
        2.5,
      );
    }

    hud.showPause(state === "playing" && !input.isLocked);
    renderer.render(scene, camera);
  };

  new GameLoop(update, render).start();
}

boot();
