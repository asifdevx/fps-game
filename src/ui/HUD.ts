const $ = (id: string): HTMLElement => document.getElementById(id)!;

export class HUD {
  private health = $("health");
  private hpfill = $("hpfill");
  private ammo = $("ammo");
  private reserve = $("reserve");
  private wave = $("wave");
  private score = $("score");
  private reload = $("reload");
  private hitmarker = $("hitmarker");
  private hurtEl = $("hurt");
  private hurtDir = $("hurtdir");
  private pause = $("pause");
  private gameover = $("gameover");
  private final = $("final");
  private best = $("best");
  private bannerEl = $("banner");
  private weaponName = $("weapon-name");
  private slots = $("slots");
  private crosshair = $("crosshair");
  private comboEl = $("combo");
  private comboText = $("combo-text");
  private comboFill = $("combo-fill");
  private root = $("hud");
  private rctx = (
    document.getElementById("radar") as HTMLCanvasElement
  ).getContext("2d")!;

  private rx = 0;
  private rz = 0;
  private ryaw = 0;
  private hitTimer = 0;
  private hurtTimer = 0;
  private dirTimer = 0;

  setHealth(v: number, max: number): void {
    this.health.textContent = String(Math.ceil(v));
    this.hpfill.style.width = `${(v / max) * 100}%`;
    this.hpfill.classList.toggle("low", v / max < 0.3);
  }

  setAmmo(ammo: number, reserve: number, reloading: boolean): void {
    this.ammo.textContent = String(ammo);
    this.reserve.textContent = String(reserve);
    this.reload.classList.toggle("show", reloading);
  }

  setWeapon(index: number, name: string): void {
    this.weaponName.textContent = name;
    Array.from(this.slots.children).forEach((el, i) =>
      el.classList.toggle("active", i === index),
    );
  }

  setWave(v: number): void {
    this.wave.textContent = String(v);
  }
  setScore(v: number): void {
    this.score.textContent = String(v);
  }

  setCombo(mult: number, streak: number, frac: number): void {
    this.comboEl.classList.toggle("show", streak >= 2);
    if (streak < 2) return;
    this.comboText.textContent = `${streak} STREAK  x${mult.toFixed(2)}`;
    this.comboFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  setCrosshair(aim: number): void {
    this.crosshair.style.opacity = String(1 - aim * 0.8);
  }

  banner(text: string): void {
    this.bannerEl.textContent = text;
    this.bannerEl.classList.remove("show");
    void this.bannerEl.offsetWidth; // restart the CSS animation
    this.bannerEl.classList.add("show");
  }

  hitMarker(kill: boolean): void {
    this.hitmarker.classList.add("show");
    this.hitmarker.classList.toggle("kill", kill);
    clearTimeout(this.hitTimer);
    this.hitTimer = window.setTimeout(
      () => this.hitmarker.classList.remove("show"),
      80,
    );
  }

  /** `angle` = direction of the attacker relative to where you face (0 = ahead, +right). */
  hurt(angle: number): void {
    this.hurtEl.classList.add("show");
    clearTimeout(this.hurtTimer);
    this.hurtTimer = window.setTimeout(
      () => this.hurtEl.classList.remove("show"),
      120,
    );

    this.hurtDir.style.transform = `rotate(${angle}rad)`;
    this.hurtDir.classList.add("show");
    clearTimeout(this.dirTimer);
    this.dirTimer = window.setTimeout(
      () => this.hurtDir.classList.remove("show"),
      250,
    );
  }

  damageNumber(x: number, y: number, text: string, crit: boolean): void {
    const el = document.createElement("div");
    el.className = crit ? "dmg crit" : "dmg";
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.addEventListener("animationend", () => el.remove());
    this.root.appendChild(el);
  }

  radarBegin(px: number, pz: number, yaw: number): void {
    this.rx = px;
    this.rz = pz;
    this.ryaw = yaw;
    const c = this.rctx;
    c.clearRect(0, 0, 150, 150);
    c.fillStyle = "rgba(0,0,0,0.45)";
    c.beginPath();
    c.arc(75, 75, 74, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.35)";
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = "#fff";
    c.beginPath();
    c.moveTo(75, 67);
    c.lineTo(70, 80);
    c.lineTo(80, 80);
    c.closePath();
    c.fill();
  }

  radarDot(x: number, z: number, color: string, size = 3): void {
    const range = 32;
    const dx = x - this.rx;
    const dz = z - this.rz;
    const yaw = this.ryaw;
    let a = dx * -Math.sin(yaw) + dz * -Math.cos(yaw); // forward
    let b = dx * Math.cos(yaw) + dz * -Math.sin(yaw); // right
    const dist = Math.hypot(a, b);
    if (dist > range) {
      a *= range / dist;
      b *= range / dist;
    }
    const k = 70 / range;
    const c = this.rctx;
    c.fillStyle = color;
    c.beginPath();
    c.arc(75 + b * k, 75 - a * k, size, 0, Math.PI * 2);
    c.fill();
  }

  showPause(show: boolean): void {
    this.pause.classList.toggle("hidden", !show);
  }

  showGameOver(
    score: number,
    wave: number,
    best: number,
    isNew: boolean,
  ): void {
    this.final.textContent = `Score ${score} · Reached wave ${wave}`;
    this.best.textContent = isNew ? `New high score!` : `Best: ${best}`;
    this.gameover.classList.remove("hidden");
  }

  hideGameOver(): void {
    this.gameover.classList.add("hidden");
  }
}
