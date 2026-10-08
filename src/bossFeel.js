// Boss feedback: the shared language every boss uses to tell the player "THIS is what you should be
// doing". A weak-point hit is a CRITICAL: a white-hot flash, a spray of sparks and embers, a chunky
// impact, an orange hitmarker, a screen-shake tick, the boss bar flashing and a CRITICAL pop. The boss
// answers with pain (rate-limited groans, a bigger one at phase thresholds). While it's stunned or
// kneeling its joints malfunction: sparks, short electrical arcs and smoke, with stuttering servos.
// An open weak point wears a pulsing target marker. Each boss picks its colors, scale and voices.
import * as THREE from 'three';
import { audio } from './audio.js';

// new sounds (tools/audio/sfx.json) and the stock ones they fall back on until they're generated
export const FEEL_SOUNDS = ['boss_crit_hit', 'joint_sparks', 'servo_stutter', 'energy_crackle', 'rotor_jam', 'drone_hit', 'boss_core_hit'];

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _n = new THREE.Vector3();
const _d = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;

// Play `name` if it has been generated, else the stock `fallback` sample. True if anything played.
export function play(name, fallback, opts) {
  const n = audio.sfxOr(name, fallback);
  return audio.sample(n, opts) || (n !== fallback && !!fallback && audio.sample(fallback, opts));
}

export function prefetchFeel(extra = []) {
  audio.prefetch([...FEEL_SOUNDS, ...extra]);
}

// how loud something `d` m away from the player should be (bosses fight at 5-30 m)
function near(game, p, far = 50) {
  return clamp(1.15 - p.distanceTo(game.player.pos) / far, 0.35, 1);
}

let lastCritSound = -1;

// A CRITICAL weak-point hit at hit.point. Marks the shot (hit.crit) so the blaster shows the orange
// hitmarker, and does everything else itself.
//   color: the hot glow / embers (default molten orange)   scale: bigger bosses, bigger bursts
//   spark: spark color   sound: false for no crunch (the boss plays its own core hit either way)   gain: crunch loudness
export function critHit(game, hit, { color = 0xff8a2a, spark = 0xffd27a, scale = 1, sound = true, gain = 1, shake = 0.32, pop = true } = {}) {
  if (hit) hit.crit = true;
  const p = hit?.point;
  const fx = game.world.fx;
  if (p && fx) {
    // spray back toward the shooter (off the surface)
    const n = hit.normal ? _n.copy(hit.normal) : _n.subVectors(game.camera.position, p).normalize();
    _d.subVectors(game.camera.position, p).normalize();
    if (n.dot(_d) < 0) n.negate();
    fx.flash(p, 0xffffff, { size: 0.55 * scale, life: 0.06, k: 2.4, hot: 1 });
    fx.flash(p, color, { size: 1.2 * scale, life: 0.14, k: 1.3, hot: 0.2, end: 1.6 });
    fx.ring(p, n, color, { size: 0.15 * scale, end: 1.5 * scale, life: 0.2, thick: 0.18, k: 2.2 });
    fx.sparks(p, n, spark, { count: Math.round(16 * scale), speed: 13 * Math.sqrt(scale), spread: 0.95, life: 0.42, size: 0.024, k: 2.4, gravity: 11 });
    const e = Math.round(5 * scale);
    for (let i = 0; i < e; i++) {
      const s = rnd(2, 6) * Math.sqrt(scale);
      fx.ember(p, n.x * s + rnd(-2.5, 2.5), n.y * s + rnd(1.5, 5), n.z * s + rnd(-2.5, 2.5), color, rnd(0.6, 1.1), rnd(0.07, 0.15) * Math.sqrt(scale));
    }
  }
  if (sound) {
    // a meaty crunch layered over the boss's own core-hit sound (at most once a shot)
    const t = game.world.time;
    if (t - lastCritSound > 0.05) {
      lastCritSound = t;
      play('boss_crit_hit', null, { gain: 0.9 * gain, vary: 0.08 }) || audio.sample('drone_hit', { gain: 0.55 * gain, rate: 0.72, vary: 0.08 });
    }
  }
  game.player.shake = Math.max(game.player.shake, shake);
  game.hud.bossCrit?.(pop);
}

// Pained groans when its weak point is being hit: rate-limited so continuous fire gets a groan every
// second and a half or so (the first hit of a burst answers right away), and a bigger one at phase
// thresholds or when it breaks. name / fallback: the new sample and the stock one it falls back on.
export class PainVoice {
  constructor(world, { name, fallback, rate = 1, gain = 1, big = null, bigFallback = null, bigRate = 0.85, gap = 1.4, synth = null }) {
    this.world = world;
    Object.assign(this, { name, fallback, rate, gain, big, bigFallback, bigRate, gap, synth });
    this.next = 0;
  }

  // one weak-point hit landed (k: how much it hurt, 1 normal)
  hurt(k = 1) {
    const t = this.world.time;
    if (t < this.next) return false;
    this.next = t + this.gap * rnd(0.85, 1.3);
    const opts = { gain: this.gain * clamp(0.75 + k * 0.25, 0.6, 1.2), rate: this.rate * rnd(0.92, 1.08), vary: 0 };
    if (!play(this.name, this.fallback, opts)) this.synth?.(1);
    return true;
  }

  // the big one (phase thresholds, a part breaking, the stun starting): always plays
  roar() {
    this.next = this.world.time + this.gap * 1.6;
    const opts = { gain: this.gain * 1.15, rate: this.bigRate, vary: 0 };
    if (!play(this.big || this.name, this.bigFallback || this.fallback, opts)) this.synth?.(1.6);
  }
}

// Short electrical arcs: jagged bright lines that flicker for a tenth of a second (a small pool).
class Arcs {
  constructor(world, color, max = 8) {
    this.world = world;
    this.SEG = 7;
    this.max = max;
    this.list = [];
    const verts = max * this.SEG * 2;
    this.pos = new Float32Array(verts * 3);
    this.col = new Float32Array(verts * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.color = new THREE.Color(color);
    this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.mesh.frustumCulled = false;
    this.mesh.userData.noCull = true;
    this.mesh.renderOrder = 5;
    this.mesh.raycast = () => {};
    world.scene.add(this.mesh);
  }

  zap(a, b, life = 0.12) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ a: a.clone(), b: b.clone(), t: life, life });
    // glow along it (bloom catches these)
    const fx = this.world.fx;
    for (let i = 1; i <= 4; i++) fx.flash(_v.lerpVectors(a, b, i / 5).add(_w.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.08)), this.color, { size: 0.5, life: life, k: 3, hot: 0.5 });
  }

  update(dt) {
    const S = this.SEG;
    let v = 0;
    for (let i = this.list.length - 1; i >= 0; i--) if ((this.list[i].t -= dt) <= 0) this.list.splice(i, 1);
    if (!this.list.length && !this.mesh.visible) return;
    for (const z of this.list) {
      const len = z.a.distanceTo(z.b);
      const k = 3.2 * (z.t / z.life) * (0.6 + Math.random() * 0.4);
      // a fresh jag every frame: it crackles
      let px = z.a.x, py = z.a.y, pz = z.a.z;
      for (let s = 1; s <= S; s++) {
        const f = s / S;
        _w.lerpVectors(z.a, z.b, f);
        if (s < S) _w.add(_v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(len * 0.16));
        const P = this.pos, C = this.col, o = v * 3;
        P[o] = px; P[o + 1] = py; P[o + 2] = pz;
        P[o + 3] = _w.x; P[o + 4] = _w.y; P[o + 5] = _w.z;
        for (let q = 0; q < 6; q += 3) {
          C[o + q] = this.color.r * k;
          C[o + q + 1] = this.color.g * k;
          C[o + q + 2] = this.color.b * k;
        }
        v += 2;
        px = _w.x;
        py = _w.y;
        pz = _w.z;
      }
    }
    const g = this.mesh.geometry;
    g.setDrawRange(0, v);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    this.mesh.visible = v > 0;
  }

  dispose() {
    this.world.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// Malfunction: while `on`, its joints spit sparks, crackle with short arcs and puff smoke, and its
// servos stutter. joints: Object3Ds on the boss (shoulders, elbows, knees, neck...).
export class Malfunction {
  // (a joint is anything with getWorldPosition(out); bubbles: underwater, bubbles instead of smoke)
  constructor(game, joints, { scale = 1, spark = 0xffc070, arc = 0x9fdcff, smoke = 0x2e2a28, rate = 7, sound = true, gain = 1, servo = true, organic = false, bubbles = false } = {}) {
    this.game = game;
    this.world = game.world;
    this.joints = joints.filter(Boolean);
    Object.assign(this, { scale, spark, arc, smoke, rate, sound, gain, servo, organic, bubbles });
    this.smokeC = new THREE.Color(smoke);
    this.arcs = organic ? null : new Arcs(this.world, arc);
    this.crackleT = 0;
    this.servoT = 0.3;
    this.k = 0;
  }

  // one sputter at a joint (also handy as a one-off "it's breaking" burst)
  sputter(j, big = 1) {
    const fx = this.world.fx, s = this.scale;
    const p = j.getWorldPosition(_v).add(_w.set(rnd(-1, 1), rnd(-0.6, 1), rnd(-1, 1)).multiplyScalar(0.28 * s));
    const dir = _n.set(rnd(-1, 1), rnd(0.2, 1.3), rnd(-1, 1)).normalize();
    if (this.organic) {
      // a living thing bleeds instead: spurts of glowing sap
      fx.burst(p, this.spark, { count: Math.round((8 + Math.random() * 8) * big), speed: 6 * Math.sqrt(s), life: 0.9, size: 0.32 * Math.sqrt(s), gravity: 14, dir, intensity: 1.6 });
      fx.sparks(p, dir, this.spark, { count: Math.round(6 * big), speed: 7, spread: 0.8, life: 0.4, size: 0.05, k: 2 });
    } else {
      fx.sparks(p, dir, this.spark, { count: Math.round((14 + Math.random() * 12) * big), speed: 8 * Math.sqrt(s), spread: 1.15, life: 0.65, size: 0.045, stretch: 0.06, k: 2.8, gravity: 12 });
      fx.flash(p, this.spark, { size: 0.8 * s * big, life: 0.09, k: 2.4, hot: 0.7 });
    }
    if (this.arcs && Math.random() < 0.75) {
      // a short arc: to another joint close by, or just jumping off the plating
      const other = this.joints[Math.floor(Math.random() * this.joints.length)].getWorldPosition(_d);
      const to = other.distanceTo(p) < 2.6 * s && other.distanceTo(p) > 0.3 ? other : _d.copy(p).add(_w.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.5, 1.3) * s));
      this.arcs.zap(p, to, rnd(0.12, 0.22));
    }
    if (this.bubbles) fx.bubbles(p, 4);
    else if (Math.random() < 0.45) fx.puff(p, rnd(-0.4, 0.4), rnd(0.6, 1.6), rnd(-0.4, 0.4), this.smokeC, 0.55, rnd(1.0, 1.8), 0.45 * s, 3);
    return p;
  }

  update(dt, on, k = 1) {
    this.k += clamp((on ? 1 : 0) - this.k, -dt * 3, dt * 6);
    if (this.arcs) this.arcs.update(dt);
    if (this.k <= 0.01 || !this.joints.length) return;
    const rate = this.rate * k * this.k;
    // (several sputters a frame at high rates)
    let n = rate * dt;
    while (n > 0) {
      if (Math.random() < n) this.sputter(this.joints[Math.floor(Math.random() * this.joints.length)]);
      n -= 1;
    }
    if (!this.sound || !on) return;
    const at = this.joints[0].getWorldPosition(_v);
    const g = this.gain * near(this.game, at);
    if ((this.crackleT -= dt) <= 0) {
      this.crackleT = rnd(0.35, 0.8);
      if (this.organic) audio.sample('acid', { gain: 0.35 * g, rate: rnd(1.2, 1.6) });
      else play('joint_sparks', 'energy_crackle', { gain: 0.55 * g, rate: rnd(0.85, 1.2), vary: 0 });
    }
    if (this.servo && (this.servoT -= dt) <= 0) {
      this.servoT = rnd(0.9, 1.7);
      play('servo_stutter', 'rotor_jam', { gain: 0.6 * g, rate: rnd(0.6, 0.85), vary: 0 });
    }
  }

  dispose() {
    this.arcs?.dispose();
  }
}

// "SHOOT HERE": a pulsing target on an open weak point (camera-facing, drawn over everything so it
// reads through smoke and sparks). update(dt, pos or null, k): k = urgency (1 normal).
export class WeakMarker {
  constructor(world, game, { color = 0xffa040, size = 1.3 } = {}) {
    this.world = world;
    this.game = game;
    this.size = size;
    this.color = new THREE.Color(color);
    const mat = (o) => new THREE.MeshBasicMaterial({ color: this.color.clone().multiplyScalar(1.15), transparent: true, opacity: o, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    this.group = new THREE.Group();
    this.inner = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), mat(0));
    this.outer = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48), mat(0));
    // four brackets around it that close in on every pulse
    this.ticks = [];
    const tg = new THREE.PlaneGeometry(0.1, 0.42);
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(tg, mat(0));
      t.rotation.z = (i * Math.PI) / 2;
      this.ticks.push(t);
      this.group.add(t);
    }
    this.group.add(this.inner, this.outer);
    this.group.renderOrder = 20;
    this.group.traverse((o) => {
      o.renderOrder = 20;
      o.raycast = () => {};
    });
    this.group.userData.noCull = true;
    this.group.visible = false;
    world.scene.add(this.group);
    this.a = 0;
    this.t = 0;
  }

  // recolor it (a weak point that shifts color: the marker shows the color that hurts it now)
  tint(hex) {
    if (hex === this.hex) return;
    this.hex = hex;
    this.color.set(hex);
    for (const o of [this.inner, this.outer, ...this.ticks]) o.material.color.copy(this.color).multiplyScalar(1.15);
  }

  update(dt, pos, k = 1) {
    this.a = clamp(this.a + (pos ? dt * 5 : -dt * 4), 0, 1);
    this.group.visible = this.a > 0.01;
    if (!this.group.visible) return;
    if (pos) this.group.position.copy(pos);
    this.t += dt * (1.6 + 0.6 * k);
    const cam = this.game.camera;
    this.group.quaternion.copy(cam.quaternion);
    // keep a readable size at range
    const dist = this.group.position.distanceTo(cam.position);
    const s = this.size * Math.max(1, dist / 16);
    const f = this.t % 1;
    this.group.scale.setScalar(s);
    this.inner.scale.setScalar(0.95 + Math.sin(this.t * Math.PI * 2) * 0.06);
    this.inner.material.opacity = this.a * (0.3 + 0.15 * Math.sin(this.t * Math.PI * 2));
    this.outer.scale.setScalar(2.1 - f * 1.1);
    this.outer.material.opacity = this.a * f * 0.55;
    const r = 1.85 - f * 0.55;
    this.ticks.forEach((t, i) => {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      t.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      t.rotation.z = a + Math.PI / 2;
      t.material.opacity = this.a * (0.35 + 0.3 * f);
    });
  }

  dispose() {
    this.world.scene.remove(this.group);
  }
}
