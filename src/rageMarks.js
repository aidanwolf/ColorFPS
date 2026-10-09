// The rage marks: small HUD glyphs floating over regular enemies (see entities/rage.js).
//  - WARNING: you're aiming at an enemy (for 0.15 s) with a color that can't hurt it (its outer shield
//    layer, else its body), or you just hit it with one. A "!" triangle in the color it NEEDS (so it
//    tells you what to switch to), ringed by one segment per wrong hit building toward its rage.
//  - AGGRO: the ring fills and the warning pops into an angry red-orange badge that stays over it while
//    it's enraged, its timer ring running down, then fades as it calms.
// DOM elements in the HUD layer (crisp at any size, no draw calls), projected each frame. At most MAX at once
// (the enraged first, then the one you're aiming at, then the nearest), never over bosses (they carry no
// rage), hidden whenever the game isn't playing, scaled with distance, and hidden behind walls (a line of
// sight check a few times a second).
import * as THREE from 'three';
import { COLORS } from './colors.js';
import { outerColor } from './entities/colorShield.js';

const MAX = 3;
const HITS = 3; // ring segments: wrong hits to a rage (RAGE.hits in entities/rage.js)
const AIM_T = 0.15; // s on target before the warning shows
const PROBE = 1 / 15; // s between crosshair probes (one ray)
const HOLD = 1.6; // s a warning lingers after the last wrong hit
const AIM_HOLD = 0.45; // and after you stop aiming
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

// three 110° arcs round the glyph: one per wrong hit toward a rage
function arc(r, a0, a1) {
  const p = (a) => `${(Math.sin(a) * r).toFixed(2)} ${(-Math.cos(a) * r).toFixed(2)}`;
  return `M${p(a0)} A${r} ${r} 0 0 1 ${p(a1)}`;
}
const SEGS = Array.from({ length: HITS }, (_, i) => {
  const step = (Math.PI * 2) / HITS;
  return arc(23, i * step + 0.17, (i + 1) * step - 0.17);
});
// the aggro badge: a jagged burst with a scowling visor and "!!"
const BURST = (() => {
  const pts = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2, r = i % 2 ? 15.5 : 21 + (i % 4 === 0 ? 2.5 : 0);
    pts.push(`${(Math.sin(a) * r).toFixed(1)},${(-Math.cos(a) * r).toFixed(1)}`);
  }
  return pts.join(' ');
})();
const TIMER_C = 2 * Math.PI * 26;
const SVG = `<svg viewBox="-32 -32 64 64" aria-hidden="true">
  <g class="rm-warn">
    <circle r="23" class="rm-back"/>
    ${SEGS.map((d, i) => `<path class="rm-seg" data-i="${i}" d="${d}"/>`).join('')}
    <path class="rm-tri" d="M0 -14.5 L13.5 10 L-13.5 10 Z"/>
    <rect class="rm-bang" x="-1.9" y="-7.5" width="3.8" height="10" rx="1.2"/>
    <circle class="rm-bang" cx="0" cy="6.4" r="2.1"/>
  </g>
  <g class="rm-rage">
    <circle r="26" class="rm-timer" stroke-dasharray="${TIMER_C.toFixed(1)}"/>
    <polygon class="rm-burst" points="${BURST}"/>
    <path class="rm-face" d="M-11 -5 L-3 -1.5 L-3 1.5 L-11 0.5 Z M11 -5 L3 -1.5 L3 1.5 L11 0.5 Z"/>
    <path class="rm-mouth" d="M-8 9 L-4 6 L0 9 L4 6 L8 9"/>
    <text class="rm-bangs" x="0" y="-8.5">!!</text>
  </g>
</svg>`;

class Marks {
  constructor() {
    this.game = null;
    this.list = new Map(); // enemy -> mark state
    this.pool = [];
    this.root = null;
    this.probeT = 0;
    this.target = null; // the enemy under the crosshair with a wrong color
    this.targetT = 0;
  }

  // start updating with this game's frames (once)
  hook(game) {
    if (this.game === game || !game?.frameCallbacks) return !!this.game;
    this.game = game;
    if (typeof document === 'undefined') return false;
    this.root = document.createElement('div');
    this.root.id = 'rage-marks';
    (document.querySelector('#hud') || document.body).appendChild(this.root);
    game.frameCallbacks.push((dt) => this.update(dt));
    return true;
  }

  mark(e) {
    if (!this.hook(e.world?.game)) return null;
    let m = this.list.get(e);
    if (!m) this.list.set(e, (m = { e, warn: 0, aim: 0, rage: false, alpha: 0, los: true, losT: 0, el: null, recent: -1, needHex: -1, popT: 0, mode: '' }));
    return m;
  }

  // a wrong-color hit on `e`
  warn(e) {
    const m = this.mark(e);
    if (m) m.warn = HOLD;
  }

  // `e` just went berserk: the warning pops into the aggro badge
  enrage(e) {
    const m = this.mark(e);
    if (!m) return;
    m.rage = true;
    m.popT = 0.5;
    m.warn = 0;
    m.los = true;
  }

  // where the glyph floats: over its head
  anchor(e, out) {
    if (e.markAnchor) return e.markAnchor(out);
    if (e.height) return out.copy(e.pos).setY(e.pos.y + e.height + 0.5);
    return out.copy(e.pos).setY(e.pos.y + 1.7);
  }

  probe(game) {
    const cam = game.camera;
    cam.getWorldDirection(_d);
    const hit = game.world.raycast(cam.position, _d, 90);
    const e = hit?.entity;
    const wrong = e && e.rage && !e.dead && game.blaster?.has && outerColor(e) !== game.blaster.color;
    if (wrong && e === this.target) this.targetT += PROBE;
    else {
      this.target = wrong ? e : null;
      this.targetT = 0;
    }
    if (this.target && this.targetT + PROBE >= AIM_T) {
      const m = this.mark(this.target);
      if (m) {
        m.aim = AIM_HOLD;
        m.los = true;
      }
    }
  }

  update(dt) {
    const game = this.game;
    const playing = game.state === 'playing' && !game.rulesPaused;
    this.root.style.display = playing ? '' : 'none';
    if (!playing) return;
    if ((this.probeT -= dt) <= 0) {
      this.probeT = PROBE;
      this.probe(game);
    }
    const cam = game.camera;
    const W = innerWidth, H = innerHeight;
    // who's showing: live marks, enraged first, then the one you're aiming at, then the nearest
    const live = [];
    for (const m of this.list.values()) {
      const e = m.e;
      if (e.dead || e.gone || e.world !== game.world) {
        this.drop(m);
        continue;
      }
      m.warn = Math.max(0, m.warn - dt);
      m.aim = Math.max(0, m.aim - dt);
      m.popT = Math.max(0, m.popT - dt);
      if (m.rage && !e.rage.on) m.rage = false;
      m.want = m.rage || m.warn > 0 || m.aim > 0;
      if ((m.losT -= dt) <= 0) {
        m.losT = 0.25;
        m.los = e === this.target || game.world.lineOfSight(cam.position, this.anchor(e, _v));
      }
      m.dist = cam.position.distanceTo(e.pos);
      if (!m.want && m.alpha <= 0.01) {
        this.drop(m);
        continue;
      }
      live.push(m);
    }
    live.sort((a, b) => (b.rage - a.rage) || ((b.e === this.target) - (a.e === this.target)) || a.dist - b.dist);
    live.forEach((m, i) => {
      const show = m.want && m.los && i < MAX;
      m.alpha += ((show ? 1 : 0) - m.alpha) * Math.min(1, dt * (show ? 14 : 6));
      this.draw(m, cam, W, H);
    });
  }

  draw(m, cam, W, H) {
    const p = this.anchor(m.e, _v).project(cam);
    if (p.z > 1 || p.z < -1 || m.alpha < 0.02) {
      if (m.el) m.el.style.opacity = 0;
      return;
    }
    const el = (m.el ??= this.take());
    const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
    const s = THREE.MathUtils.clamp(10 / Math.max(1, m.dist), 0.55, 1.25) * (m.rage ? 1.15 : 1);
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${s.toFixed(3)})`;
    el.style.opacity = m.alpha.toFixed(3);
    const mode = m.rage ? 'rage' : 'warn';
    if (mode !== m.mode) {
      el.classList.toggle('rage', m.rage);
      el.classList.remove('ending');
      m.recent = m.needHex = -1;
      if (m.rage) {
        el.classList.remove('pop');
        void el.offsetWidth; // restart the pop animation
        el.classList.add('pop');
      }
      m.mode = mode;
    }
    if (m.rage) {
      const k = Math.max(0, m.e.rage.left / m.e.rage.span);
      el.timer.style.strokeDashoffset = (TIMER_C * (1 - k)).toFixed(1);
      el.classList.toggle('ending', m.e.rage.left < 1.5);
      return;
    }
    const need = outerColor(m.e);
    if (need !== m.needHex && COLORS[need]) {
      m.needHex = need;
      el.style.setProperty('--need', '#' + COLORS[need].hex.toString(16).padStart(6, '0'));
    }
    const n = m.e.rage.recent;
    if (n !== m.recent) {
      m.recent = n;
      el.segs.forEach((s, i) => s.classList.toggle('on', i < n));
      if (n > 0) {
        el.classList.remove('tick');
        void el.offsetWidth;
        el.classList.add('tick');
      }
    }
  }

  take() {
    let el = this.pool.pop();
    if (!el) {
      el = document.createElement('div');
      el.className = 'rmark';
      el.innerHTML = SVG;
      el.segs = [...el.querySelectorAll('.rm-seg')];
      el.timer = el.querySelector('.rm-timer');
      this.root.appendChild(el);
    }
    el.style.opacity = 0;
    el.classList.remove('rage', 'pop', 'tick', 'ending');
    return el;
  }

  drop(m) {
    this.list.delete(m.e);
    if (this.target === m.e) this.target = null;
    if (!m.el) return;
    m.el.style.opacity = 0;
    this.pool.push(m.el);
    m.el = null;
  }
}

export const marks = new Marks();
