export class Input {
  private readonly element: HTMLElement;

  private down = new Set<string>();
  private pressed = new Set<string>();
  private buttons = new Set<number>();
  private buttonsPressed = new Set<number>();
  private mouseDX = 0;
  private mouseDY = 0;

  constructor(element: HTMLElement) {
    this.element = element;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("blur", this.reset);
    element.addEventListener("click", this.lock);
  }

  get isLocked(): boolean {
    return document.pointerLockElement === this.element;
  }

  /** Held down right now. Use KeyboardEvent.code, e.g. "KeyW", "Space". */
  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** True only on the tick the key went down. */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** 0 = left, 1 = middle, 2 = right. */
  isButtonDown(button: number): boolean {
    return this.buttons.has(button);
  }

  wasButtonPressed(button: number): boolean {
    return this.buttonsPressed.has(button);
  }

  /** Returns accumulated mouse movement since the last call, then resets it. */
  consumeMouseDelta(): { x: number; y: number } {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  /** Call once at the END of every fixed update tick. */
  endTick(): void {
    this.pressed.clear();
    this.buttonsPressed.clear();
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("blur", this.reset);
    this.element.removeEventListener("click", this.lock);
  }

  private lock = (): void => {
    if (!this.isLocked) this.element.requestPointerLock();
  };

  private reset = (): void => {
    this.down.clear();
    this.pressed.clear();
    this.buttons.clear();
    this.buttonsPressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === "Space") e.preventDefault();
    if (!this.down.has(e.code)) this.pressed.add(e.code);
    this.down.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.isLocked) return;
    this.buttons.add(e.button);
    this.buttonsPressed.add(e.button);
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.buttons.delete(e.button);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isLocked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };
}
