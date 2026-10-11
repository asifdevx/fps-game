import { Input } from "../core/Input";

const CSS = `
html, body { touch-action: none; overscroll-behavior: none; }
#touch, #touch * { touch-action: none; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
#touch { position: fixed; inset: 0; z-index: 5; pointer-events: none; }
.overlay { z-index: 10; }

.tzone { position: absolute; top: 0; bottom: 0; pointer-events: auto; }
#t-move { left: 0; width: 42%; }
#t-look { right: 0; width: 58%; }
#t-base { position: absolute; display: none; width: 120px; height: 120px; margin: -60px 0 0 -60px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.35); background: rgba(255,255,255,0.08); }
#t-knob { position: absolute; top: 50%; left: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%; background: rgba(255,255,255,0.45); }

.tbtn { position: absolute; pointer-events: auto; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 2px solid rgba(255,255,255,0.45); background: rgba(255,255,255,0.12); font: 700 13px system-ui, sans-serif; color: #fff; text-shadow: 0 1px 3px #000; }
.tbtn.on { background: rgba(255,255,255,0.4); }
#t-fire { right: 24px; bottom: 110px; width: 92px; height: 92px; background: rgba(255,60,60,0.28); border-color: rgba(255,90,90,0.8); }
#t-ads { right: 128px; bottom: 120px; width: 60px; height: 60px; }
#t-jump { right: 34px; bottom: 214px; width: 60px; height: 60px; }
#t-reload { right: 110px; bottom: 214px; width: 60px; height: 60px; }
#t-pause, .tw { top: 12px; width: 44px; height: 44px; border-radius: 10px; }
#t-pause { right: 12px; }

#t-rotate { display: none; position: fixed; inset: 0; z-index: 20; align-items: center; justify-content: center; padding: 24px; background: #000; color: #fff; font: 600 20px system-ui, sans-serif; text-align: center; }
@media (orientation: portrait) { #t-rotate { display: flex; } }
`;

const q = (id: string): HTMLElement => document.getElementById(id)!;

export function setupTouchControls(input: Input): void {
  if (!input.isTouch) return;

  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const title = document.querySelector("#pause h1");
  const help = document.querySelector("#pause p");
  if (title) title.textContent = "Tap to play";
  if (help) {
    help.innerHTML =
      "Left thumb: move (push fully forward to sprint)<br />" +
      "Right thumb: drag to look<br />" +
      "Buttons: fire, aim, jump, reload, weapons";
  }

  const root = document.createElement("div");
  root.id = "touch";
  root.innerHTML = `
    <div id="t-move" class="tzone"><div id="t-base"><div id="t-knob"></div></div></div>
    <div id="t-look" class="tzone"></div>
    <div id="t-fire" class="tbtn">FIRE</div>
    <div id="t-ads" class="tbtn">AIM</div>
    <div id="t-jump" class="tbtn">JUMP</div>
    <div id="t-reload" class="tbtn">RELOAD</div>
    <div id="t-pause" class="tbtn">II</div>
    <div id="t-w1" class="tbtn tw" style="right:68px">1</div>
    <div id="t-w2" class="tbtn tw" style="right:118px">2</div>
    <div id="t-w3" class="tbtn tw" style="right:168px">3</div>
  `;
  document.body.appendChild(root);

  const rotate = document.createElement("div");
  rotate.id = "t-rotate";
  rotate.textContent = "Rotate your device to landscape to play";
  document.body.appendChild(rotate);

  // --- Floating joystick (left side) ---
  const R = 60;
  const move = q("t-move");
  const base = q("t-base");
  const knob = q("t-knob");
  let moveId = -1;
  let ox = 0;
  let oy = 0;

  const setStick = (x: number, y: number): void => {
    let dx = x - ox;
    let dy = y - oy;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const vx = dx / R;
    const vy = dy / R;
    input.setKey("KeyW", vy < -0.3);
    input.setKey("KeyS", vy > 0.3);
    input.setKey("KeyA", vx < -0.3);
    input.setKey("KeyD", vx > 0.3);
    input.setKey("ShiftLeft", vy < -0.5 && Math.hypot(vx, vy) > 0.95);
  };

  const clearStick = (): void => {
    moveId = -1;
    base.style.display = "none";
    knob.style.transform = "";
    for (const k of ["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft"])
      input.setKey(k, false);
  };

  move.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      if (moveId !== -1) return;
      const t = e.changedTouches[0];
      moveId = t.identifier;
      ox = t.clientX;
      oy = t.clientY;
      base.style.left = `${ox}px`;
      base.style.top = `${oy}px`;
      base.style.display = "block";
      setStick(ox, oy);
    },
    { passive: false },
  );

  move.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === moveId) setStick(t.clientX, t.clientY);
      }
    },
    { passive: false },
  );

  const endMove = (e: TouchEvent): void => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === moveId) clearStick();
    }
  };
  move.addEventListener("touchend", endMove, { passive: false });
  move.addEventListener("touchcancel", endMove, { passive: false });

  // --- Look (right side drag) ---
  const LOOK = 1.8; // touch drag to mouse-pixel multiplier
  const look = q("t-look");
  let lookId = -1;
  let lx = 0;
  let ly = 0;

  look.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      if (lookId !== -1) return;
      const t = e.changedTouches[0];
      lookId = t.identifier;
      lx = t.clientX;
      ly = t.clientY;
    },
    { passive: false },
  );

  look.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== lookId) continue;
        input.addLook((t.clientX - lx) * LOOK, (t.clientY - ly) * LOOK);
        lx = t.clientX;
        ly = t.clientY;
      }
    },
    { passive: false },
  );

  const endLook = (e: TouchEvent): void => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === lookId) lookId = -1;
    }
  };
  look.addEventListener("touchend", endLook, { passive: false });
  look.addEventListener("touchcancel", endLook, { passive: false });

  // --- Buttons ---
  const hold = (id: string, onDown: () => void, onUp: () => void): void => {
    const el = q(id);
    el.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        el.classList.add("on");
        onDown();
      },
      { passive: false },
    );
    const end = (e: TouchEvent): void => {
      e.preventDefault();
      el.classList.remove("on");
      onUp();
    };
    el.addEventListener("touchend", end, { passive: false });
    el.addEventListener("touchcancel", end, { passive: false });
  };

  hold(
    "t-fire",
    () => input.setButton(0, true),
    () => input.setButton(0, false),
  );
  hold(
    "t-ads",
    () => input.setButton(2, true),
    () => input.setButton(2, false),
  );
  hold(
    "t-jump",
    () => input.setKey("Space", true),
    () => input.setKey("Space", false),
  );
  hold(
    "t-reload",
    () => input.setKey("KeyR", true),
    () => input.setKey("KeyR", false),
  );
  for (const n of [1, 2, 3]) {
    hold(
      `t-w${n}`,
      () => input.setKey(`Digit${n}`, true),
      () => input.setKey(`Digit${n}`, false),
    );
  }
  hold(
    "t-pause",
    () => {},
    () => input.release(),
  );

  // --- Fullscreen + landscape lock where the browser allows it (Android Chrome) ---
  q("pause").addEventListener("click", () => {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen()
      .then(() => {
        const o = screen.orientation as unknown as {
          lock?: (o: string) => Promise<void>;
        };
        void o.lock?.("landscape")?.catch(() => {});
      })
      .catch(() => {});
  });
}
