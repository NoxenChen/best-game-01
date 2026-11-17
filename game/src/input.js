// Keyboard and pointer input. Held keys give a steering vector and a held mouse
// button fires; one-shot presses (start or restart, pause, mute, upgrade choice)
// are queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const CHOICE = { Digit1: 1, Digit2: 2, Digit3: 3, Numpad1: 1, Numpad2: 2, Numpad3: 3 };

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let choice = 0;
  let mouseDown = false;
  /** Mouse position in canvas CSS pixels; converted to field coordinates by the renderer. */
  let mouseX = 0;
  let mouseY = 0;

  window.addEventListener('keydown', (event) => {
    if (MOVE_KEYS[event.code]) {
      held.add(event.code);
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (CHOICE[event.code]) {
      if (!event.repeat) choice = CHOICE[event.code];
    } else {
      return;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  return {
    /** Normalized WASD/arrows steering vector {x, y}, or {0, 0}. */
    move() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        const v = MOVE_KEYS[code];
        if (v) {
          x += v[0];
          y += v[1];
        }
      }
      const len = Math.hypot(x, y);
      return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
    },
    /** Whether the fire button is held. */
    firing() {
      return mouseDown;
    },
    /** Mouse position in canvas CSS pixels (the renderer maps it to the field). */
    mouse() {
      return { x: mouseX, y: mouseY };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The upgrade card number pressed since the last call (1, 2 or 3), else 0. */
    takeChoice() {
      const taken = choice;
      choice = 0;
      return taken;
    },
  };
}
