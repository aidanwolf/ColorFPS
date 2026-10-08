// THE SPHINX — Solar's mini-boss: a ~9 m robotic Egyptian sphinx cat in gold, sandstone and lapis, with a
// nemes headdress, a sun disc between Hathor horns, glowing eyes and a segmented tail.
// It prowls the sunken court, crouches (wiggling its hindquarters) and POUNCES in a big arc: its landing
// shadow is marked on the sand (what's under it when it lands is crushed) and the landing sends out a
// shockwave you jump. Up close it swipes (the sector it rakes glows first); at range it sweeps a sun-beam
// from its eyes along an arc it scorches onto the sand first. From phase 2 it looses scarab drones.
// Weak points (colors: [gem, core], RED and YELLOW by default — what the player has in Solar):
//  - RED gems on its front paws, shuttered except while its claws are dug in after a pounce (or stunned);
//  - the sun disc over its head shifts RED/YELLOW and takes chip damage in its color; pour it on while the
//    beam charges and the beam overloads, stunning it;
//  - land on its back (jump pads!) and you RIDE it: the hatch over its YELLOW core opens until it bucks
//    you off. Its back is a moving solid that publishes `delta` like MovingPlatform, so riding just works.
// Any of its attacks is instant death; just bumping into it only shoves you.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, RED, YELLOW } from '../colors.js';
import { audio } from '../audio.js';
import { Drone } from './drone.js';
import { critHit, PainVoice, Malfunction, WeakMarker, prefetchFeel } from '../bossFeel.js';

// The combat director (attack tokens), when the game has one: its own attacks are signature moves and go
// ahead regardless, but it takes a token while it attacks so its scarabs hold fire meanwhile, and it only
// calls scarabs when a token is free. (Optional: an empty glob if src/combat/director.js isn't there.)
const director = Object.values(import.meta.glob('../combat/director.js', { eager: true }))[0]?.director || null;

export const SPHINX_MAX_HP = 2000;
const GEM_DMG = 8; // its paw gems while its claws are dug in after a pounce
const GEM_STUN_DMG = 14; // ...and while it's stunned by an overload: the decisive window
const DISC_DMG = 2;
const CORE_DMG = 14; // the back core while you ride it
const OVERLOAD_HITS = 9; // matching-color disc hits during a beam's charge that overload it
const OVERLOAD_DMG = 140;
const RING_H = 0.45; // shockwave wall height: any jump clears it
const RING_SPEED = 12;
const RING_MAX = 22;
const SWIPE_R = 7.2; // swipe reach from the chest (m)
const SWIPE_HALF = 1.3; // half-angle of the swiped sector (rad)
const POUNCE_A = 2.7; // landing ellipse semi-axes (m): across / along the body
const POUNCE_B = 5.0;
const BACK_HALF = 1.6; // the rideable back: a square this half-size
const BEAM_ARC = 1.15; // half the angle a beam sweeps (rad)

// per phase (index 1..3)
const SPEED = [0, 4.2, 5.2, 6.2];
const TURN = [0, 1.7, 2.2, 2.7];
const GAP = [0, 2.3, 1.7, 1.2];
const CROUCH = [0, 1.05, 0.85, 0.72];
const CHAIN = [0, 1, 2, 3];
const RECOVER = [0, 3.4, 2.9, 2.4];
const SWIPE_WIND = [0, 0.78, 0.68, 0.62];
const BEAM_WIND = [0, 1.35, 1.15, 1.0];
const BEAM_SWEEP = [0, 1.35, 1.15, 1.0];
const DISC_CYCLE = [0, 3.2, 2.4, 1.7];
const RIDE_TIME = [0, 5.0, 4.3, 3.7];
const MAX_SCARABS = [0, 0, 2, 3];

// sounds the lead can drop into public/audio (each falls back to an existing one)
const SFX = ['sphinx_pain', 'sphinx_roar', 'sphinx_pounce', 'sphinx_slam', 'sphinx_purr', 'sphinx_swipe', 'sphinx_beam', 'sphinx_death', 'incinerator_roar', 'incinerator_ignite'];

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const SAND = 0xd9b77a;
const GOLD = 0xffc650;

const rand = (n) => Math.floor(Math.random() * n);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = (k) => k * k * (3 - 2 * k);

// Closest distance between segments p1-q1 and p2-q2 (each given as 6 numbers).
function segDist(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
  const d1x = bx - ax, d1y = by - ay, d1z = bz - az;
  const d2x = dx - cx, d2y = dy - cy, d2z = dz - cz;
  const rx = ax - cx, ry = ay - cy, rz = az - cz;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0, t = 0;
  if (a < 1e-9 && e < 1e-9) return Math.hypot(rx, ry, rz);
  if (a < 1e-9) t = clamp(f / e, 0, 1);
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e < 1e-9) s = clamp(-c / a, 0, 1);
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
      s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  return Math.hypot(ax + d1x * s - cx - d2x * t, ay + d1y * s - cy - d2y * t, az + d1z * s - cz - d2z * t);
}

// A telegraph decal draped over the ground: an annular sector (radii r0..r1, bearings b0..b1 around cx, cz)
// whose vertices sit on groundAt(x, z), so it shows on the court, the steps and the terrace alike.
class Ribbon {
  constructor(mat, segs = 32, rsegs = 6) {
    this.segs = segs;
    this.rsegs = rsegs;
    const n = (segs + 1) * (rsegs + 1);
    this.pos = new Float32Array(n * 3);
    const idx = [];
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < rsegs; j++) {
        const a = i * (rsegs + 1) + j, b = a + rsegs + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  set(cx, cz, r0, r1, b0, b1, groundAt, lift = 0.05) {
    const P = this.pos;
    let k = 0;
    for (let i = 0; i <= this.segs; i++) {
      const b = b0 + ((b1 - b0) * i) / this.segs, sx = Math.sin(b), sz = Math.cos(b);
      for (let j = 0; j <= this.rsegs; j++) {
        const r = r0 + ((r1 - r0) * j) / this.rsegs, x = cx + sx * r, z = cz + sz * r;
        P[k++] = x;
        P[k++] = groundAt(x, z) + lift;
        P[k++] = z;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.visible = true;
  }
}

// Collects primitive geometry per (parent, material) and merges each set into one mesh, so the whole
// sphinx is a few dozen draw calls however much detail it has.
class Kit {
  constructor() {
    this.sets = new Map();
    this.meshes = [];
  }

  add(parent, m, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _m4.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.applyMatrix4(_m4);
    if (!this.sets.has(parent)) this.sets.set(parent, new Map());
    const byMat = this.sets.get(parent);
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m).push(g);
  }

  box(parent, m, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
    this.add(parent, m, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  }

  flush() {
    for (const [parent, byMat] of this.sets) {
      for (const [m, geos] of byMat) {
        const merged = mergeGeometries(geos, false);
        geos.forEach((g) => g.dispose());
        const mesh = new THREE.Mesh(merged, m);
        parent.add(mesh);
        this.meshes.push(mesh);
      }
    }
    this.sets.clear();
  }
}

export class Sphinx {
  // pos: where it lies as a statue (root at the floor), yaw: which way it faces (0 = +z),
  // bounds: { minX, maxX, minZ, maxZ } for its root, court: the sunken floor (shockwaves only run there).
  // groundAt(x, z): the floor height around it (for telegraphs and the beam on raised ground)
  constructor(world, game, { pos, yaw = 0, floorY, bounds, court = null, groundAt = null, colors = [RED, YELLOW], onDefeated = null, onPhase = null }) {
    [this.cGem, this.cCore] = colors;
    this.world = world;
    this.game = game;
    this.spawn = new THREE.Vector3(...pos);
    this.spawnYaw = yaw;
    this.floorY = floorY ?? pos[1];
    this.bounds = bounds;
    this.court = court || bounds;
    this.groundAt = groundAt || (() => this.floorY);
    this.onDefeated = onDefeated;
    this.onPhase = onPhase;
    this.root = new THREE.Group();
    this.root.userData.hit = this;
    this.root.userData.part = 'armor';
    world.scene.add(this.root);
    this.build();
    this.buildFx();
    // pain, malfunctioning joints while stunned, and targets on whatever weak point is open
    this.pain = new PainVoice(world, { name: 'sphinx_pain', fallback: 'sphinx_roar', rate: 1.35, gain: 0.6, big: 'sphinx_roar', bigRate: 0.85, gap: 1.4 });
    const legJoints = this.legs.flatMap((l) => [l.hip, l.knee]);
    this.malfunction = new Malfunction(game, [...legJoints, this.neck, this.head, this.hips, this.discGroup], { scale: 1.3, spark: 0xffa030, arc: 0x6fc8ff, rate: 14 });
    this.gemMarkers = this.gems.map(() => new WeakMarker(world, game, { color: COLORS[this.cGem].hex, size: 0.9 }));
    this.coreMarker = new WeakMarker(world, game, { color: COLORS[this.cCore].hex, size: 1.0 });
    this.discMarker = new WeakMarker(world, game, { color: 0xffffff, size: 1.3 });
    this.backSolid = world.addSolid(new THREE.Vector3(), new THREE.Vector3(), { delta: new THREE.Vector3(), moving: true, noShot: true, kind: 'metal' });
    this.glow = world.addLight(0xffc650, 0, 12, 1.5); // the sun disc's glow (a pooled world light)
    this.scarabs = [];
    this.debris = null;
    world.addHittable(this.root);
    world.add(this);
    audio.manifest?.then(() => audio.prefetch(SFX));
    this.resetState();
  }

  // ------------------------------------------------------------------ construction
  build() {
    const K = new Kit();
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8a23a, metalness: 0.9, roughness: 0.3, emissive: 0x4a2c00, emissiveIntensity: 0.35, flatShading: true });
    const stone = new THREE.MeshStandardMaterial({ color: 0xcaa56c, metalness: 0.1, roughness: 0.78, flatShading: true });
    const lapis = new THREE.MeshStandardMaterial({ color: 0x1f4fbf, metalness: 0.5, roughness: 0.3, emissive: 0x0a1d55, emissiveIntensity: 0.6, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2118, metalness: 0.75, roughness: 0.45, flatShading: true });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.clawMat = new THREE.MeshStandardMaterial({ color: 0xe9c46a, metalness: 0.9, roughness: 0.2, emissive: 0xff5a20, emissiveIntensity: 0, flatShading: true });
    this.gemMat = new THREE.MeshStandardMaterial({ color: COLORS[this.cGem].hex, emissive: COLORS[this.cGem].hex, emissiveIntensity: 0.3, metalness: 0.2, roughness: 0.15, flatShading: true });
    this.discMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS[this.cCore].hex).multiplyScalar(2.2) });
    this.mats = [gold, stone, lapis, dark, this.eyeMat, this.clawMat, this.gemMat, this.discMat, this.coreMat];
    const tag = (o, part) => {
      o.userData.hit = this;
      o.userData.part = part;
      return o;
    };
    const group = (parent, x, y, z) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };
    const stripes = (parent, n, w, h, d, x, y0, z, dy, rx = 0, grow = 0) => {
      for (let i = 0; i < n; i++) K.box(parent, i % 2 ? lapis : gold, w, h, d + grow * i, x, y0 - i * dy, z + (grow * i) / 2, rx);
    };
    // an octagonal barrel along z (flat on top), radius rf at the front and rb at the back
    const barrel = (parent, m, rf, rb, len, x, y, z, sy = 1) =>
      K.add(parent, m, new THREE.CylinderGeometry(rf, rb, len, 8, 1, false, Math.PI / 8), x, y, z, Math.PI / 2, 0, 0, 1, 1, sy);

    // ---- body: chest + waist (pivot at mid-body, 2.9 m up)
    const body = (this.body = group(this.root, 0, 2.9, -0.3));
    barrel(body, stone, 1.6, 1.45, 3.3, 0, 0.1, 1.9);
    K.box(body, gold, 2.4, 0.3, 3.1, 0, 1.56, 1.9); // shoulder mantle
    for (let i = 0; i < 4; i++) K.box(body, gold, 0.55, 0.22, 0.6, 0, 1.78, 3.0 - i * 0.72, -0.15); // spine scutes
    // the broad collar (usekh) down the chest: gold and lapis bands, narrowing
    for (let i = 0; i < 6; i++) K.box(body, i % 2 ? lapis : gold, 2.6 - i * 0.3, 0.3, 0.25, 0, 1.05 - i * 0.33, 3.58);
    barrel(body, stone, 1.4, 1.3, 2.8, 0, 0.22, -0.45); // waist
    K.box(body, dark, 2.1, 0.7, 2.9, 0, -0.75, -0.4); // belly machinery
    for (const s of [-1, 1]) {
      K.box(body, gold, 0.18, 1.3, 2.5, s * 1.32, 0.3, -0.45);
      stripes(body, 3, 0.2, 0.2, 2.4, s * 1.34, 0.72, -0.45, 0.4);
      K.box(body, gold, 0.16, 1.5, 2.8, s * 1.5, 0.25, 1.9, 0, 0, s * 0.08); // chest side plates
      K.box(body, lapis, 0.18, 0.28, 2.7, s * 1.53, 0.6, 1.9, 0, 0, s * 0.08);
      for (let i = 0; i < 3; i++) K.box(body, dark, 0.14, 0.1, 1.9, s * 1.12, -0.25 - i * 0.22, -0.45); // ribs
    }
    // the back core in its socket, under two hinged hatches
    K.box(body, dark, 2.2, 0.25, 0.3, 0, 1.3, 0.75);
    K.box(body, dark, 2.2, 0.25, 0.3, 0, 1.3, -1.75);
    this.core = tag(new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), this.coreMat), 'core');
    this.core.position.set(0, 1.35, -0.5);
    this.core.scale.set(1, 0.7, 1.3);
    body.add(this.core);
    K.add(body, dark, new THREE.TorusGeometry(0.75, 0.13, 5, 16), 0, 1.3, -0.5, Math.PI / 2);
    this.hatches = [];
    for (const s of [-1, 1]) {
      const h = group(body, s * 1.25, 1.42, -0.5);
      K.box(h, gold, 1.26, 0.16, 2.5, -s * 0.63, 0, 0);
      K.box(h, lapis, 0.3, 0.18, 2.3, -s * 0.85, 0.01, 0);
      K.box(h, lapis, 0.12, 0.18, 2.3, -s * 0.35, 0.01, 0);
      h.userData.side = s;
      this.hatches.push(h);
    }
    this.backAnchor = group(body, 0, 1.5, -0.45);
    this.chestAnchor = group(body, 0, 0.6, 3.4);

    // ---- hindquarters (their own group so they can lift and wiggle before a pounce)
    const hips = (this.hips = group(body, 0, 0.1, -1.75));
    barrel(hips, stone, 1.3, 1.42, 2.5, 0, 0.12, -1.0);
    K.box(hips, gold, 2.2, 0.3, 2.4, 0, 1.38, -1.0); // rump plate
    K.box(hips, lapis, 2.25, 0.2, 0.45, 0, 1.42, -0.15);
    K.box(hips, dark, 2.0, 0.8, 2.2, 0, -0.8, -0.9);
    for (const s of [-1, 1]) {
      // big armored haunches
      K.add(hips, gold, new THREE.SphereGeometry(1, 8, 6), s * 1.3, 0.15, -1.0, 0, 0, 0, 0.42, 1.15, 1.3);
      K.add(hips, lapis, new THREE.CylinderGeometry(0.62, 0.62, 0.12, 12), s * 1.72, 0.2, -1.0, 0, 0, Math.PI / 2); // sun medallion
      K.add(hips, gold, new THREE.CylinderGeometry(0.3, 0.3, 0.16, 10), s * 1.74, 0.2, -1.0, 0, 0, Math.PI / 2);
    }

    // ---- tail: tapering segments, alternating gold and lapis, ending in a glowing blade
    this.tail = [];
    let tp = group(hips, 0, 0.95, -2.3);
    for (let i = 0; i < 8; i++) {
      const r = 0.42 - i * 0.03;
      const seg = new THREE.Group();
      if (i) seg.position.z = -0.6;
      tp.add(seg);
      K.box(seg, i % 2 ? lapis : gold, r, r, 0.62, 0, 0, -0.3);
      this.tail.push(seg);
      tp = seg;
    }
    K.add(tp, gold, new THREE.ConeGeometry(0.22, 0.9, 4), 0, 0, -1.0, -Math.PI / 2);
    K.add(tp, this.eyeMat, new THREE.OctahedronGeometry(0.16, 0), 0, 0, -0.7);

    // ---- neck and head
    const neck = (this.neck = group(body, 0, 0.9, 3.0));
    K.box(neck, gold, 1.6, 1.7, 1.4, 0, 0.6, 0.2, -0.35);
    K.box(neck, lapis, 1.65, 0.25, 1.45, 0, 0.3, 0.15, -0.35);
    const head = (this.head = group(neck, 0, 1.5, 0.65));
    head.scale.setScalar(1.2);
    K.box(head, gold, 1.6, 1.45, 1.7, 0, 0, 0); // skull (a golden mask)
    K.box(head, stone, 1.05, 0.7, 0.8, 0, -0.38, 0.95); // muzzle
    K.box(head, dark, 0.35, 0.22, 0.15, 0, -0.12, 1.37); // nose
    K.box(head, dark, 1.3, 0.12, 0.1, 0, 0.32, 0.86); // brow
    for (const s of [-1, 1]) {
      K.box(head, this.eyeMat, 0.42, 0.14, 0.1, s * 0.4, 0.12, 0.88, 0, 0, s * 0.28);
      K.add(head, gold, new THREE.ConeGeometry(0.5, 1.3, 4), s * 0.6, 1.15, -0.15, 0, Math.PI / 4, -s * 0.3); // ears
      K.add(head, lapis, new THREE.ConeGeometry(0.28, 0.8, 4), s * 0.63, 1.1, 0.0, 0, Math.PI / 4, -s * 0.3);
      for (let i = 0; i < 3; i++) K.box(head, dark, 0.35, 0.03, 0.03, s * 0.6, -0.3 - i * 0.1, 1.28, 0, s * 0.3, s * (0.1 - i * 0.12)); // whiskers
      // the nemes lappets falling to the chest, striped gold and lapis
      const lap = group(head, s * 0.98, -0.25, 0.2);
      lap.rotation.z = s * 0.2;
      stripes(lap, 8, 0.3, 0.3, 0.9, 0, 0.8, -0.1, 0.3, 0, 0.07);
    }
    K.box(head, gold, 1.95, 0.32, 1.95, 0, 0.78, -0.1); // nemes crown
    for (let i = 0; i < 7; i++) K.box(head, i % 2 ? lapis : gold, 2.1 + i * 0.14, 0.28, 0.32, 0, 0.75 - i * 0.3, -0.95); // its flare behind the head
    K.box(head, lapis, 0.2, 0.55, 0.2, 0, 0.82, 0.95); // uraeus cobra
    K.box(head, gold, 0.45, 0.3, 0.12, 0, 1.12, 0.95);
    stripes(head, 5, 0.32, 0.22, 0.32, 0, -0.95, 0.95, 0.22); // braided false beard
    this.jaw = group(head, 0, -0.62, 0.3);
    K.box(this.jaw, gold, 0.95, 0.24, 1.05, 0, -0.08, 0.5);
    for (const s of [-1, 1]) K.add(this.jaw, this.clawMat, new THREE.ConeGeometry(0.07, 0.3, 4), s * 0.3, 0.12, 0.92, Math.PI);
    // the sun disc between Hathor's horns, shifting RED / YELLOW
    const disc = (this.discGroup = group(head, 0, 1.85, -0.35));
    this.disc = tag(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.22, 28), this.discMat), 'disc');
    this.disc.rotation.x = Math.PI / 2;
    disc.add(this.disc);
    K.add(disc, gold, new THREE.TorusGeometry(1.05, 0.11, 6, 28));
    K.add(disc, gold, new THREE.TorusGeometry(1.3, 0.1, 5, 20, Math.PI), 0, -0.05, -0.15, 0, 0, Math.PI);
    for (const s of [-1, 1]) K.add(disc, gold, new THREE.ConeGeometry(0.1, 0.5, 5), s * 1.3, 0.2, -0.15, 0, 0, -s * 0.3);

    // ---- legs: two-bone chains solved by IK so the paws plant on the sand
    this.legs = [];
    this.gems = [];
    const paw = (wrist, front, s) => {
      K.box(wrist, gold, front ? 1.15 : 1.0, 0.5, front ? 1.5 : 1.3, 0, 0, 0.35);
      K.box(wrist, lapis, front ? 1.18 : 1.03, 0.14, 0.3, 0, 0.12, -0.25);
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * (front ? 0.27 : 0.24);
        K.box(wrist, stone, 0.24, 0.34, 0.42, x, -0.07, 1.12);
        K.add(wrist, front ? this.clawMat : gold, new THREE.ConeGeometry(0.08, 0.45, 4), x, -0.12, 1.45, Math.PI / 2);
      }
      if (!front) return;
      const gem = tag(new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), this.gemMat), s < 0 ? 'gemR' : 'gemL');
      this.gems.push(gem);
      gem.position.set(0, 0.48, 0.3);
      gem.scale.set(1, 0.8, 1.2);
      wrist.add(gem);
      // a gold shutter over it: two halves that slide apart
      const halves = [-1, 1].map((h) => {
        const g = group(wrist, h * 0.2, 0.48, 0.3);
        K.box(g, gold, 0.4, 0.62, 0.85, 0, 0, 0);
        K.box(g, lapis, 0.42, 0.12, 0.87, 0, 0.12, 0);
        g.userData.h = h;
        return g;
      });
      return halves;
    };
    for (const front of [true, false]) {
      for (const s of [-1, 1]) {
        const parent = front ? body : hips;
        const hip = group(parent, s * (front ? 1.3 : 1.4), front ? -0.5 : -0.45, front ? 2.2 : -0.9);
        const L1 = front ? 1.3 : 1.25, L2 = front ? 1.0 : 1.15;
        if (front) {
          K.box(hip, gold, 1.25, 0.65, 1.45, s * 0.05, 0.05, 0); // pauldron
          K.box(hip, lapis, 1.28, 0.16, 1.48, s * 0.05, -0.2, 0);
          K.box(hip, gold, 0.95, 1.4, 1.05, 0, -0.65, 0);
        } else {
          K.box(hip, gold, 1.0, 1.35, 1.2, 0, -0.55, 0);
          K.box(hip, lapis, 1.02, 0.18, 1.22, 0, -0.9, 0);
        }
        const knee = group(hip, 0, -L1, 0);
        K.add(knee, dark, new THREE.CylinderGeometry(0.4, 0.4, 0.9, 8), 0, 0, 0, 0, 0, Math.PI / 2);
        K.box(knee, stone, 0.75, L2 + 0.1, 0.8, 0, -L2 / 2, 0);
        K.box(knee, gold, 0.85, 0.35, 0.9, 0, -L2 * 0.72, 0);
        const foot = group(knee, 0, -L2, 0);
        const halves = paw(foot, front, s);
        this.legs.push({ hip, knee, foot, L1, L2, front, side: s, bend: front ? -1 : 1, halves, target: new THREE.Vector3(), cur: new THREE.Vector3(), splay: 0, lift: 0 });
      }
    }
    K.flush();
    this.meshes = K.meshes;
    this.eyeAnchor = group(this.head, 0, 0.12, 0.95);
  }

  buildFx() {
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
    this.fx = new THREE.Group();
    this.fx.userData.noCull = true;
    this.world.scene.add(this.fx);
    // pounce landing marker: a shadow ellipse, its rim, and a ring closing in as the landing nears
    this.marker = new THREE.Group();
    this.markerShade = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false });
    const decal = { transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 };
    this.markerMat = new THREE.MeshBasicMaterial({ color: 0xff3a10, ...decal });
    this.marker.add(new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), this.markerShade));
    this.marker.add(new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), this.markerMat));
    this.markerClose = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 48).rotateX(-Math.PI / 2), this.markerMat);
    this.marker.add(this.markerClose);
    this.marker.visible = false;
    this.fx.add(this.marker);
    // swipe sector
    this.sectorMat = new THREE.MeshBasicMaterial({ color: 0xff2410, opacity: 0.4, ...decal });
    this.sectorRibbon = new Ribbon(this.sectorMat, 24, 5);
    this.sector = this.sectorRibbon.mesh;
    this.fx.add(this.sector);
    // beam: the scorch arc it'll sweep along, and the beam itself (a glow around a white-hot core)
    // (the line is where it hits the sand; the band inside it is where it passes through a standing body)
    this.arcMat = new THREE.MeshBasicMaterial({ color: 0xff5a00, opacity: 0.6, ...decal });
    this.arcFillMat = new THREE.MeshBasicMaterial({ color: 0xff3010, opacity: 0.2, ...decal });
    this.arc = new THREE.Group();
    this.arcLine = new Ribbon(this.arcMat, 48, 2);
    this.arcFill = new Ribbon(this.arcFillMat, 48, 8);
    this.arc.add(this.arcLine.mesh, this.arcFill.mesh);
    this.arc.visible = false;
    this.fx.add(this.arc);
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    this.beam = new THREE.Group();
    this.beamGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a20).multiplyScalar(2), opacity: 0.55, ...add });
    this.beamCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0c0).multiplyScalar(2.5), ...add });
    this.beamOuter = new THREE.Mesh(beamGeo, this.beamGlow);
    this.beamInner = new THREE.Mesh(beamGeo, this.beamCore);
    this.beam.add(this.beamOuter, this.beamInner);
    this.beam.visible = false;
    this.fx.add(this.beam);
    // shockwaves share one geometry; each gets its own material for its fade
    this.ringGeo = {
      wall: new THREE.CylinderGeometry(1, 1, RING_H, 96, 1, true).translate(0, RING_H / 2, 0),
      ground: new THREE.RingGeometry(0.96, 1, 96).rotateX(-Math.PI / 2),
    };
    this.rings = [];
  }

  resetState() {
    this.hideFeel();
    this.state = 'statue';
    this.stateT = 0;
    this.hp = SPHINX_MAX_HP;
    this.phase = 1;
    this.pos = this.spawn.clone();
    this.yaw = this.spawnYaw;
    this.act = null;
    this.attackTimer = 2;
    this.lastAttack = null;
    this.repeat = 0;
    this.walkPhase = 0;
    this.speed = 0;
    this.circle = Math.random() < 0.5 ? 1 : -1;
    this.circleT = 4;
    this.discColor = this.cGem;
    this.discTimer = DISC_CYCLE[1];
    this.discFlash = 0;
    this.overload = 0;
    this.gemFlash = 0;
    this.coreFlash = 0;
    this.flinch = 0;
    this.rideT = 0;
    this.riding = false;
    this.coreOpen = 0;
    this.gemsOpen = false;
    this.summonCool = 6;
    this.wander = null;
    this.hintsShown = new Set();
    this.deathT = 0;
    this.purrGain = 0;
    this.pose = { bodyY: 1.35, pitch: 0, roll: 0, hipsPitch: 0, hipsYaw: 0, neckPitch: -0.1, neckYaw: 0, headPitch: 0, jaw: 0, hatch: 0, shutter: 0, tailUp: -0.2, eyes: 0 };
    for (const r of this.rings) this.fx.remove(r.mesh), r.mat.dispose();
    this.rings = [];
    for (const d of this.scarabs) if (!d.dead) d.dispose();
    this.scarabs = [];
    this.marker.visible = this.sector.visible = this.arc.visible = this.beam.visible = false;
    this.root.visible = true;
    this.backSolid.enabled = false;
    this.backSolid.delta.set(0, 0, 0);
    this.glow.intensity = 0;
    this.beamLoop?.setGain(0);
    this.anchorPrev = null;
    this.setDiscColor(this.cGem);
    this.discMat.color.set(0xb08a40).multiplyScalar(0.5); // a dull bronze disc on the statue
    this.animate(1, true);
  }

  // ------------------------------------------------------------------ fight control
  get active() {
    return this.state === 'waking' || this.state === 'fight' || this.state === 'dying';
  }

  // the player walked in: it wakes
  start() {
    if (this.state !== 'statue') return;
    this.state = 'waking';
    this.stateT = 0;
    this.game.hud.bossShow(true);
    this.game.hud.bossBar(1);
    this.setBossName('THE SPHINX');
    prefetchFeel(['sphinx_pain']);
    this.purr ??= audio.createLoop(audio.available?.has('sphinx_purr') ? 'sphinx_purr' : 'drone_hum', { rate: audio.available?.has('sphinx_purr') ? 1 : 0.42 });
    this.beamLoop ??= audio.createLoop(audio.available?.has('sphinx_beam') ? 'sphinx_beam' : 'incinerator_roar');
  }

  // back to a dormant statue (the player died: the fight starts over when they walk back in)
  reset() {
    if (this.state === 'dead' || this.state === 'gone') return;
    director?.release(this);
    this.resetState();
    this.purr?.setGain(0);
    this.game.hud.bossShow(false);
    this.setBossName(null);
  }

  setBossName(name) {
    const el = document.querySelector('#boss-bar .boss-name');
    if (!el) return;
    if (name) {
      this.oldName ??= el.textContent;
      el.textContent = name;
    } else if (this.oldName) el.textContent = this.oldName;
  }

  hint(key, text, urgent = true) {
    if (key && this.hintsShown.has(key)) return;
    if (key) this.hintsShown.add(key);
    this.game.hud.bossHint(text, urgent);
  }

  otherColor(c) {
    return c === this.cGem ? this.cCore : this.cGem;
  }

  name(c) {
    return COLORS[c].id.toUpperCase();
  }

  setDiscColor(c) {
    this.discColor = c;
    this.discFlash = 0.6;
  }

  // ------------------------------------------------------------------ damage
  onHit(color, hit) {
    if (this.state !== 'fight') return 'immune';
    const part = hit.part;
    if (part === 'gemL' || part === 'gemR') {
      if (!this.gemsOpen || color !== this.cGem) return 'immune';
      this.gemFlash = 1;
      const stunned = this.act?.type === 'stun';
      this.flinch = 1;
      critHit(this.game, hit, { color: COLORS[this.cGem].hex, spark: 0xffe0a0, scale: stunned ? 1.25 : 1 });
      audio.bossCoreHit();
      this.pain.hurt(stunned ? 1.2 : 1);
      this.damage(stunned ? GEM_STUN_DMG : GEM_DMG);
      return 'hit';
    }
    if (part === 'disc') {
      if (color !== this.discColor) return 'immune';
      this.discFlash = Math.max(this.discFlash, 0.5);
      this.world.fx.sparks(hit.point, hit.normal || UP, COLORS[color].hex, { count: 4, speed: 6, spread: 0.9 });
      this.damage(DISC_DMG);
      const a = this.act;
      if (a?.type === 'beam' && a.step === 0 && this.state === 'fight') {
        this.overload++;
        audio.comboTick(Math.min(6, Math.floor((this.overload / OVERLOAD_HITS) * 6)));
        if (this.overload >= OVERLOAD_HITS) this.overloadBeam();
      }
      return 'hit';
    }
    if (part === 'core') {
      if (this.coreOpen < 0.5 || color !== this.cCore) return 'immune';
      this.coreFlash = 1;
      this.flinch = 1;
      critHit(this.game, hit, { color: COLORS[this.cCore].hex, spark: 0xfff0b0, scale: 1.2, shake: 0.36 });
      audio.bossCoreHit();
      this.pain.hurt(1.2);
      this.damage(CORE_DMG);
      return 'hit';
    }
    return 'immune';
  }

  damage(n) {
    if (this.state !== 'fight') return;
    this.hp = Math.max(0, this.hp - n);
    this.game.hud.bossBar(this.hp / SPHINX_MAX_HP);
    if (this.hp <= 0) return this.die();
    const frac = this.hp / SPHINX_MAX_HP;
    const phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
    if (phase > this.phase) {
      this.phase = phase;
      this.discTimer = Math.min(this.discTimer, DISC_CYCLE[phase]);
      this.onPhase?.(phase);
      audio.bossPhase();
      this.pain.roar();
      for (const j of this.malfunction.joints) this.malfunction.sputter(j, 1.2);
      this.game.player.shake = Math.max(this.game.player.shake, 0.7);
      if (!this.riding && !this.airborne) this.startAct('roar', { dur: 1.6 });
      this.summonCool = Math.min(this.summonCool, 2.5);
      this.hint(null, phase === 2 ? 'The Sphinx is enraged — it pounces twice and calls its scarabs!' : 'FINAL PHASE — three pounces in a row. Keep moving!');
    }
  }

  overloadBeam() {
    this.overload = 0;
    audio.shieldBreak();
    this.world.fx.burst(this.disc.getWorldPosition(_v), COLORS[this.discColor].hex, { count: 90, speed: 10, life: 0.9, size: 0.5, gravity: 6 });
    this.world.fx.burst(_v, 0xffffff, { count: 30, speed: 6, life: 0.4, size: 0.6, gravity: 0 });
    this.game.player.shake = Math.max(this.game.player.shake, 0.4);
    this.hp = Math.max(1, this.hp - OVERLOAD_DMG);
    this.damage(0);
    this.game.hud.bossCrit(false);
    this.pain.roar();
    for (const j of this.malfunction.joints) this.malfunction.sputter(j, 1.5);
    this.startAct('stun', { dur: 3.4 });
    this.hint(null, `OVERLOADED — SHOOT ITS ${this.name(this.cGem)} PAW GEMS!`);
  }

  die() {
    director?.release(this);
    this.hideFeel();
    this.state = 'dying';
    this.deathT = 0;
    this.act = null;
    this.clearTelegraphs();
    this.backSolid.enabled = false;
    this.beamLoop?.setGain(0);
    for (const d of this.scarabs) if (!d.dead) d.die();
    audio.sample('sphinx_roar', { gain: 1, rate: 0.8, vary: 0 }) || audio.bossRoar();
    this.game.hud.bossHint('The Sphinx is crumbling!', true);
    if (this.riding) this.game.player.launch(9, _v.set(Math.sin(this.yaw + 1.6) * 7, 0, Math.cos(this.yaw + 1.6) * 7));
  }

  // ------------------------------------------------------------------ actions
  startAct(type, extra = {}) {
    this.clearTelegraphs();
    this.act = { type, t: 0, step: 0, ...extra };
  }

  endAct(gap = GAP[this.phase]) {
    director?.release(this);
    this.clearTelegraphs();
    this.act = null;
    this.gemsOpen = false;
    this.attackTimer = gap + Math.random() * 0.8;
  }

  clearTelegraphs() {
    this.marker.visible = this.sector.visible = this.arc.visible = this.beam.visible = false;
    this.beamLoop?.setGain(0);
  }

  chooseAttack(dist, facing) {
    const opts = [];
    const add = (t, w) => {
      if (t === this.lastAttack && this.repeat >= (t === 'pounce' ? 2 : 1)) return;
      for (let i = 0; i < w; i++) opts.push(t);
    };
    // up on the terrace its pounces fall short (they land in the court), so it burns you off it instead
    const p = this.game.player.pos, c = this.court;
    const onTerrace = p.x < c.minX || p.x > c.maxX || p.z < c.minZ || p.z > c.maxZ;
    if (dist < SWIPE_R + 1.5 && facing) add('swipe', 4);
    if (dist > 6) add('pounce', onTerrace ? 1 : 4);
    if (dist > 8) add('beam', onTerrace ? 6 : this.phase >= 2 ? 3 : 2);
    if (MAX_SCARABS[this.phase] && this.summonCool <= 0 && this.liveScarabs() < MAX_SCARABS[this.phase]) add('summon', 5);
    if (!opts.length) return void (this.attackTimer = 0.4);
    const type = opts[rand(opts.length)];
    if (type === 'summon' && director && !director.request(this, 1.8)) return void (this.attackTimer = 0.25 + Math.random() * 0.25);
    director?.request(this, 3);
    this.repeat = type === this.lastAttack ? this.repeat + 1 : 1;
    this.lastAttack = type;
    if (type === 'pounce') this.startAct('pounce', { left: CHAIN[this.phase] });
    else if (type === 'swipe') {
      const lx = (p.x - this.pos.x) * Math.cos(this.yaw) - (p.z - this.pos.z) * Math.sin(this.yaw);
      this.startAct('swipe', { side: lx >= 0 ? 1 : -1 });
      audio.sample('sphinx_swipe', { gain: 0.6, rate: 0.7 }) || audio.charge();
    } else if (type === 'beam') {
      this.startAct('beam', { passes: this.phase >= 2 ? 2 : 1 });
      this.overload = 0;
      audio.charge();
    } else this.startAct('summon');
  }

  get airborne() {
    return this.act?.type === 'pounce' && this.act.step === 1;
  }

  liveScarabs() {
    this.scarabs = this.scarabs.filter((d) => !d.dead);
    return this.scarabs.length;
  }

  // ------------------------------------------------------------------ update
  // already beaten (e.g. the world was powered down in a saved game): no statue, no fight
  vanish() {
    if (this.state === 'gone') return;
    this.state = 'gone';
    this.clearTelegraphs();
    this.root.visible = false;
    this.backSolid.enabled = false;
    this.glow.intensity = 0;
    this.purr?.stop();
    this.beamLoop?.stop();
    this.purr = this.beamLoop = null;
    for (const d of this.scarabs) if (!d.dead) d.dispose();
    this.scarabs = [];
    this.world.removeHittable(this.root);
    this.world.remove(this);
  }

  update(dt, player) {
    if (this.state === 'gone') return;
    if (this.state === 'dead') return this.updateDebris(dt);
    this.stateT += dt;
    this.updateRings(dt, player);
    if (this.state === 'statue') {
      // (a statue holds still: it was posed once by resetState)
      this.updateBack(player);
      return;
    }
    if (this.state === 'waking') return this.updateWake(dt, player);
    if (this.state === 'dying') return this.updateDeath(dt, player);
    // a Bonus Round may have hidden the bar meanwhile
    if (this.game.hud.bossEl?.classList.contains('hidden')) this.game.hud.bossShow(true);

    // ---- colors and glows
    const T = this.world.time;
    const locked = this.act?.type === 'beam';
    this.discTimer -= dt;
    if (!locked && this.discTimer <= 0) {
      this.discTimer = DISC_CYCLE[this.phase];
      this.setDiscColor(this.otherColor(this.discColor));
    }
    this.discFlash = Math.max(0, this.discFlash - dt * 3);
    this.gemFlash = Math.max(0, this.gemFlash - dt * 6);
    this.coreFlash = Math.max(0, this.coreFlash - dt * 6);
    // it flickers for the last half second before it shifts
    const warn = !locked && this.discTimer < 0.5 && Math.sin(T * 40) > 0;
    _c.set(COLORS[warn ? this.otherColor(this.discColor) : this.discColor].hex);
    const charge = this.act?.type === 'beam' && this.act.step === 0 ? Math.min(1, this.act.t / BEAM_WIND[this.phase]) : 0;
    this.discMat.color.copy(_c).multiplyScalar(1.15 + this.discFlash * 1.5 + charge * (1.2 + Math.sin(T * 30) * 0.6));
    this.glow.color.copy(_c);
    this.glow.intensity = 6 + charge * 20;
    this.discGroup.getWorldPosition(this.glow.position);
    this.gemMat.emissiveIntensity = this.gemsOpen ? 1.6 + Math.sin(T * 14) * 0.7 + this.gemFlash * 3 : 0.25;
    this.coreMat.color.set(COLORS[this.cCore].hex).multiplyScalar(this.coreOpen > 0.5 ? 1.25 + Math.sin(T * 12) * 0.25 + this.coreFlash * 0.8 : 0.5);

    // ---- riding: standing on its back opens the core; too long and it bucks you off
    this.riding = player.ground === this.backSolid && !player.dead;
    if (this.riding) {
      this.rideT += dt;
      this.hint('ride', `You're riding the Sphinx! Its back core is open — shoot it ${this.name(this.cCore)}!`);
      const a = this.act;
      if (a && (a.type === 'beam' || a.type === 'swipe' || a.type === 'summon' || (a.type === 'pounce' && a.step === 0))) this.endAct(0.5);
      if (this.rideT > RIDE_TIME[this.phase] && this.act?.type !== 'buck' && !this.airborne) this.startAct('buck');
    } else this.rideT = Math.max(0, this.rideT - dt * 0.5);
    const wantCore = this.riding || this.act?.type === 'buck' ? 1 : 0;
    this.coreOpen += (wantCore - this.coreOpen) * Math.min(1, dt * (wantCore ? 5 : 1.6));

    // ---- behavior
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const bearing = Math.atan2(dx, dz);
    this.speed = 0;
    this.summonCool -= dt;
    if (this.act) this.updateAct(dt, player, dist, bearing);
    else if (this.riding) this.updateRidden(dt);
    else this.prowl(dt, player, dist, bearing);
    if (!this.airborne) this.pos.y = this.floorY;

    this.pos.x = clamp(this.pos.x, this.bounds.minX, this.bounds.maxX);
    this.pos.z = clamp(this.pos.z, this.bounds.minZ, this.bounds.maxZ);
    this.updateScarabs(dt, player);
    this.animate(dt);
    this.updateFeel(dt);
    this.updateBack(player);
    this.pushPlayer(player);
    this.updatePurr(dist);
  }

  hideFeel() {
    if (!this.malfunction) return;
    this.malfunction.update(1, false);
    for (const m of [...this.gemMarkers, this.coreMarker, this.discMarker]) m.update(1, null);
  }

  // stunned: sparks and arcs from its joints; open weak points wear a target
  updateFeel(dt) {
    const fight = this.state === 'fight';
    const a = this.act;
    this.malfunction.update(dt, fight && a?.type === 'stun');
    const stunned = a?.type === 'stun';
    this.gems.forEach((g, i) => this.gemMarkers[i].tint(COLORS[this.cGem].hex));
    this.coreMarker.tint(COLORS[this.cCore].hex);
    this.gems.forEach((g, i) => this.gemMarkers[i].update(dt, fight && this.gemsOpen ? g.getWorldPosition(_v) : null, stunned ? 1.6 : 1));
    this.coreMarker.update(dt, fight && this.coreOpen > 0.5 ? this.core.getWorldPosition(_v) : null, 1.3);
    // the disc while a beam charges: pour it on to overload it
    const charging = fight && a?.type === 'beam' && a.step === 0;
    if (charging) this.discMarker.tint(COLORS[this.discColor].hex);
    this.discMarker.update(dt, charging ? this.disc.getWorldPosition(_v) : null, 1 + this.overload / OVERLOAD_HITS);
  }

  prowl(dt, player, dist, bearing) {
    // circle the player like a stalking cat, closing in when far, backing off when close
    this.circleT -= dt;
    if (this.circleT <= 0) {
      this.circleT = 3 + Math.random() * 3;
      this.circle *= -1;
    }
    let dir;
    if (dist > 13) dir = bearing;
    else if (dist < 7) dir = bearing + Math.PI * 0.75 * this.circle;
    else dir = bearing + this.circle * 1.25;
    const turn = TURN[this.phase] * dt;
    this.yaw += clamp(wrap(dir - this.yaw), -turn, turn);
    const sp = SPEED[this.phase] * (Math.abs(wrap(dir - this.yaw)) < 1.2 ? 1 : 0.4);
    const nx = this.pos.x + Math.sin(this.yaw) * sp * dt, nz = this.pos.z + Math.cos(this.yaw) * sp * dt;
    const b = this.bounds;
    if (nx < b.minX || nx > b.maxX || nz < b.minZ || nz > b.maxZ) {
      this.circle *= -1;
      this.circleT = 3;
    }
    this.pos.x = nx;
    this.pos.z = nz;
    this.speed = sp;
    this.attackTimer -= dt;
    if (this.attackTimer <= 0) this.chooseAttack(dist, Math.abs(wrap(bearing - this.yaw)) < 1.0);
  }

  // carrying a rider: it lopes about the court, swaying, trying to shake them
  updateRidden(dt) {
    const b = this.bounds;
    if (!this.wander || Math.hypot(this.wander.x - this.pos.x, this.wander.z - this.pos.z) < 2) {
      this.wander = { x: b.minX + Math.random() * (b.maxX - b.minX), z: b.minZ + Math.random() * (b.maxZ - b.minZ) };
    }
    const dir = Math.atan2(this.wander.x - this.pos.x, this.wander.z - this.pos.z);
    const turn = 1.4 * dt;
    this.yaw += clamp(wrap(dir - this.yaw), -turn, turn);
    const sp = SPEED[this.phase] * 0.75;
    this.pos.x += Math.sin(this.yaw) * sp * dt;
    this.pos.z += Math.cos(this.yaw) * sp * dt;
    this.speed = sp;
  }

  faceToward(bearing, rate, dt) {
    this.yaw += wrap(bearing - this.yaw) * Math.min(1, dt * rate);
  }

  updateAct(dt, player, dist, bearing) {
    const a = this.act;
    a.t += dt;
    const P = this.phase;
    const fwdX = Math.sin(this.yaw), fwdZ = Math.cos(this.yaw);
    if (a.type === 'pounce') {
      if (a.step === 0) {
        // crouch and wiggle; the landing marker follows you until it leaps
        const crouch = a.chained ? Math.max(0.62, CROUCH[P] - 0.15) : CROUCH[P];
        this.faceToward(bearing, 6, dt);
        this.aimPounce(player);
        if (!a.sfx) {
          a.sfx = true;
          audio.sample('sphinx_purr', { gain: 0.5, rate: 1.4 }) || audio.bossCharge();
        }
        if (a.t >= crouch) {
          a.step = 1;
          a.t = 0;
          a.from = this.pos.clone();
          a.dur = clamp(0.78 + a.to.distanceTo(a.from) * 0.018, 0.85, 1.2);
          a.h = clamp(3.5 + a.to.distanceTo(a.from) * 0.2, 4, 8.5);
          audio.sample('sphinx_pounce', { gain: 0.9 }) || audio.sweep();
          audio.sample('sphinx_roar', { gain: 0.6, rate: 1.15 }) || audio.bossRoar();
          this.world.fx.burst(_v.copy(this.pos).setY(this.floorY + 0.3), SAND, { count: 40, speed: 6, life: 0.8, size: 0.6, gravity: 4, mode: 'puff' });
        }
      } else if (a.step === 1) {
        const k = Math.min(1, a.t / a.dur);
        this.pos.lerpVectors(a.from, a.to, k);
        this.pos.y = this.floorY + 4 * a.h * k * (1 - k);
        const left = 1 - k;
        this.markerClose.scale.setScalar(1 + left * 1.5);
        this.markerMat.opacity = 0.75 + 0.25 * Math.sin(a.t * 30);
        if (k >= 1) this.land(player, a);
      } else if (a.step === 2) {
        // claws dug in: its paw gems are open
        if (a.t >= a.hold) {
          if (a.left > 0) {
            this.act = { type: 'pounce', t: 0, step: 0, left: a.left, chained: true };
            this.gemsOpen = false;
          } else this.endAct();
        }
      }
    } else if (a.type === 'swipe') {
      const wind = SWIPE_WIND[P];
      this.chestAnchor.getWorldPosition(_v);
      if (a.step === 0) {
        this.faceToward(bearing, 3, dt);
        this.sectorRibbon.set(_v.x, _v.z, 1.2, SWIPE_R, this.yaw - SWIPE_HALF, this.yaw + SWIPE_HALF, this.groundAt, 0.04);
        this.sectorMat.opacity = 0.35 + 0.15 * Math.sin(a.t * (12 + a.t * 30)) + (a.t / wind) * 0.25;
        if (a.t >= wind) {
          a.step = 1;
          a.t = 0;
          audio.sweep();
          this.sectorMat.opacity = 0.9;
        }
      } else if (a.step === 1) {
        if (!a.hit && this.inSector(player, _v)) {
          a.hit = true;
          player.damage(100, 'spike');
        }
        this.sectorMat.opacity = Math.max(0, 1 - a.t * 4);
        if (a.t > 0.28) {
          a.step = 2;
          a.t = 0;
          this.sector.visible = false;
          this.world.fx.burst(_v.setY(this.floorY + 0.3), SAND, { count: 30, speed: 7, life: 0.7, size: 0.5, gravity: 5, mode: 'puff' });
        }
      } else if (a.t > 0.55) this.endAct();
    } else if (a.type === 'beam') this.updateBeam(dt, player, dist, bearing, a);
    else if (a.type === 'summon') {
      if (a.step === 0 && a.t > 0.25 && !a.roared) {
        a.roared = true;
        audio.sample('sphinx_roar', { gain: 0.9 }) || audio.bossRoar();
      }
      if (a.step === 0 && a.t > 1.0) {
        a.step = 1;
        this.summon(player);
      }
      if (a.t > 1.7) this.endAct();
    } else if (a.type === 'roar') {
      if (!a.roared && a.t > 0.2) {
        a.roared = true;
        audio.sample('sphinx_roar', { gain: 1 }) || audio.bossRoar();
        this.world.fx.ring(_v.copy(this.pos).setY(this.floorY + 0.1), UP, SAND, { size: 2, end: 14, life: 0.8, thick: 0.2, k: 0.6 });
      }
      if (a.t > a.dur) this.endAct(1.0);
    } else if (a.type === 'stun') {
      this.gemsOpen = true;
      if (a.t > a.dur) this.endAct(1.2);
    } else if (a.type === 'buck') {
      // rears and thrashes, then throws its rider
      if (a.step === 0) {
        if (!a.sfx) {
          a.sfx = true;
          audio.sample('sphinx_roar', { gain: 0.9, rate: 1.1 }) || audio.bossRoar();
          this.hint('buck', 'It\'s bucking! Get your shots in — you\'ll be thrown!', true);
        }
        if (a.t > 0.75) {
          a.step = 1;
          a.t = 0;
          if (player.ground === this.backSolid || (this.isOver(player) && player.pos.y > this.backSolid.max.y - 0.3)) {
            const side = Math.random() < 0.5 ? 1 : -1;
            const px = Math.sin(this.yaw + side * 1.57) * 9 - fwdX * 3, pz = Math.cos(this.yaw + side * 1.57) * 9 - fwdZ * 3;
            player.launch(10, _v.set(px, 0, pz));
            player.shake = Math.max(player.shake, 0.4);
          }
          audio.slam();
          this.rideT = 0;
        }
      } else if (a.t > 0.9) this.endAct(1.6);
    }
  }

  // where a pounce from here would land on the player (clamped to the court), shown by the marker
  aimPounce(player) {
    const a = this.act;
    a.to ??= new THREE.Vector3();
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    a.to.set(player.pos.x - fx * 0.3, this.floorY, player.pos.z - fz * 0.3);
    a.to.x = clamp(a.to.x, this.bounds.minX, this.bounds.maxX);
    a.to.z = clamp(a.to.z, this.bounds.minZ, this.bounds.maxZ);
    this.marker.visible = true;
    this.marker.position.set(a.to.x + fx * 0.3, this.floorY + 0.03, a.to.z + fz * 0.3);
    this.marker.rotation.y = this.yaw;
    this.marker.scale.set(POUNCE_A, 1, POUNCE_B);
    this.markerClose.scale.setScalar(2.5);
    this.markerMat.opacity = 0.6 + 0.25 * Math.sin(a.t * 16);
  }

  land(player, a) {
    this.pos.copy(a.to);
    this.marker.visible = false;
    // crushed if you're inside the marked ellipse and not above its back
    const lx = (player.pos.x - this.marker.position.x) * Math.cos(this.yaw) - (player.pos.z - this.marker.position.z) * Math.sin(this.yaw);
    const lz = (player.pos.x - this.marker.position.x) * Math.sin(this.yaw) + (player.pos.z - this.marker.position.z) * Math.cos(this.yaw);
    if ((lx / POUNCE_A) ** 2 + (lz / POUNCE_B) ** 2 < 1 && player.pos.y < this.floorY + 3.8) player.damage(100, 'impact');
    audio.sample('sphinx_slam', { gain: 1 }) || audio.bossLand();
    player.shake = Math.max(player.shake, 0.8 * clamp(1.4 - Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) / 30, 0.2, 1));
    const c = _v.copy(this.marker.position).setY(this.floorY + 0.2);
    this.world.fx.burst(c, SAND, { count: 90, speed: 11, life: 1.1, size: 0.9, gravity: 3, mode: 'puff', drag: 2 });
    this.world.fx.burst(c, GOLD, { count: 30, speed: 9, life: 0.6, size: 0.3, gravity: 12 });
    this.world.fx.ring(c, UP, SAND, { size: 2, end: 10, life: 0.6, thick: 0.25, k: 0.8 });
    this.spawnRing(this.marker.position);
    a.left--;
    if (this.phase === 3 && a.left <= 0) this.spawnRing(this.marker.position, 0.9); // a second wave: land, then jump again
    a.step = 2;
    a.t = 0;
    a.hold = a.left > 0 ? 0.45 : RECOVER[this.phase];
    if (a.left <= 0) {
      this.gemsOpen = true;
      this.hint('gems', `Its claws are stuck in the sand — shoot the ${this.name(this.cGem)} gems on its paws!`);
    }
  }

  updateBeam(dt, player, dist, bearing, a) {
    const P = this.phase;
    if (a.step === 0 || a.step === 2) {
      // charge: face you and scorch the arc it'll sweep onto the sand (the second pass re-aims at you)
      const wind = a.step === 0 ? BEAM_WIND[P] : 0.75;
      if (!a.aimed) {
        a.aimed = true;
        a.r = clamp(dist, 6, 24);
        a.dir = a.dir ? -a.dir : Math.random() < 0.5 ? 1 : -1;
        a.center = bearing;
        a.from = bearing - a.dir * BEAM_ARC;
        this.drawArc(a);
      }
      this.faceToward(a.center, 5, dt);
      this.arc.visible = true;
      const pulse = Math.sin(a.t * (10 + a.t * 18));
      this.arcMat.opacity = 0.6 + 0.25 * pulse;
      this.arcFillMat.opacity = 0.3 + 0.1 * pulse;
      if (a.t >= wind) {
        a.step++;
        a.t = 0;
        a.th = a.from;
        this.drawArc(a, true); // its head has reared up meanwhile: the band may have moved
        this.arcFillMat.opacity = 0.25;
        audio.sample('incinerator_ignite', { gain: 0.9 });
        this.beamLoop?.setGain(0.9);
      }
      return;
    }
    // sweeping (steps 1 and 3)
    const k = Math.min(1, a.t / BEAM_SWEEP[P]);
    const prev = a.th;
    a.th = a.from + a.dir * 2 * BEAM_ARC * ease(k);
    this.arcMat.opacity = 0.45;
    // test a few points between last frame's angle and this one, so a fast sweep can't skip past you
    for (let i = 1; i <= 4 && !player.dead; i++) {
      if (this.beamHits(player, a.r, prev + ((a.th - prev) * i) / 4)) player.damage(100, 'burn');
    }
    this.drawBeam(a.r, a.th);
    if (k < 1) return;
    this.beam.visible = false;
    this.beamLoop?.setGain(0);
    if (a.step === 1 && a.passes > 1) {
      a.step = 2;
      a.t = 0;
      a.aimed = false;
      return;
    }
    this.endAct();
  }

  // eye position and where the beam meets the ground (or the first wall in the way)
  beamEnds(r, th, eye, end) {
    this.root.updateMatrixWorld(true);
    this.eyeAnchor.getWorldPosition(eye);
    const x = this.pos.x + Math.sin(th) * r, z = this.pos.z + Math.cos(th) * r;
    end.set(x, this.groundAt(x, z), z);
    _u.subVectors(end, eye);
    const len = _u.length();
    _u.divideScalar(len);
    const hit = this.world.raycast(eye, _u, len, { meshes: false });
    if (hit && !hit.solid?.moving) end.copy(hit.point);
  }

  beamHits(player, r, th) {
    const eye = _w, end = _u.clone();
    this.beamEnds(r, th, eye, end);
    const p = player.pos;
    return segDist(eye.x, eye.y, eye.z, end.x, end.y, end.z, p.x, p.y + 0.15, p.z, p.x, p.y + player.height - 0.15, p.z) < 0.55;
  }

  drawBeam(r, th) {
    const eye = new THREE.Vector3(), end = new THREE.Vector3();
    this.beamEnds(r, th, eye, end);
    const len = eye.distanceTo(end);
    this.beam.visible = true;
    this.beam.position.copy(eye);
    this.beam.lookAt(end);
    const flick = 0.85 + Math.random() * 0.3;
    this.beamOuter.scale.set(0.42 * flick, 0.42 * flick, len);
    this.beamInner.scale.set(0.14, 0.14, len);
    const fx = this.world.fx;
    fx.flash(end, 0xffa030, { size: 1.6, life: 0.08, k: 1.6 });
    fx.sparks(end, UP, 0xffb040, { count: 3, speed: 8, spread: 1.2, life: 0.4 });
    if (Math.random() < 0.5) fx.ember(end, (Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2, 0xff8a2a, 1, 0.14);
    if (Math.random() < 0.4) fx.puff(end, 0, 1.2, 0, _c.set(0x6a4a2a), 0.4, 1.4, 0.4, 3);
  }

  // The scorch arc: a line where the beam meets the sand, and a band inside it as far in as the slanting
  // beam still passes through a standing body (get under it, or beyond the line).
  drawArc(a, refresh = false) {
    this.root.updateMatrixWorld(true);
    const gx = this.pos.x + Math.sin(a.center) * a.r, gz = this.pos.z + Math.cos(a.center) * a.r;
    const eyeH = this.eyeAnchor.getWorldPosition(_v).y - this.groundAt(gx, gz);
    const rIn = Math.max(1.5, a.r * (1 - 2.4 / Math.max(eyeH, 3)));
    if (refresh && Math.abs(rIn - a.rIn) < 0.2) return;
    a.rIn = rIn;
    const b0 = a.center - BEAM_ARC, b1 = a.center + BEAM_ARC;
    this.arcLine.set(this.pos.x, this.pos.z, a.r - 0.55, a.r + 0.6, b0, b1, this.groundAt, 0.06);
    this.arcFill.set(this.pos.x, this.pos.z, rIn, a.r - 0.55, b0, b1, this.groundAt, 0.05);
  }

  summon(player) {
    const n = MAX_SCARABS[this.phase] - this.liveScarabs();
    this.backAnchor.getWorldPosition(_v);
    for (let i = 0; i < n; i++) {
      const color = i === 0 ? this.cGem : i === 1 ? this.cCore : [this.cGem, this.cCore];
      const p = [_v.x + (Math.random() - 0.5) * 3, _v.y + 1.5, _v.z + (Math.random() - 0.5) * 3];
      const d = new Drone(this.world, { pos: p, color, hp: 2, range: 34, fireInterval: 3.0, orbit: 1.4, cycle: 2.6 });
      d.group.scale.setScalar(0.8);
      // a gold scarab shell over its hull
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.66, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), this.mats[0]);
      shell.scale.set(0.85, 0.55, 1.1);
      shell.position.y = 0.12;
      d.body.add(shell);
      d.parts.push(shell);
      d.aggro = true;
      d.swarmA = (i / Math.max(1, n)) * Math.PI * 2 + Math.random();
      this.scarabs.push(d);
      this.world.fx.burst(_w.set(...p), SAND, { count: 30, speed: 5, life: 0.8, size: 0.5, gravity: 3, mode: 'puff' });
    }
    this.summonCool = 18;
    this.hint('scarab', 'Scarabs! Shoot them in their color — or shoot down their orbs.', false);
  }

  // the scarabs swarm in a ring around you
  updateScarabs(dt, player) {
    for (const d of this.scarabs) {
      if (d.dead) continue;
      d.swarmA += dt * 0.45;
      const r = 8 + Math.sin(d.swarmA * 1.7) * 1.5;
      d.home.set(player.pos.x + Math.cos(d.swarmA) * r, this.floorY + 3.5 + Math.sin(d.swarmA * 2.3) * 0.8, player.pos.z + Math.sin(d.swarmA) * r);
      d.home.x = clamp(d.home.x, this.court.minX - 2, this.court.maxX + 2);
      d.home.z = clamp(d.home.z, this.court.minZ - 2, this.court.maxZ + 2);
    }
  }

  // ------------------------------------------------------------------ hazards
  inSector(player, chest) {
    const dx = player.pos.x - chest.x, dz = player.pos.z - chest.z;
    const d = Math.hypot(dx, dz);
    if (d > SWIPE_R + 0.35 || player.pos.y > this.groundAt(player.pos.x, player.pos.z) + 2.2) return false;
    if (d < 1.5) return true;
    return Math.abs(wrap(Math.atan2(dx, dz) - this.yaw)) < SWIPE_HALF + 0.35 / d;
  }

  spawnRing(at, delay = 0) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb050).multiplyScalar(2), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(this.ringGeo.wall, mat), new THREE.Mesh(this.ringGeo.ground, mat));
    mesh.position.set(at.x, this.floorY + 0.02, at.z);
    mesh.visible = !delay;
    this.fx.add(mesh);
    this.rings.push({ mesh, mat, r: 1.5, delay, hit: false, x: at.x, z: at.z });
    if (!delay) audio.ringWave();
  }

  updateRings(dt, player) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      if (ring.delay > 0) {
        ring.delay -= dt;
        if (ring.delay > 0) continue;
        ring.mesh.visible = true;
        audio.ringWave();
      }
      ring.r += dt * RING_SPEED;
      ring.mesh.scale.set(ring.r, 1, ring.r);
      ring.mat.opacity = Math.max(0, 1 - ring.r / RING_MAX);
      if (!ring.hit) {
        const p = player.pos, c = this.court;
        const d = Math.hypot(p.x - ring.x, p.z - ring.z);
        const inCourt = p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ;
        // feet below the top of the wall as it passes = hit; any jump clears it
        if (inCourt && Math.abs(d - ring.r) < 0.6 && p.y < this.floorY + RING_H && player.ground !== this.backSolid) {
          ring.hit = true;
          player.damage(100, 'impact');
        }
      }
      if (ring.r > RING_MAX) {
        this.fx.remove(ring.mesh);
        ring.mat.dispose();
        this.rings.splice(i, 1);
      }
    }
  }

  // is the player within its footprint (local box)?
  isOver(player, pad = 0) {
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < 2.0 + pad && lz > -4.4 - pad && lz < 4.8 + pad;
  }

  // bumping into it shoves you out of its body (harmless); its back is solid from above
  pushPlayer(player) {
    if (this.riding || player.dead) return;
    const top = this.backSolid.max.y;
    if (player.pos.y > top - 0.5 || player.pos.y + player.height < this.pos.y + 0.3) return;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const HW = 2.05, F = 4.9, Bk = -4.5;
    if (Math.abs(lx) >= HW || lz <= Bk || lz >= F) return;
    // out through the nearest face
    const ox = HW - Math.abs(lx), of = F - lz, ob = lz - Bk;
    let nlx = lx, nlz = lz;
    if (ox <= of && ox <= ob) nlx = Math.sign(lx || 1) * HW;
    else if (of < ob) nlz = F;
    else nlz = Bk;
    player.pos.x = this.pos.x + nlx * c + nlz * s;
    player.pos.z = this.pos.z - nlx * s + nlz * c;
  }

  // the rideable back: a square solid that follows the back anchor and carries its rider
  updateBack(player) {
    const s = this.backSolid;
    if (!this.root.visible || this.state === 'dying') {
      s.enabled = false;
      s.delta.set(0, 0, 0);
      return;
    }
    this.root.updateMatrixWorld(true);
    const a = this.backAnchor.getWorldPosition(_v);
    const prev = this.anchorPrev;
    s.delta.set(0, 0, 0);
    if (prev && player.ground === s) {
      // carry the rider: rotate their offset by the yaw change and move it with the anchor
      const dyaw = this.yaw - prev.yaw;
      const ox = player.pos.x - prev.x, oz = player.pos.z - prev.z;
      const c = Math.cos(dyaw), sn = Math.sin(dyaw);
      const nx = a.x + ox * c + oz * sn, nz = a.z - ox * sn + oz * c;
      s.delta.set(nx - player.pos.x, a.y - prev.y, nz - player.pos.z);
      if (s.delta.lengthSq() > 4) s.delta.set(0, 0, 0);
    }
    this.anchorPrev = { x: a.x, y: a.y, z: a.z, yaw: this.yaw };
    s.min.set(a.x - BACK_HALF, a.y - 0.7, a.z - BACK_HALF);
    s.max.set(a.x + BACK_HALF, a.y, a.z + BACK_HALF);
    // one-way: only solid to someone coming down onto it from above
    s.enabled = player.ground === s || player.pos.y >= a.y - 0.45;
  }

  updatePurr(dist) {
    if (!this.purr) return;
    const busy = this.act?.type === 'pounce' && this.act.step === 0 ? 1.6 : 1;
    const g = clamp(1 - (dist - 6) / 40, 0, 1) * 0.5 * busy;
    if (Math.abs(g - this.purrGain) > 0.01) this.purr.setGain((this.purrGain = g));
    this.purr.setRate((audio.available?.has('sphinx_purr') ? 1 : 0.42) * (1 + this.speed * 0.03 + (busy - 1) * 0.3));
  }

  // ------------------------------------------------------------------ waking, death
  updateWake(dt, player) {
    const T = this.stateT;
    this.pose.eyes = T < 0.6 ? (Math.random() < T / 0.6 ? 1 : 0.1) : 1;
    if (T > 0.9 && !this.roared) {
      this.roared = true;
      audio.sample('sphinx_roar', { gain: 1 }) || audio.bossRoar();
      player.shake = Math.max(player.shake, 0.7);
      this.world.fx.ring(_v.copy(this.pos).setY(this.floorY + 0.1), UP, SAND, { size: 2, end: 16, life: 0.9, thick: 0.2, k: 0.7 });
      this.world.fx.burst(_v.setY(this.floorY + 3), SAND, { count: 80, speed: 5, life: 1.6, size: 0.8, gravity: 4, mode: 'puff' });
    }
    this.faceToward(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), 1.2, dt);
    this.glow.intensity = 6 * Math.min(1, T);
    this.discGroup.getWorldPosition(this.glow.position);
    this.discMat.color.set(COLORS[this.discColor].hex).multiplyScalar(0.3 + Math.min(1, T / 0.8) * 0.85);
    this.animate(dt);
    this.updateBack(player);
    if (T > 2.6) {
      this.roared = false;
      this.state = 'fight';
      this.attackTimer = 1.2;
      this.hint(null, `Dodge its pounce — then shoot the ${this.name(this.cGem)} gems on its paws. Its sun disc takes its own color.`, false);
    }
  }

  updateDeath(dt, player) {
    this.deathT += dt;
    const T = this.deathT;
    this.animate(dt);
    this.backSolid.enabled = false;
    this.glow.intensity = Math.random() < 0.5 ? 14 : 2;
    this.discMat.color.set(COLORS[Math.random() < 0.5 ? this.cGem : this.cCore].hex).multiplyScalar(1 + Math.random() * 2);
    this.eyeMat.color.setRGB(Math.random() * 3, Math.random() * 1.5, 0.2);
    if (Math.random() < dt * 12) {
      // sand pours from cracks in its armor, sparks fly
      const m = this.meshes[rand(this.meshes.length)];
      m.getWorldPosition(_v);
      this.world.fx.burst(_v, SAND, { count: 20, speed: 4, life: 1.2, size: 0.6, gravity: 6, mode: 'puff' });
      this.world.fx.sparks(_v, UP, GOLD, { count: 10, speed: 9, spread: 2 });
      if (Math.random() < 0.4) audio.explode();
      player.shake = Math.max(player.shake, 0.25);
    }
    if (T > 3.6) this.explode(player);
  }

  explode(player) {
    this.state = 'dead';
    this.clearTelegraphs();
    this.glow.intensity = 0;
    this.purr?.stop();
    this.beamLoop?.stop();
    this.purr = this.beamLoop = null;
    this.world.removeHittable(this.root);
    this.backSolid.enabled = false;
    const c = _v.copy(this.pos).setY(this.floorY + 2.5);
    const fx = this.world.fx;
    fx.burst(c, SAND, { count: 260, speed: 14, life: 2.2, size: 1.3, gravity: 3, mode: 'puff', drag: 1.2 });
    fx.burst(c, GOLD, { count: 160, speed: 18, life: 1.6, size: 0.45, gravity: 9 });
    fx.burst(c, 0xffffff, { count: 40, speed: 7, life: 0.4, size: 1.2, gravity: 0 });
    for (const col of [this.cGem, this.cCore]) fx.burst(c, COLORS[col].hex, { count: 90, speed: 13, life: 1.3, size: 0.55, gravity: 4 });
    fx.ring(c.setY(this.floorY + 0.2), UP, SAND, { size: 3, end: 26, life: 1.2, thick: 0.25, k: 0.9 });
    audio.sample('sphinx_death', { gain: 1, vary: 0 }) || audio.explode(true);
    player.shake = 1;
    // the robot bursts apart: every armor piece is flung, bounces on the sand and sinks into it
    this.root.updateMatrixWorld(true);
    this.debris = [];
    this.debrisT = 0;
    const center = this.pos.clone().setY(this.floorY + 2.5);
    for (const m of [...this.meshes, ...this.gems, this.disc, this.core]) {
      this.world.scene.attach(m);
      const dir = m.getWorldPosition(new THREE.Vector3()).sub(center);
      dir.y = Math.abs(dir.y) + 1.5;
      dir.normalize().multiplyScalar(6 + Math.random() * 10);
      this.debris.push({ m, vel: dir, spin: new THREE.Vector3().randomDirection().multiplyScalar(3 + Math.random() * 6), life: 5 + Math.random() * 2, scale: m.scale.clone() });
    }
    this.root.visible = false;
    this.game.hud.bossShow(false);
    this.setBossName(null);
    this.onDefeated?.();
  }

  updateDebris(dt) {
    if (!this.debris) return;
    this.debrisT += dt;
    let alive = 0;
    for (const d of this.debris) {
      if (d.life <= 0) continue;
      d.life -= dt;
      alive++;
      const m = d.m;
      if (this.debrisT < 2.8) {
        d.vel.y -= 22 * dt;
        m.position.addScaledVector(d.vel, dt);
        m.rotation.x += d.spin.x * dt;
        m.rotation.y += d.spin.y * dt;
        m.rotation.z += d.spin.z * dt;
        if (m.position.y < this.floorY + 0.3 && d.vel.y < 0) {
          m.position.y = this.floorY + 0.3;
          d.vel.y *= -0.3;
          d.vel.x *= 0.6;
          d.vel.z *= 0.6;
          d.spin.multiplyScalar(0.5);
          if (Math.abs(d.vel.y) > 2 && Math.random() < 0.3) this.world.fx.burst(m.position, SAND, { count: 6, speed: 3, life: 0.7, size: 0.5, gravity: 4, mode: 'puff' });
        }
      } else {
        m.position.y -= dt * 0.8; // swallowed by the sand
        if (Math.random() < dt * 2) this.world.fx.burst(_v.copy(m.position).setY(this.floorY + 0.1), SAND, { count: 3, speed: 1, life: 0.8, size: 0.6, gravity: 1, mode: 'puff' });
      }
      if (d.life < 0.6) m.scale.copy(d.scale).multiplyScalar(Math.max(0.01, d.life / 0.6));
      if (d.life <= 0) {
        this.world.scene.remove(m);
        m.geometry.dispose();
      }
    }
    if (!alive) {
      this.debris = null;
      this.world.remove(this);
      this.world.scene.remove(this.fx);
    }
  }

  // ------------------------------------------------------------------ animation
  // Pose targets by state, blended; then the legs are solved so the paws plant where they should.
  animate(dt, snap = false) {
    const T = this.world.time;
    const p = this.pose;
    const a = this.act;
    const st = this.state;
    const t = {
      bodyY: 2.85, pitch: 0, roll: 0, hipsPitch: 0, hipsYaw: 0, neckPitch: 0, neckYaw: 0, headPitch: 0, jaw: 0,
      hatch: this.coreOpen, shutter: this.gemsOpen ? 1 : 0, tailUp: 0.35, eyes: st === 'statue' ? 0 : st === 'waking' ? p.eyes : 1,
    };
    // feet: [front L, front R, hind L, hind R] targets in root space
    const feet = this.legs.map((l) => l.target.set(l.side * (l.front ? 1.3 : 1.4), l.front ? 0.25 : 0.22, l.front ? 2.2 : -2.75));
    const splay = [0, 0, 0, 0];
    const lift = (i, y, z) => feet[i].set(feet[i].x, y, z);
    // gait
    const moving = this.speed > 0.1;
    if (moving) this.walkPhase += (dt * Math.PI * this.speed) / 1.8;
    const P = this.game.player;
    const toPlayer = wrap(Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z) - this.yaw);
    t.neckYaw = clamp(toPlayer, -0.7, 0.7) * 0.6;
    t.headPitch = 0.05;
    if (st === 'statue') {
      // lying like the Great Sphinx: forepaws stretched out, haunches folded
      t.bodyY = 1.35;
      t.neckYaw = 0;
      t.neckPitch = -0.12;
      t.tailUp = -0.25;
      for (let i = 0; i < 2; i++) lift(i, 0.25, 4.6);
      for (let i = 2; i < 4; i++) lift(i, 0.22, -1.7);
    } else if (st === 'waking') {
      const k = clamp((this.stateT - 1.2) / 1.2, 0, 1);
      t.bodyY = 1.35 + (2.85 - 1.35) * ease(k);
      t.neckPitch = this.stateT > 0.8 && this.stateT < 2.0 ? -0.45 : -0.1;
      t.jaw = this.stateT > 0.8 && this.stateT < 2.0 ? 0.6 : 0;
      for (let i = 0; i < 2; i++) lift(i, 0.25, 4.6 - 2.4 * ease(k));
      for (let i = 2; i < 4; i++) lift(i, 0.22, -1.7 - 1.05 * ease(k));
    } else if (st === 'dying') {
      const k = clamp((this.deathT - 0.8) / 1.4, 0, 1);
      t.bodyY = 2.85 - 1.75 * ease(k);
      t.pitch = 0.08 * k;
      t.roll = 0.22 * k + Math.sin(T * 30) * 0.03;
      t.neckPitch = 0.8 * k;
      t.headPitch = 0.3 * k;
      t.jaw = 0.5;
      t.tailUp = -0.4 * k;
      t.eyes = 1;
      for (let i = 0; i < 4; i++) splay[i] = 0.75 * k;
    } else if (a) {
      const P3 = this.phase;
      if (a.type === 'pounce' && a.step === 0) {
        const crouch = a.chained ? Math.max(0.62, CROUCH[P3] - 0.15) : CROUCH[P3];
        const k = Math.min(1, a.t / 0.35);
        t.bodyY = 2.85 - 0.75 * k;
        t.pitch = 0.12 * k;
        t.hipsPitch = -0.12 * k;
        // the butt wiggle, faster as it's about to leap
        t.hipsYaw = Math.sin(a.t * (14 + (a.t / crouch) * 10)) * 0.16 * k;
        t.neckPitch = 0.15;
        t.headPitch = 0.15;
        t.tailUp = 0.1 + Math.sin(a.t * 20) * 0.15;
        for (let i = 0; i < 2; i++) lift(i, 0.25, 2.9);
        for (let i = 2; i < 4; i++) lift(i, 0.22, -2.3);
      } else if (a.type === 'pounce' && a.step === 1) {
        const k = Math.min(1, a.t / a.dur);
        t.bodyY = 2.9;
        t.pitch = -0.35 + 0.65 * k;
        t.neckPitch = -0.2;
        t.jaw = 0.5;
        t.tailUp = 0.6;
        for (let i = 0; i < 2; i++) lift(i, 0.9 - 0.6 * k, 4.4);
        for (let i = 2; i < 4; i++) lift(i, 1.3, -4.9);
      } else if ((a.type === 'pounce' && a.step === 2) || a.type === 'stun') {
        t.bodyY = a.type === 'stun' ? 1.8 : 2.25;
        t.pitch = a.type === 'stun' ? 0.16 : 0.08;
        t.neckPitch = a.type === 'stun' ? 0.55 : 0.2;
        t.headPitch = a.type === 'stun' ? 0.25 : 0.1;
        t.jaw = a.type === 'stun' ? 0.35 : 0;
        t.tailUp = a.type === 'stun' ? -0.2 : 0.2;
        if (a.type === 'stun') t.eyes = Math.random() < 0.3 ? 0.2 : 1;
        for (let i = 0; i < 2; i++) lift(i, 0.25, 3.1);
        if (a.type === 'stun') splay[0] = splay[1] = 0.25;
        // claws working at the sand
        if (a.type === 'pounce') for (let i = 0; i < 2; i++) feet[i].y += Math.max(0, Math.sin(T * 9 + i * 3)) * 0.12;
      } else if (a.type === 'swipe') {
        const i = a.side > 0 ? 1 : 0;
        const s = this.legs[i].side;
        t.roll = -s * 0.1;
        t.pitch = -0.08;
        t.neckPitch = -0.15;
        t.jaw = 0.45;
        if (a.step === 0) {
          lift(i, 3.0, 3.3);
          splay[i] = 0.45;
          this.clawMat.emissiveIntensity = 1 + Math.sin(T * 30) * 0.5;
        } else if (a.step === 1) {
          const k = Math.min(1, a.t / 0.28);
          lift(i, 3.0 - 2.6 * k, 3.3 + 1.6 * k);
          splay[i] = 0.45 - 0.9 * k;
        }
      } else if (a.type === 'beam') {
        t.bodyY = 3.0;
        t.pitch = -0.08;
        t.neckPitch = -0.3;
        t.headPitch = 0.25;
        t.jaw = 0.55;
        if (a.step === 1 || a.step === 3) t.neckYaw = clamp(wrap(a.th - this.yaw), -1.2, 1.2) * 0.8;
        else t.neckYaw = 0;
        t.eyes = 2;
      } else if (a.type === 'summon' || a.type === 'roar' || a.type === 'buck') {
        const thrash = a.type === 'buck' ? Math.sin(a.t * 18) * (a.step === 0 ? 0.12 : 0.05) : 0;
        t.bodyY = 3.25;
        t.pitch = (a.type === 'buck' && a.step === 1 ? -0.7 : -0.5) + thrash;
        t.roll = thrash * 1.5;
        t.neckPitch = -0.35;
        t.jaw = 0.7;
        t.tailUp = 0.7;
        for (let i = 0; i < 2; i++) lift(i, 2.3 + Math.sin(T * 8 + i * 2) * 0.3, 3.4);
      }
    } else if (this.riding) {
      t.roll = Math.sin(T * 5) * 0.08;
      t.pitch = Math.sin(T * 7) * 0.04;
      t.neckYaw = Math.sin(T * 2) * 0.4;
      t.neckPitch = -0.2;
      t.jaw = 0.3;
    }
    if (!a || a.type !== 'swipe') this.clawMat.emissiveIntensity = Math.max(0, this.clawMat.emissiveIntensity - dt * 3);
    // walk cycle on top of whatever the feet are doing (a trot: diagonal pairs together)
    const gaitK = moving ? Math.min(1, this.speed / 3) : 0;
    if (gaitK > 0) {
      const off = [0, Math.PI, Math.PI, 0];
      for (let i = 0; i < 4; i++) {
        const ph = this.walkPhase + off[i];
        feet[i].z += Math.sin(ph) * 0.95 * gaitK;
        feet[i].y += Math.max(0, Math.cos(ph)) * 0.55 * gaitK;
      }
      t.bodyY += Math.abs(Math.cos(this.walkPhase)) * 0.12 * gaitK - 0.06;
      t.roll += Math.sin(this.walkPhase) * 0.03 * gaitK;
      if (Math.abs(Math.sin(this.walkPhase)) > 0.98 && !this._stepped) {
        this._stepped = true;
        const d = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
        if (d < 30) audio.bossStep();
        P.shake = Math.max(P.shake, 0.1 * clamp(1 - d / 25, 0, 1));
      } else if (Math.abs(Math.sin(this.walkPhase)) < 0.9) this._stepped = false;
    }
    const k = snap ? 1 : Math.min(1, dt * 9);
    for (const key in t) p[key] += (t[key] - p[key]) * (key === 'eyes' ? Math.min(1, dt * 12) : k);
    if (snap) p.eyes = t.eyes;

    // apply
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.body.position.y = p.bodyY;
    this.body.rotation.set(p.pitch, 0, p.roll);
    this.hips.rotation.set(p.hipsPitch, p.hipsYaw, 0);
    this.hips.position.x = p.hipsYaw * 0.8;
    // a weak-point hit snaps its head back
    this.flinch = Math.max(0, (this.flinch || 0) - dt * 6);
    this.neck.rotation.set(p.neckPitch - this.flinch * 0.22, p.neckYaw, 0);
    this.head.rotation.set(p.headPitch - this.flinch * 0.3, p.neckYaw * 0.5, 0);
    this.body.rotation.x -= this.flinch * 0.04;
    this.jaw.rotation.x = p.jaw * 0.6;
    for (const h of this.hatches) h.rotation.z = -h.userData.side * 2.1 * ease(clamp(p.hatch, 0, 1));
    for (const l of this.legs) if (l.halves) for (const h of l.halves) h.position.x = h.userData.h * (0.2 + 0.42 * p.shutter);
    this.core.rotation.y += dt * 2;
    this.core.visible = p.hatch > 0.05 || st === 'dying';
    this.eyeMat.color.setRGB(0.25, 1.0, 0.85).multiplyScalar(2.2 * p.eyes);
    if (p.eyes > 1.2) this.eyeMat.color.setRGB(2.5, 1.2, 0.3).multiplyScalar(p.eyes * 0.7);
    // the tail: a raised curve that sways, twitching at the tip
    for (let i = 0; i < this.tail.length; i++) {
      const seg = this.tail[i];
      seg.rotation.x = i === 0 ? -p.tailUp - 0.2 : -0.12 + (i > 4 ? 0.15 : 0) * Math.sign(p.tailUp);
      seg.rotation.y = Math.sin(T * 2.2 - i * 0.55) * (0.1 + i * 0.025) + (i === 0 ? p.hipsYaw * 2 : 0);
    }
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < 4; i++) {
      const l = this.legs[i];
      l.cur.lerp(feet[i], snap ? 1 : Math.min(1, dt * 16));
      l.splay += (splay[i] - l.splay) * (snap ? 1 : Math.min(1, dt * 10));
      this.solveLeg(l);
    }
  }

  // Two-bone IK in the leg's own vertical plane: the paw (the foot group) goes to l.cur (root space).
  solveLeg(l) {
    _v.copy(l.cur);
    this.root.localToWorld(_v);
    l.hip.parent.worldToLocal(_v);
    const ty = _v.y - l.hip.position.y, tz = _v.z - l.hip.position.z;
    const L1 = l.L1, L2 = l.L2;
    const d = clamp(Math.hypot(ty, tz), Math.abs(L1 - L2) + 0.05, L1 + L2 - 0.02);
    const theta = Math.atan2(-tz, -ty);
    const alpha = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const beta = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    l.hip.rotation.x = theta - l.bend * alpha;
    l.hip.rotation.z = l.side * l.splay;
    l.knee.rotation.x = l.bend * (Math.PI - beta);
    const pitch = this.body.rotation.x + (l.front ? 0 : this.hips.rotation.x);
    l.foot.rotation.x = -(pitch + l.hip.rotation.x + l.knee.rotation.x);
  }
}
