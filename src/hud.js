// DOM heads-up display: health, color slots, crosshair, messages, zone titles and the boss bar.
import { COLORS } from './colors.js';

const $ = (s) => document.querySelector(s);

// Keyboard/mouse wording in hints, rewritten for touch controls.
const TOUCH_TEXT = [
  [/Switch colors with .*?last color\./, 'Tap the <b>color buttons</b> to switch colors fast.'],
  [/Hold <b>LMB<\/b> to fire\./, 'Hold <b>FIRE</b> to shoot. Drag on it to aim while firing.'],
  [/<b>LMB<\/b> to fire\./, 'Hold <b>FIRE</b> to shoot.'],
  [/<b>Space<\/b> to jump/, 'Tap <b>JUMP</b>'],
  [/hold <b>Ctrl<\/b> or <b>C<\/b> to crouch/, 'tap <b>CROUCH</b> to duck'],
  [/press <b>\d<\/b>/, 'tap its color button'],
];

export class Hud {
  constructor() {
    this.root = $('#hud');
    this.healthFill = $('#health .fill');
    this.healthValue = $('#health .value');
    this.colorsEl = $('#colors');
    this.msg = $('#message');
    this.zone = $('#zone-title');
    this.vignette = $('#vignette');
    this.hit = $('#hitmarker');
    this.bossEl = $('#boss-bar');
    this.bossFill = $('.boss-fill');
    this.bossGhost = $('.boss-ghost');
    this.bossHintEl = $('.boss-hint');
    this.secretsEl = $('#secrets');
    this.msgTimer = 0;
    this.zoneTimer = 0;
    this.hurtLevel = 0;
    this.hintTimer = 0;
    this.slots = [];
    this.fadeEl = $('#fade');
    this.deathEl = $('#death');
  }

  // Full-screen black fade, 0..1. With a duration it eases there via CSS.
  fade(v, secs = 0) {
    this.fadeEl.style.transition = secs ? `opacity ${secs}s` : 'none';
    this.fadeEl.style.opacity = v;
  }

  deathBanner(text, offerRevive = false) {
    this.deathEl.classList.toggle('show', !!text);
    if (!text) return;
    this.deathEl.querySelector('.death-main').textContent = text;
    this.deathEl.querySelector('.revive').classList.toggle('hidden', !offerRevive);
    this.deathEl.querySelector('.revive-key').textContent = this.touchMode ? 'Tap' : 'Press R';
  }

  show(v) {
    this.root.classList.toggle('hidden', !v);
  }

  // Breath while underwater (frac 0..1); hidden at full air above water.
  setAir(frac, show) {
    const el = (this.airEl ??= $('#air'));
    el.classList.toggle('hidden', !show);
    if (!show) return;
    (this.airFill ??= el.querySelector('.air-fill')).style.width = `${(frac * 100).toFixed(1)}%`;
    el.classList.toggle('low', frac < 0.3);
  }

  // The current goal, top-left. Flashes when it changes.
  setObjective(html, color = null) {
    if (html === this.objectiveHtml) return;
    this.objectiveHtml = html;
    const el = (this.objEl ??= $('#objective'));
    el.classList.toggle('none', !html);
    el.querySelector('.obj-text').innerHTML = html || '';
    el.style.setProperty('--oc', color || '');
    el.classList.remove('new');
    void el.offsetWidth; // restart the flash animation
    if (html) el.classList.add('new');
  }

  buildColors(blaster) {
    this.colorsEl.innerHTML = '';
    this.slots = COLORS.map((c, i) => {
      const el = document.createElement('div');
      el.className = 'cslot';
      el.style.setProperty('--c', c.css);
      el.innerHTML = `<div class="sw"></div><div class="k">${i + 1}</div>` +
        '<svg class="lock" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="currentColor"/></svg>';
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.onColor?.(i);
      });
      this.colorsEl.appendChild(el);
      return el;
    });
    this.setColor(blaster.color, blaster);
  }

  setColor(i, blaster) {
    document.documentElement.style.setProperty('--cur', blaster.has ? COLORS[i].css : '#ffffff');
    this.slots.forEach((el, k) => {
      el.classList.toggle('active', k === i && blaster.has);
      el.classList.toggle('locked', !blaster.unlocked[k]);
    });
  }

  setHealth(h, max) {
    this.healthFill.style.width = `${(100 * h) / max}%`;
    this.healthValue.textContent = Math.ceil(h);
  }

  setSecrets(found, total) {
    this.secretsEl.textContent = `SECRETS ${found}/${total}`;
  }

  message(html, time = 4) {
    if (this.touchMode) for (const [re, txt] of TOUCH_TEXT) html = html.replace(re, txt);
    this.msg.innerHTML = html;
    this.msg.classList.add('show');
    this.msgTimer = time;
  }

  // Letterboxed cutscene view: hides the gameplay HUD but keeps title cards and flashes.
  cinematic(on) {
    this.root.classList.toggle('cinematic', on);
  }

  whiteFlash() {
    this.fadeEl.style.background = '#fff';
    this.fade(1);
    requestAnimationFrame(() => {
      this.fade(0, 0.7);
      setTimeout(() => (this.fadeEl.style.background = ''), 750);
    });
  }

  zoneTitle(sub, main, color = '#fff', time = 3.5) {
    this.zone.querySelector('.zone-sub').textContent = sub;
    this.zone.querySelector('.zone-main').textContent = main;
    this.zone.style.setProperty('--zc', color);
    this.zone.classList.add('show');
    this.zoneTimer = time;
  }

  // armor (a one-hit shield): the badge over the color slots and a cyan rim round the screen
  setArmor(n) {
    this.armorEl ??= document.querySelector('#armor');
    this.armorEdge ??= document.querySelector('#armor-edge');
    if (n) {
      clearTimeout(this.armorDownT);
      this.armorEl.classList.remove('down');
      this.armorEl.querySelector('span').textContent = 'SHIELD';
    }
    if (n || !this.armorEl.classList.contains('down')) this.armorEl.classList.toggle('hidden', !n);
    this.root.classList.toggle('armored', !!n);
  }

  armorGain() {
    this.armorEl.classList.remove('gain');
    void this.armorEl.offsetWidth;
    this.armorEl.classList.add('gain');
    // the line explains it once a session; after that the badge pop says it
    if (this.armorTold) return;
    this.armorTold = true;
    this.message('<b style="color:#7ff6ff">SHIELD</b> up: it takes the next hit for you.', 2.2);
  }

  // the shield blows apart: the honeycomb round the screen bursts outward into shards, a white-cyan
  // flash, a red edge, and the badge flips to SHIELD DOWN before it fades: you're bare again
  armorBreak() {
    this.armorEdge ??= document.querySelector('#armor-edge');
    this.armorHex ??= document.querySelector('#armor-hex');
    this.shardLayer ??= document.querySelector('#shard-layer');
    for (const el of [this.armorEdge, this.armorHex]) {
      el.classList.remove('break');
      void el.offsetWidth;
      el.classList.add('break');
    }
    setTimeout(() => { this.armorEdge.classList.remove('break'); this.armorHex.classList.remove('break'); }, 800);
    const W = innerWidth, H = innerHeight;
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.36 + Math.random() * 0.16;
      const x = W / 2 + Math.cos(a) * W * r, y = H / 2 + Math.sin(a) * H * r;
      const d = 140 + Math.random() * 260;
      const el = document.createElement('div');
      el.className = 'hex-shard';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      el.style.setProperty('--dy', `${Math.sin(a) * d}px`);
      el.style.setProperty('--rot', `${(Math.random() - 0.5) * 720}deg`);
      el.style.animationDelay = `${Math.random() * 0.06}s`;
      const k = 0.6 + Math.random() * 0.9;
      el.style.width = `${26 * k}px`;
      el.style.height = `${30 * k}px`;
      this.shardLayer.appendChild(el);
      setTimeout(() => el.remove(), 900);
    }
    this.flash('radial-gradient(ellipse at center, transparent 35%, rgba(255, 30, 50, 0.75) 100%)');
    this.armorEl ??= document.querySelector('#armor');
    this.armorEl.classList.remove('hidden', 'gain', 'down');
    this.armorEl.querySelector('span').textContent = 'SHIELD DOWN';
    void this.armorEl.offsetWidth;
    this.armorEl.classList.add('down');
    clearTimeout(this.armorDownT);
    this.armorDownT = setTimeout(() => {
      this.armorEl.classList.remove('down');
      if (!this.root.classList.contains('armored')) this.armorEl.classList.add('hidden');
      this.armorEl.querySelector('span').textContent = 'SHIELD';
    }, 1350);
  }

  hurt(amount) {
    this.hurtLevel = Math.min(1, this.hurtLevel + amount / 35);
  }

  // burning in lava: the edges glow hotter as the grace runs out (k 0 → 1)
  burning(k) {
    this.hurtLevel = Math.max(this.hurtLevel, 0.45 + 0.55 * Math.min(1, k));
  }

  flash(color) {
    this.vignette.style.background = color;
    this.hurtLevel = 1;
    setTimeout(() => (this.vignette.style.background = ''), 250);
  }

  // crit: a weak-point hit (bigger, orange, with a punch)
  hitmarker(immune, crit = false) {
    this.hit.classList.remove('show', 'immune', 'crit');
    void this.hit.offsetWidth; // restart the CSS animation
    this.hit.classList.add('show');
    if (immune) this.hit.classList.add('immune');
    else if (crit) this.hit.classList.add('crit');
  }

  // A boss took a CRITICAL weak-point hit: the bar flares orange and a CRITICAL pops by the crosshair.
  bossCrit(pop = true) {
    this.bossPulse('crit');
    if (!pop) return;
    const now = performance.now();
    if (now - (this.lastPop || 0) < 110) return;
    this.lastPop = now;
    const el = document.createElement('div');
    el.className = 'crit-pop';
    el.textContent = 'CRITICAL';
    el.style.left = `calc(50% + ${(Math.random() * 2 - 1) * 46 + 28}px)`;
    el.style.top = `calc(50% - ${26 + Math.random() * 34}px)`;
    el.style.setProperty('--tilt', `${(Math.random() * 2 - 1) * 9}deg`);
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 650);
  }

  // restart the boss bar's flash ('hurt' on any damage, 'crit' on a weak-point hit)
  bossPulse(kind) {
    const el = this.bossEl;
    if (!el || el.classList.contains('hidden')) return;
    const now = performance.now();
    if (kind === 'hurt' && (el.classList.contains('crit') && now - (this.critAt || 0) < 300)) return;
    if (kind === 'crit') this.critAt = now;
    el.classList.remove('hurt', 'crit');
    void el.offsetWidth;
    el.classList.add(kind);
  }

  bossShow(v) {
    this.bossEl.classList.toggle('hidden', !v);
    this.bossEl.parentElement?.classList.toggle('boss-on', !!v); // the objective panel steps aside for the boss bar
  }

  bossBar(frac) {
    // any drop flashes the bar (the white ghost trails behind it)
    if (frac < (this.bossFrac ?? 1) - 1e-4 && frac > 0) this.bossPulse('hurt');
    this.bossFrac = frac;
    this.bossFill.style.width = `${frac * 100}%`;
    this.bossGhost.style.width = `${frac * 100}%`;
  }

  bossHint(text, urgent) {
    this.bossHintEl.textContent = text;
    this.bossHintEl.style.color = urgent ? '#fff' : '';
    this.hintTimer = 5;
  }

  update(dt) {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msg.classList.remove('show');
    }
    if (this.zoneTimer > 0) {
      this.zoneTimer -= dt;
      if (this.zoneTimer <= 0) this.zone.classList.remove('show');
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.bossHintEl.textContent = '';
    }
    this.hurtLevel = Math.max(0, this.hurtLevel - dt * 1.8);
    this.vignette.style.opacity = this.hurtLevel;
  }
}
