// Keyboard + mouse state with per-frame edge detection and pointer lock.
export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDown = false;
    this.mousePressed = false;
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.stick = null; // analog move vector { f, r } from the touch stick
    this.locked = false;
    this.lockFailed = false; // pointer lock refused: fall back to plain mouse input while playing
    this.active = false; // set by the game while gameplay is running
    this.onLockChange = null;

    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.locked && (['Space', 'Tab', 'KeyQ', 'KeyE'].includes(e.code) || e.ctrlKey)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    addEventListener('mousedown', (e) => {
      if (!this.capturing) return;
      if (e.button === 0) {
        this.mouseDown = true;
        this.mousePressed = true;
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.capturing) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    addEventListener(
      'wheel',
      (e) => {
        if (!this.capturing) return;
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      if (!this.locked) {
        this.mouseDown = false;
        this.keys.clear();
      }
      this.onLockChange?.(this.locked);
    });
  }

  get capturing() {
    return this.locked || (this.active && this.lockFailed);
  }

  requestLock() {
    const fail = () => (this.lockFailed = true);
    try {
      // A plain lock keeps the OS pointer speed/acceleration, which is what most players expect.
      const p = this.dom.requestPointerLock?.();
      if (p && p.catch) p.catch(fail);
      else if (!this.dom.requestPointerLock) fail();
    } catch {
      fail();
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code);
  }

  hit(code) {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed = false;
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
  }
}
