// On-screen touch controls: a floating move stick on the left, drag-to-look on the right,
// and FIRE / JUMP / CROUCH / pause buttons. They feed the same Input object the keyboard
// and mouse use, so the player and blaster code don't need to know which device is active.

const STICK_RADIUS = 56;
const DEADZONE = 0.12;
// Finger pixels are coarser than mouse counts; at the default sensitivity (3) this makes a
// half-screen drag turn roughly 180°.
const LOOK_SCALE = 5.5;

export class TouchControls {
  constructor(input, { onPause }) {
    this.input = input;
    this.onPause = onPause;
    this.stickId = null;
    this.stickOrigin = { x: 0, y: 0 };
    this.looks = new Map(); // touch id → last position (look drags, including drags that start on FIRE)
    this.fireId = null;
    this.jumpId = null;
    this.crouched = false;

    const root = (this.root = document.createElement('div'));
    root.id = 'touch';
    root.hidden = true;
    root.innerHTML = `
      <div class="stick-hint">MOVE</div>
      <div class="stick"><div class="knob"></div></div>
      <button type="button" class="tbtn pause" data-btn="pause" aria-label="Pause">❚❚</button>
      <button type="button" class="tbtn crouch" data-btn="crouch">CROUCH</button>
      <button type="button" class="tbtn jump" data-btn="jump">JUMP</button>
      <button type="button" class="tbtn fire" data-btn="fire">FIRE</button>`;
    document.body.appendChild(root);
    this.stick = root.querySelector('.stick');
    this.knob = root.querySelector('.knob');
    this.crouchBtn = root.querySelector('.crouch');
    this.fireBtn = root.querySelector('.fire');
    this.jumpBtn = root.querySelector('.jump');

    const opts = { passive: false };
    root.addEventListener('touchstart', (e) => this.start(e), opts);
    root.addEventListener('touchmove', (e) => this.move(e), opts);
    root.addEventListener('touchend', (e) => this.end(e), opts);
    root.addEventListener('touchcancel', (e) => this.end(e), opts);
  }

  show(v) {
    if (this.root.hidden === !v) return;
    this.root.hidden = !v;
    if (!v) this.releaseAll();
  }

  start(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const btn = t.target.closest?.('[data-btn]')?.dataset.btn;
      if (btn === 'pause') {
        this.onPause();
      } else if (btn === 'fire') {
        this.fireId = t.identifier;
        this.input.mouseDown = true;
        this.input.mousePressed = true;
        this.fireBtn.classList.add('on');
        this.looks.set(t.identifier, { x: t.clientX, y: t.clientY });
      } else if (btn === 'jump') {
        this.jumpId = t.identifier;
        this.input.keys.add('Space');
        this.input.pressed.add('Space');
        this.jumpBtn.classList.add('on');
      } else if (btn === 'crouch') {
        this.setCrouch(!this.crouched);
      } else if (t.clientX < innerWidth * 0.42 && this.stickId === null) {
        this.stickId = t.identifier;
        this.stickOrigin = { x: t.clientX, y: t.clientY };
        this.stick.style.transform = `translate(${t.clientX}px, ${t.clientY}px)`;
        this.knob.style.transform = 'translate(0px, 0px)';
        this.stick.classList.add('on');
        this.root.classList.add('moving');
      } else {
        this.looks.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    }
  }

  move(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.stickId) {
        let dx = t.clientX - this.stickOrigin.x, dy = t.clientY - this.stickOrigin.y;
        const d = Math.hypot(dx, dy);
        if (d > STICK_RADIUS) {
          dx = (dx / d) * STICK_RADIUS;
          dy = (dy / d) * STICK_RADIUS;
        }
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
        const k = Math.min(1, d / STICK_RADIUS);
        if (k < DEADZONE) this.input.stick = null;
        else {
          // rescale past the dead zone so small pushes still walk slowly
          const s = (k - DEADZONE) / (1 - DEADZONE) / (k || 1);
          this.input.stick = { r: (dx / STICK_RADIUS) * s, f: (-dy / STICK_RADIUS) * s };
        }
      }
      const last = this.looks.get(t.identifier);
      if (last) {
        this.input.dx += (t.clientX - last.x) * LOOK_SCALE;
        this.input.dy += (t.clientY - last.y) * LOOK_SCALE;
        last.x = t.clientX;
        last.y = t.clientY;
      }
    }
  }

  end(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const id = t.identifier;
      if (id === this.stickId) {
        this.stickId = null;
        this.input.stick = null;
        this.stick.classList.remove('on');
        this.root.classList.remove('moving');
      }
      if (id === this.fireId) {
        this.fireId = null;
        this.input.mouseDown = false;
        this.fireBtn.classList.remove('on');
      }
      if (id === this.jumpId) {
        this.jumpId = null;
        this.input.keys.delete('Space');
        this.jumpBtn.classList.remove('on');
      }
      this.looks.delete(id);
    }
  }

  setCrouch(on) {
    this.crouched = on;
    if (on) this.input.keys.add('TouchCrouch');
    else this.input.keys.delete('TouchCrouch');
    this.crouchBtn.classList.toggle('on', on);
  }

  // Drop every held control, e.g. when a menu opens mid-touch. Crouch is a toggle, so it stays.
  releaseAll() {
    this.stickId = this.fireId = this.jumpId = null;
    this.looks.clear();
    this.input.stick = null;
    this.input.mouseDown = false;
    this.input.keys.delete('Space');
    this.stick.classList.remove('on');
    this.root.classList.remove('moving');
    this.fireBtn.classList.remove('on');
    this.jumpBtn.classList.remove('on');
  }
}
