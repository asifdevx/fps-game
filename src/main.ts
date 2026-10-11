import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { GameLoop } from "./core/GameLoop";
import { Input } from "./core/Input";
import { EnemyManager } from "./enemies/EnemyManager";
import { Player } from "./player/Player";
import { Weapon } from "./player/Weapon";
import "./style.css";
import { HUD } from "./ui/HUD";
import { Level } from "./world/Level";

async function boot(): Promise<void> {
  await RAPIER.init();

  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  new Level(scene, world);
  const player = new Player(world, camera, input);
  const enemies = new EnemyManager(world, scene);
  const weapon = new Weapon(scene, camera, world, player, enemies, input);
  const hud = new HUD();

  let score = 0;
  let state: "playing" | "over" = "playing";

  player.onHurt = () => hud.hurt();
  enemies.onPlayerHit = (dmg) => player.damage(dmg);
  enemies.onWave = (w) => {
    hud.setWave(w);
    weapon.addReserve(30);
  };
  weapon.onHit = (_enemy, killed, headshot) => {
    hud.hitMarker(killed);
    if (killed) score += headshot ? 150 : 100;
  };

  function restart(): void {
    player.reset();
    enemies.reset();
    weapon.reset();
    score = 0;
    state = "playing";
    hud.hideGameOver();
    hud.setWave(0);
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyR" && state === "over") restart();
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const update = (dt: number): void => {
    if (state === "playing" && input.isLocked) {
      player.update(dt);
      weapon.update(dt);
      enemies.update(dt, player.eye);
      world.step(); // after every kinematic body has queued its move

      if (player.health <= 0) {
        state = "over";
        document.exitPointerLock();
        hud.showGameOver(score, enemies.wave);
      }
    } else {
      input.consumeMouseDelta(); // avoid a camera jump when resuming
    }
    input.endTick();
  };

  const render = (alpha: number): void => {
    player.applyCamera(alpha);
    hud.setHealth(player.health);
    hud.setAmmo(weapon.ammo, weapon.reserve, weapon.reloading);
    hud.setScore(score);
    hud.showPause(state === "playing" && !input.isLocked);
    renderer.render(scene, camera);
  };

  new GameLoop(update, render).start();
}

boot();
