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
    this.locked = false;
    this.onLockChange = null;

    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.locked && ['Space', 'Tab', 'KeyQ', 'KeyE'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) {
        this.mouseDown = true;
        this.mousePressed = true;
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    addEventListener(
      'wheel',
      (e) => {
        if (!this.locked) return;
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

  requestLock() {
    const p = this.dom.requestPointerLock?.({ unadjustedMovement: true });
    // Some browsers reject unadjustedMovement; fall back to a plain lock.
    if (p && p.catch) p.catch(() => this.dom.requestPointerLock());
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
