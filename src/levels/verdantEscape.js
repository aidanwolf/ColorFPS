// VERDANT · THE BOULDER ESCAPE and THE MONKEY'S MOUTH (verdantRuin.js builds it once the sanctum fight is won)
//
// The Seed's guard is down, the temple starts to come apart: the high door east of the pyramid's top opens, and
// as you step onto the bridge to it the niche in the west wall bursts and a great carved stone ball rolls out
// after you. It follows the passages down and round toward daylight, a little faster when you're far ahead and a
// little slower when you're close (it never stops), and through old-fashioned booby traps: pressure plates that
// fire darts across the passage, swinging spiked logs, a spike pit, a floor that falls away, stone doors grinding
// shut, flame jets; and in the way, barricades, rubble, roots and a cracked wall that only a GREEN glob's burst
// clears (cracked, seams glowing green). Out of the mouth of a colossal carved monkey face in the cliff, onto a
// wooden rope bridge over the gorge; the boulder jams in the mouth behind you. Turn around: the face.
// A death on the run puts you back at the start of it (the checkpoint on the pyramid's top), everything reset.
import * as THREE from 'three';
import { GREEN } from '../colors.js';
import { audio } from '../audio.js';
import { Checkpoint } from '../entities/misc.js';
import { boxGeo, mat } from '../materials.js';

const PI = Math.PI;
const EAST = -PI / 2, WEST = PI / 2, NORTH = 0;
export const ESCAPE_ID = 'verdant:escape'; // in game.clearedEncounters once you're out on the bridge
const W5 = 5, HH = 5.5; // passage width and height
const BR = 2.1; // the boulder's radius
const BRIDGE = { x1: 6, x2: 27, y: 18, z: -330, w: 2.2, sag: 0.55 };
// the run's centre line (floor y at each node): niche → pyramid top → east door → passages → the mouth
const NODES = [
  [-79.5, 23.6, -380], [-24, 23.6, -380], [-6, 23.0, -380], [-6, 21.8, -346], [-28, 21.0, -346],
  [-28, 20.4, -321], [-12, 19.6, -321], [-12, 19.0, -330], [1.6, 18.0, -330],
];
const RUN_FROM = 3; // passages are built from NODES[1] (the east door) on

export function buildVerdantEscape(B, { K, F, cradle, quake, sanctum: S, slab, solid }) {
  const { W, game, hint, devStart, onRespawn } = B;
  const { mats, R, rand } = K;
  const G_ = (t) => `<b style="color:#3dff7a">${t}</b>`;
  audio.manifest?.then(() => audio.prefetch(['boulder_roll', 'dart_trap', 'stone_slam', 'rope_bridge_creak', 'gate_slam', 'sphinx_slam', 'crumble_break', 'crumble_crack', 'temple_rumble', 'welder_roll', 'trapdoor_drop', 'lava_sizzle', 'spike', 'bramble_tear', 'wood_break', 'fire_whoosh']));
  const sfx = (name, alt, o) => audio.sample(audio.sfxOr(name, alt), o);
  const near = (p, far = 40) => Math.max(0.15, 1 - game.camera.position.distanceTo(p) / far);

  // ---------------------------------------------------------------- the path
  const P = NODES.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const segs = [];
  let total = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z);
    segs.push({ a, b, L, s0: total, dir: new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize() });
    total += L;
  }
  const at = (s, out = new THREE.Vector3()) => {
    s = Math.max(0, Math.min(total, s));
    for (const g of segs) if (s <= g.s0 + g.L || g === segs[segs.length - 1]) return out.lerpVectors(g.a, g.b, Math.min(1, (s - g.s0) / g.L));
    return out;
  };
  const segAt = (s) => segs.find((g) => s <= g.s0 + g.L) || segs[segs.length - 1];
  // where along the path a point is (the nearest point on the path, searched near a hint so corners don't jump)
  const _q = new THREE.Vector3();
  function project(p, hintS = null) {
    let best = 0, bd = Infinity;
    for (const g of segs) {
      if (hintS !== null && (g.s0 > hintS + 25 || g.s0 + g.L < hintS - 25)) continue;
      const dx = g.b.x - g.a.x, dz = g.b.z - g.a.z;
      const k = Math.max(0, Math.min(1, ((p.x - g.a.x) * dx + (p.z - g.a.z) * dz) / (g.L * g.L)));
      _q.set(g.a.x + dx * k, 0, g.a.z + dz * k);
      const d = Math.hypot(p.x - _q.x, p.z - _q.z) + Math.max(0, Math.abs(p.y - (g.a.y + (g.b.y - g.a.y) * k)) - 3) * 2;
      if (d < bd) {
        bd = d;
        best = g.s0 + k * g.L;
      }
    }
    return { s: best, d: bd };
  }
  const sOf = (x, z) => project({ x, y: 22, z }).s;

  // ---------------------------------------------------------------- the passages
  // walls along the offset polylines (90° turns: each offset vertex is the corner point pushed out both ways),
  // floors stepping gently down each leg (with gaps for the pits), a ceiling, friezes, lamps, roots
  const gaps = []; // [s1, s2] stretches with no floor (pits)
  function buildPassages() {
    const pts = [...P.slice(1, P.length - 1), new THREE.Vector3(0, 18, -330)]; // east door → the cliff face at x 0
    const nAt = (i) => {
      const nIn = i > 0 ? leftN(pts[i - 1], pts[i]) : leftN(pts[0], pts[1]);
      const nOut = i < pts.length - 1 ? leftN(pts[i], pts[i + 1]) : nIn;
      return nIn.equals(nOut) ? nIn.clone() : nIn.clone().add(nOut); // (a 90° turn: the miter, both ways)
    };
    for (const side of [1, -1]) {
      const o = pts.map((p, i) => {
        const n = nAt(i);
        return new THREE.Vector3(p.x + n.x * side * W5 / 2, p.y, p.z + n.z * side * W5 / 2);
      });
      for (let i = 0; i < o.length - 1; i++) {
        const a = o[i], b = o[i + 1];
        const yLo = Math.min(a.y, b.y) - 0.5, yHi = Math.max(a.y, b.y) + HH;
        const along = Math.abs(b.x - a.x) > Math.abs(b.z - a.z);
        const out = leftN(pts[i], pts[i + 1]).multiplyScalar(side);
        if (along) slab(mats.granite, Math.min(a.x, b.x), yLo, Math.min(a.z, a.z + out.z), Math.max(a.x, b.x), yHi, Math.max(a.z, a.z + out.z));
        else slab(mats.granite, Math.min(a.x, a.x + out.x), yLo, Math.min(a.z, b.z), Math.max(a.x, a.x + out.x), yHi, Math.max(a.z, b.z));
        // the frieze, lamps, vines and moss on the inner face
        const L = along ? Math.abs(b.x - a.x) : Math.abs(b.z - a.z);
        for (let u = 1; u < L - 1; u += 2.2) {
          const k = u / L, x = a.x + (b.x - a.x) * k - out.x * 0.06, z = a.z + (b.z - a.z) * k - out.z * 0.06, y = a.y + (b.y - a.y) * k;
          K.put(mats.glyph, along ? boxGeo(2.1, 0.9, 0.1, 0.9) : boxGeo(0.1, 0.9, 2.1, 0.9), x, y + 3.1, z);
          if (Math.round(u / 2.2) % 3 === 1) {
            K.put(mats.algae, along ? boxGeo(0.24, 0.7, 0.1, 0.5) : boxGeo(0.1, 0.7, 0.24, 0.5), x - out.x * 0.02, y + 1.7, z - out.z * 0.02);
            K.put(mats.granite, along ? boxGeo(0.6, 0.16, 0.36, 0.5) : boxGeo(0.36, 0.16, 0.6, 0.5), x - out.x * 0.15, y + 2.15, z - out.z * 0.15);
          }
          if (rand() < 0.25) F.vineStrand(x - out.x * 0.1, y + HH, z - out.z * 0.1, R(1, 3.5), 0.12);
          if (rand() < 0.4) K.put(mats.moss, along ? boxGeo(R(0.6, 1.8), R(0.2, 0.7), 0.08, 0.5) : boxGeo(0.08, R(0.2, 0.7), R(0.6, 1.8), 0.5), x, y + 0.25, z);
        }
      }
      // a pillar behind every corner closes the outer corners' gaps
      o.forEach((v, i) => {
        const n = nAt(i).multiplyScalar(side * 0.5);
        if (i === 0 || i === o.length - 1) return;
        slab(mats.granite, v.x + n.x - 0.5, v.y - 0.5, v.z + n.z - 0.5, v.x + n.x + 0.5, v.y + HH + 0.5, v.z + n.z + 0.5);
      });
    }
    // floors (stepping gently down, broken at the pits) and ceilings, leg by leg
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const along = Math.abs(b.x - a.x) > Math.abs(b.z - a.z);
      const L = along ? Math.abs(b.x - a.x) : Math.abs(b.z - a.z);
      const sA = sOf(a.x, a.z), sB = sOf(b.x, b.z);
      const n = Math.max(2, Math.round(L / 1.4));
      for (let k = 0; k < n; k++) {
        const y = a.y + (b.y - a.y) * (k / Math.max(1, n - 1));
        let pieces = [[k / n, (k + 1) / n]];
        for (const [g1, g2] of gaps) {
          const u1 = (g1 - sA) / (sB - sA), u2 = (g2 - sA) / (sB - sA);
          pieces = pieces.flatMap(([p1, p2]) => (u2 <= p1 || u1 >= p2 ? [[p1, p2]] : [[p1, Math.max(p1, u1)], [Math.min(p2, u2), p2]].filter(([q1, q2]) => q2 - q1 > 0.001)));
        }
        for (const [u1, u2] of pieces) {
          const ex1 = u1 < 1e-6 ? W5 / 2 : 0, ex2 = u2 > 1 - 1e-6 ? W5 / 2 : 0; // (corners filled)
          const m = k % 5 === 2 ? mats.glyph : mats.granite;
          if (along) {
            const sg = Math.sign(b.x - a.x), xa = a.x + (b.x - a.x) * u1 - sg * ex1, xb = a.x + (b.x - a.x) * u2 + sg * ex2;
            slab(m, Math.min(xa, xb), y - 1, a.z - W5 / 2, Math.max(xa, xb), y, a.z + W5 / 2);
          } else {
            const sg = Math.sign(b.z - a.z), za = a.z + (b.z - a.z) * u1 - sg * ex1, zb = a.z + (b.z - a.z) * u2 + sg * ex2;
            slab(m, a.x - W5 / 2, y - 1, Math.min(za, zb), a.x + W5 / 2, y, Math.max(za, zb));
          }
        }
      }
      const yTop = Math.max(a.y, b.y) + HH;
      if (along) slab(mats.granite, Math.min(a.x, b.x) - W5 / 2, yTop, a.z - W5 / 2 - 0.5, Math.max(a.x, b.x) + W5 / 2, yTop + 1, a.z + W5 / 2 + 0.5);
      else slab(mats.granite, a.x - W5 / 2 - 0.5, yTop, Math.min(a.z, b.z) - W5 / 2, a.x + W5 / 2 + 0.5, yTop + 1, Math.max(a.z, b.z) + W5 / 2);
      // roots through the ceiling
      for (let u = R(1, 4); u < L; u += R(4, 8)) {
        const k = u / L, x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
        K.limb([[x + R(-1.5, 1.5), yTop + 0.5, z + R(-1.5, 1.5)], [x + R(-1, 1), yTop - R(1, 2), z + R(-1, 1)], [x + R(-2, 2), yTop - R(1.8, 2.6), z + R(-2, 2)]], R(0.12, 0.22), 0.05, mats.bark, 5);
      }
    }
  }
  function leftN(a, b) {
    return new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize();
  }

  // ---------------------------------------------------------------- the sanctum end: niche, causeway, bridge, door
  const top = S.top;
  // the west causeway from the niche to the pyramid's top, and the east bridge from the top to the high door
  for (const [x1, x2] of [[S.x1, S.cx - 4], [S.cx + 4, S.x2]]) {
    slab(mats.granite, x1, top - 1.2, S.cz - 2.5, x2, top, S.cz + 2.5);
    K.put(mats.glyph, boxGeo(x2 - x1, 0.5, 5.1, 0.6), (x1 + x2) / 2, top - 0.9, S.cz);
    for (const s of [-1, 1]) {
      slab(mats.granite, x1, top, S.cz + s * 2.5 - 0.3, x2, top + 0.8, S.cz + s * 2.5 + 0.3);
      W.addSolid(new THREE.Vector3(x1, top, Math.min(S.cz + s * 2.5 - 0.3, S.cz + s * 2.5 + 0.3)), new THREE.Vector3(x2, top + 1.3, Math.max(S.cz + s * 2.5 - 0.3, S.cz + s * 2.5 + 0.3)), { noShot: true });
    }
    // corbelled supports down to the floor every 7 m
    for (let x = x1 + 3.5; x < x2 - 1; x += 7) slab(mats.granite, x - 0.9, S.floor, S.cz - 1.6, x + 0.9, top - 1.2, S.cz + 1.6);
  }
  // the niche behind the west wall: the boulder waits in it behind a cracked slab
  slab(mats.granite, S.x1 - 7, top - 1, S.cz - 3.5, S.x1 - 1, top, S.cz + 3.5);
  slab(mats.granite, S.x1 - 7, top, S.cz - 3.5, S.x1 - 1, top + 6, S.cz - 2.5);
  slab(mats.granite, S.x1 - 7, top, S.cz + 2.5, S.x1 - 1, top + 6, S.cz + 3.5);
  slab(mats.granite, S.x1 - 8, top, S.cz - 3.5, S.x1 - 7, top + 6, S.cz + 3.5);
  slab(mats.granite, S.x1 - 8, top + 6, S.cz - 3.5, S.x1 - 1, top + 7, S.cz + 3.5);
  const nicheSlab = new THREE.Mesh(boxGeo(0.6, 5.4, 5, 0.5), mats.glyph);
  nicheSlab.position.set(S.x1 - 0.5, top + 2.7, S.cz);
  W.scene.add(nicheSlab);

  // ---------------------------------------------------------------- traps and obstacles along the passages
  const resets = [];
  const flameStates = []; // (the flame jets' clocks: flameClock() for tests)
  const trapS = []; // where the timed traps are (the boulder eases off while you wait out one just ahead)
  const hazards = []; // functions (player) → death cause or null, checked every frame of the run
  // A breakable obstacle: only a green glob's burst clears it (other colors glance off). styles: planks, rubble,
  // roots, cracked (a cracked granite wall with glowing green seams)
  class Breakable {
    constructor(min, max, style) {
      this.min = new THREE.Vector3(...min);
      this.max = new THREE.Vector3(...max);
      this.style = style;
      this.color = GREEN;
      this.c = this.min.clone().add(this.max).multiplyScalar(0.5);
      this.size = this.max.clone().sub(this.min);
      this.group = new THREE.Group();
      this.group.position.copy(this.c);
      const sz = this.size, alongX = sz.x > sz.z;
      const add = (m, g, x, y, z) => {
        const mesh = new THREE.Mesh(g, m);
        mesh.position.set(x, y, z);
        this.group.add(mesh);
        return mesh;
      };
      if (style === 'planks') {
        const plank = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9, flatShading: true });
        for (let i = 0; i < 6; i++) add(plank, alongX ? boxGeo(sz.x + 0.3, 0.32, 0.12, 0.5) : boxGeo(0.12, 0.32, sz.z + 0.3, 0.5), 0, -sz.y / 2 + 0.45 + i * 0.85, 0).rotation[alongX ? 'z' : 'x'] = R(-0.15, 0.15);
        for (const s of [-1, 1]) add(plank, boxGeo(0.25, sz.y, 0.25, 0.5), alongX ? s * sz.x * 0.3 : 0, 0, alongX ? 0 : s * sz.z * 0.3);
        add(mats.sap, alongX ? boxGeo(0.5, 0.5, 0.14, 0.5) : boxGeo(0.14, 0.5, 0.5, 0.5), 0, 0.2, 0); // a green-daubed glyph: blast here
      } else if (style === 'rubble') {
        for (let i = 0; i < 14; i++) add(mats.granite, new THREE.DodecahedronGeometry(R(0.5, 1.1), 0), R(-0.45, 0.45) * sz.x, R(-0.45, 0.4) * sz.y, R(-0.45, 0.45) * sz.z);
        for (let i = 0; i < 7; i++) add(mats.sap, new THREE.BoxGeometry(R(0.6, 1.4), 0.06, 0.06).rotateZ(R(0, PI)).rotateY(alongX ? 0 : PI / 2), R(-0.4, 0.4) * sz.x, R(-0.4, 0.4) * sz.y, alongX ? sz.z * 0.48 : R(-0.4, 0.4) * sz.z);
      } else if (style === 'roots') {
        for (let i = 0; i < 8; i++) {
          const pts = [];
          const y0 = R(-0.45, 0.45) * sz.y, y1 = R(-0.45, 0.45) * sz.y;
          for (let j = 0; j <= 4; j++) {
            const u = j / 4 - 0.5;
            pts.push(alongX ? new THREE.Vector3(u * sz.x * 1.1, y0 + (y1 - y0) * (u + 0.5) + R(-0.4, 0.4), R(-0.3, 0.3)) : new THREE.Vector3(R(-0.3, 0.3), y0 + (y1 - y0) * (u + 0.5) + R(-0.4, 0.4), u * sz.z * 1.1));
          }
          add(mats.bark, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, R(0.18, 0.32), 6), 0, 0, 0);
        }
        for (let i = 0; i < 6; i++) add(mats.sap, new THREE.IcosahedronGeometry(R(0.12, 0.2), 0), R(-0.4, 0.4) * sz.x, R(-0.4, 0.4) * sz.y, R(-0.4, 0.4) * sz.z);
      } else {
        add(mats.granite, boxGeo(sz.x, sz.y, sz.z, 0.5), 0, 0, 0);
        const face = alongX ? 1 : 0;
        for (let i = 0; i < 9; i++) {
          const g = new THREE.BoxGeometry(R(0.8, 2.4), 0.09, 0.09).rotateZ(R(-1.2, 1.2));
          if (!face) g.rotateY(PI / 2);
          for (const s of [-1, 1]) add(mats.sap, g.clone(), face ? R(-0.4, 0.4) * sz.x : s * (sz.x / 2 + 0.02), R(-0.4, 0.4) * sz.y, face ? s * (sz.z / 2 + 0.02) : R(-0.4, 0.4) * sz.z);
        }
      }
      W.scene.add(this.group);
      this.solid = W.addSolid(this.min.clone(), this.max.clone(), { entity: this, kind: 'stone' });
      this.broken = false;
      this.shake = 0;
      W.add(this);
      resets.push(() => this.restore());
      obstacles.push(this);
    }
    onHit(color, hit) {
      if (this.broken) return undefined;
      if (color !== GREEN || hit?.kind !== 'blast') {
        this.shake = 0.3;
        return 'immune';
      }
      this.smash(hit?.dir);
      return 'kill';
    }
    onSplash(point, radius, color) {
      if (this.broken || color !== GREEN) return;
      const c = _c.set(Math.max(this.min.x, Math.min(point.x, this.max.x)), Math.max(this.min.y, Math.min(point.y, this.max.y)), Math.max(this.min.z, Math.min(point.z, this.max.z)));
      if (c.distanceTo(point) < radius + 0.4) this.smash();
    }
    smash(dir = null) {
      if (this.broken) return;
      this.broken = true;
      this.solid.enabled = false;
      this.group.visible = false;
      const fx = W.fx, c = this.c, sz = this.size;
      const col = this.style === 'planks' ? 0x6a4a2a : this.style === 'roots' ? 0x3a3020 : 0x6a7066;
      for (let i = 0, n = fx.budget(36); i < n; i++) {
        _v.set(R(-0.5, 0.5) * sz.x, R(-0.5, 0.5) * sz.y, R(-0.5, 0.5) * sz.z).add(c);
        _w.subVectors(_v, c).normalize().multiplyScalar(R(3, 8));
        if (dir) _w.addScaledVector(dir, 3);
        fx.shard(_v, _w.x, _w.y + 3, _w.z, _col.set(col), 1, R(0.8, 1.4), R(0.1, 0.25));
      }
      fx.burst(c, 0x9a9a7a, { count: 20, speed: 3, life: 1.4, size: 0.6, gravity: 1, mode: 'puff' });
      fx.flash(c, 0x3dff7a, { size: 2.6, life: 0.2, hot: 0.3 });
      const g = near(c);
      if (this.style === 'planks') sfx('wood_break', 'crumble_break', { gain: 1 * g, rate: 1.3, vary: 0.1 });
      else if (this.style === 'roots') sfx('bramble_tear', 'crumble_break', { gain: 1 * g, vary: 0.1 });
      else sfx('crumble_break', 'boss_slam', { gain: 1.1 * g, rate: 0.8, vary: 0.1 });
      game.player.shake = Math.max(game.player.shake, 0.3 * g);
    }
    restore() {
      this.broken = false;
      this.solid.enabled = true;
      this.group.visible = true;
    }
    update(dt) {
      if (this.broken || this.shake <= 0) return;
      this.shake = Math.max(0, this.shake - dt * 3);
      this.group.position.set(this.c.x + Math.sin(W.time * 50) * 0.05 * this.shake, this.c.y, this.c.z);
    }
  }
  const _c = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _col = new THREE.Color();
  const obstacles = [];
  // a barrier across the passage at path position s (thickness along the path)
  function across(s, thick, y0 = 0, h = HH) {
    const p = at(s), g = segAt(s), alongX = Math.abs(g.dir.x) > 0.5;
    return alongX ? [[p.x - thick / 2, p.y + y0, p.z - W5 / 2], [p.x + thick / 2, p.y + y0 + h, p.z + W5 / 2]] : [[p.x - W5 / 2, p.y + y0, p.z - thick / 2], [p.x + W5 / 2, p.y + y0 + h, p.z + thick / 2]];
  }

  // DART PLATES: a row of glowing glyph plates across the floor; step on one and darts fly across the passage
  // from holes in the wall 0.3 s later (keep running and they miss)
  function darts(s) {
    const [mn, mx] = across(s, 1.4, -0.02, 0.06);
    const p = at(s), g = segAt(s), alongX = Math.abs(g.dir.x) > 0.5;
    const plate = new THREE.Mesh(boxGeo(mx[0] - mn[0] - 0.1, 0.05, mx[2] - mn[2] - 0.1, 0.5), mats.glyph);
    plate.position.set(p.x, p.y + 0.02, p.z);
    W.scene.add(plate);
    const glow = new THREE.Mesh(boxGeo(alongX ? 0.06 : W5 - 0.4, 0.02, alongX ? W5 - 0.4 : 0.06, 0.5), mats.sap);
    glow.position.set(p.x, p.y + 0.055, p.z);
    W.scene.add(glow);
    // the holes in both walls
    for (const sd of [-1, 1]) for (const hy of [1.0, 1.5]) {
      const hx = alongX ? p.x : p.x + sd * (W5 / 2 - 0.02), hz = alongX ? p.z + sd * (W5 / 2 - 0.02) : p.z;
      K.put(mats.pipeDark, new THREE.CircleGeometry(0.09, 8).rotateY(alongX ? (sd > 0 ? PI : 0) : (sd > 0 ? -PI / 2 : PI / 2)), hx, p.y + hy, hz);
    }
    const dartGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4).rotateX(PI / 2);
    if (!alongX) dartGeo.rotateY(PI / 2);
    const dartMat = new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 0.8 });
    const flying = [0, 1, 2, 3].map(() => {
      const m = new THREE.Mesh(dartGeo, dartMat);
      m.visible = false;
      W.scene.add(m);
      return m;
    });
    const st = { t: -1, cool: 0 };
    resets.push(() => ((st.t = -1), (st.cool = 0), flying.forEach((m) => (m.visible = false))));
    W.trigger(mn, [mx[0], mx[1] + 0.4, mx[2]], () => {
      if (st.t >= 0 || st.cool > 0) return;
      st.t = 0;
      sfx('dart_click', 'step_stone1', { gain: 1, rate: 0.6, vary: 0 });
      glow.scale.setScalar(1.5);
    }, { once: false });
    W.add({
      update(dt, player) {
        st.cool -= dt;
        if (st.t < 0) return;
        st.t += dt;
        if (st.t >= 0.3 && st.t - dt < 0.3) {
          sfx('dart_trap', 'fish_dart', { gain: 1.1 * near(p), vary: 0.05 });
          flying.forEach((m) => (m.visible = true));
        }
        if (st.t >= 0.3) {
          const k = Math.min(1, (st.t - 0.3) / 0.25);
          flying.forEach((m, i) => {
            const sd = i % 2 ? 1 : -1, hy = i < 2 ? 1.0 : 1.5;
            const off = sd * (W5 / 2) * (1 - 2 * k);
            m.position.set(alongX ? p.x + (i - 1.5) * 0.25 : p.x + off, p.y + hy, alongX ? p.z + off : p.z + (i - 1.5) * 0.25);
          });
          // the dart volume: the plate's strip, chest and head height, while they fly
          if (k < 1 && player.pos.y < p.y + 2 && player.pos.y > p.y - 1 && Math.abs((alongX ? player.pos.x - p.x : player.pos.z - p.z)) < 0.75 && Math.abs((alongX ? player.pos.z - p.z : player.pos.x - p.x)) < W5 / 2 + 0.2 && !game.godMode) player.damage(1, 'dart');
        }
        if (st.t > 0.6) {
          st.t = -1;
          st.cool = 0.8;
          flying.forEach((m) => (m.visible = false));
          glow.scale.setScalar(1);
        }
      },
    });
  }

  // A SWINGING SPIKED LOG: hung from the ceiling across the passage, swinging along it; dash under while it's away
  const pendulums = [];
  function pendulum(s, phase) {
    const p = at(s), g = segAt(s), alongX = Math.abs(g.dir.x) > 0.5;
    const pivotY = p.y + HH - 0.2, len = 3.7, amp = 1.05, period = 2.3;
    const pivot = new THREE.Group();
    pivot.position.set(p.x, pivotY, p.z);
    const swing = new THREE.Group();
    pivot.add(swing);
    const logGeo = new THREE.CylinderGeometry(0.5, 0.5, W5 - 0.5, 10).rotateX(PI / 2);
    if (alongX) logGeo.rotateY(0);
    else logGeo.rotateY(PI / 2);
    const log = new THREE.Mesh(logGeo, mats.bark);
    log.position.y = -len;
    swing.add(log);
    for (let i = 0; i < 9; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 5), new THREE.MeshStandardMaterial({ color: 0x9a9a8a, metalness: 0.6, roughness: 0.4 }));
      const u = (i / 8 - 0.5) * (W5 - 0.8), a = (i % 3) * 2.1;
      const nx = Math.cos(a), ny = Math.sin(a);
      if (alongX) sp.position.set(nx * 0.6, -len + ny * 0.6, u);
      else sp.position.set(u, -len + ny * 0.6, nx * 0.6);
      sp.lookAt(alongX ? new THREE.Vector3(nx * 3, -len + ny * 3, u) : new THREE.Vector3(u, -len + ny * 3, nx * 3));
      sp.rotateX(PI / 2);
      swing.add(sp);
    }
    for (const sd of [-1, 1]) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 5), new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 1 }));
      rope.position.set(alongX ? 0 : sd * 1.6, -len / 2, alongX ? sd * 1.6 : 0);
      swing.add(rope);
    }
    W.scene.add(pivot);
    const st = { t: phase * period, broken: false, paused: false };
    pendulums.push({ s, st, pivot });
    trapS.push(s);
    // goo freezes it mid-swing (a burst on the log: it hangs there for a few seconds while you slip past)
    const stick = W.goo?.registerStickable({ group: swing }, { box: (out) => out.setFromObject(log), freeze: false, duration: 4, parent: swing, onStick: () => (st.paused = true), onUnstick: () => (st.paused = false) });
    resets.push(() => ((st.broken = false), (pivot.visible = true), (st.t = phase * period), (st.paused = false), stick?.unstick?.()));
    const lp = new THREE.Vector3();
    let lastSide = 0;
    W.add({
      update(dt, player) {
        if (st.broken || !run.active) return;
        if (!st.paused) st.t += dt;
        const th = amp * Math.sin((st.t / period) * PI * 2);
        if (alongX) swing.rotation.z = th * Math.sign(g.dir.x);
        else swing.rotation.x = -th * Math.sign(g.dir.z);
        // where the log is: offset along the path, raised on its arc
        const off = Math.sin(th) * len, y = pivotY - Math.cos(th) * len;
        lp.set(p.x + g.dir.x * off, y, p.z + g.dir.z * off);
        const side = Math.sign(th);
        if (side !== lastSide && Math.abs(th) < 0.2) sfx('swing_whoosh', 'vine_whip', { gain: 0.7 * near(lp, 25), rate: 0.7, vary: 0.1 });
        lastSide = side;
        const pp = player.pos;
        const dAlong = alongX ? Math.abs(pp.x - lp.x) : Math.abs(pp.z - lp.z);
        const dAcross = alongX ? Math.abs(pp.z - p.z) : Math.abs(pp.x - p.x);
        if (dAlong < 0.85 && dAcross < W5 / 2 + 0.2 && pp.y < lp.y + 0.5 && pp.y + 1.75 > lp.y - 0.5 && !game.godMode) player.damage(1, 'crush');
      },
    });
  }

  // A STONE DOOR grinding down out of the ceiling as you come (it starts when you're 10 m off and takes 2.4 s)
  const doors = [];
  function closingDoor(s) {
    const [mn, mx] = across(s, 0.7, 0, HH);
    const size = new THREE.Vector3(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(boxGeo(size.x, size.y, size.z, 0.5), mats.glyph));
    const lip = new THREE.Mesh(boxGeo(size.x + 0.04, 0.12, size.z + 0.04, 0.5), mats.sap);
    lip.position.y = -size.y / 2 + 0.06;
    g.add(lip);
    W.scene.add(g);
    const cy = (mn[1] + mx[1]) / 2;
    const sol = W.addSolid(new THREE.Vector3(...mn), new THREE.Vector3(...mx), { kind: 'stone', enabled: false });
    sol.enabled = false;
    const d = { s, k: 0, state: 'up' };
    const place = () => {
      g.position.set((mn[0] + mx[0]) / 2, cy + size.y * (1 - d.k), (mn[2] + mx[2]) / 2);
      // only the part that's come down blocks you (a solid that grows down from the ceiling)
      sol.min.y = mx[1] - size.y * d.k;
      sol.enabled = d.k > 0.05 && d.state !== 'smashed';
    };
    place();
    resets.push(() => ((d.k = 0), (d.state = 'up'), (g.visible = true), place()));
    doors.push(d);
    W.add({
      update(dt) {
        if (d.state === 'up' && run.active && run.ps > s - 10 && run.ps < s) {
          d.state = 'closing';
          sfx('stone_grind', 'temple_rumble', { gain: 0.9, rate: 1.3, vary: 0.05 });
        }
        if (d.state === 'closing') {
          d.k = Math.min(1, d.k + dt / 2.4);
          if (Math.random() < dt * 20) W.fx.edgeDust?.(mn[0], mx[0], mx[1] - size.y * d.k, mn[2], mx[2]);
          if (d.k >= 1) {
            d.state = 'shut';
            sfx('stone_slam', 'gate_slam', { gain: 1 * near(g.position), vary: 0.05 });
          }
          place();
        }
      },
    });
    d.smash = () => {
      if (d.state === 'smashed') return;
      d.state = 'smashed';
      g.visible = false;
      sol.enabled = false;
      W.fx.burst(g.position, 0x8a8a7a, { count: 26, speed: 6, life: 1, size: 0.5, gravity: 8 });
    };
  }

  // FLAME JETS: vents in both walls cough fire across the passage on a cycle (a glow and a hiss warn you first)
  function flames(s, phase) {
    const p = at(s), g = segAt(s), alongX = Math.abs(g.dir.x) > 0.5;
    const period = 2.6, warn = 0.5, burn = 0.9;
    for (const sd of [-1, 1]) {
      const vx = alongX ? p.x : p.x + sd * (W5 / 2 - 0.1), vz = alongX ? p.z + sd * (W5 / 2 - 0.1) : p.z;
      K.put(mats.pipeDark, alongX ? boxGeo(1.0, 0.6, 0.3, 0.5) : boxGeo(0.3, 0.6, 1.0, 0.5), vx, p.y + 1.1, vz);
    }
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const sheet = new THREE.Mesh(alongX ? new THREE.BoxGeometry(1.0, 1.6, W5) : new THREE.BoxGeometry(W5, 1.6, 1.0), glowMat);
    sheet.position.set(p.x, p.y + 1.1, p.z);
    W.scene.add(sheet);
    const st = { t: phase * period };
    trapS.push(s);
    flameStates.push({ st, period });
    resets.push(() => (st.t = phase * period));
    W.add({
      update(dt, player) {
        st.t += dt;
        const c = st.t % period;
        const lit = c > period - burn;
        const warning = !lit && c > period - burn - warn;
        glowMat.opacity = lit ? 0.55 + 0.25 * Math.sin(st.t * 40) : warning ? 0.08 : 0;
        if (player.pos.distanceTo(sheet.position) > 30) return;
        if (warning && Math.random() < dt * 30) W.fx.ember(_v.set(p.x + R(-0.3, 0.3), p.y + 1.1, p.z + R(-0.3, 0.3)), 0, 1, 0, 0xff8a2a, 0.3, 0.08);
        if (lit) {
          if (Math.random() < dt * 60) {
            const sd = rand() < 0.5 ? -1 : 1;
            W.fx.ember(_v.set(alongX ? p.x + R(-0.4, 0.4) : p.x + sd * W5 / 2, p.y + R(0.5, 1.7), alongX ? p.z + sd * W5 / 2 : p.z + R(-0.4, 0.4)), alongX ? 0 : -sd * 9, R(0, 2), alongX ? -sd * 9 : 0, 0xff7a1a, 0.35, 0.3);
          }
          if (c - dt <= period - burn) sfx('fire_whoosh', 'lava_sizzle', { gain: 0.9 * near(sheet.position, 25), rate: 0.8, vary: 0.1 });
          const pp = player.pos;
          if (Math.abs(alongX ? pp.x - p.x : pp.z - p.z) < 0.85 && Math.abs(alongX ? pp.z - p.z : pp.x - p.x) < W5 / 2 + 0.2 && pp.y < p.y + 2 && pp.y > p.y - 1 && !game.godMode) player.damage(1, 'burn');
        }
      },
    });
  }

  // ---- lay them out (s along the run; the passages begin at the east door)
  const sDoor = sOf(-24, -380);
  const S1 = sOf(-6, -380), S2 = sOf(-6, -346), S3 = sOf(-28, -346), S4 = sOf(-28, -321), S5 = sOf(-12, -321), S6 = sOf(-12, -330);
  // gaps first (the floor builder leaves them open): the spike pit, the crumbling floor, the last leap
  const pitA = [S1 + 18.5, S1 + 21.5], crumbleA = [S2 + 4, S2 + 12], crumbleB = [S6 + 5, S6 + 8];
  gaps.push(pitA, crumbleA, crumbleB);
  buildPassages();
  // the spike pit (seg 2)
  {
    const a = at(pitA[0]), b = at(pitA[1]);
    const y = Math.min(a.y, b.y) - 3.5;
    slab(mats.granite, -6 - W5 / 2, y - 1, Math.min(a.z, b.z), -6 + W5 / 2, y, Math.max(a.z, b.z));
    slab(mats.granite, -6 - W5 / 2, y, Math.min(a.z, b.z) - 0.5, -6 + W5 / 2, a.y, Math.min(a.z, b.z));
    slab(mats.granite, -6 - W5 / 2, y, Math.max(a.z, b.z), -6 + W5 / 2, b.y, Math.max(a.z, b.z) + 0.5);
    B.spikes([-6 - W5 / 2, y, Math.min(a.z, b.z)], [-6 + W5 / 2, y + 0.7, Math.max(a.z, b.z)], { color: null });
    // (a green burst over it lays a goo membrane you can run across instead of jumping)
    W.goo?.addGap({ min: [-6 - W5 / 2, y, Math.min(a.z, b.z)], max: [-6 + W5 / 2, Math.min(a.y, b.y), Math.max(a.z, b.z)] }, { axis: 'y', duration: 8 });
    for (const sd of [-1, 1]) K.put(mats.sap, boxGeo(0.06, 0.05, Math.abs(b.z - a.z), 0.5), -6 + sd * (W5 / 2 - 0.05), a.y + 0.03, (a.z + b.z) / 2);
  }
  // the crumbling floor (seg 3) and the last leap (seg 7): slabs that fall away under you, a pit beneath
  for (const [g1, g2, along] of [[crumbleA[0], crumbleA[1], 'x'], [crumbleB[0], crumbleB[1], 'x']]) {
    const a = at(g1), b = at(g2);
    const y = Math.min(a.y, b.y) - 4;
    slab(mats.granite, Math.min(a.x, b.x), y - 1, a.z - W5 / 2, Math.max(a.x, b.x), y, a.z + W5 / 2);
    B.spikes([Math.min(a.x, b.x), y, a.z - W5 / 2], [Math.max(a.x, b.x), y + 0.7, a.z + W5 / 2], { color: null });
    const n = Math.max(1, Math.round(Math.abs(b.x - a.x) / 2.6));
    for (let i = 0; i < n; i++) {
      const x1 = Math.min(a.x, b.x) + (Math.abs(b.x - a.x) * i) / n, x2 = Math.min(a.x, b.x) + (Math.abs(b.x - a.x) * (i + 1)) / n;
      const yy = a.y + (b.y - a.y) * ((i + 0.5) / n);
      B.crumble({ min: [x1 + 0.03, yy - 0.5, a.z - W5 / 2 + 0.03], max: [x2 - 0.03, yy, a.z + W5 / 2 - 0.03], delay: 0.45, respawn: 0, zone: 'green', kind: 'rock' });
    }
    void along;
  }
  darts(S1 - 6);
  new Breakable(...across(S1 - 2.2, 0.6), 'planks');
  pendulum(S1 + 7, 0);
  pendulum(S1 + 13, 0.5);
  new Breakable(...across(S1 + 27, 1.4), 'rubble');
  new Breakable(...across(S2 + 17, 0.9), 'roots');
  closingDoor(S3 + 6);
  darts(S3 + 12);
  closingDoor(S3 + 18);
  flames(S4 + 5, 0);
  flames(S4 + 10, 0); // (in step: both burn together, then a clear window to run both)
  new Breakable(...across(S5 + 4.5, 0.8), 'cracked');
  const notSwamp = (p) => !(p.y > -2 && p.z > -301.5);
  F.groupVisible(K.flush(), notSwamp); // (the ruin so far and the passages)

  // ---------------------------------------------------------------- the boulder
  const boulder = new THREE.Group();
  {
    const g = new THREE.IcosahedronGeometry(BR, 3);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = _v.fromBufferAttribute(p, i), n = 1 + 0.035 * Math.sin(v.x * 3.1) * Math.sin(v.y * 2.7 + v.z * 1.9);
      p.setXYZ(i, v.x * n, v.y * n, v.z * n);
    }
    g.computeVertexNormals();
    const rock = new THREE.MeshStandardMaterial({ color: 0x7a8072, roughness: 0.95, flatShading: true });
    const body = new THREE.Mesh(g, rock);
    const spin = new THREE.Group();
    spin.add(body);
    // carved glyph bands and moss on it
    for (const rx of [0, PI / 2]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(BR * 0.99, 0.16, 5, 32), mats.glyph);
      band.rotation.x = rx;
      spin.add(band);
    }
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(R(0.4, 0.7), 1).scale(1, 0.4, 1), mats.moss);
      _v.randomDirection().multiplyScalar(BR * 0.95);
      m.position.copy(_v);
      m.lookAt(_w.copy(_v).multiplyScalar(2));
      spin.add(m);
    }
    boulder.add(spin);
    boulder.userData.spin = spin;
    W.scene.add(boulder);
  }
  const jam = new THREE.Vector3(1.6, 18 + BR, -330);
  const boulderSolid = W.addSolid(new THREE.Vector3(jam.x - BR, 18, jam.z - BR), new THREE.Vector3(jam.x + BR, 18 + 2 * BR, jam.z + BR), { kind: 'stone', enabled: false });
  boulderSolid.enabled = false;
  const run = { armed: false, active: false, done: false, bs: 0, ps: 0, v: 0, t: 0, loop: null, rumbleT: 0 };
  const _axis = new THREE.Vector3(), _qq = new THREE.Quaternion(), _bp = new THREE.Vector3();
  function placeBoulder(s) {
    at(s, _bp);
    boulder.position.set(_bp.x, _bp.y + BR, _bp.z);
  }
  function resetRun() {
    run.active = false;
    run.bs = 0;
    run.v = 0;
    run.t = 0;
    placeBoulder(0);
    nicheSlab.visible = true;
    for (const f of resets) f();
    run.loop?.setGain(0);
  }
  function jamIt() {
    boulder.position.copy(jam);
    nicheSlab.visible = false;
    boulderSolid.enabled = true;
    run.active = false;
    run.done = true;
    run.loop?.setGain(0);
  }
  resetRun();
  if (game.clearedEncounters?.has(ESCAPE_ID)) jamIt();
  // (the run's checkpoint: the sanctum fight's beacon on the pyramid's top, east edge; every attempt starts there)
  // start: step onto the east bridge with the run armed
  W.trigger([S.cx + 4.2, top - 0.5, S.cz - 2.5], [S.cx + 7, top + 3, S.cz + 2.5], () => {
    if (!run.armed || run.active || run.done) return;
    run.active = true;
    run.t = 0;
    run.bs = 0;
    nicheSlab.visible = false;
    const np = nicheSlab.position;
    W.fx.burst(np, 0x8a8a7a, { count: 40, speed: 7, life: 1.2, size: 0.6, gravity: 9 });
    for (let i = 0; i < 20; i++) W.fx.shard(np, R(2, 8), R(0, 5), R(-4, 4), _col.set(0x6a7066), 1, R(0.8, 1.4), R(0.15, 0.35));
    sfx('stone_slam', 'sphinx_slam', { gain: 1.3, vary: 0 });
    quake(1.8);
    cradle.shudder(1);
    game.setMusic(audio.musicOr('music_escape', 'music_ascent'));
    run.loop ??= audio.createLoop('boulder_roll', { gain: 0 });
    game.hud.zoneTitle('', 'RUN!', '#ffcf5a', 1.6);
    setTimeout(() => run.active && game.hud.message(`Blast what's in your way with ${G_('globs')} (hold to charge: a charged glob flies straight). Goo freezes the traps. <b>Don't stop.</b>`, 5), 1500);
  }, { once: false });
  onRespawn(() => {
    if (run.done) return;
    resetRun();
  });
  // the chase
  W.add({
    update(dt, player) {
      if (!run.active) return;
      run.t += dt;
      const pr = project(player.pos, run.ps);
      if (pr.d < 6) run.ps = pr.s;
      const gap = run.ps - run.bs;
      // a little faster when you're far ahead, a little slower when it's close, never stopping; it eases off
      // while an obstacle you haven't cleared stands just ahead of you
      let v = THREE.MathUtils.clamp(6.0 + 0.3 * (gap - 10), 4.4, 9.5);
      if (run.t < 1.2) v = Math.min(v, 2 + run.t * 4); // (it has to get going)
      for (const o of obstacles) {
        if (o.broken) continue;
        const so = project(o.c, run.ps).s;
        if (so > run.ps - 1 && so < run.ps + 6 && gap < 14) v = Math.min(v, 3.4);
      }
      for (const ts of trapS) if (ts > run.ps - 0.5 && ts < run.ps + 5 && gap < 14) v = Math.min(v, 3.6);
      run.v += (v - run.v) * Math.min(1, dt * 3);
      const end = total - 0; // (the jam point)
      run.bs = Math.min(end, run.bs + run.v * dt);
      placeBoulder(run.bs);
      // roll it
      const g = segAt(run.bs);
      _axis.set(g.dir.z, 0, -g.dir.x);
      _qq.setFromAxisAngle(_axis, (-run.v * dt) / BR);
      boulder.userData.spin.quaternion.premultiply(_qq);
      // smash what's in its way
      for (const p of pendulums) if (!p.st.broken && Math.abs(p.s - run.bs) < BR + 0.5) {
        p.st.broken = true;
        p.pivot.visible = false;
        W.fx.burst(p.pivot.position.clone().setY(p.pivot.position.y - 3.7), 0x5a4a2a, { count: 30, speed: 7, life: 1, size: 0.3, gravity: 10 });
        sfx('wood_break', 'crumble_break', { gain: 0.8 * near(p.pivot.position), vary: 0.1 });
      }
      for (const d of doors) if (d.state !== 'smashed' && Math.abs(d.s - run.bs) < BR + 0.4) d.smash();
      for (const o of obstacles) if (!o.broken && o.c.distanceTo(boulder.position) < BR + 1) o.smash();
      // the sound, the shake, the dust it raises
      const dist = boulder.position.distanceTo(player.pos);
      run.loop?.setGain(Math.max(0, 1 - dist / 40) * 1.1);
      run.loop?.setRate(0.8 + run.v * 0.05);
      player.shake = Math.max(player.shake, 0.32 * Math.max(0, 1 - dist / 22));
      run.rumbleT -= dt;
      if (run.rumbleT <= 0) {
        run.rumbleT = 0.6;
        if (!run.loop || !audio.available?.has('boulder_roll')) audio.sample(audio.sfxOr('temple_rumble', 'root_rumble'), { gain: 0.5 * Math.max(0.2, 1 - dist / 30), rate: 1.2, vary: 0.1 });
        W.fx.burst(_v.copy(boulder.position).setY(boulder.position.y - BR + 0.2), 0x8a8a6a, { count: 6, speed: 2, life: 1.2, size: 0.6, gravity: 1, mode: 'puff' });
      }
      // caught
      const dx = player.pos.x - boulder.position.x, dz = player.pos.z - boulder.position.z;
      const dy = player.pos.y + 0.9 - boulder.position.y;
      if (Math.hypot(dx, dz) < BR + 0.35 && Math.abs(dy) < BR + 0.6 && !game.godMode && !player.dead) {
        player.damage(1, 'crush');
        player.shake = 1;
        sfx('stone_slam', 'boss_slam', { gain: 1.2, vary: 0 });
      }
      // out: the player's on the bridge; the boulder wedges itself in the mouth
      if (run.bs >= end - 0.01) {
        jamIt();
        sfx('stone_slam', 'sphinx_slam', { gain: 1.4, vary: 0 });
        sfx('crumble_break', 'boss_slam', { gain: 1, rate: 0.6, vary: 0 });
        W.fx.burst(jam.clone().setX(jam.x + 2), 0x9a9a7a, { count: 50, speed: 6, life: 1.8, size: 0.9, gravity: 1, mode: 'puff' });
        for (let i = 0; i < 24; i++) W.fx.shard(jam, R(2, 9), R(1, 6), R(-4, 4), _col.set(0x6a7066), 1, R(1, 2), R(0.15, 0.4));
        player.shake = Math.max(player.shake, 0.8);
      }
    },
  });
  // the bridge's checkpoint (the boulder jams the mouth behind you: there's no going back in)
  new Checkpoint(W, game, { pos: [BRIDGE.x1 + 1.6, BRIDGE.y, BRIDGE.z], yaw: EAST, size: [2, 3, BRIDGE.w] });
  // escaped: past the lip of the mouth (the boulder may still be on its way: it jams behind you)
  W.trigger([BRIDGE.x1, BRIDGE.y - 2, BRIDGE.z - 3], [BRIDGE.x1 + 3, BRIDGE.y + 4, BRIDGE.z + 3], () => {
    if (run.done && game.clearedEncounters?.has(ESCAPE_ID)) return;
    if (!game.clearedEncounters?.has(ESCAPE_ID)) {
      game.clearedEncounters?.add(ESCAPE_ID);
      setTimeout(() => game.hud.message('Out. <b>Look back.</b>', 3), 1400);
      if (run.active) run.bs = Math.max(run.bs, total - 8); // (it's right behind you: let it jam now)
      else jamIt();
      game.setMusic(audio.musicOr('music_green', 'music_green'));
    }
  }, { once: false });

  // ---------------------------------------------------------------- THE MONKEY FACE and the gorge
  buildFace();
  buildBridge();
  F.groupVisible(K.flush(), notSwamp);

  // ---------------------------------------------------------------- objectives
  function objective(p) {
    if (p.x > BRIDGE.x1 - 0.5 && p.x < BRIDGE.x2 + 0.5 && Math.abs(p.z - BRIDGE.z) < 3 && p.y > 14) return 'Across the rope bridge to the landing.';
    if (run.active) {
      const ahead = obstacles.find((o) => !o.broken && project(o.c, run.ps).s > run.ps - 1 && project(o.c, run.ps).s < run.ps + 9);
      return ahead ? `${G_('Blast')} it out of the way — <b>now</b>!` : '<b>RUN!</b> Don\'t stop.';
    }
    const inSanctum = p.x > S.x1 && p.x < S.x2 && p.z > S.z1 && p.z < S.z2 && p.y > S.floor - 1;
    if (run.armed && !run.done && inSanctum) return p.y < top - 0.5 ? 'Climb back up the pyramid: the way out is the <b>high door east</b> of its top.' : 'Out through the high door <b>east</b>!';
    if (run.armed && !run.done && project(p).d < 4 && p.y > 15) return 'Out, toward the daylight!';
    return '';
  }
  devStart('verdant11', [S.cx + 3, top, S.cz], EAST, [0, 1, 2], 'The boulder escape');
  devStart('verdant14', [BRIDGE.x1 + 1.5, BRIDGE.y, BRIDGE.z], EAST, [0, 1, 2], 'The monkey\'s mouth and the rope bridge');

  return {
    objective,
    get armed() {
      return run.armed;
    },
    arm() {
      if (run.armed) return;
      run.armed = true;
    },
    run,
    obstacles,
    flameClock: () => (flameStates[0] ? flameStates[0].st.t % flameStates[0].period : null),
    path: { at, project, total, segs },
    done() {
      if (!game.clearedEncounters?.has(ESCAPE_ID)) game.clearedEncounters?.add(ESCAPE_ID);
      jamIt();
    },
  };

  // ================================================================ the face
  // A colossal ape's head carved into the cliff's east face, x 0 (eyes, brow, broad nose, a gaping muzzle whose
  // mouth is the passage out, fangs, round ears, a stepped crown), moss and vines all over it, its eyes glowing.
  function buildFace() {
    const cx = 0, cz = -330, faceMat = mats.granite;
    const put = (m, g, x, y, z) => K.put(m, g, x, y, z);
    const ell = (rx, ry, rz, d = 2) => new THREE.IcosahedronGeometry(1, d).scale(rx, ry, rz);
    // the cliff: the mountain's east face from the gorge floor to the summit, holed for the mouth
    const C1 = -364, C2 = -300.5;
    slab(faceMat, -3, -30, C1, cx, 52, cz - 2.6, true, 'rock');
    slab(faceMat, -3, -30, cz + 2.6, cx, 52, C2, true, 'rock');
    slab(faceMat, -3, -30, cz - 2.6, cx, 18, cz + 2.6, true, 'rock');
    slab(faceMat, -3, 23.5, cz - 2.6, cx, 52, cz + 2.6, true, 'rock');
    for (let i = 0; i < 26; i++) {
      // ledges and buttresses breaking up the cliff away from the face
      const z = rand() < 0.5 ? R(C1, -354) : R(-306, C2), y = R(-25, 46), w = R(2, 5), h = R(3, 12);
      put(faceMat, boxGeo(R(0.6, 2), h, w, 0.12), R(0.3, 1), y, z);
      K.mossCap(0.6, y + h / 2, z, w * 0.5, 0.3);
    }
    // the head: an oval face plate framed by a mane of stone tufts, a heavy brow over deep sockets and glowing
    // eyes, a flat broad nose, a great protruding muzzle split by the gaping mouth (the way out), fangs, C-shaped
    // ears, and a stepped temple crown
    const dark = new THREE.MeshStandardMaterial({ color: 0x141a14, roughness: 1, flatShading: true });
    const pale = new THREE.MeshStandardMaterial({ map: mats.granite.map, color: 0xc8d0bc, roughness: 0.9 });
    put(faceMat, ell(2.6, 17.5, 16, 3), cx + 0.4, 30, cz); // the face plate
    for (let i = 0; i < 34; i++) {
      // the mane: rough tufts round the oval
      const a = (i / 34) * PI * 2, rz = 16.5 + R(-0.8, 1.2), ry = 18 + R(-0.8, 1.2);
      const y = 30 + Math.sin(a) * ry, z = cz + Math.cos(a) * rz;
      if (y < 15) continue;
      put(faceMat, new THREE.DodecahedronGeometry(R(2, 3.2), 0).scale(0.8, 1.3, 1), cx + R(1, 2.2), y, z);
    }
    put(pale, ell(3.4, 2.1, 12.5), cx + 3.6, 36.6, cz); // the brow
    for (const s of [-1, 1]) {
      put(pale, ell(2.8, 1.5, 5).rotateX(s * 0.18), cx + 4.4, 35.9, cz + s * 5.4); // brow arches
      put(dark, ell(1.3, 2.5, 3.5), cx + 3.7, 32.3, cz + s * 5.5); // sockets
      put(pale, ell(2.5, 1.3, 3.6), cx + 4.1, 29.3, cz + s * 6.2); // cheekbones
      put(faceMat, ell(3.6, 4.2, 4.2), cx + 3.2, 23.2, cz + s * 9.6); // the muzzle's cheeks
      // ears: a C of stone, a dark hollow in it
      put(faceMat, new THREE.TorusGeometry(4.2, 1.4, 6, 18, PI * 1.55).rotateY(PI / 2).rotateX(s > 0 ? -0.55 : PI + 0.55), cx + 0.9, 31, cz + s * 18.2);
      put(dark, new THREE.CylinderGeometry(2.8, 2.8, 0.6, 16).rotateZ(PI / 2), cx + 0.6, 31, cz + s * 18.2);
    }
    put(pale, ell(2.1, 3.6, 2.1), cx + 4.6, 30.8, cz); // the bridge of the nose
    put(pale, ell(3.1, 1.9, 4.3), cx + 6.4, 27.4, cz); // the nose
    for (const s of [-1, 1]) put(dark, ell(0.8, 0.9, 1.05), cx + 9.0, 27.0, cz + s * 1.7); // nostrils
    // the muzzle: the upper lip over the mouth and the lower jaw under it (the mouth between: 18..23.5)
    put(pale, ell(6.4, 3.0, 9.6), cx + 4.2, 25.7, cz);
    put(faceMat, ell(5.8, 3.3, 8.2), cx + 3.6, 14.6, cz);
    put(faceMat, ell(4, 2.2, 5), cx + 4.6, 12.4, cz); // the chin
    put(dark, boxGeo(6.2, 5.4, 15, 0.5), cx + 2.6, 20.8, cz); // the dark inside of the mouth
    slab(faceMat, cx, 17, cz - 6, cx + 6.6, 18, cz + 6, true, 'stone'); // the jaw's top: the floor out
    slab(faceMat, cx, 23.5, cz - 6, cx + 6.4, 24.5, cz + 6, true, 'stone'); // (under the lip: a ceiling)
    for (const s of [-1, 1]) {
      slab(dark, cx, 18, cz + s * 2.6, cx + 2, 23.5, cz + s * 6, true, 'stone'); // the mouth's sides
      put(pale, new THREE.ConeGeometry(0.7, 3.2, 6).rotateZ(PI), cx + 6.3, 22.2, cz + s * 3.2); // fangs, upper
      put(pale, new THREE.ConeGeometry(0.6, 2.6, 6), cx + 6.1, 19.3, cz + s * 4.4); // fangs, lower
      for (let i = 0; i < 4; i++) put(pale, new THREE.ConeGeometry(0.32, 1, 5).rotateZ(PI), cx + 6.6, 23, cz + s * (4.1 + i * 0.85)); // teeth
    }
    // the eyes: deep green, glowing, with a halo
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dff7a).multiplyScalar(2.2) });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(1.25, 16, 12), eyeMat);
      eye.position.set(cx + 4.6, 32.0, cz + s * 5.5);
      W.scene.add(eye);
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateY(PI / 2), new THREE.MeshBasicMaterial({ map: F.FM.blob, color: 0x3dff7a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.set(cx + 5.4, 32.0, cz + s * 5.5);
      W.scene.add(halo);
    }
    // the crown: a stepped temple headdress, glyph-banded, a jade disc at its front
    for (const [w, h, y] of [[28, 2.4, 47.5], [21, 2.4, 49.9], [14, 2.6, 52.3], [7, 3.2, 55]]) {
      put(faceMat, boxGeo(5, h, w, 0.3), cx + 1.5, y, cz);
      put(mats.glyph, boxGeo(5.1, h * 0.4, w + 0.1, 0.6), cx + 1.5, y, cz);
    }
    put(mats.jade, new THREE.CylinderGeometry(2.2, 2.2, 0.5, 20).rotateZ(PI / 2), cx + 4.1, 50, cz);
    // moss, vines and roots all over it
    for (let i = 0; i < 70; i++) {
      const z = R(cz - 22, cz + 22), y = R(10, 50);
      F.vineStrand(R(1, 5.5), y, z, R(2, 12), 0.18);
    }
    for (let i = 0; i < 24; i++) K.mossCap(R(1, 7), R(14, 48), R(cz - 18, cz + 18), R(0.8, 2), 0.35);
    for (let i = 0; i < 8; i++) {
      const z = R(cz - 20, cz + 20);
      K.limb([[0.5, 52, z], [R(3, 6), R(36, 46), z + R(-3, 3)], [R(2, 7), R(20, 30), z + R(-4, 4)], [R(0.5, 3), R(4, 12), z + R(-4, 4)]], R(0.35, 0.6), 0.12, mats.bark, 6);
    }
    // a light at the mouth: the daylight you run toward (and a soft glow filling the opening, seen from inside)
    const day = new THREE.Mesh(new THREE.PlaneGeometry(6, 6).rotateY(-PI / 2), new THREE.MeshBasicMaterial({ map: F.FM.blob, color: 0xd8f0c0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    day.position.set(cx + 6.8, 20.6, cz);
    W.scene.add(day);
    B.light(8, 22, cz, 0xfff0c8, 26, 26);
    // the gorge below: mist on the water far down, rock pillars, a kill zone (fall and you're back at the run's end)
    for (let i = 0; i < 10; i++) F.mist(R(4, 26), R(-4, 2), R(-360, -302), R(14, 24), R(14, 24));
    for (const [x, z, h] of [[9, -312, 22], [22, -348, 26], [12, -356, 18], [24, -310, 15]]) {
      put(faceMat, new THREE.CylinderGeometry(R(1.5, 2.5), R(2.5, 3.5), h, 8), x, -10 + h / 2, z);
      K.mossCap(x, -10 + h, z, 2.2, 0.4);
      for (let k = 0; k < 4; k++) F.vineStrand(x + R(-1.5, 1.5), -10 + h, z + R(-1.5, 1.5), R(3, 8), 0.16);
    }
    B.killZone([0, -40, -366], [27, 4, -300.5]);
    slab(faceMat, 0, -30, -301.5, 27, 30, -300.5, false); // (the gorge's south end: a wall of rock)
    for (let x = 1; x < 26; x += R(3, 6)) put(faceMat, boxGeo(R(2, 4), R(10, 30), R(1, 2.5), 0.12), x, R(0, 15), -302 + R(-0.4, 0.4));
    // the gorge's air: the fog opens up out here (the face behind you, the tree ahead)
    W.trigger([cx, 17, cz - 6], [cx + 6.5, 24, cz + 6], () => game.setAtmosphere('verdantGorge'), { once: false });
    W.trigger([-12, 17, cz - 2.5], [cx - 0.2, 24, cz + 2.5], () => game.setAtmosphere('verdantRuin'), { once: false });
  }

  // ================================================================ the rope bridge
  // Wooden planks slung on ropes from the monkey's lip (x 6) to the landing (x 27), sagging, swaying a little.
  function buildBridge() {
    const { x1, x2, y, z, w, sag } = BRIDGE;
    const group = new THREE.Group();
    W.scene.add(group);
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x6a5234, roughness: 0.95, flatShading: true });
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8a7a54, roughness: 1, flatShading: true });
    const yAt = (x) => y - sag * Math.sin(((x - x1) / (x2 - x1)) * PI);
    const n = Math.round((x2 - x1) / 0.55);
    for (let i = 0; i < n; i++) {
      const xa = x1 + ((x2 - x1) * i) / n, xb = x1 + ((x2 - x1) * (i + 1)) / n, xm = (xa + xb) / 2;
      if (i % 11 === 6) continue; // (a missing plank or two)
      const m = new THREE.Mesh(boxGeo(0.46, 0.08, w + R(-0.15, 0.15), 0.5), plankMat);
      m.position.set(xm, yAt(xm) - 0.04, z + R(-0.08, 0.08));
      m.rotation.set(R(-0.03, 0.03), R(-0.06, 0.06), R(-0.02, 0.02));
      group.add(m);
    }
    // collision: a strip of thin boxes following the sag (continuous: the gaps are only for the eye)
    const nc = Math.round((x2 - x1) / 0.8);
    for (let i = 0; i < nc; i++) {
      const xa = x1 + ((x2 - x1) * i) / nc, xb = x1 + ((x2 - x1) * (i + 1)) / nc;
      const t = Math.min(yAt(xa), yAt(xb));
      W.addSolid(new THREE.Vector3(xa, t - 0.3, z - w / 2), new THREE.Vector3(xb + 0.02, t, z + w / 2), { static: true, kind: 'wood' });
    }
    // rails you can't fall over (the ropes), and the posts at both ends
    for (const sd of [-1, 1]) {
      W.addSolid(new THREE.Vector3(x1, y - 1, Math.min(z + sd * (w / 2), z + sd * (w / 2 + 0.3))), new THREE.Vector3(x2, y + 1.6, Math.max(z + sd * (w / 2), z + sd * (w / 2 + 0.3))), { noShot: true });
      const pts = [], low = [];
      for (let i = 0; i <= 24; i++) {
        const x = x1 + ((x2 - x1) * i) / 24;
        pts.push(new THREE.Vector3(x, yAt(x) + 1.1 + sag * 0.3 * Math.sin((i / 24) * PI), z + sd * w / 2));
        low.push(new THREE.Vector3(x, yAt(x) + 0.05, z + sd * w / 2));
      }
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.05, 5), ropeMat));
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(low), 48, 0.04, 5), ropeMat));
      for (let i = 1; i < 24; i += 2) {
        const a = pts[i], b = low[i];
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, a.y - b.y, 4), ropeMat);
        r.position.set(a.x, (a.y + b.y) / 2, a.z);
        group.add(r);
      }
      for (const px of [x1 + 0.2, x2 - 0.2]) {
        K.put(mats.bark, new THREE.CylinderGeometry(0.18, 0.22, 2.2, 7), px, y + 0.6, z + sd * (w / 2 + 0.15));
        K.put(mats.bark, new THREE.CylinderGeometry(0.2, 0.2, 0.25, 7), px, y + 1.7, z + sd * (w / 2 + 0.15));
      }
    }
    // hanging moss and a few vines off the ropes
    for (let i = 0; i < 14; i++) K.hangMoss(R(x1 + 1, x2 - 1), y - 0.2, z + (rand() < 0.5 ? -1 : 1) * w / 2, R(0.4, 1.4), 0.25);
    // the east abutment under the landing's edge (the landing itself: verdantGodTree.js)
    slab(mats.granite, x2 - 0.6, y - 1.5, z - 1.6, x2 + 0.2, y - 0.02, z + 1.6);
    // sway and creak
    let t = 0, creakT = 2;
    W.add({
      update(dt, player) {
        if (Math.abs(player.pos.z - z) > 40 || player.pos.x < -20) return;
        t += dt;
        const on = player.pos.x > x1 && player.pos.x < x2 && Math.abs(player.pos.z - z) < 2 && player.pos.y > y - 2;
        const amp = on ? 0.02 : 0.008;
        group.position.y = Math.sin(t * 1.3) * 0.02;
        group.rotation.x = Math.sin(t * 0.9) * amp;
        group.position.z = z - (Math.cos(group.rotation.x) * z - z) * 0; // (sway about the bridge's own line)
        creakT -= dt * (on && player.speed2d > 1 ? 1.6 : 0.4);
        if (creakT <= 0) {
          creakT = R(1.2, 3);
          audio.sample(audio.sfxOr('rope_bridge_creak', 'mummy_creak'), { gain: on ? 0.7 : 0.25, rate: R(0.85, 1.1), vary: 0.1 });
        }
      },
    });
    // the sway pivots round the bridge's own axis
    group.position.set(0, 0, 0);
    group.children.forEach((c) => (c.position.z -= z));
    group.position.z = z;
    hint([x1, y - 1, z - 2], [x1 + 4, y + 3, z + 2], 'A rope bridge over the gorge. The landing\'s on the far side.', 3);
  }
}
