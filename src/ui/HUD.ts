const $ = (id: string): HTMLElement => document.getElementById(id)!;

export class HUD {
  private health = $("health");
  private ammo = $("ammo");
  private reserve = $("reserve");
  private wave = $("wave");
  private score = $("score");
  private reload = $("reload");
  private hitmarker = $("hitmarker");
  private hurtEl = $("hurt");
  private pause = $("pause");
  private gameover = $("gameover");
  private final = $("final");
  private hitTimer = 0;
  private hurtTimer = 0;

  setHealth(v: number): void {
    this.health.textContent = String(Math.ceil(v));
  }
  setAmmo(ammo: number, reserve: number, reloading: boolean): void {
    this.ammo.textContent = String(ammo);
    this.reserve.textContent = String(reserve);
    this.reload.classList.toggle("show", reloading);
  }
  setWave(v: number): void {
    this.wave.textContent = String(v);
  }
  setScore(v: number): void {
    this.score.textContent = String(v);
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

  hurt(): void {
    this.hurtEl.classList.add("show");
    clearTimeout(this.hurtTimer);
    this.hurtTimer = window.setTimeout(
      () => this.hurtEl.classList.remove("show"),
      120,
    );
  }

  showPause(show: boolean): void {
    this.pause.classList.toggle("hidden", !show);
  }

  showGameOver(score: number, wave: number): void {
    this.final.textContent = `Score ${score} · Reached wave ${wave}`;
    this.gameover.classList.remove("hidden");
  }
  hideGameOver(): void {
    this.gameover.classList.add("hidden");
  }
}
