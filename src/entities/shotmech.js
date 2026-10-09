// Things you move by shooting them: platforms that step or get pushed along a path (and the riser /
// sinker blocks built on them), chunks that turn a quarter turn per hit, and a wall of ledges you shoot
// up and down into a staircase. Options are documented at the top of mechanics.js.
import * as THREE from 'three';
import { COLORS } from '../colors.js';
import { boxGeo, mat } from '../materials.js';
import { audio } from '../audio.js';
import { v3, glowMat, edgeGeo, faceDecal, faceNormal, faceEuler, glyphMat, barMesh, overlapsPlayer, nearGain, sfx, clamp, rnd, easeOutBack } from './mechkit.js';

const UP = new THREE.Vector3(0, 1, 0);
const BLAST_HOLD = 0.75; // s a blast keeps a push-mode mover from drifting home (a glob comes every 0.62 s)
const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// Can a moving box go to newMin..newMax (moving by delta)? Not into a bystander, and not if its rider
// (standing on `solid`) would be shoved into something else.
function canMove(player, solid, newMin, newMax, delta) {
  if (!player || player.dead) return true;
  if (player.ground === solid && player.grounded) {
    // (the box itself is still at its old spot: leave it out of the headroom test)
    const was = solid.enabled;
    solid.enabled = false;
    const ok = player.fits(player.pos.x + delta.x, player.pos.y + delta.y, player.pos.z + delta.z, player.height);
    solid.enabled = was;
    return ok;
  }
  return !overlapsPlayer(player, newMin, newMax, 0.01);
}

// Up / down chevron texture for rack targets (white on black, drawn additively in a color).
let arrowTexture = null;
function arrowTex() {
  if (arrowTexture) return arrowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#fff';
  g.lineWidth = 8;
  g.strokeRect(8, 8, 112, 112);
  g.fillStyle = '#fff';
  for (const y of [30, 62]) {
    g.beginPath();
    g.moveTo(64, y);
    g.lineTo(100, y + 30);
    g.lineTo(84, y + 30);
    g.lineTo(64, y + 14);
    g.lineTo(44, y + 30);
    g.lineTo(28, y + 30);
    g.closePath();
    g.fill();
  }
  arrowTexture = new THREE.CanvasTexture(c);
  arrowTexture.colorSpace = THREE.SRGBColorSpace;
  return arrowTexture;
}

export class ShotMover {
  constructor(world, { min, max, path, color, mode = 'step', step = 2, speed, back = 0, hold, kick = 1.1, drag = 2.5, bounce = false, twoWay = false, zone = 'red', kind = 'plat', track = true, onEnd = null }) {
    this.world = world;
    this.color = color;
    this.hex = COLORS[color].hex;
    this.mode = mode;
    this.stepLen = step;
    this.speed = speed ?? (mode === 'step' ? 5 : 7); // step: travel speed; push: top speed
    this.back = back;
    this.hold = hold ?? (mode === 'step' ? 1.5 : 0.25);
    this.kick = kick;
    this.drag = drag;
    this.bounce = bounce;
    this.twoWay = twoWay;
    this.onEnd = onEnd;
    this.base = v3(min);
    this.size = v3(max).sub(this.base);
    this.offset = v3(path);
    this.len = this.offset.length();
    this.axis = this.offset.clone().normalize();
    this.u = 0;
    this.target = 0;
    this.v = 0;
    this.sign = 1; // step direction (flips at the ends with bounce)
    this.since = 99; // seconds since the last hit
    this.heat = 0; // 0..1, how hard it's being shot (the riser's gauge)
    this.flash = 0;
    this.t = 0;
    this.cur = this.base.clone();
    const s = this.size;
    this.mesh = new THREE.Group();
    this.body = new THREE.Group();
    this.body.position.copy(s).multiplyScalar(0.5);
    this.edgeMat = glowMat(this.hex, 2);
    this.glyph = glyphMat(this.hex, 1.1);
    this.body.add(new THREE.Mesh(boxGeo(s.x, s.y, s.z), mat(kind, zone)), new THREE.Mesh(edgeGeo(s.x, s.y, s.z, 0.06), this.edgeMat));
    for (const f of ['+x', '-x', '+z', '-z', '-y', '+y']) this.body.add(faceDecal(s, f, this.glyph, f === '+y' ? 0.5 : 0.6));
    this.mesh.add(this.body);
    this.mesh.position.copy(this.base);
    world.scene.add(this.mesh);
    if (track) this.buildTrack();
    this.solid = world.addSolid(this.base.clone(), this.base.clone().add(s), { delta: new THREE.Vector3(), moving: true, entity: this, kind: 'metal' });
    this.loop = audio.createLoop('elevator_loop', { gain: 0 });
    world.add(this);
  }

  // a dim rail under the path (bottom center, start to end) with a notch at every step stop
  buildTrack() {
    const g = new THREE.Group();
    const m = glowMat(this.hex, 0.7);
    const a = this.base.clone().add(new THREE.Vector3(this.size.x / 2, -0.12, this.size.z / 2));
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, this.len + 0.06), m);
    rail.position.copy(a).addScaledVector(this.axis, this.len / 2);
    rail.lookAt(_p.copy(a).add(this.offset));
    g.add(rail);
    const notch = glowMat(this.hex, 1.6);
    const n = this.mode === 'step' ? Math.round(this.len / this.stepLen) : 1;
    for (let i = 0; i <= n; i++) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), notch);
      tick.position.copy(a).addScaledVector(this.axis, Math.min(this.len, i * (this.mode === 'step' ? this.stepLen : this.len)));
      g.add(tick);
    }
    this.world.scene.add(g);
  }

  onHit(color, hit) {
    if (color !== this.color) {
      this.flash = 1;
      return 'immune';
    }
    this.since = 0;
    this.heat = Math.min(1, this.heat + 0.12);
    const fx = this.world.fx, p = hit?.point || this.cur;
    fx.sparks(p, hit?.normal || UP, this.hex, { count: 10, speed: 9, spread: 0.7, life: 0.3 });
    fx.ring(_p.copy(p).addScaledVector(hit?.normal || UP, 0.03), hit?.normal || UP, this.hex, { size: 0.15, end: 0.9, life: 0.2, thick: 0.2, k: 1.4 });
    this.flash = 0.6;
    if (this.mode === 'step') {
      if (this.bounce && ((this.sign > 0 && this.target >= this.len - 1e-3) || (this.sign < 0 && this.target <= 1e-3))) this.sign *= -1;
      const next = clamp(this.target + this.stepLen * this.sign, 0, this.len);
      if (next === this.target) {
        // already at the end stop: a dull clank
        sfx.clank(0.5);
        return 'hit';
      }
      this.target = next;
      sfx.clank(nearGain(this.world, this.cur));
    } else {
      const dir = this.twoWay && hit?.dir ? Math.sign(hit.dir.dot(this.axis)) || 1 : 1;
      // a glob's blast (weapons/globs.js) lands like hit.power shots, and keeps it from sliding back
      // until the next glob is due, as the red stream of shots would
      if (hit?.power) this.since = Math.min(0, this.hold - BLAST_HOLD);
      this.v = clamp(this.v + this.kick * dir * (hit?.power || 1), -this.speed, this.speed);
      // a rising whine: the faster you fire, the higher the pitch
      audio.tone({ type: 'triangle', f: 300 + this.heat * 500, f2: 360 + this.heat * 600, dur: 0.06, gain: 0.04 });
    }
    return 'hit';
  }

  // when a mover is linked to a switch, activate() runs it to the far end and deactivate() home
  activate() {
    this.target = this.len;
    this.since = 0;
  }

  deactivate() {
    this.target = 0;
  }

  reset() {
    this.u = this.target = this.v = 0;
    this.sign = 1;
    this.since = 99;
    this.heat = 0;
    this.place(this.base);
    this.solid.delta.set(0, 0, 0);
  }

  place(p) {
    this.cur.copy(p);
    this.solid.min.copy(p);
    this.solid.max.copy(p).add(this.size);
    this.mesh.position.copy(p);
  }

  update(dt, player) {
    this.t += dt;
    this.since += dt;
    const delta = this.solid.delta.set(0, 0, 0);
    let u = this.u;
    if (this.mode === 'step') {
      if (this.back > 0 && this.since > this.hold && this.target > 0) this.target = Math.max(0, this.target - this.back * dt);
      const d = this.target - u;
      // ease in to each stop
      u += Math.sign(d) * Math.min(Math.abs(d), Math.max(0.4, Math.min(this.speed, Math.abs(d) * 7)) * dt);
    } else {
      this.v *= Math.max(0, 1 - this.drag * dt);
      if (this.since > this.hold && this.back > 0 && u > 0) this.v = Math.min(this.v, -this.back);
      u = clamp(u + this.v * dt, 0, this.len);
      if ((u <= 0 && this.v < 0) || (u >= this.len && this.v > 0)) this.v = 0;
    }
    if (u !== this.u) {
      _p.copy(this.base).addScaledVector(this.axis, u);
      delta.subVectors(_p, this.cur);
      _a.copy(_p);
      _b.copy(_p).add(this.size);
      if (canMove(player, this.solid, _a, _b, delta)) {
        const was = this.u;
        this.u = u;
        this.place(_p);
        // reaching an end stop
        const stop = (u >= this.len && was < this.len) || (u <= 0 && was > 0);
        if (stop) {
          sfx.clank(nearGain(this.world, this.cur) * 0.8);
          this.world.fx.sparks(_p.copy(this.cur).add(this.size.clone().multiplyScalar(0.5)), this.axis.clone().multiplyScalar(u > 0 ? -1 : 1), this.hex, { count: 8, speed: 5, spread: 1.2, life: 0.3 });
          this.onEnd?.(u > 0 ? 'end' : 'start', this);
        }
      } else {
        // blocked by the player (or the rider's headroom): hold still
        delta.set(0, 0, 0);
        this.v = 0;
        if (this.mode === 'step') this.target = this.u;
      }
    }
    const speed = dt > 0 ? delta.length() / dt : 0;
    this.loop.setGain(Math.min(1, speed / 3) * 0.45 * nearGain(this.world, this.cur, 30));
    this.loop.setRate(0.8 + Math.min(1, speed / 6) * 0.6);
    this.heat = Math.max(0, this.heat - dt * (this.since < 0.3 ? 0.4 : 1.2));
    this.flash = Math.max(0, this.flash - dt * 4);
    this.edgeMat.color.set(this.hex).multiplyScalar(2 + this.flash * 2);
  }
}

// A vertical bar of segments on each side face showing a 0..1 value (the riser's charge).
function sideGauges(mover) {
  const s = mover.size, bars = [];
  for (const f of ['+x', '-x', '+z', '-z']) {
    const n = faceNormal(f);
    const w = n.x ? s.z : s.x;
    const bar = barMesh(mover.hex, s.y * 0.8, Math.min(0.3, w * 0.18), 8);
    bar.rotation.copy(faceEuler(f));
    bar.rotateZ(Math.PI / 2); // fills bottom → top
    bar.position.set(n.x * (s.x / 2 + 0.02) + (n.z ? w * 0.36 : 0), 0, n.z * (s.z / 2 + 0.02) + (n.x ? -w * 0.36 : 0));
    mover.body.add(bar);
    bars.push(bar);
  }
  return bars;
}

export class RiserBlock extends ShotMover {
  // rise: meters it can climb; kick: m/s per hit; back: the steady sink speed once you stop
  constructor(world, { min, max, rise = 4, color, kick = 1.3, back = 1.6, hold = 0.2, drag = 2.2, speed = 6, zone = 'red', kind = 'metal' }) {
    super(world, { min, max, path: [0, rise, 0], color, mode: 'push', kick, back, hold, drag, speed, zone, kind, track: false });
    this.bars = sideGauges(this);
  }

  update(dt, player) {
    const sinking = this.since > this.hold && this.u > 0;
    super.update(dt, player);
    for (const b of this.bars) {
      b.material.uniforms.uFrac.value = Math.max(this.heat, this.u / this.len * 0.25);
      b.material.uniforms.uBlink.value = sinking && (this.t * 6) % 1 < 0.5 ? 1 : 0;
    }
    // sparks off the base while it's climbing hard
    if (this.v > 1 && Math.random() < 0.4) {
      _p.set(this.cur.x + Math.random() * this.size.x, this.cur.y, this.cur.z + Math.random() * this.size.z);
      this.world.fx.ember(_p, rnd(-0.5, 0.5), -1, rnd(-0.5, 0.5), this.hex, 0.5, 0.04);
    }
  }
}

export class SinkerBlock extends ShotMover {
  // depth: how far it sinks (default its full height, flush with the floor); back: how fast it rises
  constructor(world, { min, max, depth, color, kick = 1.2, back = 1.2, hold = 0.5, drag = 2.2, speed = 5, zone = 'red', kind = 'metal' }) {
    const h = max[1] - min[1];
    super(world, { min, max, path: [0, -(depth ?? h), 0], color, mode: 'push', kick, back, hold, drag, speed, zone, kind, track: false });
    this.bars = sideGauges(this);
    this.rising = false;
  }

  update(dt, player) {
    super.update(dt, player);
    const rising = this.since > this.hold && this.u > 0.01;
    if (rising && !this.rising) {
      // the warning: it's coming back up
      sfx.jam(nearGain(this.world, this.cur) * 0.7);
      this.world.fx.ring(_p.copy(this.cur).add(_a.set(this.size.x / 2, this.size.y + 0.05, this.size.z / 2)), UP, this.hex, { size: 0.3, end: Math.max(this.size.x, this.size.z), life: 0.4, k: 1.6 });
    }
    this.rising = rising;
    const warn = rising && (this.t * 8) % 1 < 0.5;
    this.edgeMat.color.set(warn ? 0xffffff : this.hex).multiplyScalar(warn ? 2.5 : 2 + this.flash * 2);
    for (const b of this.bars) {
      b.material.uniforms.uFrac.value = this.u / this.len;
      b.material.uniforms.uBlink.value = warn ? 1 : 0;
    }
  }
}

export class ShotRotor {
  constructor(world, { pivot, parts, axis = 'y', dir = 1, color, time = 0.45, start = 0, correct = null, onTurn = null, onCorrect = null, zone = 'red', kind = 'metal', caps = true }) {
    this.world = world;
    this.pivot = v3(pivot);
    this.parts = parts.map((p) => (Array.isArray(p) ? { min: v3(p.slice(0, 3)), max: v3(p.slice(3, 6)) } : { min: v3(p.min), max: v3(p.max) }));
    this.axis = axis;
    this.dir = dir < 0 ? -1 : 1;
    this.color = color;
    this.hex = COLORS[color].hex;
    this.time = time;
    this.start = ((start % 4) + 4) % 4;
    this.correct = correct === null ? null : [].concat(correct);
    this.onTurn = onTurn;
    this.onCorrect = onCorrect;
    this.k = this.start;
    this.turning = false;
    this.queued = 0;
    this.tt = 0;
    this.jam = 0;
    this.flash = 0;
    this.good = 0;
    this.group = new THREE.Group();
    this.group.position.copy(this.pivot);
    this.spin = new THREE.Group(); // rotates; the group stays put
    this.group.add(this.spin);
    this.edgeMat = glowMat(this.hex, 2);
    const m = mat(kind, zone);
    let ext = 0; // reach along the axis, for the hub caps
    for (const p of this.parts) {
      const s = p.max.clone().sub(p.min), c = p.min.clone().add(p.max).multiplyScalar(0.5);
      const mesh = new THREE.Mesh(boxGeo(s.x, s.y, s.z), m);
      const e = new THREE.Mesh(edgeGeo(s.x, s.y, s.z, 0.06), this.edgeMat);
      mesh.position.copy(c);
      e.position.copy(c);
      this.spin.add(mesh, e);
      ext = Math.max(ext, Math.abs(p.min[axis]), Math.abs(p.max[axis]));
    }
    // hub caps on both ends of the axis: a glowing ring with chevrons showing which way it turns
    if (caps) {
      const glyph = glyphMat(this.hex, 1.2);
      const ringM = glowMat(this.hex, 2.2);
      for (const side of [-1, 1]) {
        const cap = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 28), ringM);
        const disc = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), glyph);
        disc.position.z = 0.01;
        cap.add(ring, disc);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 4), ringM);
          cone.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0);
          // pointing along the turn (counterclockwise seen from +axis for dir 1)
          cone.rotation.z = a + (this.dir * side > 0 ? 0 : Math.PI);
          cap.add(cone);
        }
        // the cap plane faces out along ±axis
        if (axis === 'x') cap.rotation.y = (side * Math.PI) / 2;
        else if (axis === 'y') cap.rotation.x = (-side * Math.PI) / 2;
        else if (side < 0) cap.rotation.y = Math.PI;
        cap.position[axis] = side * (ext + 0.03);
        this.spin.add(cap);
      }
    }
    world.scene.add(this.group);
    this.solids = this.parts.map(() => world.addSolid(new THREE.Vector3(), new THREE.Vector3(), { entity: this, kind: 'metal' }));
    this.pending = this.parts.map(() => false);
    world.add(this);
    this.reset();
  }

  get orientation() {
    return this.k;
  }

  angleOf(k) {
    return (k * this.dir * Math.PI) / 2;
  }

  // world boxes of every part at orientation k (quarter turns keep axis-aligned boxes axis-aligned)
  boxesFor(k) {
    const m = new THREE.Matrix4();
    const a = this.angleOf(k);
    if (this.axis === 'x') m.makeRotationX(a);
    else if (this.axis === 'y') m.makeRotationY(a);
    else m.makeRotationZ(a);
    return this.parts.map((p) => {
      const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      for (let i = 0; i < 8; i++) {
        _p.set(i & 1 ? p.max.x : p.min.x, i & 2 ? p.max.y : p.min.y, i & 4 ? p.max.z : p.min.z).applyMatrix4(m);
        _p.set(Math.round(_p.x * 1e4) / 1e4, Math.round(_p.y * 1e4) / 1e4, Math.round(_p.z * 1e4) / 1e4);
        lo.min(_p);
        hi.max(_p);
      }
      return { min: lo.add(this.pivot), max: hi.add(this.pivot) };
    });
  }

  setSolids(k, player) {
    this.boxesFor(k).forEach((b, i) => {
      const s = this.solids[i];
      s.min.copy(b.min);
      s.max.copy(b.max);
      // a part that would land in the player stays intangible until they move out of it
      this.pending[i] = overlapsPlayer(player, b.min, b.max, 0.01);
      s.enabled = !this.pending[i];
    });
  }

  onHit(color, hit) {
    if (color !== this.color) {
      this.flash = 1;
      return 'immune';
    }
    this.world.fx.sparks(hit?.point || this.pivot, hit?.normal || UP, this.hex, { count: 10, speed: 9, spread: 0.8, life: 0.3 });
    this.turn();
    return 'hit';
  }

  activate() {
    this.turn();
  }

  turn() {
    if (this.turning) {
      this.queued = Math.min(1, this.queued + 1);
      return;
    }
    const player = this.world.game?.player;
    const next = (this.k + 1) % 4;
    if (this.boxesFor(next).some((b) => overlapsPlayer(player, b.min, b.max, 0.05))) {
      // won't turn into you: it shudders, grinds and stays put
      this.jam = 1;
      sfx.jam(nearGain(this.world, this.pivot));
      this.world.fx.sparks(this.pivot, UP, 0xffffff, { count: 14, speed: 8, spread: 2, life: 0.35 });
      return;
    }
    this.turning = true;
    this.tt = 0;
    this.from = this.angleOf(this.k);
    this.to = this.angleOf(next);
    this.next = next;
    sfx.rotorTurn(nearGain(this.world, this.pivot));
  }

  reset() {
    this.k = this.start;
    this.turning = false;
    this.queued = 0;
    this.jam = 0;
    this.spin.rotation.set(0, 0, 0);
    this.spin.rotation[this.axis] = this.angleOf(this.k);
    this.setSolids(this.k, null);
  }

  update(dt, player) {
    if (this.turning) {
      this.tt = Math.min(1, this.tt + dt / this.time);
      this.spin.rotation[this.axis] = this.from + (this.to - this.from) * easeOutBack(this.tt);
      if (this.tt >= 1) {
        this.turning = false;
        this.k = this.next;
        this.spin.rotation[this.axis] = this.to;
        this.setSolids(this.k, player);
        const g = nearGain(this.world, this.pivot);
        sfx.rotorLock(g);
        const fx = this.world.fx;
        for (const b of this.boxesFor(this.k)) {
          _p.addVectors(b.min, b.max).multiplyScalar(0.5);
          fx.sparks(_p, UP, this.hex, { count: 6, speed: 6, spread: 1.6, life: 0.3 });
        }
        fx.flash(this.pivot, this.hex, { size: 1.5, life: 0.15, k: 1.4 });
        this.onTurn?.(this.k, this);
        if (this.correct?.includes(this.k)) {
          this.good = 1;
          sfx.switchOn(g);
          fx.ring(this.pivot, null, 0xffffff, { size: 0.5, end: 4, life: 0.5, thick: 0.08, k: 1.4 });
          this.onCorrect?.(this.k, this);
        }
        if (this.queued > 0) {
          this.queued--;
          this.turn();
        }
      }
    } else if (this.jam > 0) {
      this.jam = Math.max(0, this.jam - dt * 3);
      this.spin.rotation[this.axis] = this.angleOf(this.k) + Math.sin(this.jam * 30) * 0.06 * this.jam;
    }
    // parts waiting for the player to step out of them
    this.pending.forEach((w, i) => {
      if (w && !overlapsPlayer(player, this.solids[i].min, this.solids[i].max, 0.01)) {
        this.pending[i] = false;
        this.solids[i].enabled = true;
      }
    });
    this.flash = Math.max(0, this.flash - dt * 5);
    this.good = Math.max(0, this.good - dt * 1.5);
    const blink = this.pending.some(Boolean) && (this.world.time * 10) % 1 < 0.5;
    this.edgeMat.color.set(this.good > 0 ? 0xffffff : this.hex).multiplyScalar(blink ? 0.4 : 2 + this.flash * 2 + this.good * 0.8);
  }
}

// One column of a PlatformRack: a ledge that moves between notches on its rail.
class RackLedge {
  constructor(rack, i, notch) {
    this.rack = rack;
    this.i = i;
    this.start = notch;
    this.notch = notch;
    this.color = rack.colors[i % rack.colors.length];
    this.hex = COLORS[this.color].hex;
    this.since = 0;
    this.flash = 0;
    const R = rack, W = R.world;
    const t = R.tangent, n = R.normal;
    this.colPos = R.origin.clone().addScaledVector(t, i * R.spacing); // wall point at notch 0's top
    const sx = Math.abs(t.x) * R.width + Math.abs(n.x) * R.depth, sz = Math.abs(t.z) * R.width + Math.abs(n.z) * R.depth;
    this.size = new THREE.Vector3(sx, R.thick, sz);
    this.mesh = new THREE.Group();
    this.edgeMat = glowMat(this.hex, 2);
    const glyph = glyphMat(this.hex, 1);
    this.mesh.add(new THREE.Mesh(boxGeo(sx, R.thick, sz), mat(R.kind, R.zone)), new THREE.Mesh(edgeGeo(sx, R.thick, sz, 0.06), this.edgeMat), faceDecal(this.size, 'up', glyph, 0.5));
    W.scene.add(this.mesh);
    this.y = this.topOf(notch);
    this.solid = W.addSolid(new THREE.Vector3(), new THREE.Vector3(), { delta: new THREE.Vector3(), moving: true, kind: 'metal' });
    // the rail beside the ledge: a dim bar with a tick per notch and a bright marker riding with the ledge
    const side = R.width / 2 + 0.3;
    const railPos = this.colPos.clone().addScaledVector(t, side).addScaledVector(n, 0.04);
    const h = R.notches * R.step;
    const dim = glowMat(this.hex, 0.5), tick = glowMat(this.hex, 1.4);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, h + 0.2, 0.08), dim);
    rail.position.copy(railPos).setY(R.y0 + h / 2);
    W.scene.add(rail);
    for (let k = 0; k <= R.notches; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(t.x) * 0.32 + 0.06, 0.05, Math.abs(t.z) * 0.32 + 0.06), tick);
      m.position.copy(railPos).setY(R.y0 + k * R.step);
      W.scene.add(m);
    }
    this.markerMat = glowMat(this.hex, 3);
    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), this.markerMat);
    this.marker.position.copy(railPos).addScaledVector(n, 0.12);
    this.railPos = railPos;
    W.scene.add(this.marker);
    // targets: UP above the rail, DOWN below it, flat on the wall
    this.targets = [];
    for (const dir of [1, -1]) {
      const y = dir > 0 ? R.y0 + h + R.targetGap : R.y0 - R.thick - R.targetGap;
      const c = this.colPos.clone().setY(y).addScaledVector(n, 0.08);
      const ts = 0.8;
      const half = new THREE.Vector3(Math.abs(t.x) * ts / 2 + Math.abs(n.x) * 0.08, ts / 2, Math.abs(t.z) * ts / 2 + Math.abs(n.z) * 0.08);
      const tm = new THREE.MeshBasicMaterial({ map: arrowTex(), color: new THREE.Color(this.hex).multiplyScalar(1.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(half.x * 2, ts, half.z * 2), new THREE.MeshStandardMaterial({ color: 0x1b1d24, emissive: new THREE.Color(this.hex), emissiveIntensity: 0.15, metalness: 0.7, roughness: 0.4 }));
      plate.position.copy(c);
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(ts * 0.9, ts * 0.9), tm);
      decal.rotation.copy(faceEuler(R.face));
      if (dir < 0) decal.rotateZ(Math.PI);
      decal.position.copy(c).addScaledVector(n, 0.09);
      W.scene.add(plate, decal);
      const target = { color: this.color, mat: tm, plate, flash: 0, onHit: (color, hit) => this.hitTarget(target, dir, color, hit) };
      W.addSolid(c.clone().sub(half), c.clone().add(half), { static: true, entity: target, kind: 'metal' });
      this.targets.push(target);
    }
    this.place();
  }

  topOf(notch) {
    return this.rack.y0 + notch * this.rack.step;
  }

  hitTarget(target, dir, color, hit) {
    if (color !== this.color) {
      target.flash = 0.5;
      return 'immune';
    }
    target.flash = 1;
    const fx = this.rack.world.fx;
    fx.sparks(hit?.point || target.plate.position, this.rack.normal, this.hex, { count: 12, speed: 9, spread: 0.8, life: 0.3 });
    fx.ring(_p.copy(target.plate.position).addScaledVector(this.rack.normal, 0.1), this.rack.normal, this.hex, { size: 0.2, end: 1.2, life: 0.3, thick: 0.12, k: 1.5 });
    this.move(dir);
    return 'hit';
  }

  move(dir, quiet = false) {
    const next = clamp(this.notch + dir, 0, this.rack.notches);
    this.since = 0;
    if (next === this.notch) {
      if (!quiet) sfx.clank(0.4);
      return;
    }
    this.notch = next;
    this.flash = 1;
    if (!quiet) sfx.clank(nearGain(this.rack.world, this.colPos));
  }

  bounds(y, min, max) {
    const R = this.rack;
    // the ledge sticks out from the wall along the normal, centered on the column along the tangent
    const c = _p.copy(this.colPos).addScaledVector(R.normal, R.depth / 2);
    min.set(c.x - this.size.x / 2, y - R.thick, c.z - this.size.z / 2);
    max.set(c.x + this.size.x / 2, y, c.z + this.size.z / 2);
  }

  place() {
    this.bounds(this.y, this.solid.min, this.solid.max);
    this.mesh.position.addVectors(this.solid.min, this.solid.max).multiplyScalar(0.5);
    this.marker.position.y = this.y;
  }

  reset() {
    this.notch = this.start;
    this.y = this.topOf(this.notch);
    this.since = 0;
    this.solid.delta.set(0, 0, 0);
    this.place();
  }

  update(dt, player) {
    const R = this.rack;
    this.since += dt;
    // the harder variant: ledges creep back to their home notch, blinking the marker first
    const home = R.home ? R.home[this.i] ?? this.start : this.start;
    const creeping = R.drift > 0 && this.notch !== home;
    if (creeping && this.since > R.drift) this.move(Math.sign(home - this.notch), true);
    const delta = this.solid.delta.set(0, 0, 0);
    const goal = this.topOf(this.notch);
    if (this.y !== goal) {
      const d = goal - this.y;
      const ny = this.y + Math.sign(d) * Math.min(Math.abs(d), Math.max(0.5, Math.min(5, Math.abs(d) * 8)) * dt);
      this.bounds(ny, _a, _b);
      delta.set(0, ny - this.y, 0);
      if (canMove(player, this.solid, _a, _b, delta)) {
        this.y = ny;
        this.place();
        if (this.y === goal) R.world.fx.sparks(_p.copy(this.marker.position), R.normal, this.hex, { count: 5, speed: 4, spread: 1.2, life: 0.25 });
      } else {
        delta.set(0, 0, 0);
        this.notch = Math.round((this.y - R.y0) / R.step); // give up the move rather than crush
      }
    }
    this.flash = Math.max(0, this.flash - dt * 4);
    const warn = creeping && this.since > R.drift - 0.8 && (R.world.time * 10) % 1 < 0.5;
    this.markerMat.color.set(warn ? 0xffffff : this.hex).multiplyScalar(3);
    this.marker.rotation.y += dt * 2;
    this.edgeMat.color.set(this.hex).multiplyScalar(2 + this.flash * 2);
    for (const t of this.targets) {
      t.flash = Math.max(0, t.flash - dt * 4);
      t.plate.material.emissiveIntensity = 0.15 + t.flash * 0.8;
      t.mat.color.set(this.hex).multiplyScalar(1.4 + t.flash * 2);
    }
  }
}

export class PlatformRack {
  // pos: the wall point of the first column at notch 0's top. Columns run along `along` (default +x on a
  // ±z wall, -z on a ±x wall) every `spacing` m; ledges stick out `depth` m toward `face`.
  constructor(world, { pos, face = '+z', along = null, columns = null, notches = 6, step = 1, start = null, colors = null, color = 0, width = 2.4, depth = 1.6, thick = 0.4, spacing = 3.2, targetGap = 1.2, drift = 0, home = null, zone = 'red', kind = 'plat' }) {
    this.world = world;
    this.face = face;
    this.normal = faceNormal(face).clone();
    this.tangent = along ? v3(along).normalize() : this.normal.x ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(1, 0, 0);
    this.origin = v3(pos);
    this.y0 = this.origin.y;
    this.notches = notches;
    this.step = step;
    this.width = width;
    this.depth = depth;
    this.thick = thick;
    this.spacing = spacing;
    this.targetGap = targetGap;
    this.drift = drift;
    this.home = home;
    this.zone = zone;
    this.kind = kind;
    this.colors = colors || [color];
    const n = columns ?? (start ? start.length : 3);
    this.ledges = [];
    for (let i = 0; i < n; i++) this.ledges.push(new RackLedge(this, i, start ? start[i] ?? 0 : 0));
    world.add(this);
  }

  // notch of every ledge, e.g. to check a solution
  get notchesNow() {
    return this.ledges.map((l) => l.notch);
  }

  reset() {
    for (const l of this.ledges) l.reset();
  }

  update(dt, player) {
    for (const l of this.ledges) l.update(dt, player);
  }
}
