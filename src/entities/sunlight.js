// SUNLIGHT KIT — Solar's light puzzles: mirrors and solar panels on pivots, receivers that catch a beam and
// power things, beams of focused sunlight that bounce between them, and sand-glass that the sun burns away.
//
// RotMirror     { pos (the panel's pivot), yaw: 0, step: π/4, count: 8, start: 0, tilt: 0, size: [2.4, 1.8],
//                 look: 'mirror' | 'pv', post: 1.6 (support height under the pivot; 0 = none), color: YELLOW, onTurn(i) }
//    A mirror (or a glossy photovoltaic panel) that turns about the vertical when shot `color` (YELLOW: it runs
//    on sunlight; null = any color) on its back, frame, yoke or post: one `step` per hit, with a clunk, sparks
//    and a little overshoot. Other colors glance off (its turntable flickers). Facing
//    angles are yaw + i·step (yaw 0 faces north/-z, π/2 west, like the player); tilt > 0 tips the face up
//    (π/4 throws a vertical sunbeam out sideways). count·step = 2π wraps round; a shorter arc stops at its
//    ends (it jams). Which way it turns: a hit right of the pivot (as you look at it) pushes that edge away
//    (a revolving door); a dead-centre hit turns it +1. Its FACE reflects: shots (weapon.js follows the
//    'mirror' result with hit.normal), the yellow beam (onBeam → 'mirror') and SunBeams (reflects()).
//    index / normal / turn(dir) / setIndex(i) / reset().
// LightReceiver { pos (centre of the lens), face: '+x' | '-x' | '+z' | '-z' | 'up' | 'down', accept: 'light' |
//                 'sun', color: YELLOW, mode: 'latch' | 'hold', fill: 0.5 (s of beam to light it),
//                 size: 1.3, links: [], onOn, onOff, cable: [[x,y,z], ...] (a power line that lights up) }
//    accept 'light' (a target plate): a matching shot lights it at once (other colors ricochet), the yellow
//    beam and sunlight fill it. 'sun' (a sun-catcher with a crystal): only focused sunlight (a SunBeam:
//    hit.sun) fills it — the blaster can't fake the sun. color null: any color.
//    latch: once lit it stays lit. hold: lit while the light stays on it (it fades ~0.3 s after).
//    Lighting calls activate(this) on each link (Seal: open(), Elevator: start(), PhasePlatform, ...),
//    going dark calls deactivate(this). on / lit (0..1) / setOn(on) / reset().
// BurnWall      { min, max, time: 1.4 (s of sunlight), look: 'glass' | 'wax', onBurn, hintHtml }
//    A slab of fused sand-glass: shots glance off it (the blaster isn't hot enough), focused sunlight heats
//    it until it boils away (a dissolve with a glowing rim, steam and embers) and the way is open for good.
//    burned / burn().
// SunBeam       { from, dir, range: 140, width: 0.45, bounces: 8, enabled: true, near: 110, source: null |
//                 'lens' | 'crack' }
//    Focused sunlight: a beam from `from` along `dir`, bouncing off mirror solids and anything whose
//    reflects(hit) says so, ending on whatever it strikes: onBeam(dt, hit) with hit.sun = true, or (for
//    things with only onHit, like enemies and yellow barriers) onHit(YELLOW, hit) ticks at the blaster's
//    rate. It doesn't touch the player. path (points) / end (the last hit) / enabled.
// SunEmitter    { pos, dir, time: 2.6, size: 0.9 } — a focusing prism: shoot it YELLOW (or hold the beam on it)
//    and it throws a SunBeam along `dir` for `time` s (kept alight while you keep feeding it).
import * as THREE from 'three';
import { COLORS, YELLOW } from '../colors.js';
import { audio } from '../audio.js';
import { glyphTex } from '../materials.js';
import { v3, glowMat, ringMesh, nearGain, easeOutBack, sfx, clamp } from './mechkit.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _ray = new THREE.Raycaster();
_ray.layers.enableAll();
const TICK = 0.13; // the beam's damage ticks: the blaster's fire interval
const SUN_HEX = 0xffc650;
const SOUNDS = ['rotor_turn', 'rotor_lock', 'rotor_jam', 'mirror_hit', 'switch_on', 'target', 'lava_sizzle', 'shatter', 'energy_crackle', 'incinerator_ignite', 'charge_up', 'servo_heavy'];
audio.manifest?.then(() => audio.prefetch(SOUNDS));

// ------------------------------------------------------------------ shared looks
let pvTex = null;
// a photovoltaic panel: deep blue cells in a white grid, a little sky sheen across it (drawn once)
export function pvTexture() {
  if (pvTex) return pvTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const cols = 6, rows = 6, cw = 256 / cols, ch = 256 / rows;
  g.fillStyle = '#d8dde6';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const gr = g.createLinearGradient(i * cw, j * ch, (i + 1) * cw, (j + 1) * ch);
      const v = 0.85 + ((i * 7 + j * 13) % 5) * 0.05;
      gr.addColorStop(0, `rgb(${18 * v | 0},${42 * v | 0},${98 * v | 0})`);
      gr.addColorStop(1, `rgb(${9 * v | 0},${22 * v | 0},${60 * v | 0})`);
      g.fillStyle = gr;
      g.fillRect(i * cw + 3, j * ch + 3, cw - 6, ch - 6);
      // the cell's fine busbars
      g.fillStyle = 'rgba(160,180,220,0.35)';
      for (let k = 1; k < 4; k++) g.fillRect(i * cw + 3, j * ch + (k * ch) / 4, cw - 6, 1);
    }
  const sg = g.createLinearGradient(0, 256, 256, 0);
  sg.addColorStop(0.3, 'rgba(255,255,255,0)');
  sg.addColorStop(0.47, 'rgba(200,225,255,0.28)');
  sg.addColorStop(0.53, 'rgba(200,225,255,0.28)');
  sg.addColorStop(0.7, 'rgba(255,255,255,0)');
  g.fillStyle = sg;
  g.fillRect(0, 0, 256, 256);
  pvTex = new THREE.CanvasTexture(c);
  pvTex.colorSpace = THREE.SRGBColorSpace;
  pvTex.anisotropy = 8;
  return pvTex;
}

let mirrorTex = null;
// a polished heliostat mirror: pale gold sky in it, a bright streak, faint facet seams
function mirrorTexture() {
  if (mirrorTex) return mirrorTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#fff6e0');
  grad.addColorStop(0.5, '#e8c98a');
  grad.addColorStop(1, '#9a8a70');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const sg = g.createLinearGradient(10, 128, 118, 0);
  sg.addColorStop(0.4, 'rgba(255,255,255,0)');
  sg.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  sg.addColorStop(0.6, 'rgba(255,255,255,0)');
  g.fillStyle = sg;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(60,45,25,0.5)';
  g.lineWidth = 2;
  for (const x of [43, 85]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
  mirrorTex = new THREE.CanvasTexture(c);
  mirrorTex.colorSpace = THREE.SRGBColorSpace;
  return mirrorTex;
}

let M = null;
function kitMats() {
  if (M) return M;
  M = {
    steel: new THREE.MeshStandardMaterial({ color: 0x4a4640, metalness: 0.85, roughness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1c1a18, metalness: 0.7, roughness: 0.5 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb08840, metalness: 0.8, roughness: 0.35, emissive: 0x2a1a06 }),
    // (unlit: out in the sun a lit chrome sheet blows the bloom out)
    mirror: new THREE.MeshBasicMaterial({ map: mirrorTexture(), color: 0xe8e0d0 }),
    pv: new THREE.MeshStandardMaterial({ map: pvTexture(), color: 0xffffff, metalness: 0.55, roughness: 0.18, emissive: 0x0a1630, envMapIntensity: 1.2 }),
    arrow: new THREE.MeshBasicMaterial({ color: new THREE.Color(SUN_HEX).multiplyScalar(1.6) }),
  };
  return M;
}

// a turning-arrow chevron ring for the turntable (shows it turns)
function arrowRing(r, n = 4) {
  const geos = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const s = new THREE.Shape();
    s.moveTo(-0.16, -0.06);
    s.lineTo(0.16, 0);
    s.lineTo(-0.16, 0.06);
    s.lineTo(-0.1, 0);
    s.closePath();
    const g = new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2).rotateY(-a - Math.PI / 2).translate(Math.cos(a) * r, 0, -Math.sin(a) * r);
    geos.push(g);
  }
  return geos;
}

// ------------------------------------------------------------------ the beam's ray cast
// Like World.raycast, but meshes are only tested if they sit near the ray (a beam casts every frame).
function beamCast(world, origin, dir, far) {
  const best = world.raycast(origin, dir, far, { meshes: false });
  let bestT = best ? best.t : far;
  let out = best;
  const cands = [];
  for (const o of world.hitTargets) {
    // distance from the object's origin to the ray segment (generous: big bodies, offset parts)
    const at = o.parent === world.scene ? o.position : o.getWorldPosition(_p);
    _v.subVectors(at, origin);
    const t = clamp(_v.dot(dir), 0, bestT);
    _w.copy(origin).addScaledVector(dir, t);
    if (_w.distanceToSquared(at) < (o.userData.beamRadius || 9) ** 2) cands.push(o);
  }
  if (cands.length) {
    _ray.set(origin, dir);
    _ray.camera = world.game.camera;
    _ray.far = bestT;
    for (const o of cands) o.updateMatrixWorld(true);
    for (const h of _ray.intersectObjects(cands, true)) {
      let hidden = false;
      for (let a = h.object; a; a = a.parent) if (!(a.userData.wantVisible ? a.userData.wantVisible() : a.visible)) hidden = true;
      if (hidden) continue;
      let o = h.object;
      while (o && !o.userData.hit) o = o.parent;
      if (!o || o.userData.noHit) continue;
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : dir.clone().negate();
      out = { t: h.distance, normal: n, entity: o.userData.hit, part: o.userData.part || null, object: h.object, instanceId: h.instanceId };
      break;
    }
  }
  if (out) out.point = origin.clone().addScaledVector(dir, out.t);
  return out;
}

// ------------------------------------------------------------------ RotMirror
export class RotMirror {
  constructor(world, { pos, yaw = 0, step = Math.PI / 4, count = 8, start = 0, tilt = 0, size = [2.4, 1.8], look = 'mirror', post = 1.6, color = YELLOW, onTurn = null, time = 0.45 }) {
    this.world = world;
    this.color = color;
    this.pos = v3(pos);
    this.yaw0 = yaw;
    this.step = step;
    this.count = count;
    this.wrap = Math.abs(Math.abs(step * count) - Math.PI * 2) < 1e-3;
    this.start = start;
    this.index = start;
    this.tilt = tilt;
    this.time = time;
    this.onTurn = onTurn;
    this.angle = this.angleOf(start);
    this.from = this.angle;
    this.to = this.angle;
    this.t = 1;
    this.cool = 0;
    this.flash = 0;
    this.normal = new THREE.Vector3();
    const mats = kitMats();
    const [w, h] = size;
    this.size = size;
    this.root = new THREE.Group();
    this.root.position.copy(this.pos);
    this.root.userData.hit = this;
    this.root.userData.beamRadius = Math.max(w, h) + post + 1;
    // the post (pos.y - post is the floor) up to a turntable under the panel, and a yoke up its sides to
    // the pivot (the panel's centre)
    const tableY = -h / 2 - 0.3;
    if (post + tableY > 0.05) {
      const ph = post + tableY;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, ph, 10), mats.steel);
      p.position.y = -post + ph / 2;
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.25, 12), mats.dark);
      foot.position.y = -post + 0.12;
      this.root.add(p, foot);
    }
    this.yawG = new THREE.Group();
    this.root.add(this.yawG);
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.16, 16), mats.brass);
    table.position.y = tableY;
    this.yawG.add(table);
    this.arrowMat = mats.arrow.clone();
    const arrows = new THREE.Mesh(mergeGeos(arrowRing(0.32)), this.arrowMat);
    arrows.position.y = tableY + 0.085;
    this.yawG.add(arrows);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, -tableY + 0.1, 0.14), mats.steel);
      arm.position.set(s * (w / 2 + 0.12), tableY / 2, 0);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.2, 10), mats.brass);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(s * (w / 2 + 0.12), 0, 0);
      this.yawG.add(arm, hub);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w + 0.36, 0.12, 0.14), mats.steel);
    bar.position.y = tableY;
    this.yawG.add(bar);
    this.tiltG = new THREE.Group();
    this.yawG.add(this.tiltG);
    // the panel: a backing slab with a frame, and the reflecting face (front side only: from behind a
    // shot passes it and strikes the back, which turns it)
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), mats.dark);
    back.position.z = 0.07;
    this.tiltG.add(back);
    for (const [fx, fy, fw, fh] of [[0, h / 2, w + 0.16, 0.1], [0, -h / 2, w + 0.16, 0.1], [w / 2, 0, 0.1, h], [-w / 2, 0, 0.1, h]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.18), look === 'pv' ? mats.steel : mats.brass);
      f.position.set(fx, fy, 0.04);
      this.tiltG.add(f);
    }
    this.faceMat = (look === 'pv' ? mats.pv : mats.mirror).clone();
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.faceMat);
    this.face.rotation.y = Math.PI; // the plane faces local -z (the panel's front)
    this.face.position.z = -0.005;
    this.face.userData.part = 'face';
    this.tiltG.add(this.face);
    this.place();
    world.scene.add(this.root);
    world.addHittable(this.root);
    world.add(this);
  }

  angleOf(i) {
    return this.yaw0 + i * this.step;
  }

  place() {
    this.yawG.rotation.y = this.angle;
    this.tiltG.rotation.x = this.tilt;
    const ct = Math.cos(this.tilt);
    this.normal.set(-Math.sin(this.angle) * ct, Math.sin(this.tilt), -Math.cos(this.angle) * ct).normalize();
  }

  // the face's world normal at the settled angle (what reflections use, even mid-turn)
  faceHit(hit) {
    return hit?.object === this.face && (!hit.dir || hit.dir.dot(this.normal) < 0);
  }

  reflects(hit) {
    if (!this.faceHit(hit)) return false;
    hit.normal = this.normal.clone();
    return true;
  }

  onBeam(dt, hit) {
    return this.reflects(hit) ? 'mirror' : 'hit';
  }

  onHit(color, hit) {
    if (this.reflects(hit)) {
      this.flash = 0.6;
      return 'mirror';
    }
    if (this.color !== null && color !== this.color) {
      // the wrong color: the turntable won't take it
      this.flash = 0.5;
      this.wrong = 0.4;
      return 'immune';
    }
    // which way: the torque of the shot about the vertical axis through the pivot
    let dir = 1;
    if (hit?.point && hit.dir) {
      const rx = hit.point.x - this.pos.x, rz = hit.point.z - this.pos.z;
      const tq = rz * hit.dir.x - rx * hit.dir.z;
      if (Math.abs(tq) > 0.15) dir = tq > 0 ? 1 : -1;
    }
    this.turn(dir, hit);
    return 'hit';
  }

  turn(dir = 1, hit = null) {
    if (this.cool > 0 || this.t < 1) return false;
    let next = this.index + dir;
    if (this.wrap) next = (next + this.count) % this.count;
    else if (next < 0 || next >= this.count) {
      sfx.jam(nearGain(this.world, this.pos));
      this.jam = 0.4;
      this.cool = 0.3;
      return false;
    }
    this.from = this.angle;
    this.to = this.from + dir * this.step;
    this.index = next;
    this.t = 0;
    this.cool = this.time + 0.18;
    sfx.rotorTurn(nearGain(this.world, this.pos));
    const p = hit?.point || this.pos;
    this.world.fx.sparks(p, hit?.normal || UP, SUN_HEX, { count: 8, speed: 6, spread: 0.8, life: 0.3 });
    this.flash = 1;
    return true;
  }

  setIndex(i) {
    this.index = i;
    this.angle = this.from = this.to = this.angleOf(i);
    this.t = 1;
    this.place();
  }

  reset() {
    this.setIndex(this.start);
  }

  update(dt) {
    this.cool -= dt;
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.time);
      this.angle = this.from + (this.to - this.from) * easeOutBack(this.t);
      if (this.t >= 1) {
        this.angle = this.to = this.angleOf(this.index);
        sfx.rotorLock(nearGain(this.world, this.pos));
        this.world.fx.burst(_v.copy(this.pos).setY(this.pos.y - this.size[1] * 0.08), 0xd8b880, { count: 6, speed: 1.5, life: 0.6, size: 0.18, gravity: -0.5, mode: 'puff' });
        this.onTurn?.(this.index, this);
      }
      this.place();
    } else if (this.jam > 0) {
      this.jam -= dt;
      this.yawG.rotation.y = this.angle + Math.sin(this.jam * 60) * 0.02 * (this.jam / 0.4);
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);
    if (this.wrong > 0) this.wrong -= dt;
    this.arrowMat.color.set(this.wrong > 0 && Math.sin(this.wrong * 60) > 0 ? 0x553311 : SUN_HEX).multiplyScalar(1.2 + this.flash * 2.5);
  }
}

function mergeGeos(geos) {
  const g = new THREE.BufferGeometry();
  let n = 0;
  for (const x of geos) n += (x.index ? x.index.count : x.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const x0 of geos) {
    const x = x0.index ? x0.toNonIndexed() : x0;
    pos.set(x.attributes.position.array, o * 3);
    nor.set(x.attributes.normal.array, o * 3);
    o += x.attributes.position.count;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

// ------------------------------------------------------------------ LightReceiver
const FACE_N = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+z': [0, 0, 1], '-z': [0, 0, -1], up: [0, 1, 0], down: [0, -1, 0] };

export class LightReceiver {
  constructor(world, { pos, face = '+z', accept = 'light', color = YELLOW, mode = 'latch', fill = 0.5, size = 1.3, links = [], onOn = null, onOff = null, cable = null }) {
    this.world = world;
    this.pos = v3(pos);
    this.n = new THREE.Vector3(...(FACE_N[face] || face));
    this.accept = accept;
    this.color = color;
    this.mode = mode;
    this.fill = fill;
    this.links = links;
    this.onOn = onOn;
    this.onOff = onOff;
    this.on = false;
    this.lit = 0;
    this.feed = 0; // seconds since light last fell on it
    this.flash = 0;
    this.t = Math.random() * 10;
    const hex = color === null ? SUN_HEX : COLORS[color].hex;
    this.hex = hex;
    const mats = kitMats();
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.n);
    // housing: a square collar standing proud of the wall, with the lens set in it
    const r = size / 2;
    const housing = new THREE.Mesh(new THREE.BoxGeometry(size + 0.5, size + 0.5, 0.4), mats.dark);
    housing.position.z = -0.2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r + 0.06, 0.07, 6, 28), mats.brass);
    rim.position.z = 0.02;
    this.lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(0.3) });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(r, 28), this.lensMat);
    lens.position.z = 0.03;
    this.group.add(housing, rim, lens);
    if (accept === 'sun') {
      // a sun-catcher: a faceted crystal boss and four sun-ray vanes round it
      this.crystalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(0.5) });
      const cr = new THREE.Mesh(new THREE.OctahedronGeometry(r * 0.45, 0), this.crystalMat);
      cr.scale.z = 0.6;
      cr.position.z = 0.12;
      this.crystal = cr;
      this.group.add(cr);
      for (let k = 0; k < 4; k++) {
        const vane = new THREE.Mesh(new THREE.BoxGeometry(0.12, size * 0.5, 0.1), mats.brass);
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        vane.position.set(Math.cos(a) * (r + 0.42), Math.sin(a) * (r + 0.42), -0.05);
        vane.rotation.z = a - Math.PI / 2;
        this.group.add(vane);
      }
    } else {
      // a target: the bullseye glyph over the lens
      this.glyph = new THREE.MeshBasicMaterial({ map: glyphTex, color: new THREE.Color(hex).multiplyScalar(0.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const g = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.95, size * 0.95), this.glyph);
      g.position.z = 0.05;
      this.group.add(g);
    }
    this.ring = ringMesh(hex, r + 0.22, 16);
    this.ring.position.z = 0.06;
    this.group.add(this.ring);
    this.group.userData.hit = this;
    this.group.userData.beamRadius = size + 1;
    world.scene.add(this.group);
    world.addHittable(this.group);
    // the power line: thin boxes along the points, dark until it's lit
    if (cable && cable.length > 1) {
      this.cableMat = new THREE.MeshBasicMaterial({ color: 0x2a2018 });
      const geos = [];
      for (let i = 0; i < cable.length - 1; i++) {
        const a = v3(cable[i]), b = v3(cable[i + 1]);
        const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
        const g = new THREE.BoxGeometry(0.12, 0.12, len + 0.12);
        _m.lookAt(a, b, Math.abs(b.y - a.y) > len * 0.9 ? new THREE.Vector3(1, 0, 0) : UP);
        g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(_q.setFromRotationMatrix(_m))).translate(mid.x, mid.y, mid.z);
        geos.push(g);
      }
      this.cable = new THREE.Mesh(mergeGeos(geos), this.cableMat);
      world.scene.add(this.cable);
    }
    world.add(this);
  }

  takes(hit) {
    return this.accept !== 'sun' || !!hit?.sun;
  }

  onHit(color, hit) {
    if (this.color !== null && color !== this.color) {
      this.flash = 0.6;
      return 'immune';
    }
    if (!this.takes(hit)) {
      // a sun-catcher: the blaster's light is too thin to wake it (it shimmers, the shot glances off)
      this.flash = 0.8;
      if (!this.warned && hit && !hit.sun) {
        this.warned = true;
        this.world.game.hud.message('A <b>sun-catcher</b>: it only wakes to <b>focused sunlight</b>. Turn the panels to bring the sun to it.', 4.5);
      }
      return 'immune';
    }
    if (hit?.sun) return this.onBeam(TICK, hit);
    this.lit = 1;
    this.feed = 0;
    this.setOn(true, hit);
    return 'hit';
  }

  onBeam(dt, hit) {
    if (!this.takes(hit)) return 'hit';
    this.feed = 0;
    this.lit = Math.min(1, this.lit + dt / this.fill);
    if (this.lit >= 1) this.setOn(true, hit);
    return 'hit';
  }

  // quiet: no sound or sparks (a restored save opening what the sun locked)
  setOn(on, hit = null, quiet = false) {
    if (on === this.on) return;
    this.on = on;
    const g = quiet ? 0 : nearGain(this.world, this.pos, 50);
    if (on && quiet) {
      this.lit = 1;
      for (const l of this.links) l?.activate?.(this);
      this.onOn?.(this);
    } else if (on) {
      this.flash = 1;
      audio.sample('switch_on', { gain: 0.8 * g, vary: 0 }) || audio.target();
      audio.sample('energy_crackle', { gain: 0.5 * g, rate: 1.2 });
      const p = hit?.point || this.pos;
      this.world.fx.ring(p, this.n, this.hex, { size: 0.3, end: 2.2, life: 0.5, thick: 0.15, k: 1.6 });
      this.world.fx.burst(p, this.hex, { count: 24, speed: 6, life: 0.6, size: 0.22, gravity: 2 });
      for (const l of this.links) l?.activate?.(this);
      this.onOn?.(this);
    } else {
      audio.sample('switch_off', { gain: 0.6 * g });
      for (const l of this.links) l?.deactivate?.(this);
      this.onOff?.(this);
    }
  }

  reset() {
    if (this.mode === 'latch' && this.keep) return;
    this.lit = 0;
    if (this.on) {
      this.on = false;
      for (const l of this.links) l?.deactivate?.(this);
      this.onOff?.(this);
    }
  }

  update(dt) {
    this.t += dt;
    this.feed += dt;
    if (!this.on || this.mode === 'hold') {
      // light that stops falling on it drains away
      if (this.feed > 0.12) this.lit = Math.max(0, this.lit - dt * (this.mode === 'hold' ? 3 : 0.8));
      if (this.on && this.mode === 'hold' && this.lit <= 0) this.setOn(false);
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.5);
    const k = this.on ? 1 : this.lit;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.4);
    this.lensMat.color.set(this.hex).multiplyScalar(0.25 + k * 1.6 + this.flash * 1.2 + (this.on ? 0.3 * pulse : 0.12 * pulse));
    if (this.crystalMat) {
      this.crystalMat.color.set(this.hex).multiplyScalar(0.45 + k * 2.2 + this.flash);
      this.crystal.rotation.z += dt * (0.3 + k * 3);
    }
    if (this.glyph) this.glyph.color.set(this.hex).multiplyScalar(0.7 + k * 0.8 + this.flash);
    this.ring.material.uniforms.uFrac.value = k;
    this.ring.material.uniforms.uBlink.value = this.on ? 0.2 * pulse : 0;
    if (this.cableMat) this.cableMat.color.set(this.on ? this.hex : 0x2a2018).multiplyScalar(this.on ? 1.4 + 0.4 * Math.sin(this.t * 6) : 1);
  }
}

// ------------------------------------------------------------------ BurnWall
const BURN_VS = `
  varying vec3 vW; varying vec3 vN;
  void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const BURN_FS = `
  uniform float uBurn, uHeat, uTime, uWax; uniform vec3 uHot; varying vec3 vW; varying vec3 vN;
  float h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
  void main(){
    float n = n3(vW * 1.3) * 0.6 + n3(vW * 4.1) * 0.3 + n3(vW * 11.0) * 0.1;
    // it burns from the hot spot outward and from the bottom up a little
    float d = n - uBurn * 1.25 + 0.15;
    if (d < 0.0) discard;
    // fused glass in bands, like tree rings (one per summer)
    float band = 0.5 + 0.5 * sin(vW.y * 9.0 + n3(vW * 0.8) * 6.0);
    vec3 glass = mix(vec3(0.42, 0.28, 0.12), vec3(0.95, 0.72, 0.38), band * band);
    glass = mix(glass, vec3(0.78, 0.66, 0.5), uWax);
    float rim = abs(dot(normalize(vN), normalize(cameraPosition - vW)));
    vec3 col = glass * (0.55 + 0.45 * rim);
    col += uHot * uHeat * (0.6 + 0.4 * sin(uTime * 9.0 + n * 20.0)) * 0.8;
    // the burning rim
    float edge = 1.0 - smoothstep(0.0, 0.09, d);
    col = mix(col, vec3(2.6, 1.4, 0.45), edge * step(0.001, uBurn));
    gl_FragColor = vec4(col, 1.0);
  }`;

export class BurnWall {
  constructor(world, { min, max, time = 1.4, look = 'glass', onBurn = null, hintHtml = null }) {
    this.world = world;
    this.min = v3(min);
    this.max = v3(max);
    this.time = time;
    this.onBurn = onBurn;
    this.hintHtml = hintHtml ?? 'Fused <b>sand-glass</b>: your shots glance off. Only <b>focused sunlight</b> can burn through it.';
    this.heat = 0;
    this.burnT = -1;
    this.burned = false;
    this.cool = 0;
    this.fxT = 0;
    const size = new THREE.Vector3().subVectors(this.max, this.min);
    this.center = new THREE.Vector3().addVectors(this.min, this.max).multiplyScalar(0.5);
    this.size = size;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: BURN_VS, fragmentShader: BURN_FS,
      uniforms: { uBurn: { value: 0 }, uHeat: { value: 0 }, uTime: { value: 0 }, uWax: { value: look === 'wax' ? 1 : 0 }, uHot: { value: new THREE.Color(1.6, 0.6, 0.12) } },
    });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z, Math.max(1, Math.round(size.x)), Math.max(1, Math.round(size.y)), Math.max(1, Math.round(size.z))), this.mat);
    this.mesh.position.copy(this.center);
    this.mesh.userData.hit = this;
    this.mesh.userData.beamRadius = size.length() / 2 + 1;
    world.scene.add(this.mesh);
    world.addHittable(this.mesh);
    this.solid = world.addSolid(this.min.clone(), this.max.clone(), { static: false, noShot: true, kind: 'metal' });
    world.add(this);
  }

  onHit(color, hit) {
    if (this.burned) return undefined;
    if (hit?.sun) return this.onBeam(TICK, hit);
    this.cool = 0.15;
    if (!this.warned) {
      this.warned = true;
      this.world.game.hud.message(this.hintHtml, 4.5);
    }
    return 'immune';
  }

  onBeam(dt, hit) {
    if (this.burned || !hit?.sun) return 'hit';
    this.heat = Math.min(1, this.heat + dt / this.time);
    this.hot = hit.point;
    this.fed = 0;
    if (this.heat >= 1) this.burn();
    return 'hit';
  }

  burn(instant = false) {
    if (this.burned) return;
    this.burned = true;
    this.solid.enabled = false;
    this.world.removeHittable(this.mesh);
    if (instant) {
      this.mesh.visible = false;
      return;
    }
    this.burnT = 0;
    const g = Math.max(0.4, nearGain(this.world, this.center, 60));
    audio.sample('lava_sizzle', { gain: 0.9 * g, rate: 0.7 });
    audio.sample('shatter', { gain: 0.6 * g, rate: 0.6 });
    audio.sample('incinerator_ignite', { gain: 0.5 * g, rate: 1.3 });
    this.onBurn?.(this);
  }

  update(dt, player) {
    this.mat.uniforms.uTime.value += dt;
    this.fed = (this.fed ?? 9) + dt;
    if (!this.burned) {
      if (this.fed > 0.2) this.heat = Math.max(0, this.heat - dt * 0.35);
      this.mat.uniforms.uHeat.value = this.heat + (this.cool > 0 ? 0.3 : 0);
      this.cool -= dt;
      // smoke and sparks off the hot spot while the sun works at it
      if (this.fed < 0.2 && this.hot && (this.fxT -= dt) <= 0) {
        this.fxT = 0.04;
        const fx = this.world.fx;
        fx.ember(this.hot, (Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3, 0xffa040, 0.6, 0.08);
        if (Math.random() < 0.4) fx.burst(this.hot, 0x8a7060, { count: 1, speed: 1, life: 1.4, size: 0.4, gravity: -1.2, mode: 'puff' });
        if (Math.random() < 0.05) audio.sample('lava_sizzle', { gain: 0.25 * nearGain(this.world, this.center), vary: 0.2 });
      }
      return;
    }
    if (this.burnT < 0) return;
    this.burnT += dt;
    const k = Math.min(1, this.burnT / 1.3);
    this.mat.uniforms.uBurn.value = k;
    this.mat.uniforms.uHeat.value = 1 - k * 0.5;
    // the glass boils off in steam and embers
    const fx = this.world.fx;
    for (let i = 0; i < 4; i++) {
      _v.set(this.min.x + Math.random() * this.size.x, this.min.y + Math.random() * this.size.y, this.min.z + Math.random() * this.size.z);
      fx.ember(_v, (Math.random() - 0.5) * 2, 1 + Math.random() * 3, (Math.random() - 0.5) * 2, Math.random() < 0.5 ? 0xffb050 : 0xff7020, 0.8, 0.09);
      if (Math.random() < 0.5) fx.burst(_v, 0xc8b8a0, { count: 1, speed: 0.8, life: 1.8, size: 0.7, gravity: -1.4, mode: 'puff' });
    }
    if (k >= 1) {
      this.mesh.visible = false;
      this.burnT = -1;
    }
  }
}

// ------------------------------------------------------------------ SunBeam
const BEAM_VS = `
  varying vec3 vN; varying vec3 vV; varying float vY; varying float vD;
  void main(){
    vec4 w = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - w.xyz);
    vD = distance(cameraPosition, w.xyz);
    vY = position.y + 0.5;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const BEAM_FS = `
  uniform float uI, uTime, uLen, uCore; varying vec3 vN; varying vec3 vV; varying float vY; varying float vD;
  void main(){
    // (it thins out right in front of your eyes, so walking through it doesn't white the screen out)
    float near = smoothstep(0.4, 2.5, vD);
    float rim = abs(dot(normalize(vN), normalize(vV)));
    float core = pow(rim, uCore);
    float flow = 0.75 + 0.25 * sin(vY * uLen * 1.7 - uTime * 14.0) * sin(vY * uLen * 0.6 - uTime * 5.0 + 1.3);
    vec3 col = mix(vec3(1.0, 0.42, 0.08), vec3(1.5, 1.25, 0.85), core);
    gl_FragColor = vec4(min(col * core * flow * uI * near, vec3(2.6)), 1.0);
  }`;
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);

export class SunBeam {
  constructor(world, { from, dir, range = 140, width = 0.45, bounces = 8, enabled = true, near = 110, source = null }) {
    this.world = world;
    this.from = v3(from);
    this.dir = v3(dir).normalize();
    this.range = range;
    this.width = width;
    this.bounces = bounces;
    this.enabled = enabled;
    this.near = near;
    this.I = enabled ? 1 : 0;
    this.path = [];
    this.end = null;
    this.tickT = 0;
    this.traceT = 0;
    this.fxT = 0;
    this.t = Math.random() * 10;
    const mk = (core, k) => new THREE.ShaderMaterial({
      vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uI: { value: k }, uTime: { value: 0 }, uLen: { value: 1 }, uCore: { value: core } },
    });
    this.segs = [];
    for (let i = 0; i <= bounces; i++) {
      const core = new THREE.Mesh(beamGeo, mk(2.5, 1.3));
      const glow = new THREE.Mesh(beamGeo, mk(1.2, 0.35));
      core.visible = glow.visible = false;
      core.userData.noCull = glow.userData.noCull = true;
      world.scene.add(core, glow);
      this.segs.push({ core, glow });
    }
    // the splash where it strikes, and a hot glint at each mirror
    this.splashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.1, 0.55), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.splash = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), this.splashMat);
    this.splash.userData.noCull = true;
    world.scene.add(this.splash);
    this.glints = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), this.splashMat, bounces + 1);
    this.glints.userData.noCull = true;
    this.glints.count = 0;
    world.scene.add(this.glints);
    if (source === 'lens') this.buildLens();
    else if (source === 'crack') this.buildCrack();
    this.roar = audio.createLoop('sun_hum', { gain: 0 });
    world.add(this);
  }

  // the collector lens it pours out of: a bronze ring housing with a white-hot eye
  buildLens() {
    const mats = kitMats();
    const g = new THREE.Group();
    g.position.copy(this.from);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), this.dir);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.22, 8, 24), mats.brass);
    ring.rotation.x = Math.PI / 2;
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, 1.2, 16, 1, true), mats.dark);
    hood.position.y = 0.6;
    hood.material = mats.dark;
    this.eyeMat = glowMat(0xfff0c0, 2.4);
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.95, 20), this.eyeMat);
    eye.rotation.x = Math.PI / 2;
    eye.position.y = 0.02;
    g.add(ring, hood, eye);
    this.world.scene.add(g);
  }

  // a sunlit crack in a roof: a ragged glowing slit
  buildCrack() {
    this.eyeMat = glowMat(0xfff0c0, 2.2);
    const s = new THREE.Shape();
    const L = 1.6, W = 0.5;
    s.moveTo(-L, 0);
    for (let i = 0; i <= 8; i++) s.lineTo(-L + (i / 8) * 2 * L, (i % 2 ? 1 : 0.6) * W * Math.sin((i / 8) * Math.PI));
    for (let i = 8; i >= 0; i--) s.lineTo(-L + (i / 8) * 2 * L, -(i % 2 ? 0.6 : 1) * W * Math.sin((i / 8) * Math.PI));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), this.eyeMat);
    m.position.copy(this.from).addScaledVector(this.dir, -0.05);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.dir);
    m.rotateZ(Math.random() * Math.PI);
    this.world.scene.add(m);
  }

  setDir(d) {
    this.dir.copy(d).normalize();
  }

  trace() {
    const pts = this.path;
    pts.length = 0;
    let o = this.from.clone(), d = this.dir.clone();
    pts.push(o.clone());
    this.end = null;
    this.glintN = 0;
    for (let k = 0; k <= this.bounces; k++) {
      const hit = beamCast(this.world, o, d, this.range);
      if (!hit) {
        pts.push(o.clone().addScaledVector(d, this.range));
        break;
      }
      hit.dir = d.clone();
      hit.sun = true;
      hit.beam = this;
      pts.push(hit.point.clone());
      const mirror = hit.solid?.mirror || (hit.entity?.reflects && hit.entity.reflects(hit));
      if (mirror && k < this.bounces) {
        const n = hit.normal;
        d = d.clone().addScaledVector(n, -2 * d.dot(n)).normalize();
        o = hit.point.clone().addScaledVector(n, 0.03);
        this.glints.setMatrixAt(this.glintN++, _m.compose(hit.point, _q.identity(), _v.setScalar(this.width * 1.6)));
        continue;
      }
      this.end = hit;
      break;
    }
    this.glints.count = this.glintN;
    this.glints.instanceMatrix.needsUpdate = true;
  }

  update(dt, player) {
    this.t += dt;
    this.I += ((this.enabled ? 1 : 0) - this.I) * Math.min(1, dt * 6);
    const far = player.pos.distanceTo(this.from) > this.near && (!this.path.length || player.pos.distanceTo(this.path[this.path.length - 1]) > this.near);
    if (this.I < 0.01 || far) {
      for (const s of this.segs) s.core.visible = s.glow.visible = false;
      this.splash.visible = false;
      this.glints.visible = false;
      this.roar.setGain(0);
      return;
    }
    // trace at ~30 Hz (mirrors turn, enemies walk into it)
    this.traceT -= dt;
    if (this.traceT <= 0 || !this.path.length) {
      this.traceT = 1 / 30;
      this.trace();
    }
    const pts = this.path, I = this.I * (0.92 + 0.08 * Math.sin(this.t * 31));
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      if (i >= pts.length - 1) {
        s.core.visible = s.glow.visible = false;
        continue;
      }
      const a = pts[i], b = pts[i + 1];
      const len = a.distanceTo(b);
      _v.addVectors(a, b).multiplyScalar(0.5);
      _w.subVectors(b, a).normalize();
      _q.setFromUnitVectors(UP, _w);
      for (const [m, wk, k] of [[s.core, 1, 1.3], [s.glow, 3.2, 0.35]]) {
        m.position.copy(_v);
        m.quaternion.copy(_q);
        m.scale.set(this.width * wk * 0.5, len, this.width * wk * 0.5);
        m.material.uniforms.uI.value = I * k;
        m.material.uniforms.uTime.value = this.t;
        m.material.uniforms.uLen.value = len;
        m.visible = true;
      }
    }
    this.glints.visible = this.glintN > 0;
    const endP = pts[pts.length - 1];
    this.splash.visible = !!this.end;
    if (this.end) {
      this.splash.position.copy(endP);
      this.splash.scale.setScalar(this.width * (1.5 + 0.3 * Math.sin(this.t * 23)));
      this.splashMat.opacity = I;
      // sparks and embers where it bites
      this.fxT -= dt;
      if (this.fxT <= 0) {
        this.fxT = 0.05;
        const n = this.end.normal || UP;
        this.world.fx.ember(endP, n.x * 3 + (Math.random() - 0.5) * 3, n.y * 3 + 1 + Math.random() * 2, n.z * 3 + (Math.random() - 0.5) * 3, 0xffb24a, 0.5, 0.08);
      }
      // feed what it ends on: onBeam every frame, else onHit ticks (enemies, yellow barriers, targets)
      const e = this.end.entity;
      if (e && this.enabled) {
        if (e.onBeam) e.onBeam(dt, this.end);
        else if (e.onHit && (this.tickT -= dt) <= 0) {
          this.tickT = TICK;
          e.onHit(YELLOW, this.end);
        }
      }
    }
    const g = nearGain(this.world, endP, 30) * 0.4 + nearGain(this.world, this.from, 30) * 0.2;
    this.roar.setGain(g * this.I);
  }
}

// ------------------------------------------------------------------ SunEmitter
export class SunEmitter {
  constructor(world, { pos, dir, time = 2.6, size = 0.9 }) {
    this.world = world;
    this.pos = v3(pos);
    this.dir = v3(dir).normalize();
    this.time = time;
    this.left = 0;
    this.t = 0;
    const mats = kitMats();
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.dir);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.6, size * 0.75, size * 1.6, 8), mats.dark);
    body.rotation.x = Math.PI / 2;
    body.position.z = -size * 0.5;
    const collar = new THREE.Mesh(new THREE.TorusGeometry(size * 0.62, 0.08, 6, 16), mats.brass);
    collar.position.z = size * 0.3;
    this.prismMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(SUN_HEX).multiplyScalar(0.6) });
    const prism = new THREE.Mesh(new THREE.OctahedronGeometry(size * 0.5, 0), this.prismMat);
    prism.position.z = size * 0.35;
    prism.scale.set(1, 1, 1.5);
    this.prism = prism;
    this.ring = ringMesh(SUN_HEX, size * 0.95, 12);
    this.ring.position.z = size * 0.32;
    this.group.add(body, collar, prism, this.ring);
    this.group.userData.hit = this;
    world.scene.add(this.group);
    world.addHittable(this.group);
    this.beam = new SunBeam(world, { from: this.pos.clone().addScaledVector(this.dir, size * 1.1), dir: this.dir, enabled: false, width: 0.35 });
    world.add(this);
  }

  feed(k) {
    const was = this.left > 0;
    this.left = Math.min(this.time, this.left + k);
    if (!was) {
      const g = nearGain(this.world, this.pos, 50);
      audio.sample('charge_up', { gain: 0.5 * g, rate: 1.6 });
      audio.sample('incinerator_ignite', { gain: 0.5 * g, rate: 1.4 });
    }
  }

  onHit(color) {
    if (color !== YELLOW) return 'immune';
    this.feed(this.time);
    return 'hit';
  }

  onBeam(dt, hit) {
    if (hit?.beam === this.beam) return 'hit';
    this.feed(dt * 3 + 0.3);
    return 'hit';
  }

  reset() {
    this.left = 0;
  }

  update(dt) {
    this.t += dt;
    this.left = Math.max(0, this.left - dt);
    this.beam.enabled = this.left > 0;
    const k = this.left / this.time;
    this.prismMat.color.set(SUN_HEX).multiplyScalar(0.6 + k * 2.2 + 0.2 * Math.sin(this.t * 3));
    this.prism.rotation.z += dt * (0.4 + k * 6);
    this.ring.material.uniforms.uFrac.value = k;
  }
}

// ------------------------------------------------------------------ LightShaft
// A shaft of daylight through a crack in a roof: a soft, dusty column (just light — it burns nothing) with
// a glowing slit where it gets in and a pool where it lands. down(): it fades out (the sun's eclipsed).
const SHAFT_FS = `
  uniform float uI, uTime; varying vec3 vN; varying vec3 vV; varying float vY; varying float vD;
  void main(){
    float rim = abs(dot(normalize(vN), normalize(vV)));
    float body = pow(rim, 1.6);
    float fade = smoothstep(0.0, 0.25, vY) * smoothstep(1.0, 0.82, vY);
    float dust = 0.82 + 0.18 * sin(vY * 40.0 - uTime * 0.8) * sin(vY * 13.0 + uTime * 0.5);
    gl_FragColor = vec4(vec3(1.0, 0.78, 0.45) * body * fade * dust * uI, 1.0);
  }`;
export class LightShaft {
  constructor(world, { top, bottom, r = 0.9, intensity = 0.32 }) {
    this.world = world;
    const a = v3(top), b = v3(bottom);
    this.top = a;
    this.bottom = b;
    this.I = intensity;
    this.k = 1;
    this.t = Math.random() * 10;
    const len = a.distanceTo(b);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VS, fragmentShader: SHAFT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uI: { value: intensity }, uTime: { value: 0 } },
    });
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 1.25, 1, 12, 1, true), this.mat);
    this.mesh.position.addVectors(a, b).multiplyScalar(0.5);
    this.mesh.quaternion.setFromUnitVectors(UP, _v.subVectors(a, b).normalize());
    this.mesh.scale.set(1, len, 1);
    world.scene.add(this.mesh);
    this.poolMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.75, 0.42).multiplyScalar(intensity * 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const pool = new THREE.Mesh(new THREE.CircleGeometry(r * 1.5, 20), this.poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.copy(b).y += 0.03;
    world.scene.add(pool);
    this.slitMat = glowMat(0xfff0c8, 1.8);
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.6, r * 0.45), this.slitMat);
    slit.rotation.x = Math.PI / 2;
    slit.rotation.z = Math.random() * Math.PI;
    slit.position.copy(a).y -= 0.03;
    world.scene.add(slit);
    this.moteT = 0;
    world.add(this);
  }

  down() {
    this.k = 0;
  }

  update(dt, player) {
    this.t += dt;
    this.mat.uniforms.uTime.value = this.t;
    this.mat.uniforms.uI.value += (this.I * this.k - this.mat.uniforms.uI.value) * Math.min(1, dt * 2);
    const I = this.mat.uniforms.uI.value / this.I;
    this.poolMat.color.setRGB(1.0, 0.75, 0.42).multiplyScalar(this.I * 1.6 * I);
    this.slitMat.color.setRGB(1, 0.94, 0.78).multiplyScalar(0.3 + 1.5 * I);
    // motes turning in the light
    if (I > 0.1 && player.pos.distanceToSquared(this.bottom) < 900 && (this.moteT -= dt) <= 0) {
      this.moteT = 0.12;
      _v.lerpVectors(this.bottom, this.top, Math.random() * 0.8);
      _v.x += (Math.random() - 0.5) * 1.2;
      _v.z += (Math.random() - 0.5) * 1.2;
      this.world.fx.burst(_v, 0xffe0a0, { count: 1, speed: 0.15, life: 3, size: 0.06, gravity: -0.05, drag: 0.6, spread: 1 });
    }
  }
}
