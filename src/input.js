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
    this.lockFailed = false; // pointer lock unavailable here (e.g. an embed without it): plain mouse input while playing
    this.everLocked = false; // a lock has worked on this page, so a refusal is only Chrome's cool-down after Esc
    this.refusals = 0;
    this.onLockRefused = null; // a request was turned down (try again on the next click)
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
      if (this.locked) {
        this.everLocked = true;
        this.refusals = 0;
        this.lockFailed = false;
      } else {
        this.mouseDown = false;
        this.keys.clear();
      }
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('pointerlockerror', () => this.refused());
  }

  get capturing() {
    return this.locked || (this.active && this.lockFailed);
  }

  requestLock() {
    if (!this.dom.requestPointerLock) return void (this.lockFailed = true);
    try {
      // A plain lock keeps the OS pointer speed/acceleration, which is what most players expect.
      const p = this.dom.requestPointerLock();
      if (p && p.catch) p.catch(() => this.refused());
    } catch {
      this.refused();
    }
  }

  // Chrome turns a lock down for about a second after Esc releases it: that's never a reason to stop
  // asking (the game pauses and the next click asks again). Only a page where it has never worked, twice
  // over, falls back to plain mouse input.
  refused() {
    if (this.locked) return;
    this.refusals++;
    if (!this.everLocked && this.refusals >= 2) this.lockFailed = true;
    else this.onLockRefused?.();
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
