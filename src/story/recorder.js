// Iris Calder's audio logs: which ones you've found (kept in localStorage, see save.js), playback with
// subtitles and a "LOG 03 · Title" card, music ducking while she talks, and the pause menu's log list.
// The world devices that hand them out are entities/audiolog.js; the scripts are tools/audio/logs.json
// (voiced by tools/audio/tts.mjs, which also writes logdata.json with the subtitle timing).
import LOGS from './logdata.json';
import { audio } from '../audio.js';
import { loadLogs, writeLogs } from '../save.js';

const AUDIO_URL = `${import.meta.env.BASE_URL}audio/`;
const $ = (s) => document.querySelector(s);
const HOLD_TO_STOP = 0.5; // seconds holding T
const DUCK = 0.2; // music level while a log plays

export class Recorder {
  constructor(game) {
    this.game = game;
    this.logs = LOGS;
    this.found = new Set(loadLogs().filter((id) => LOGS.some((l) => l.id === id)));
    this.cur = null; // the log playing
    this.el = null; // <audio>, routed through the game's mixer once audio is unlocked
    this.card = $('#logcard');
    this.lineEl = this.card.querySelector('.log-line');
    this.barEl = this.card.querySelector('.log-bar i');
    this.holdEl = this.card.querySelector('.log-skip');
    this.holdT = 0;
    this.updateButton();
    audio.manifest.then(() => audio.prefetch(['log_pickup']));

    addEventListener('keydown', (e) => {
      if (!this.cur || e.repeat) return;
      if (e.code === 'Backspace') this.stop();
      if (e.code === 'KeyT') this.holdStart = performance.now();
    });
    addEventListener('keyup', (e) => e.code === 'KeyT' && (this.holdStart = 0));
    addEventListener('blur', () => (this.holdStart = 0));
    this.card.querySelector('.log-x').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.stop();
    });
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      const a = el?.dataset.action;
      if (a === 'logs') this.openList();
      else if (a === 'logs-back') this.game.showScreen('pause');
      else if (a === 'log-play') {
        if (this.cur?.id === el.dataset.log) this.stop();
        else this.play(el.dataset.log);
        this.renderList();
      }
    });
  }

  get total() {
    return this.logs.length;
  }

  has(id) {
    return this.found.has(id);
  }

  // Picked up in the world: remember it and start playing.
  collect(id) {
    const first = this.found.size === 0;
    this.found.add(id);
    writeLogs([...this.found]);
    this.updateButton();
    audio.sample('log_pickup', { gain: 0.9, vary: 0, dry: true });
    this.play(id);
    const n = this.found.size;
    this.game.hud.message(`Audio log recovered · ${n}/${this.total}${first ? '<br><small>Replay them from the pause menu.</small>' : ''}`, first ? 4 : 2.5);
  }

  play(id) {
    const log = this.logs.find((l) => l.id === id);
    if (!log) return;
    this.stop(true);
    this.cur = log;
    this.line = -1;
    this.t0 = performance.now();
    this.useClock = true; // until the audio actually plays, subtitles follow the wall clock
    this.card.querySelector('.log-tag').textContent = `LOG ${log.id}`;
    this.card.querySelector('.log-title').textContent = log.title;
    this.card.classList.remove('hidden', 'out');
    document.body.classList.add('log-on');
    this.holdEl.innerHTML = this.game.touchMode ? 'Tap <b>✕</b> to stop' : 'Hold <kbd>T</kbd> to stop';
    this.lineEl.textContent = '';
    if (audio.available?.has(log.file)) this.startAudio(log);
    this.duck(true);
    this.loop();
  }

  startAudio(log) {
    if (!this.el) {
      this.el = new Audio();
      this.el.preload = 'auto';
      const ctx = audio.ctx;
      if (ctx && audio.master) {
        // a field-recorder voice: thinned lows, rolled-off highs, a little presence, dry (no room reverb)
        const src = ctx.createMediaElementSource(this.el);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 170;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 7200;
        const pk = ctx.createBiquadFilter();
        pk.type = 'peaking';
        pk.frequency.value = 2600;
        pk.gain.value = 3;
        const g = ctx.createGain();
        g.gain.value = 1.5;
        src.connect(hp).connect(pk).connect(lp).connect(g).connect(audio.master);
      } else this.el.volume = this.game.settings.volume;
    }
    const el = this.el;
    el.src = AUDIO_URL + log.file + '.mp3';
    el.currentTime = 0;
    el.play().then(
      () => this.cur === log && (this.useClock = false),
      () => {}, // blocked or missing: the subtitles still run on the clock
    );
  }

  // Music sits under her voice (the same duck the upgrade stinger uses), then comes back.
  duck(on) {
    const ctx = audio.ctx, d = audio.musicDuck;
    if (!ctx || !d) return;
    const g = d.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(on ? DUCK : 1, t, on ? 0.25 : 0.9);
  }

  stop(quiet = false) {
    if (!this.cur) return;
    this.cur = null;
    this.holdStart = 0;
    if (this.el) this.el.pause();
    cancelAnimationFrame(this.raf);
    this.duck(false);
    if (quiet) return;
    document.body.classList.remove('log-on');
    this.card.classList.add('out');
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => !this.cur && this.card.classList.add('hidden'), 600);
    this.renderList();
  }

  // Subtitles, progress and the hold-to-stop key, every animation frame while a log plays (it keeps
  // playing as you move, and through the pause menu).
  loop() {
    const log = this.cur;
    if (!log) return;
    const t = this.useClock ? (performance.now() - this.t0) / 1000 : this.el.currentTime;
    let k = -1;
    for (let i = 0; i < log.lines.length; i++) if (log.lines[i].t <= t + 0.05) k = i;
    if (k !== this.line) {
      this.line = k;
      this.lineEl.classList.remove('in');
      void this.lineEl.offsetWidth; // restart the fade-in
      this.lineEl.textContent = k >= 0 ? log.lines[k].text : '';
      this.lineEl.classList.add('in');
    }
    this.barEl.style.width = `${Math.min(100, (100 * t) / log.dur).toFixed(1)}%`;
    const held = this.holdStart ? (performance.now() - this.holdStart) / 1000 : 0;
    this.holdEl.style.setProperty('--hold', Math.min(1, held / HOLD_TO_STOP));
    if (held >= HOLD_TO_STOP || t > log.dur + 0.4 || (!this.useClock && this.el.ended)) return this.stop();
    this.raf = requestAnimationFrame(() => this.loop());
  }

  updateButton() {
    const b = $('#logs-btn');
    if (b) b.textContent = `Logs ${this.found.size}/${this.total}`;
  }

  openList() {
    this.game.showScreen('logs');
    this.renderList();
  }

  renderList() {
    $('#logs-count').textContent = `${this.found.size} of ${this.total} recovered · recorded by Dr. Iris Calder`;
    const list = $('#logs-list');
    list.innerHTML = '';
    for (const log of this.logs) {
      const row = document.createElement('button');
      const got = this.found.has(log.id);
      row.className = 'log-row' + (got ? '' : ' locked') + (this.cur?.id === log.id ? ' playing' : '');
      row.disabled = !got;
      if (got) {
        row.dataset.action = 'log-play';
        row.dataset.log = log.id;
      }
      const m = Math.floor(log.dur / 60), s = String(Math.round(log.dur % 60)).padStart(2, '0');
      row.innerHTML = `<span class="n">${log.id}</span><span class="t">${got ? log.title : '— not found —'}</span>` +
        `<span class="w">${got ? log.where : ''}</span><span class="d">${got ? (this.cur?.id === log.id ? '■' : `▶ ${m}:${s}`) : ''}</span>`;
      list.appendChild(row);
    }
  }
}
