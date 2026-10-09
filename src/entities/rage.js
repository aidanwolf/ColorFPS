// Enrage: the price of shooting a regular enemy with the wrong color. Every ricochet off it (its body or a
// shield layer: any onHit that returns 'immune') builds rage; three within RAGE.window seconds and it goes
// berserk for RAGE.time seconds (each further wrong hit tops that back up). Right-color hits never add rage.
// Enraged it is clearly readable (its color seams flare hot and flicker, a red-orange heat rim, sparks and
// embers venting, an aggro yell and the HUD's badge over it: rageMarks.js) and stronger but still fair:
//  - its whole AI runs RAGE.warp × faster (movement, turning, cooldowns, and telegraphs, which so stay at
//    80% of their length: still readable)
//  - its attack cooldowns are cut a further RAGE.cool × (≈40% shorter in all), its shots fly RAGE.shot ×
//    faster, and it presses in closer
//  - it may take one of the combat director's attack tokens past the cap (director.request)
//  - a cracked shield layer slowly mends (colorShield.js)
// One helper for every regular enemy (drone.js, enemyKit.js, groundKit.js, the spider bot); bosses don't
// carry one. Usage: `this.rage = new Rage(this)`; dt = this.rage.update(dt) at the top of the frame (the
// warped dt for the AI); this.rage.wrong(hit) on every immune result; this.rage.paint(glowMaterial) after
// the frame's glow color is set.
import * as THREE from 'three';
import { audio } from '../audio.js';
import { barks } from '../combat/barks.js';
import { esfx } from './enemySfx.js';
import { marks } from '../rageMarks.js';

export const RAGE = { hits: 3, window: 4, time: 7, warp: 1.25, cool: 0.75, shot: 1.25, press: 0.6 };

const HOT = new THREE.Color(3, 1.15, 0.3);
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();
const _box = new THREE.Box3();
const _s = new THREE.Sphere();
const noRay = () => {};
audio.manifest?.then(() => audio.prefetch(['aggro_sting', 'aggro_warn', 'combo_fail', 'combo_tick']));

// the heat rim: a shared additive fresnel ball (one material, one geometry for every enraged enemy)
let auraMat = null;
let auraGeo = null;
function aura() {
  if (!auraGeo) {
    auraGeo = new THREE.IcosahedronGeometry(1, 2);
    auraGeo.userData.shared = true;
  }
  auraMat ??= new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vView;
      varying vec3 vP;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vView = -mv.xyz;
        vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vN;
      varying vec3 vView;
      varying vec3 vP;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 3.0);
        // licks of heat crawling up it
        float lick = 0.6 + 0.4 * sin(vP.y * 7.0 - uTime * 9.0 + sin(vP.x * 5.0 + uTime * 3.0) * 2.0);
        float flick = 0.8 + 0.2 * sin(uTime * 37.0);
        gl_FragColor = vec4(vec3(1.0, 0.32, 0.06) * 1.6, rim * lick * flick * 0.7);
      }`,
  });
  return { geo: auraGeo, mat: auraMat };
}

export class Rage {
  constructor(owner) {
    this.owner = owner;
    this.times = new Array(RAGE.hits).fill(-1e9); // the last few wrong hits (seconds, own clock)
    this.t = 0;
    this.left = 0; // seconds of rage left (0: calm)
    this.ventT = 0;
    this.flick = 1;
    marks.hook(owner.world.game); // (the HUD's crosshair probe runs from the first regular enemy on)
  }

  get on() {
    return this.left > 0 && !this.owner.dead;
  }

  // how long a rage lasts (the HUD's timer ring)
  get span() {
    return RAGE.time;
  }

  get warp() {
    return this.on ? RAGE.warp : 1;
  }

  // multiply an attack cooldown by this
  get cool() {
    return this.on ? RAGE.cool : 1;
  }

  // multiply a projectile's speed by this
  get shot() {
    return this.on ? RAGE.shot : 1;
  }

  // wrong hits within the window (0 .. RAGE.hits), for the HUD's warning ring
  get recent() {
    let n = 0;
    for (const t of this.times) if (this.t - t <= RAGE.window) n++;
    return n;
  }

  // A wrong-color hit landed (it ricocheted). Returns true if this one set it off.
  wrong() {
    if (this.owner.dead) return false;
    if (this.on) {
      this.left = Math.max(this.left, RAGE.time);
      marks.warn(this.owner);
      return false;
    }
    this.times.copyWithin(0, 1);
    this.times[this.times.length - 1] = this.t;
    const n = this.recent;
    if (n >= RAGE.hits) {
      this.enrage();
      return true;
    }
    // a soft tick for each segment of the warning ring filling
    audio.sample(audio.sfxOr('aggro_warn', 'combo_tick'), { gain: 0.32 + n * 0.08, rate: audio.available?.has('aggro_warn') ? 1 : 1.3 + n * 0.15, vary: 0 });
    marks.warn(this.owner);
    return false;
  }

  enrage() {
    const o = this.owner;
    this.left = RAGE.time;
    this.times.fill(-1e9);
    const fx = o.world.fx;
    const c = this.center(new THREE.Vector3());
    fx.flash(c, 0xff6a20, { size: 1.8, life: 0.2, k: 2, hot: 0.4, end: 1.6 });
    fx.ring(c, null, 0xff4a10, { size: 0.5, end: 3.2, life: 0.4, thick: 0.15, k: 1.8 });
    fx.burst(c, 0xff7a30, { count: 26, speed: 7, life: 0.6, size: 0.25, gravity: 4 });
    fx.sparks(c, UP, 0xffb060, { count: 16, speed: 11, spread: 1.4, life: 0.45 });
    // the "uh-oh" sting, the aggro yell and a grunt pitched down under it (so voiceless ones still roar)
    if (!audio.sample(audio.sfxOr('aggro_sting', 'combo_fail'), { gain: audio.available?.has('aggro_sting') ? 0.8 : 0.6, rate: audio.available?.has('aggro_sting') ? 1 : 0.7, vary: 0 }) && audio.ctx) {
      audio.tone({ type: 'sawtooth', f: 330, f2: 140, dur: 0.45, gain: 0.08 });
    }
    barks.say(o, 'enraged');
    esfx('robot_pain_heavy', o.pos, 1.4, (o.voicePitch ?? 1) * 0.62);
    esfx('hydraulic_hiss', o.pos, 0.9, 0.8, 0.12); // vents blowing
    marks.enrage(o);
    if (!this.aura) {
      const { geo, mat } = aura();
      this.aura = new THREE.Mesh(geo, mat);
      this.aura.raycast = noRay; // never catches a shot
      this.aura.renderOrder = 1;
      const parent = o.rageParent ?? o.group;
      // sized to the enemy's body: its own say-so, its walker's height, else its bounds (measured once)
      if (o.rageAura) {
        this.aura.position.set(...o.rageAura.center);
        this.aura.scale.setScalar(o.rageAura.radius);
      } else if (o.height) {
        this.aura.position.set(0, o.height * 0.55, 0);
        this.aura.scale.set(Math.max(o.radius, o.height * 0.3) * 1.2, o.height * 0.62, Math.max(o.radius, o.height * 0.3) * 1.2);
      } else {
        const shells = this.owner.shield?.root;
        if (shells) shells.visible = false; // (measure the body, not its shields)
        _box.setFromObject(parent).getBoundingSphere(_s);
        if (shells) shells.visible = true;
        parent.updateWorldMatrix(true, false);
        this.aura.position.copy(parent.worldToLocal(_s.center));
        const k = parent.getWorldScale(_v).x || 1;
        this.aura.scale.setScalar(Math.min(3, Math.max(0.6, _s.radius * 0.8)) / k);
      }
      parent.add(this.aura);
    }
    this.aura.visible = true;
  }

  calm() {
    this.left = 0;
    if (this.aura) this.aura.visible = false;
    this.owner.world.fx.burst(this.center(_v), 0x9a9aa8, { count: 10, speed: 1.5, life: 1, size: 0.5, gravity: -1.5, drag: 1.5 }); // a last puff of steam
  }

  center(out) {
    const o = this.owner;
    if (o.center) return o.center(out);
    return out.copy(o.pos);
  }

  // Advance the clock (real time); returns the dt the enemy's AI should run on.
  update(dt) {
    this.t += dt;
    if (this.left <= 0) return dt;
    this.left -= dt;
    if (this.left <= 0 || this.owner.dead) {
      this.calm();
      return dt;
    }
    // hot flicker for the seams, a pulse when it's about to calm down
    this.flick = 1.25 + 0.45 * Math.random() + (Math.random() < 0.08 ? 0.8 : 0);
    if (auraMat) auraMat.uniforms.uTime.value = this.t;
    // venting: embers and heat haze rising, a spit of sparks now and then
    this.ventT -= dt;
    if (this.ventT <= 0 && (this.owner.dist ?? 0) < 45) {
      this.ventT = 0.05;
      const fx = this.owner.world.fx;
      const c = this.center(_v);
      c.x += (Math.random() - 0.5) * 0.8;
      c.z += (Math.random() - 0.5) * 0.8;
      fx.ember(c, (Math.random() - 0.5) * 1.2, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 1.2, 0xff6a1a, 0.6 + Math.random() * 0.4, 0.05);
      if (Math.random() < 0.25) fx.puff(c, 0, 1.2, 0, _c.set(0x6a3a2a), 0.25, 0.8, 0.35, 2.5);
      if (Math.random() < 0.08) fx.sparks(c, UP, 0xffa040, { count: 5, speed: 6, spread: 1.2, life: 0.3 });
    }
    return dt * RAGE.warp;
  }

  // Flare a glow material hot (call after the frame's own color is set). The hue stays the body's, so
  // you can still read which color hurts it.
  paint(mat) {
    if (this.left <= 0 || !mat) return;
    const k = this.left < 1.2 && Math.sin(this.t * 30) > 0 ? 0.8 : this.flick;
    mat.color.multiplyScalar(k).lerp(_c.copy(HOT), 0.22);
  }

  dispose() {
    this.aura?.parent?.remove(this.aura);
    this.aura = null;
  }
}
