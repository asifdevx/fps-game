export type GunKind = "rifle" | "pistol" | "shotgun";

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  /** Call from a user gesture (click). Safe to call repeatedly. */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.ctx = ctx;
    this.master = master;
    this.noiseBuf = buf;
  }

  private tone(
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    type: OscillatorType = "square",
    delay = 0,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur);
  }

  private noise(dur: number, cutoff: number, vol: number, delay = 0): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noiseBuf) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur);
  }

  shoot(kind: GunKind): void {
    if (kind === "rifle") {
      this.noise(0.12, 3000, 0.5);
      this.tone(180, 50, 0.1, 0.5, "square");
    } else if (kind === "pistol") {
      this.noise(0.14, 4000, 0.5);
      this.tone(260, 70, 0.12, 0.5, "sawtooth");
    } else {
      this.noise(0.35, 1800, 0.9);
      this.tone(110, 30, 0.25, 0.8, "sawtooth");
    }
  }

  reload(dur: number): void {
    this.tone(900, 400, 0.04, 0.25, "square", dur * 0.2);
    this.tone(500, 300, 0.05, 0.25, "square", dur * 0.6);
    this.tone(1100, 600, 0.05, 0.3, "square", dur * 0.92);
  }

  empty(): void {
    this.tone(1200, 900, 0.03, 0.2, "square");
  }
  hit(headshot: boolean): void {
    this.tone(
      headshot ? 1400 : 900,
      headshot ? 900 : 500,
      0.06,
      0.3,
      "triangle",
    );
  }
  kill(): void {
    this.tone(300, 80, 0.2, 0.4, "sawtooth");
    this.noise(0.2, 800, 0.3);
  }
  hurt(): void {
    this.tone(120, 60, 0.25, 0.6, "sawtooth");
    this.noise(0.2, 500, 0.5);
  }
  enemyShot(): void {
    this.tone(600, 150, 0.15, 0.3, "square");
    this.noise(0.1, 2500, 0.25);
  }
  pickup(): void {
    this.tone(600, 900, 0.08, 0.3, "sine");
    this.tone(900, 1300, 0.1, 0.3, "sine", 0.07);
  }
  wave(): void {
    this.tone(110, 110, 0.7, 0.4, "sawtooth");
    this.tone(165, 165, 0.7, 0.3, "sawtooth");
  }
  step(): void {
    this.noise(0.05, 400, 0.12);
  }
  gameOver(): void {
    this.tone(200, 40, 1.0, 0.5, "sawtooth");
  }
}
