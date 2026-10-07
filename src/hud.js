// DOM heads-up display: health, color slots, crosshair, messages, zone titles and the boss bar.
import { COLORS } from './colors.js';

const $ = (s) => document.querySelector(s);

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
  }

  show(v) {
    this.root.classList.toggle('hidden', !v);
  }

  buildColors(blaster) {
    this.colorsEl.innerHTML = '';
    this.slots = COLORS.map((c, i) => {
      const el = document.createElement('div');
      el.className = 'cslot';
      el.style.setProperty('--c', c.css);
      el.innerHTML = `<div class="sw"></div><div class="k">${i + 1}</div>`;
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
    this.msg.innerHTML = html;
    this.msg.classList.add('show');
    this.msgTimer = time;
  }

  zoneTitle(sub, main, color = '#fff') {
    this.zone.querySelector('.zone-sub').textContent = sub;
    this.zone.querySelector('.zone-main').textContent = main;
    this.zone.style.setProperty('--zc', color);
    this.zone.classList.add('show');
    this.zoneTimer = 3.5;
  }

  hurt(amount) {
    this.hurtLevel = Math.min(1, this.hurtLevel + amount / 35);
  }

  flash(color) {
    this.vignette.style.background = color;
    this.hurtLevel = 1;
    setTimeout(() => (this.vignette.style.background = ''), 250);
  }

  hitmarker(immune) {
    this.hit.classList.remove('show', 'immune');
    void this.hit.offsetWidth; // restart the CSS animation
    this.hit.classList.add('show');
    if (immune) this.hit.classList.add('immune');
  }

  bossShow(v) {
    this.bossEl.classList.toggle('hidden', !v);
  }

  bossBar(frac) {
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
