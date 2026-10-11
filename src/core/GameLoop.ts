export type UpdateFn = (dt: number) => void;
export type RenderFn = (alpha: number) => void;

export class GameLoop {
  private readonly step = 1 / 60;
  private accumulator = 0;
  private last = 0;
  private rafId = 0;
  private running = false;

  private readonly update: UpdateFn;
  private readonly render: RenderFn;

  constructor(update: UpdateFn, render: RenderFn) {
    this.update = update;
    this.render = render;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private frame = (now: number): void => {
    if (!this.running) return;

    // Clamp so a background tab doesn't cause a huge catch-up spiral
    const delta = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    this.accumulator += delta;

    while (this.accumulator >= this.step) {
      this.update(this.step);
      this.accumulator -= this.step;
    }

    this.render(this.accumulator / this.step);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
