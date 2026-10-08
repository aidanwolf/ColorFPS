// THE FINAL BATTLE — the Prism Warden, the machine's fail-safe, wakes once every world has gone dark and
// drags you through echoes of the engines you shut down:
//   I   THE PRISM CORE   (levels/prism.js: the arena under the Hub)
//   II  THE FORGE        (forge.js)    molten islands, lava tides, slag geysers — red weak points
//   III THE SUNSCORCH    (sunscorch.js) sun lances, the incinerator beam, quicksand — yellow
//   IV  THE OVERGROWTH   (overgrowth.js) sweeping vines, thorns, spore pods, sludge — green
//   V   THE DEEP         (deep.js)     the flood: swim for air pockets against the vortex — blue
//   VI  THE HEART        (heart.js)    every color and every trick at once, the core laid bare
// Each stage is a chunk of one health bar (see boss.js). This director runs the warps between them,
// restarts the current stage when you die, gives each stage its mood, and runs the ending.
// The stage arenas are far off the map (x 700..1000; regions.js gives each its own culling area).
import * as THREE from 'three';
import { audio } from '../../audio.js';
import { director } from '../../combat/director.js';
import { Hazards } from './hazards.js';
import { buildForge } from './forge.js';
import { buildSunscorch } from './sunscorch.js';
import { buildOvergrowth } from './overgrowth.js';
import { buildDeep } from './deep.js';
import { buildHeart } from './heart.js';

const WARP_CUT = 1.25; // seconds into a warp when the screen is white and we jump arenas
const ENV = 0.35; // the scene's usual image-based light (main.js); the stages set their own

// a track if it has been generated (audio/manifest.json), otherwise the fallback
export function track(name, fallback) {
  return audio.available?.has(name) ? name : fallback;
}

export function buildFinale(B, boss, { prismReturn }) {
  const { W, game, level, devStart } = B;
  const H = new Hazards(W, game);
  const ctx = { B, W, game, level, H, boss };
  const stages = [buildForge(ctx), buildSunscorch(ctx), buildOvergrowth(ctx), buildDeep(ctx), buildHeart(ctx)];
  boss.setStages(stages);
  Object.assign(boss.stages[0], {
    title: 'I · THE PRISM CORE', sub: 'STAGE I', main: 'THE PRISM CORE', color: '#d9a8ff', hp: 1600,
    dmg: { core: 12, hole: 6, kneel: 16, vent: 12, limb: 5, head: 8, broken: 4, torso: 3 },
    tips: {
      slam: '<b>JUMP</b> the red shockwave when it reaches you!',
      volley: 'Orbs! <b>Shoot each in its color</b>, or put a pillar between you.',
      sweep: 'The blade sweeps wide: <b>back off</b> out of its reach!',
    },
  });
  boss.setStages(stages); // (recount the bar with stage I's final health)
  const director = new FinaleDirector(ctx, prismReturn);
  level.finale = director;
  stages.forEach((st, i) => devStart(`finale${i + 2}`, st.playerStart.toArray(), st.playerYaw, [0, 1, 2, 3]));
  return director;
}

class FinaleDirector {
  constructor(ctx, prismReturn) {
    Object.assign(this, ctx);
    this.prismReturn = prismReturn;
    this.warp = null;
    this.told = new Set();
    const b = this.boss;
    b.onStageClear = (from, to) => this.beginWarp(from, to);
    b.onEnterStage = (idx, o) => this.setupStage(idx, o);
    b.onFightOn = (idx) => this.fightOn(idx);
    b.onDying = () => this.stages.at(-1).onDying?.();
    b.onDeathFx = (T, dt) => this.stages.at(-1).deathFx?.(T, dt);
    b.onDefeated = () => this.finish();
    b.onReset = () => (this.game.scene.environmentIntensity = ENV);
    // ?dev&start=finaleN: jump straight into stage N
    const params = new URLSearchParams(location.search);
    const m = params.has('dev') && /^finale([2-6])$/.exec(params.get('start') || '');
    this.devStage = m ? +m[1] - 1 : null;
    this.buildOverlay();
    this.W.add(this);
  }

  get stages() {
    return this.boss.stages;
  }

  // The cracks that spread over your view as reality shatters (a canvas drawn once, faded in and out).
  buildOverlay() {
    const hud = document.querySelector('#hud');
    if (!hud) return;
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 576;
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0;mix-blend-mode:screen';
    const g = c.getContext('2d');
    const crack = (x, y, a, len, w, depth) => {
      let px = x, py = y;
      const steps = 6 + Math.floor(Math.random() * 5);
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(px, py);
      for (let i = 0; i < steps; i++) {
        a += (Math.random() - 0.5) * 0.7;
        px += Math.cos(a) * (len / steps);
        py += Math.sin(a) * (len / steps);
        g.lineTo(px, py);
        if (depth < 2 && Math.random() < 0.25) {
          g.stroke();
          crack(px, py, a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6), len * 0.45, w * 0.6, depth + 1);
          g.lineWidth = w;
          g.beginPath();
          g.moveTo(px, py);
        }
      }
      g.stroke();
    };
    const hues = ['#ff5a6a', '#ffe070', '#6aff9a', '#6aa8ff', '#ffffff'];
    for (let i = 0; i < 22; i++) {
      g.strokeStyle = hues[i % hues.length];
      g.shadowColor = g.strokeStyle;
      g.shadowBlur = 8;
      crack(512 + (Math.random() - 0.5) * 60, 288 + (Math.random() - 0.5) * 40, (i / 22) * Math.PI * 2, 300 + Math.random() * 280, 2.4, 0);
    }
    const fade = document.querySelector('#fade');
    hud.insertBefore(c, fade ? fade.nextSibling : null);
    this.crackEl = c;
  }

  // Leave a cleared stage: the Warden reels, the world cracks like glass, a prismatic white-out — and
  // we're somewhere else.
  beginWarp(from, to) {
    this.H.clear();
    this.stages[from].onExit?.();
    this.warp = { t: 0, from, to, cut: false, shards: 0 };
    const next = this.stages[to];
    this.game.hud.bossHint(`The Warden tears reality open — it drags you into ${next.main.toLowerCase()}!`, true);
    audio.sample('warp_shatter', { gain: 1 }) || audio.shatter();
    audio.setIntensity(2);
  }

  updateWarp(dt) {
    const w = this.warp;
    w.t += dt;
    const t = w.t, game = this.game, p = game.player;
    p.invuln = 99;
    p.shake = Math.max(p.shake, Math.min(1, 0.2 + t * 0.7));
    // shards of the world burst around you, faster and faster
    w.shards -= dt;
    if (!w.cut && w.shards <= 0) {
      w.shards = Math.max(0.03, 0.18 - t * 0.12);
      const eye = game.camera.position;
      const c = [0xff3344, 0xffd23a, 0x3dff7a, 0x3a8bff, 0xffffff][Math.floor(Math.random() * 5)];
      const at = new THREE.Vector3(eye.x + (Math.random() - 0.5) * 8, eye.y + (Math.random() - 0.3) * 4, eye.z + (Math.random() - 0.5) * 8);
      this.W.fx.burst(at, c, { count: 18, speed: 7, life: 0.9, size: 0.4, gravity: 3, mode: 'shard' });
      if (Math.random() < 0.4) audio.shatter();
    }
    if (this.crackEl) this.crackEl.style.opacity = w.cut ? Math.max(0, 1 - (t - WARP_CUT) / 0.8) : Math.min(1, Math.max(0, (t - 0.25) / 0.7));
    if (!w.cut && t > WARP_CUT - 0.3 && !w.white) {
      // the prismatic white-out
      w.white = true;
      const f = game.hud.fadeEl;
      f.style.background = 'radial-gradient(circle at 50% 50%, #ffffff 0%, #fff6e0 30%, #e0f0ff 60%, #f0d8ff 100%)';
      game.hud.fade(1, 0.28);
      audio.sample('warp_whoosh', { gain: 1 }) || audio.shieldBreak();
    }
    if (!w.cut && t > WARP_CUT) {
      w.cut = true;
      this.setupStage(w.to, { restart: false });
      this.boss.enterStage(w.to);
      game.hud.fade(0, 1.0);
      setTimeout(() => (game.hud.fadeEl.style.background = ''), 1100);
      const st = this.stages[w.to];
      game.hud.zoneTitle(st.sub, st.main, st.color, 4);
      audio.bossPhase();
    }
    if (w.cut && t > WARP_CUT + 1.7) {
      p.invuln = 1.0;
      if (this.crackEl) this.crackEl.style.opacity = 0;
      this.warp = null;
    }
  }

  // Put a stage back to its start and the player at its entrance (a warp in, a restart after a death,
  // or a dev start).
  setupStage(idx, { restart = false, dev = false } = {}) {
    const st = this.stages[idx], game = this.game, p = game.player;
    this.H.clear();
    for (const pr of this.W.projectiles) pr.alive = false;
    for (const s of this.stages) if (s !== st) s.onExit?.();
    st.reset?.();
    // how many attackers may act at once (the combat director's tokens): calmer while you swim, highest
    // in the heart
    director.setIntensity(st.intensity ?? 2);
    if (restart && this.warp) {
      // died mid-warp: skip the rest of it
      this.warp = null;
      game.hud.fadeEl.style.background = '';
      if (this.crackEl) this.crackEl.style.opacity = 0;
    }
    if (idx > 0) {
      p.spawn(st.playerStart, st.playerYaw);
      p.updateCamera();
      p.invuln = restart || dev ? 1.6 : 99;
      game.setAtmosphere(st.atmosphere, true);
      game.scene.environmentIntensity = st.env ?? ENV;
      this.mood(st);
      if (restart) game.hud.zoneTitle(st.sub, st.main, st.color, 2.5);
    }
  }

  mood(st) {
    this.game.setMusic(track(st.music, st.musicFallback));
  }

  // The Warden has landed: the stage's own clock starts and its opening line shows.
  fightOn(idx) {
    const st = this.stages[idx];
    st.fightOn?.();
    if (st.intro && !this.told.has(st.key + ':intro')) {
      this.told.add(st.key + ':intro');
      this.game.hud.message(st.intro, 5);
    }
  }

  update(dt, player) {
    const game = this.game, b = this.boss;
    if (this.devStage !== null && game.started && game.state === 'playing' && b.state === 'dormant') {
      const idx = this.devStage;
      this.devStage = null;
      b.devStage = idx;
      game.startBoss();
      this.mood(this.stages[idx]);
      game.hud.zoneTitle(this.stages[idx].sub, this.stages[idx].main, this.stages[idx].color, 3);
    }
    if (this.warp) this.updateWarp(dt);
    if (!b.active || game.rulesPaused) return;
    const st = b.stage;
    if (b.state !== 'warp' && b.state !== 'dying' && b.stageIdx > 0 && !this.warp) st.update?.(dt, player, b);
    // say what each attack wants, the first time it comes
    const k = b.attack?.type;
    if (k && b.state !== 'warp') {
      const tip = st.tips?.[k];
      const key = st.key + ':' + k;
      if (tip && !this.told.has(key) && !this.told.has('any:' + k)) {
        this.told.add(key);
        if (['slam', 'volley', 'sweep', 'charge'].includes(k)) this.told.add('any:' + k);
        game.hud.message(tip, 3.5);
      }
    }
  }

  // The Warden is gone: the echo collapses and you wake in the Prism Core, the machine silent.
  finish() {
    const game = this.game;
    this.H.clear();
    for (const s of this.stages) s.onExit?.();
    game.hud.whiteFlash();
    const [x, y, z, yaw] = this.prismReturn;
    game.player.spawn(new THREE.Vector3(x, y, z), yaw);
    game.player.updateCamera();
    game.player.invuln = 99;
    game.setAtmosphere('prism', true);
    game.scene.environmentIntensity = ENV;
    director.setIntensity();
    game.onBossDefeated();
  }
}

