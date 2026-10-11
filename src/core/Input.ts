export class Input {
  /** True on phones and tablets (primary pointer is a finger). */
  readonly isTouch = window.matchMedia("(pointer: coarse)").matches;

  private readonly element: HTMLElement;
  private down = new Set<string>();
  private pressed = new Set<string>();
  private buttons = new Set<number>();
  private buttonsPressed = new Set<number>();
  private mouseDX = 0;
  private mouseDY = 0;
  private touchPlaying = false;

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

  /** Desktop: pointer is locked. Touch: the player has tapped to start. */
  get isLocked(): boolean {
    return this.isTouch
      ? this.touchPlaying
      : document.pointerLockElement === this.element;
  }

  /** Pause / stop capturing input (exits pointer lock, or ends touch play). */
  release(): void {
    if (this.isTouch) {
      this.touchPlaying = false;
      this.reset();
    } else {
      document.exitPointerLock();
    }
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

  // --- Used by the touch UI to fake keyboard/mouse input ---
  setKey(code: string, isDown: boolean): void {
    if (isDown) {
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    } else {
      this.down.delete(code);
    }
  }

  setButton(button: number, isDown: boolean): void {
    if (isDown) {
      if (!this.buttons.has(button)) this.buttonsPressed.add(button);
      this.buttons.add(button);
    } else {
      this.buttons.delete(button);
    }
  }

  addLook(dx: number, dy: number): void {
    this.mouseDX += dx;
    this.mouseDY += dy;
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
    if (this.isTouch) {
      this.touchPlaying = true;
      return;
    }
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
    this.setKey(e.code, true);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (this.isTouch || !this.isLocked) return; // ignore synthesized mouse events on touch
    this.setButton(e.button, true);
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.buttons.delete(e.button);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.isTouch || !this.isLocked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };
}
