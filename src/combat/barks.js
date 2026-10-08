// Enemy voice barks: short robotic radio lines that make the enemies sound like they're coordinating and
// reacting to you ("I'm hit, cover me!"). The script is tools/audio/barks.json (voiced by
// tools/audio/barks.mjs into public/audio/bark_<id>.mp3); each world's robots have their own persona
// (voice, lines, a WebAudio robot chain and a subtitle tint):
//   foundry: Crimson Foundry welders        solar: Sunscorch mummies       verdant: spider bots, slime cores
//   azure:   squids, sub-drones, fish        lumen: the Lumen security network (drones, turrets, wardens,
//                                                   brutes, mortars)
// An enemy opts in with a `barkPersona` field; gameplay code calls say(enemy, event), died(enemy),
// player(event), and the combat director reports the attack tokens it grants (flank / suppress).
// Rules: one voice at a time; requests wait a moment for the channel and compete on priority, then distance (the
// nearest speaker wins); a global gap after each line, per-persona-event and per-speaker cooldowns, a
// shuffle bag per bucket so a line never repeats soon; only within earshot; never over one of Wren's audio
// logs (barks are skipped while one plays, and a bark in progress is cut when one starts). The voice is
// positional (panned and attenuated from the speaker, following it as it moves) and is cut with a burst of
// static if the speaker is destroyed mid-line. Every line also shows as a small radio-intercept subtitle
// (a setting); until a line's mp3 exists it plays as a synthetic robot babble through the same chain.
import SCRIPT from '../../tools/audio/barks.json';
import PACK from './barkpack.json'; // where each voiced line sits in its persona's barkpack_<persona>.mp3
import { audio } from '../audio.js';
import { director } from './director.js';
import { esfx } from '../entities/enemySfx.js';

const PERSONAS = SCRIPT.personas;
// event -> [priority, persona-event cooldown s, chance, earshot m]
const EVENTS = {
  taunt: [6, 0, 1, 40],
  ally_down: [4, 3.5, 0.85, 34],
  shield_break: [4, 6, 1, 36],
  hit: [3, 3.2, 0.75, 34],
  spot: [3, 6, 0.95, 40],
  charge: [2, 6, 0.8, 34],
  roll: [2, 4.5, 0.6, 30],
  reload: [2, 7, 0.7, 30],
  lost: [2, 9, 0.85, 34],
  hiding: [2, 12, 1, 34],
  flank: [2, 8, 0.6, 36],
  suppress: [1, 8, 0.45, 36],
  idle: [0, 14, 1, 20],
};
const GAP = 2.2; // s of quiet after a line before the next (more after idle chatter); priority 4+ cuts in anyway
const SPEAKER_COOL = 4;
const HIDE_T = 3.5; // s of nobody seeing you (while they're hunting you) before they call it out
const SCAN = 0.5;
const SUB_HOLD = 0.9; // s a subtitle stays up after its line

const isTalker = (e) => e && e.barkPersona && !e.dead && !e.dying && e.pos;

class Barks {
  constructor() {
    this.time = 0;
    this.buckets = new Map(); // persona:event -> { lines, bag, next }
    for (const l of SCRIPT.lines) {
      const k = l.persona + ':' + l.event;
      let b = this.buckets.get(k);
      if (!b) this.buckets.set(k, (b = { lines: [], bag: [], i: 0 }));
      b.lines.push(l);
    }
    this.cool = new Map(); // persona:event -> time it may play again
    this.cur = null; // the line speaking: { line, speaker, persona, end, src, g, pan, prio }
    this.quietUntil = 0;
    this.idleNext = 8;
    this.pending = { speaker: null, event: null, score: -Infinity, prio: 0, until: 0 }; // the best request waiting for the channel
    this.chains = {};
    this.unseenT = 0;
    this.hideNext = 0;
    this.scanT = 0;
    this.prefetched = new Set();
    this.log = []; // what played (for tests / debugging), last 200
    this.subsOn = true;
    this.el = null;
    this.subT = 0;
    director.onGrant = (e, n) => this.token(e, n);
  }

  attach(game) {
    this.game = game;
    this.subsOn = game.settings?.barkSubs !== false;
  }

  // ---------------------------------------------------------------- requests
  // `speaker` wants to say a line for `event`. Kept if it beats the request already waiting.
  say(speaker, event) {
    if (!isTalker(speaker) || !this.game) return false;
    const E = EVENTS[event];
    if (!E) return false;
    const persona = speaker.barkPersona;
    if (!this.buckets.has(persona + ':' + event)) return false;
    if ((this.cool.get(persona + ':' + event) ?? 0) > this.time) return false;
    if ((speaker._barkAt ?? -1e9) + SPEAKER_COOL > this.time && event !== 'taunt') return false;
    const d = audio.distTo(speaker.pos);
    if (d > E[3]) return false;
    if (Math.random() > E[2]) return false;
    const score = E[0] * 100 - d;
    const P = this.pending;
    if (P.speaker && score <= P.score) return false;
    P.speaker = speaker;
    P.event = event;
    P.score = score;
    P.prio = E[0];
    // it waits a moment for the channel (a line playing, the gap after one), then it's stale
    P.until = this.time + (E[0] >= 3 ? 1.6 : 0.9);
    return true;
  }

  clearPending() {
    this.pending.speaker = null;
    this.pending.score = -Infinity;
  }

  // An enemy was destroyed: the nearest other talker within 26 m of it reacts.
  died(e) {
    if (!this.game || !e?.pos) return;
    if (this.cur?.speaker === e) this.cut(true);
    const s = this.nearest((o) => o !== e && o.pos.distanceToSquared(e.pos) < 26 * 26);
    if (s) this.say(s, 'ally_down');
  }

  // Something happened to the player: the nearest enemy that's onto you comments.
  player(event, now = false) {
    if (!this.game) return;
    const s = this.nearest((o) => o.aggro || o.sees) || (event === 'taunt' ? this.nearest(() => true, 30) : null);
    if (!s) return;
    if (this.say(s, event) && now) this.flush();
  }

  // The combat director granted `e` an attack token (n holders now): call the play.
  token(e, n) {
    if (!isTalker(e)) return;
    this.say(e, n > 1 ? 'flank' : 'suppress');
  }

  nearest(pred, max = 40) {
    let best = null, bd = max;
    for (const e of this.game.world.entities) {
      if (!isTalker(e) || !pred(e)) continue;
      const d = audio.distTo(e.pos);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- per frame
  update(dt, game) {
    if (!this.game) this.attach(game);
    this.time += dt;
    const logOn = !!game.recorder?.cur;
    if (logOn && this.cur) this.cut(false);
    // the line playing: follow the speaker, end on time
    if (this.cur) {
      const c = this.cur;
      if (this.time >= c.end) this.finish();
      else if (c.speaker.dead || c.speaker.gone) this.cut(true);
      else this.place(c);
    }
    if (this.el && this.subT > 0 && (this.subT -= dt) <= 0) this.el.classList.remove('on');
    // occasional scans: who's around, are you hiding, idle chatter
    if ((this.scanT -= dt) <= 0) {
      this.scanT = SCAN;
      if (game.state === 'playing' && !game.player.dead) this.scan(game);
    }
    if (!logOn) this.flush();
    if (this.pending.speaker && this.time > this.pending.until) this.clearPending(); // (it waited for the channel too long)
  }

  scan(game) {
    let hunting = null, hd = 32, seen = false, idle = null, idd = 16;
    for (const e of game.world.entities) {
      if (!isTalker(e)) continue;
      const d = audio.distTo(e.pos);
      if (d < 70 && !this.prefetched.has(e.barkPersona)) this.prefetch(e.barkPersona);
      if (e.aggro) {
        if (e.sees) seen = true;
        if (d < hd) {
          hd = d;
          hunting = e;
        }
      } else if (d < idd) {
        idd = d;
        idle = e;
      }
    }
    // hiding: they're hunting you and nobody has had eyes on you for a while
    if (hunting && !seen) {
      this.unseenT += SCAN;
      if (this.unseenT >= HIDE_T && this.time >= this.hideNext) {
        if (this.say(hunting, 'hiding')) this.hideNext = this.time + 10;
      }
    } else this.unseenT = 0;
    if (idle && !hunting && this.time >= this.idleNext) {
      this.idleNext = this.time + 10 + Math.random() * 10;
      this.say(idle, 'idle');
    }
  }

  // play this frame's best request, if the channel is free (or it outranks what's playing)
  flush() {
    const P = this.pending;
    if (!P.speaker) return;
    if (P.speaker.dead || P.speaker.gone) return this.clearPending();
    if (this.cur) {
      if (P.prio < this.cur.prio + 2) return;
      this.cut(false);
    } else if (this.time < this.quietUntil && P.prio < 4) return;
    const persona = P.speaker.barkPersona;
    const line = this.pick(persona, P.event);
    if (!line) return;
    this.play(P.speaker, line, P.prio);
    this.cool.set(persona + ':' + P.event, this.time + EVENTS[P.event][1]);
    P.speaker._barkAt = this.time;
    this.clearPending();
  }

  // the next line from the bucket's shuffle bag
  pick(persona, event) {
    const b = this.buckets.get(persona + ':' + event);
    if (!b) return null;
    if (b.i >= b.bag.length) {
      const last = b.bag[b.bag.length - 1];
      b.bag = b.lines.slice().sort(() => Math.random() - 0.5);
      if (b.bag.length > 1 && b.bag[0] === last) b.bag.push(b.bag.shift());
      b.i = 0;
    }
    return b.bag[b.i++];
  }

  prefetch(persona) {
    this.prefetched.add(persona);
    audio.manifest?.then(() => audio.prefetch(['barkpack_' + persona]));
  }

  // ---------------------------------------------------------------- voice
  play(speaker, line, prio) {
    const P = PERSONAS[line.persona];
    const name = 'barkpack_' + line.persona, slice = PACK[line.persona]?.[line.id];
    const buf = slice && audio.ctx && audio.buffers.get(name);
    if (slice && audio.available?.has(name) && !buf) audio.prefetch([name]);
    const words = line.text.split(/\s+/).length;
    const dur = buf ? slice[1] : Math.min(2.6, Math.max(0.8, 0.3 + words * 0.3));
    const c = { line, speaker, prio, end: this.time + dur + 0.1, src: null, g: null, pan: null, babble: [] };
    this.cur = c;
    const ctx = audio.ctx;
    if (ctx && audio.sfxBus) {
      const chain = this.chain(line.persona);
      c.g = ctx.createGain();
      c.pan = ctx.createStereoPanner();
      c.g.connect(c.pan).connect(chain);
      this.place(c, true);
      const t0 = ctx.currentTime + 0.06;
      esfx('radio_squelch', speaker.pos, 1, 1);
      if (buf) {
        c.src = ctx.createBufferSource();
        c.src.buffer = buf;
        c.src.connect(c.g);
        c.src.start(t0, slice[0], slice[1]);
      } else this.babble(c, P.fx, t0, dur, words);
      esfx('radio_squelch', speaker.pos, 0.8, 0.85, dur + 0.08);
    }
    this.subtitle(P, line.text, dur);
    this.log.push({ t: +this.time.toFixed(2), event: line.event, persona: line.persona, id: line.id, text: line.text, dist: +audio.distTo(speaker.pos).toFixed(1), audio: !!buf, who: speaker.constructor?.name });
    if (this.log.length > 200) this.log.shift();
  }

  // a stand-in voice: syllable blips at the persona's pitch, through its robot chain
  babble(c, fx, t0, dur, words) {
    const ctx = audio.ctx;
    const n = Math.max(2, Math.round(words * 1.6));
    const step = dur / n;
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.15) continue; // gaps between "words"
      const t = t0 + i * step;
      const o = ctx.createOscillator();
      o.type = i % 3 ? 'sawtooth' : 'square';
      const f = fx.babble * (0.85 + Math.random() * 0.4) * (i === n - 1 ? 0.8 : 1);
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * (0.9 + Math.random() * 0.25), t + step * 0.8);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.85);
      o.connect(g).connect(c.g);
      o.start(t);
      o.stop(t + step);
      c.babble.push(o);
    }
  }

  // pan and level from the speaker (called every frame while it talks)
  place(c, snap = false) {
    if (!c.g) return;
    const p = c.speaker.pos;
    const d = audio.distTo(p);
    const g = 0.35 + 0.65 * Math.max(0, Math.min(1, 1 - (d - 5) / 35));
    const pan = audio.panOf(p);
    if (snap) {
      c.g.gain.value = g;
      c.pan.pan.value = pan;
    } else {
      const t = audio.ctx.currentTime;
      c.g.gain.setTargetAtTime(g, t, 0.08);
      c.pan.pan.setTargetAtTime(pan, t, 0.08);
    }
  }

  finish() {
    const c = this.cur;
    this.cur = null;
    this.quietUntil = this.time + GAP + (c.line.event === 'idle' ? 2 : 0);
    if (c.g) setTimeout(() => c.pan.disconnect(), 400);
  }

  // stop the line now (a log started, it was outranked); `lost`: the speaker died: static and a cut-off
  cut(lost) {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    this.quietUntil = this.time + 0.6;
    if (c.g && audio.ctx) {
      const t = audio.ctx.currentTime;
      c.g.gain.cancelScheduledValues(t);
      c.g.gain.setTargetAtTime(0, t, lost ? 0.03 : 0.06);
      try {
        c.src?.stop(t + 0.3);
      } catch {
        /* already stopped */
      }
      for (const o of c.babble) try { o.stop(t + 0.1); } catch { /* done */ }
      if (lost) audio.noise({ dur: 0.25, gain: 0.08, freq: 3000, q: 0.5 });
      setTimeout(() => c.pan.disconnect(), 500);
    }
    if (this.el) {
      if (lost && this.subT > 0) {
        this.el.querySelector('.bk-text').textContent += ' — [signal lost]';
        this.subT = 1.1;
      } else if (!lost) {
        this.el.classList.remove('on');
        this.subT = 0;
      }
    }
  }

  // One robot chain per persona, built on first use: highpass → ring-mod (dry/wet) → formant peak →
  // drive / crush → optional temple comb echo (solar) or warble (azure) → lowpass → the sfx bus (so it
  // gets the room reverb).
  chain(persona) {
    if (this.chains[persona]) return this.chains[persona];
    const ctx = audio.ctx, fx = PERSONAS[persona].fx;
    const input = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = fx.hp;
    input.connect(hp);
    const ring = ctx.createGain();
    ring.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.type = fx.ringType;
    osc.frequency.value = fx.ring;
    osc.connect(ring.gain);
    osc.start();
    const wet = ctx.createGain();
    wet.gain.value = fx.ringMix;
    const dry = ctx.createGain();
    dry.gain.value = 1 - fx.ringMix;
    const sum = ctx.createGain();
    hp.connect(ring).connect(wet).connect(sum);
    hp.connect(dry).connect(sum);
    const formant = ctx.createBiquadFilter();
    formant.type = 'peaking';
    formant.frequency.value = fx.formant;
    formant.Q.value = 3;
    formant.gain.value = fx.formantGain;
    sum.connect(formant);
    // drive + bit-crush in one curve: a soft clip, quantized to `bits` levels a side
    const shaper = ctx.createWaveShaper();
    const N = 1024, curve = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1;
      let y = Math.tanh(x * fx.drive) / Math.tanh(fx.drive);
      if (fx.bits) y = Math.round(y * fx.bits) / fx.bits;
      curve[i] = y;
    }
    shaper.curve = curve;
    formant.connect(shaper);
    let tail = shaper;
    if (fx.comb) {
      // a short metallic echo, like a voice inside a stone tomb
      const d = ctx.createDelay(0.5);
      d.delayTime.value = fx.comb;
      const fb = ctx.createGain();
      fb.gain.value = fx.combFb;
      const mix = ctx.createGain();
      tail.connect(mix);
      tail.connect(d).connect(fb).connect(d);
      d.connect(mix);
      tail = mix;
    }
    if (fx.wobble) {
      // a warbling delay line: the pitch drifts like sound through water
      const d = ctx.createDelay(0.1);
      d.delayTime.value = 0.012;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = fx.wobble;
      const depth = ctx.createGain();
      depth.gain.value = fx.wobbleDepth;
      lfo.connect(depth).connect(d.delayTime);
      lfo.start();
      tail.connect(d);
      tail = d;
    }
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = fx.lp;
    const out = ctx.createGain();
    out.gain.value = fx.gain;
    tail.connect(lp).connect(out).connect(audio.sfxBus);
    this.chains[persona] = input;
    return input;
  }

  // ---------------------------------------------------------------- subtitles
  subtitle(P, text, dur) {
    if (!this.subsOn || typeof document === 'undefined') return;
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.id = 'bark';
      this.el.innerHTML = '<span class="bk-tag"><i></i><b></b></span><span class="bk-text"></span>';
      document.body.appendChild(this.el);
    }
    this.el.style.setProperty('--bk', P.color);
    this.el.querySelector('.bk-tag b').textContent = P.label;
    this.el.querySelector('.bk-text').textContent = text;
    this.el.classList.remove('on');
    void this.el.offsetWidth; // restart the transition
    this.el.classList.add('on');
    this.subT = dur + SUB_HOLD;
  }

  setSubtitles(on) {
    this.subsOn = on;
    if (!on && this.el) this.el.classList.remove('on');
  }

  // the player respawned: silence, fresh cooldowns
  reset() {
    this.cut(false);
    this.cool.clear();
    this.clearPending();
    this.unseenT = 0;
    this.quietUntil = this.time + 2;
    this.idleNext = this.time + 8;
  }
}

export const barks = new Barks();
