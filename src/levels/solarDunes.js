// THE DUNE SEA: Solar's on-rails hover-sled run, west of the mesas (x -430 … -212, z -235 … -45).
//
//   buildDuneRun(B, { start, startYaw, end, endYaw, onDone })
//     start: [x, y, z]  the boarding dock (the spot a player stands on it); startYaw: the way the sled
//                       points as you walk aboard (out over the sea: π/2 = west)
//     end:   [x, y, z]  the landing dock; endYaw: the way you face stepping off it (back into Solar: -π/2 = east)
//     onDone()          runs once when the sled has landed you (not again on a reloaded save)
//   Yaws are snapped to quarter turns (the docks are built of axis-aligned boxes). Both docks are meant for
//   Solar's west edge (x ≈ -212); the sled is parked on the sea side of each dock.
//
// The sled leaves the start dock, sweeps west along the south of the sea, up the far side and into the
// Maw (a quicksand whirlpool it circles while the Lumen Excavator rises out of it: shoot out its vents),
// then snakes back across the north and lands you at the end dock. Waves come at it all the way: drones
// swooping in from the flanks and astern, swarms, turrets on the rock spires, scarabs leaping out of the
// quicksand onto the deck, raider skiffs racing alongside. 60-90 s. Yellow at heart, with red worked in so
// you keep switching mid-fight (you have red and yellow by now): red drones and scarabs in the mix, skiffs
// in red shield bubbles, turrets behind red shields, and the Excavator's vents
// bolted under red armor plates you blast off before the yellow vents can be hit.
// Dying mid-run puts you back on the start dock (its checkpoint is taken as you board) with the run reset;
// landing takes the end dock's checkpoint and the run is saved as done (the sled waits at the end dock).
//
// Everything is built here: the dune terrain (one displaced mesh), a quicksand floor under the whole sea
// (sink in it like any Solar quicksand), mesa walls round the edge, dressing (instanced spires and wrecked
// solar panels, a buried collector dish, fallen pylons, skiff wrecks), the docks, the sled and its rider.
import * as THREE from 'three';
import { RED, YELLOW } from '../colors.js';
import { audio } from '../audio.js';
import { director } from '../combat/director.js';
import { spawnEnemy } from '../entities/combat.js';
import { Checkpoint } from '../entities/misc.js';
import { Hovercraft, wrapAngle } from '../entities/hovercraft.js';
import { RaiderSkiff, DuneScarab, Excavator, skiffModel, erupt } from '../entities/duneRaiders.js';
import { MAT } from '../entities/enemyKit.js';

const RUN_ID = 'dunes:run'; // in game.clearedEncounters (saved) once the run is done
const BAND = { x1: -430, x2: -215, z1: -235, z2: -45 }; // the sea's box (all region 'solar')
const TERRAIN = { x1: -430, x2: -212, z1: -235, z2: -45, step: 1.75 };
const ARENA = { x: -320, z: -140, r: 34 }; // the Maw: the sled circles it at radius r
const HOVER = 1.3; // deck height over the sand
const GRAVITY = 16; // the sled's (it floats a little over crests)
const DOCK_REACH = 7.3; // dock point -> the parked sled's middle
const MOOD = { music: 'music_solar', ambient: 'amb_solar', atmosphere: 'solar' };
const SAND_DUST = 0xc9a26a;

const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _r = new THREE.Vector3();
const _c = new THREE.Color();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const DAMP = new THREE.Color(0.32, 0.2, 0.1);

const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const smoothstep = (a, b, x) => smooth01((x - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const fwdOf = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)];

// ---------------------------------------------------------------- noise (deterministic)
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, oct = 3) {
  let s = 0, amp = 0.5, n = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x, z);
    n += amp;
    x = x * 2.03 + 17.1;
    z = z * 2.03 - 9.3;
    amp *= 0.5;
  }
  return s / n;
}

// The dunes before any shaping: long transverse ridges running roughly north-south, each a gentle
// windward slope up to a knife-edge crest and a steep slip face down its east side (the low western sun
// lights the windward faces and leaves the slip faces in shade), smaller cross dunes, and quicksand
// basins where the sand sinks away. Heights are metres over the docks' level.
function rawDunes(x, z) {
  const region = fbm(x * 0.006 + 3.1, z * 0.006 - 1.7, 3);
  const warp = fbm(x * 0.018, z * 0.018, 2) * 5 + Math.sin(z * 0.017 + region * 4) * 2.6;
  const ph = x * 0.04 + warp;
  const f = ph - Math.floor(ph), C = 0.72;
  const ridge = f < C ? Math.pow(f / C, 1.3) : Math.pow(1 - (f - C) / (1 - C), 1.45);
  let h = ridge * (1.4 + 6.8 * smoothstep(0.32, 0.72, region));
  const ph2 = (x * 0.55 + z * 0.83) * 0.075 + fbm(x * 0.03 + 9, z * 0.03, 2) * 3;
  const f2 = ph2 - Math.floor(ph2);
  h += (f2 < 0.75 ? Math.pow(f2 / 0.75, 1.3) : Math.pow(1 - (f2 - 0.75) / 0.25, 1.4)) * 1.0 * (1.1 - region);
  h += (fbm(x * 0.07, z * 0.07, 2) - 0.5) * 0.7;
  const basin = smoothstep(0.37, 0.25, fbm(x * 0.011 + 20, z * 0.011 - 7, 3));
  return h * (1 - basin) - 2.6 * basin;
}

// Height keyframes [s, h] along a leg (h over the docks' level; below -1 is under the quicksand).
function profileAt(keys, s) {
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (s <= keys[i][0]) {
      const [s0, h0] = keys[i - 1], [s1, h1] = keys[i];
      return lerp(h0, h1, smooth01((s - s0) / (s1 - s0)));
    }
  }
  return keys[keys.length - 1][1];
}

// ---------------------------------------------------------------- the rails
// Leg A: start dock -> the Maw (a Catmull-Rom spline); leg M: round the Maw (a circle, as many laps as the
// fight takes); leg B: the Maw -> end dock. Positions are on the sand's level (y is the terrain's job).
// The profiles shape the sand under each leg: rolling dunes, crests to jump, quicksand to skim.
const WAYPOINTS_A = [[-265, -68], [-305, -63], [-345, -70], [-382, -61], [-408, -78], [-419, -110], [-414, -145], [-393, -169], [-363, -178]];
const WAYPOINTS_B = [[-283, -104], [-270, -90], [-248, -92], [-238, -115], [-246, -145], [-262, -170], [-290, -186], [-318, -198], [-340, -208], [-328, -221], [-295, -218], [-260, -208]];
const PROFILE_A = [[0, -2.2], [16, -2.2], [30, 0.4], [55, 1.4], [75, 0.8], [96, 1.8], [113, 4.3], [117, 4.5], [121, 0.2], [130, -2.2], [178, -2.2], [190, 0.6], [212, 2.0], [232, 1.0], [250, 1.6], [268, 4.8], [272, 5.0], [276, 0.8], [296, 1.2], [322, 0.6], [345, 1.4], [370, 0.4], [9999, 0.3]];
const PROFILE_B = [[0, 0.3], [18, 1.0], [32, -2.2], [80, -2.2], [94, 0.8], [118, 2.0], [140, 1.2], [160, 2.2], [176, 5.2], [180, 5.4], [184, 0.6], [204, 1.0], [232, 2.4], [262, 1.2], [300, 0.8], [330, 1.0], [348, -2.2], [9999, -2.2]];
const MAW_H = 0.3;

class Rails {
  constructor(startPark, startYaw, endPark, endYaw) {
    const v = (x, z) => new THREE.Vector3(x, 0, z);
    const [sx, sz] = fwdOf(startYaw), [ex, ez] = fwdOf(endYaw);
    const circ = (th) => v(ARENA.x + Math.cos(th) * ARENA.r, ARENA.z + Math.sin(th) * ARENA.r);
    const A = [v(startPark[0], startPark[1]), v(startPark[0] + sx * 14, startPark[1] + sz * 14), ...WAYPOINTS_A.map(([x, z]) => v(x, z)),
      circ(-Math.PI / 2 - 0.5), circ(-Math.PI / 2 - 0.25), circ(-Math.PI / 2)];
    const Bp = [circ(0), circ(0.25), circ(0.5), ...WAYPOINTS_B.map(([x, z]) => v(x, z)),
      v(endPark[0] - ex * 16, endPark[1] - ez * 16), v(endPark[0] - ex * 6, endPark[1] - ez * 6), v(endPark[0], endPark[1])];
    this.A = new THREE.CatmullRomCurve3(A, false, 'centripetal');
    this.B = new THREE.CatmullRomCurve3(Bp, false, 'centripetal');
    for (const c of [this.A, this.B]) {
      c.arcLengthDivisions = 1200;
      c.updateArcLengths();
    }
    this.lenA = this.A.getLength();
    this.lenB = this.B.getLength();
    this.th0 = -Math.PI / 2; // where leg M starts (the Maw's north point, heading east)
  }

  // position on the sand's level along a leg at distance s
  point(leg, s, out) {
    if (leg === 1) {
      const th = this.th0 + s / ARENA.r;
      return out.set(ARENA.x + Math.cos(th) * ARENA.r, 0, ARENA.z + Math.sin(th) * ARENA.r);
    }
    const c = leg === 0 ? this.A : this.B, len = leg === 0 ? this.lenA : this.lenB;
    return c.getPointAt(THREE.MathUtils.clamp(s / len, 0, 1), out);
  }

  // unit heading (xz) along a leg at s
  tangent(leg, s, out) {
    if (leg === 1) {
      const th = this.th0 + s / ARENA.r;
      return out.set(-Math.sin(th), 0, Math.cos(th));
    }
    const len = leg === 0 ? this.lenA : this.lenB;
    const s0 = Math.max(0, Math.min(len - 1, s - 0.5));
    this.point(leg, s0 + 1, out);
    this.point(leg, s0, _b);
    return out.sub(_b).setY(0).normalize();
  }

  profile(leg, s) {
    return leg === 0 ? profileAt(PROFILE_A, s) : leg === 1 ? MAW_H : profileAt(PROFILE_B, s);
  }

  // every 2 m along all three legs (for shaping the terrain and placing things off the rails)
  samples() {
    const out = [];
    const add = (leg, len) => {
      for (let s = 0; s <= len; s += 2) {
        this.point(leg, s, _p);
        out.push({ x: _p.x, z: _p.z, h: this.profile(leg, s), leg, s });
      }
    };
    add(0, this.lenA);
    add(1, Math.PI * 2 * ARENA.r);
    add(2, this.lenB);
    return out;
  }
}

// nearest-sample lookups over the rails (a 16 m grid of buckets)
class RailIndex {
  constructor(samples) {
    this.samples = samples;
    this.cells = new Map();
    for (const s of samples) {
      const k = this.key(Math.floor(s.x / 16), Math.floor(s.z / 16));
      if (!this.cells.has(k)) this.cells.set(k, []);
      this.cells.get(k).push(s);
    }
  }

  key(i, j) {
    return i * 4096 + j;
  }

  // nearest sample within `reach` m (3 cells either way), or null; sets this.dist
  nearest(x, z) {
    const ci = Math.floor(x / 16), cj = Math.floor(z / 16);
    let best = null, bd = Infinity;
    for (let i = ci - 2; i <= ci + 2; i++) {
      for (let j = cj - 2; j <= cj + 2; j++) {
        const list = this.cells.get(this.key(i, j));
        if (!list) continue;
        for (const s of list) {
          const d = (s.x - x) ** 2 + (s.z - z) ** 2;
          if (d < bd) {
            bd = d;
            best = s;
          }
        }
      }
    }
    this.dist = Math.sqrt(bd);
    return best;
  }
}

// ---------------------------------------------------------------- terrain
// One displaced grid mesh over the sea: dunes shaped round the rails (a flattened lane that follows each
// leg's profile, dune walls either side), the Maw's basin, moats round the docks and banks of sand piled
// against the mesa walls. Lit like the rest of Solar (standard material) with vertex-color shading and
// a ripple normal map. heightAt() samples it for everything that rides on it.
class Terrain {
  constructor(index, docks, base) {
    const { x1, x2, z1, z2, step } = TERRAIN;
    const nx = Math.round((x2 - x1) / step) + 1, nz = Math.round((z2 - z1) / step) + 1;
    this.nx = nx;
    this.nz = nz;
    this.base = base;
    const h = (this.h = new Float32Array(nx * nz));
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x1 + i * step, z = z1 + j * step;
        let y = rawDunes(x, z);
        // the lane along the rails
        const near = index.nearest(x, z);
        if (near) y = lerp(near.h, y, smoothstep(6, 24, index.dist));
        // the Maw: a quicksand basin inside the ring, its lip raised a little outside it
        const da = Math.hypot(x - ARENA.x, z - ARENA.z);
        y = lerp(-3.2, y, smoothstep(ARENA.r - 10, ARENA.r - 4.5, da));
        if (da > ARENA.r + 5 && da < ARENA.r + 22) y += Math.sin(((da - ARENA.r - 5) / 17) * Math.PI) * 2.5;
        // moats round the docks
        for (const d of docks) y = lerp(-2.6, y, smoothstep(13, 24, Math.hypot(x - d[0], z - d[1])));
        // sand banked up against the mesa walls (not the east side, where Solar is)
        const edge = Math.min(x - BAND.x1, z - BAND.z1, BAND.z2 - z);
        y = lerp(y, 7 + fbm(x * 0.05, z * 0.05, 2) * 6, smoothstep(16, 3, edge));
        h[j * nx + i] = y;
      }
    }
    // geometry, with vertex colors: pale crests, warm faces, damp dark sand where it meets the quicksand
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i, x = x1 + i * step, z = z1 + j * step, y = h[k];
        pos[k * 3] = x;
        pos[k * 3 + 1] = base + y;
        pos[k * 3 + 2] = z;
        uv[k * 2] = x / 5;
        uv[k * 2 + 1] = z / 5;
        const n = fbm(x * 0.02 + 40, z * 0.02, 2), g = fbm(x * 0.15, z * 0.15, 1);
        _c.setRGB(lerp(0.86, 0.74, n), lerp(0.64, 0.5, n), lerp(0.4, 0.3, n), THREE.SRGBColorSpace);
        const crest = smoothstep(1, 7, y);
        _c.r *= 0.92 + 0.12 * crest + 0.05 * g;
        _c.g *= 0.92 + 0.11 * crest + 0.05 * g;
        _c.b *= 0.9 + 0.1 * crest + 0.05 * g;
        const damp = smoothstep(0.4, -0.9, y); // just over the quicksand (at -1)
        _c.lerp(DAMP, damp * 0.55);
        col[k * 3] = _c.r;
        col[k * 3 + 1] = _c.g;
        col[k * 3 + 2] = _c.b;
      }
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let o = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx[o++] = a;
        idx[o++] = c;
        idx[o++] = b;
        idx[o++] = b;
        idx[o++] = c;
        idx[o++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, normalMap: rippleTexture(), normalScale: new THREE.Vector2(0.7, 0.7) });
    m.userData.noBatch = true; // (one big mesh: drawn as it is)
    this.mesh = new THREE.Mesh(geo, m);
    this.mesh.matrixAutoUpdate = false;
  }

  // the dunes' height (world y) at x, z (bilinear in the grid)
  heightAt(x, z) {
    const { x1, z1, step } = TERRAIN;
    const fx = THREE.MathUtils.clamp((x - x1) / step, 0, this.nx - 1.001), fz = THREE.MathUtils.clamp((z - z1) / step, 0, this.nz - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, h = this.h, nx = this.nx;
    const a = h[j * nx + i], b = h[j * nx + i + 1], c = h[(j + 1) * nx + i], d = h[(j + 1) * nx + i + 1];
    return this.base + a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
}

// A tiling normal map of wind ripples: wavy parallel ridges, sharp on their lee side, with fine grain.
let rippleTex = null;
function rippleTexture() {
  if (rippleTex) return rippleTex;
  const S = 256;
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const ph = v * 9 + 0.22 * Math.sin(Math.PI * 2 * (u * 2 + v)) + 0.08 * Math.sin(Math.PI * 2 * (u * 5 - v * 3));
      const f = ph - Math.floor(ph);
      const r = f < 0.7 ? f / 0.7 : 1 - (f - 0.7) / 0.3;
      H[y * S + x] = r * r * 0.9 + hash2(x, y) * 0.08;
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const hx = H[y * S + ((x + 1) % S)] - H[y * S + ((x + S - 1) % S)];
      const hy = H[((y + 1) % S) * S + x] - H[((y + S - 1) % S) * S + x];
      let nx = -hx * 2.2, ny = -hy * 2.2, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const k = (y * S + x) * 4;
      img.data[k] = (nx * 0.5 + 0.5) * 255;
      img.data[k + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[k + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  rippleTex = new THREE.CanvasTexture(c);
  rippleTex.wrapS = rippleTex.wrapT = THREE.RepeatWrapping;
  rippleTex.anisotropy = 4;
  return rippleTex;
}

// The quicksand floor's surface: Solar's quicksand look (liquid.js style 1: wavy ripples crawling one
// way, pale crests, damp patches), toned to sit with the lit dunes, and in the Maw a whirlpool spiralling
// down into a dark throat. One flat sheet under the whole sea; the dunes rise out of it.
function quicksandMaterial(time) {
  const m = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMaw: { value: new THREE.Vector3(ARENA.x, ARENA.z, ARENA.r - 5) }, uK: { value: 1.75 } }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime, uK;
      uniform vec3 uMaw;
      varying vec3 vW;
      float lh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float ln(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }
      float lfbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * ln(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        vec2 dir = vec2(0.8, 0.6);
        float along = dot(p, dir), across = dot(p, vec2(-dir.y, dir.x));
        float warp = sin(across * 0.33 + lfbm(p * 0.12) * 4.0) * 0.8 + lfbm(p * 0.35) * 1.1;
        float ph = (along + warp) * 3.0 - t * 1.2;
        float crest = smoothstep(0.75, 1.0, sin(ph));
        float drift = lfbm(p * 0.3 + dir * t * 0.06);
        vec3 c = mix(vec3(0.8, 0.6, 0.38), vec3(0.6, 0.43, 0.25), drift);
        c *= 0.84 + 0.2 * cos(ph);
        c += vec3(0.14, 0.1, 0.06) * crest;
        c = mix(c, vec3(0.34, 0.23, 0.13), smoothstep(0.66, 0.85, lfbm(p * 0.18 - dir * t * 0.02)) * 0.6);
        // the Maw: spiral arms winding down into the throat
        vec2 q = p - uMaw.xy;
        float r = length(q) / uMaw.z;
        if (r < 1.0) {
          float a = atan(q.y, q.x), lr = log(max(r, 0.02));
          float arms = sin(a * 5.0 + lr * 9.0 + t * 1.6);
          float fine = sin(a * 17.0 + lr * 26.0 + t * 2.6);
          vec3 s = mix(vec3(0.8, 0.6, 0.38), vec3(0.5, 0.35, 0.2), 0.5 + 0.5 * arms) * (0.9 + 0.1 * fine);
          s = mix(s, vec3(0.1, 0.06, 0.03), smoothstep(0.38, 0.0, r));
          c = mix(c, s, smoothstep(1.0, 0.75, r));
        }
        gl_FragColor = vec4(pow(c, vec3(2.2)) * uK, 1.0);
        #include <fog_fragment>
      }`,
  });
  m.uniforms.uTime = time;
  return m;
}

// ---------------------------------------------------------------- dressing
// Sandstone spires: a tapered column, jagged and banded in strata (one geometry, instanced).
function spireGeometry(radial = 8, rows = 7) {
  const g = new THREE.CylinderGeometry(0.7, 1, 1, radial, rows);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + (hash2(Math.round(a * 3), Math.round(y * 7)) - 0.5) * 0.35 - Math.sin(y * 9) * 0.06;
    p.setXYZ(i, x * k, y, z * k);
    const band = 0.5 + 0.5 * Math.sin(y * 24 + hash2(3, Math.round(y * 7)) * 2);
    _c.setRGB(lerp(0.62, 0.78, band), lerp(0.42, 0.52, band), lerp(0.28, 0.34, band), THREE.SRGBColorSpace);
    col[i * 3] = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

let panelTexture = null;
function solarPanelTexture() {
  if (panelTexture) return panelTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#16233c';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#22355a';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) g.fillRect(2 + x * 10.3, 2 + y * 15.5, 8.6, 13.5);
  g.strokeStyle = '#8a8f9a';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 62, 62);
  panelTexture = new THREE.CanvasTexture(c);
  panelTexture.colorSpace = THREE.SRGBColorSpace;
  return panelTexture;
}

// A lattice pylon lying in the sand (two/four rails and cross braces, merged into one mesh).
function pylonGeometry(len) {
  const parts = [];
  const box = (w, h, d, x, y, z, rx = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.applyMatrix4(_m4.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, 0, rz)), _s.set(1, 1, 1)));
    parts.push(g);
  };
  for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) box(0.22, len, 0.22, x, len / 2, z);
  for (let y = 1.5; y < len; y += 3) {
    box(1.9, 0.12, 0.12, 0, y, -0.9, 0, 0.8);
    box(1.9, 0.12, 0.12, 0, y, 0.9, 0, -0.8);
    box(0.12, 0.12, 1.9, -0.9, y + 1.5, 0, 0.8, 0);
    box(0.12, 0.12, 1.9, 0.9, y + 1.5, 0, -0.8, 0);
  }
  box(4, 0.3, 0.3, 0, len - 0.4, 0);
  const g = mergeAll(parts);
  return g;
}
function mergeAll(parts) {
  // (a tiny local merge: every part is a non-indexed-compatible BoxGeometry)
  let count = 0;
  for (const g of parts) count += g.index.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of parts) {
    const p = g.attributes.position, n = g.attributes.normal, ix = g.index;
    for (let i = 0; i < ix.count; i++, o++) {
      const k = ix.getX(i);
      pos[o * 3] = p.getX(k);
      pos[o * 3 + 1] = p.getY(k);
      pos[o * 3 + 2] = p.getZ(k);
      nor[o * 3] = n.getX(k);
      nor[o * 3 + 1] = n.getY(k);
      nor[o * 3 + 2] = n.getZ(k);
    }
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return geo;
}

// ================================================================ the run
export function buildDuneRun(B, { start, startYaw = Math.PI / 2, end, endYaw = -Math.PI / 2, onDone = null }) {
  const { W, game, level, devStart, onRespawn, guideStrip, area, glowEdge } = B;
  const zone = 'yellow';
  const quarter = (a) => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
  const sYaw = quarter(startYaw), eYaw = quarter(endYaw);
  const [sfx_, sfz] = fwdOf(sYaw), [efx, efz] = fwdOf(eYaw);
  const dockY = Math.min(start[1], end[1]);
  const Q = dockY - 1; // the quicksand floor's surface
  const startPark = [start[0] + sfx_ * DOCK_REACH, start[2] + sfz * DOCK_REACH];
  const endPark = [end[0] - efx * DOCK_REACH, end[2] - efz * DOCK_REACH]; // (behind you as you step off)
  const parkYawStart = sYaw, parkYawEnd = eYaw + Math.PI; // the sled's nose points out to sea at both
  const parkY = (y) => y + 0.3;

  const rails = new Rails(startPark, sYaw, endPark, eYaw);
  const samples = rails.samples();
  const index = new RailIndex(samples);
  const terrain = new Terrain(index, [startPark, endPark, [start[0], start[2]], [end[0], end[2]]], dockY);
  W.scene.add(terrain.mesh);
  const surfaceAt = (x, z) => Math.max(terrain.heightAt(x, z), Q);

  // the quicksand floor under the whole sea: a hazard solid (it sinks you, like any Solar quicksand: see
  // Player.sinkIn) with its own surface sheet, and sand sighing up off it round you (World.updateLiquidFx)
  const qmin = new THREE.Vector3(TERRAIN.x1, Q - 0.4, BAND.z1), qmax = new THREE.Vector3(TERRAIN.x2 + 3, Q, BAND.z2);
  W.addSolid(qmin, qmax, { static: true, hazard: 'acid', kind: 'acid' });
  (W.liquids ??= []).push({ min: qmin.clone(), max: qmax.clone(), zone, style: 1 });
  const time = { value: 0 };
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(qmax.x - qmin.x, qmax.z - qmin.z).rotateX(-Math.PI / 2), quicksandMaterial(time));
  sheet.position.set((qmin.x + qmax.x) / 2, Q + 0.02, (qmin.z + qmax.z) / 2);
  sheet.matrixAutoUpdate = false;
  sheet.updateMatrix();
  W.scene.add(sheet);

  // ---------------------------------------------------------------- cliffs round the sea
  // Banded sandstone buttresses shoulder to shoulder along the edges (instanced, like the spires), tall
  // enough that nothing past the edge shows from the sled; lower on the east (Solar's) side, with gaps
  // for the two docks.
  const crnd = rng(7331);
  const cliffs = [];
  const cliffRun = (axis, from, to, edge, inward, hMin, hMax, skip = () => false) => {
    for (let c = from + 4; c < to - 2; c += 7 + crnd() * 5) {
      if (skip(c)) continue;
      const along = 6 + crnd() * 6, depth = 3.5 + crnd() * 3, h = hMin + crnd() * (hMax - hMin);
      const off = edge + inward * (depth + crnd() * 1.5);
      cliffs.push(axis === 'x' ? { x: c, z: off, sx: along, sz: depth, h } : { x: off, z: c, sx: depth, sz: along, h });
    }
  };
  cliffRun('x', BAND.x1, BAND.x2, BAND.z1, 1, 26, 48); // north
  cliffRun('x', BAND.x1, BAND.x2, BAND.z2, -1, 22, 40); // south
  cliffRun('z', BAND.z1, BAND.z2, BAND.x1, 1, 30, 52); // west
  cliffRun('z', BAND.z1, BAND.z2, BAND.x2, -1, 10, 20, (z) => [start[2], end[2]].some((d) => Math.abs(z - d) < 17)); // east
  const cliffMesh = new THREE.InstancedMesh(spireGeometry(12, 9), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), cliffs.length);
  cliffs.forEach((k, i) => {
    _q.setFromAxisAngle(UP, crnd() * 6.3);
    cliffMesh.setMatrixAt(i, _m4.compose(_p.set(k.x, Q - 4, k.z), _q, _s.set(k.sx, k.h + 4, k.sz)));
  });
  W.scene.add(cliffMesh);

  // ---------------------------------------------------------------- dressing
  const pathDist = (x, z) => (index.nearest(x, z), index.dist);
  const inBand = (x, z, m) => x > BAND.x1 + m && x < BAND.x2 - m && z > BAND.z1 + m && z < BAND.z2 - m;
  const nearDock = (x, z, r) => [start, end].some((d) => Math.hypot(x - d[0], z - d[2]) < r);
  const mawDist = (x, z) => Math.hypot(x - ARENA.x, z - ARENA.z);
  const drnd = rng(4242);
  // spires: the free-standing ones scattered off the rails, plus the turret perches right beside them
  const spireSpots = [];
  for (let tries = 0; tries < 400 && spireSpots.length < 30; tries++) {
    const x = lerp(BAND.x1, BAND.x2, drnd()), z = lerp(BAND.z1, BAND.z2, drnd());
    if (!inBand(x, z, 12) || nearDock(x, z, 30) || mawDist(x, z) < ARENA.r + 14) continue;
    const pd = pathDist(x, z);
    if (pd < 15 || spireSpots.some((s) => Math.hypot(s.x - x, s.z - z) < 14)) continue;
    const near = pd < 45;
    spireSpots.push({ x, z, r: 1.8 + drnd() * 2.6, h: (near ? 9 : 12) + drnd() * (near ? 10 : 16), cap: drnd() < 0.35 });
  }
  // turret perches: [leg, s, lateral (+ right)] – flat-topped pillars a turret stands on
  const perches = [[0, 236, 16], [0, 330, -15], [2, 120, 15], [2, 236, -14]].map(([leg, s, lat]) => {
    rails.point(leg, s, _p);
    rails.tangent(leg, s, _t);
    const x = _p.x - _t.z * lat, z = _p.z + _t.x * lat; // (right of the heading is (-tz, tx))
    const h = 7 + drnd() * 2;
    spireSpots.push({ x, z, r: 2.4, h, cap: false, flat: true });
    return { leg, s, pos: [x, terrain.heightAt(x, z) + h + 0.1, z] };
  });
  const spireMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  const spires = new THREE.InstancedMesh(spireGeometry(), spireMat, spireSpots.length);
  const capCount = spireSpots.filter((s) => s.cap || s.flat).length;
  const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.1, 1, 7), spireMat, capCount);
  const capCol = new Float32Array(caps.geometry.attributes.position.count * 3);
  for (let i = 0; i < capCol.length; i += 3) capCol.set([0.42, 0.2, 0.09], i); // (the darker caprock)
  caps.geometry.setAttribute('color', new THREE.BufferAttribute(capCol, 3));
  let ci = 0;
  spireSpots.forEach((s, i) => {
    const gy = Math.min(terrain.heightAt(s.x, s.z), dockY) - 2;
    const top = terrain.heightAt(s.x, s.z) + s.h;
    _q.setFromAxisAngle(UP, drnd() * 6.3);
    spires.setMatrixAt(i, _m4.compose(_p.set(s.x, gy, s.z), _q, _s.set(s.r, top - gy, s.r)));
    if (s.cap || s.flat) {
      const cr = s.flat ? s.r * 1.05 : s.r * (1.4 + drnd() * 0.6);
      caps.setMatrixAt(ci++, _m4.compose(_p.set(s.x, top - 0.2, s.z), _q, _s.set(cr, s.flat ? 0.6 : 1.2 + drnd(), cr)));
    }
  });
  W.scene.add(spires, caps);
  // wrecked solar panel rows: half buried, knocked askew
  const panelSpots = [];
  for (let tries = 0; tries < 200 && panelSpots.length < 9; tries++) {
    const x = lerp(BAND.x1, BAND.x2, drnd()), z = lerp(BAND.z1, BAND.z2, drnd());
    if (!inBand(x, z, 14) || nearDock(x, z, 25) || mawDist(x, z) < ARENA.r + 10) continue;
    const pd = pathDist(x, z);
    if (pd < 12 || pd > 50 || panelSpots.some((s) => Math.hypot(s.x - x, s.z - z) < 30)) continue;
    panelSpots.push({ x, z, a: drnd() * 6.3, n: 5 + Math.floor(drnd() * 6) });
  }
  const panelCount = panelSpots.reduce((n, s) => n + s.n, 0);
  const panelMat = new THREE.MeshStandardMaterial({ map: solarPanelTexture(), metalness: 0.65, roughness: 0.22 });
  const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(3.4, 0.1, 2.2), panelMat, panelCount);
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.12, 2.4, 6).translate(0, 1.2, 0), MAT.dark, panelCount);
  let pi = 0;
  for (const s of panelSpots) {
    const dx = Math.cos(s.a), dz = Math.sin(s.a);
    for (let k = 0; k < s.n; k++) {
      const x = s.x + dx * k * 3.8 + (drnd() - 0.5), z = s.z + dz * k * 3.8 + (drnd() - 0.5);
      const gy = terrain.heightAt(x, z);
      const sunk = drnd() * 1.6;
      _q.setFromEuler(_e.set(0.5 + (drnd() - 0.5) * 0.9, -s.a + (drnd() - 0.5) * 0.5, (drnd() - 0.5) * 0.8, 'YXZ'));
      panels.setMatrixAt(pi, _m4.compose(_p.set(x, gy + 1.9 - sunk, z), _q, _s.set(1, 1, 1)));
      _q.setFromEuler(_e.set((drnd() - 0.5) * 0.4, 0, (drnd() - 0.5) * 0.4));
      posts.setMatrixAt(pi++, _m4.compose(_p.set(x, gy - sunk - 0.3, z), _q, _s.set(1, 1, 1)));
    }
  }
  W.scene.add(panels, posts);
  // the great collector dish, toppled and half swallowed, its receiver mast snapped
  const dishMat = new THREE.MeshStandardMaterial({ color: 0xc9c0ae, metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide });
  const dish = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(18, 40, 12, 0, Math.PI * 2, 0, 0.62), dishMat);
  bowl.rotation.x = Math.PI; // concave side up
  bowl.position.y = 18;
  const ribs = new THREE.Mesh(new THREE.SphereGeometry(18.15, 16, 6, 0, Math.PI * 2, 0, 0.62), new THREE.MeshStandardMaterial({ color: 0x3a3630, metalness: 0.7, roughness: 0.5, wireframe: true }));
  ribs.rotation.x = Math.PI;
  ribs.position.y = 18;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 9, 8), MAT.dark);
  mast.position.y = 4.5;
  const receiver = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23a).multiplyScalar(0.6) }));
  receiver.position.set(0.8, 9.2, 0.4);
  receiver.rotation.set(0.5, 0.3, 0.8);
  dish.add(bowl, ribs, mast, receiver);
  dish.position.set(-372, Q - 3.5, -112);
  dish.rotation.set(0.95, 0.6, 0.15);
  W.scene.add(dish);
  // fallen pylons (and one still leaning, half buried)
  const pylonMat = new THREE.MeshStandardMaterial({ color: 0x5a5448, metalness: 0.7, roughness: 0.45, flatShading: true });
  const pylonGeo = pylonGeometry(30);
  for (const [x, z, ry, rx, sink] of [[-298, -95, 0.4, 1.45, 1.2], [-360, -205, -0.9, 1.5, 1.4], [-262, -132, 2.1, 0.55, 6], [-405, -195, 1.2, 0.35, 8]]) {
    const m = new THREE.Mesh(pylonGeo, pylonMat);
    m.position.set(x, terrain.heightAt(x, z) - sink, z);
    m.rotation.set(rx, ry, 0, 'YXZ');
    W.scene.add(m);
  }
  // skiff wrecks from earlier raids, nose down in the sand; one still smoulders
  const wreckGlow = new THREE.MeshBasicMaterial({ color: 0x2a1a08 });
  const wreckArmor = new THREE.MeshStandardMaterial({ color: 0x3a3428, metalness: 0.6, roughness: 0.6, flatShading: true });
  const wrecks = [[-335, -88, 0.6], [-398, -128, 2.2], [-275, -196, -1.1]].map(([x, z, a]) => {
    const w = skiffModel(null, wreckGlow, wreckArmor);
    w.scale.setScalar(1.15);
    w.position.set(x, terrain.heightAt(x, z) - 0.2, z);
    w.rotation.set(-0.45, a, 0.5, 'YXZ');
    W.scene.add(w);
    return w.position;
  });

  // ---------------------------------------------------------------- docks
  // A landing platform on stilts over the moat: a gate arch at the sea edge, a striped boarding apron,
  // chevrons pointing at the sled. Invisible rails keep you on it (the sea edge only opens onto a parked sled).
  const blockers = [];
  const block = (min, max) => {
    const s = W.addSolid(new THREE.Vector3(...min), new THREE.Vector3(...max), { noShot: true });
    blockers.push(s);
    return s;
  };
  // an axis-aligned box from dock-local coords (f along the sled's heading, l to its right)
  const boxAt = (o, yaw, f1, l1, f2, l2) => {
    const [fx, fz] = fwdOf(yaw), rx = -fz, rz = fx;
    const xa = o[0] + fx * f1 + rx * l1, za = o[2] + fz * f1 + rz * l1, xb = o[0] + fx * f2 + rx * l2, zb = o[2] + fz * f2 + rz * l2;
    return [Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb)];
  };
  function dock(o, yaw, name, toSea) {
    // (yaw: the sled's heading; the sea edge of the dock is 4 m ahead of the dock point)
    const y = o[1];
    const D = (f1, l1, f2, l2, y1, y2, kind) => {
      const [x1, z1, x2, z2] = boxAt(o, yaw, f1, l1, f2, l2);
      W.box(x1, y1, z1, x2, y2, z2, kind, zone);
    };
    const Dd = (f1, l1, f2, l2, y1, y2, kind) => {
      const [x1, z1, x2, z2] = boxAt(o, yaw, f1, l1, f2, l2);
      W.deco(x1, y1, z1, x2, y2, z2, kind, zone);
    };
    D(-4, -5, 4, 5, y - 0.6, y, 'plat');
    for (const [f, l] of [[-3.4, -4.4], [3.4, -4.4], [-3.4, 4.4], [3.4, 4.4]]) D(f - 0.35, l - 0.35, f + 0.35, l + 0.35, Q - 4, y - 0.6, 'metal');
    D(-4.2, -5.2, 4.2, -4.9, y - 0.9, y - 0.5, 'metal');
    D(-4.2, 4.9, 4.2, 5.2, y - 0.9, y - 0.5, 'metal');
    const [ex1, ez1, ex2, ez2] = boxAt(o, yaw, -4, -5, 4, 5);
    glowEdge(ex1, ez1, ex2, ez2, y, 'glow1', zone);
    Dd(3.0, -1.6, 3.95, 1.6, y, y + 0.03, 'hazard'); // the boarding apron
    // the gate: posts either side of the gap and a lintel with a cyan strip
    for (const l of [-1.9, 1.9]) {
      D(3.4, l - 0.25, 3.9, l + 0.25, y, y + 3.6, 'metal');
      Dd(3.35, l - 0.08, 3.4, l + 0.08, y + 0.3, y + 3.3, 'trimWhite');
    }
    D(3.4, -2.15, 3.9, 2.15, y + 3.6, y + 4.1, 'metal');
    Dd(3.35, -1.65, 3.4, 1.65, y + 3.62, y + 3.7, 'trimWhite');
    // rails down both sides (and along the sea edge either side of the gap)
    for (const [f1, l1, f2, l2] of [[-4, -5.1, 4, -4.9], [-4, 4.9, 4, 5.1], [3.8, -5, 4.1, -1.6], [3.8, 1.6, 4.1, 5]]) {
      const [x1, z1, x2, z2] = boxAt(o, yaw, f1, l1, f2, l2);
      W.box(x1, y, z1, x2, y + 1, z2, 'metal', zone);
      block([x1, y, z1], [x2, y + 5, z2]);
    }
    const [gx1, gz1, gx2, gz2] = boxAt(o, yaw, 3.8, -1.6, 4.4, 1.6);
    const gap = block([gx1, y, gz1], [gx2, y + 5, gz2]); // (open while the sled is parked here)
    const [fx, fz] = fwdOf(yaw);
    const ends = [[o[0] - fx * 2.5, y, o[2] - fz * 2.5], [o[0] + fx * 3.6, y, o[2] + fz * 3.6]];
    guideStrip(toSea ? ends : ends.reverse(), 0x9bf6ff, { spacing: 1.2, scale: 1.1 }); // (pointing aboard / ashore)
    level.places.push({ pos: new THREE.Vector3(o[0], y, o[2]), name });
    const [ax1, az1, ax2, az2] = boxAt(o, yaw, -4, -5, 3.5, 5);
    area([ax1, y, az1], [ax2, y + 3, az2], MOOD);
    return { gap };
  }
  const startDock = dock(start, sYaw, 'THE DUNE SEA', true);
  const endDock = dock(end, eYaw + Math.PI, 'DUNE SEA LANDING', false);
  const startCp = new Checkpoint(W, game, { pos: [start[0] - sfx_ * 1.5, start[1], start[2] - sfz * 1.5], yaw: sYaw, size: [4, 3, 4], name: 'THE DUNE SEA' });
  const endCp = new Checkpoint(W, game, { pos: [end[0] + efx * 1.5, end[1], end[2] + efz * 1.5], yaw: eYaw, size: [4, 3, 4], name: 'DUNE SEA LANDING' });
  // where the sled berths: its deck (a solid you walk onto) and rails round it
  function berth(park, yaw, y) {
    const o = [park[0], y, park[1]];
    const [x1, z1, x2, z2] = boxAt(o, yaw, -3.15, -1.4, 1.7, 1.4);
    const deck = W.addSolid(new THREE.Vector3(x1, y - 0.7, z1), new THREE.Vector3(x2, y, z2), { kind: 'metal' });
    const rails = [[-3.1, -1.75, 2.4, -1.45], [-3.1, 1.45, 2.4, 1.75], [1.7, -1.6, 2.4, 1.6]].map(([f1, l1, f2, l2]) => {
      const [a, b, c, d] = boxAt(o, yaw, f1, l1, f2, l2);
      return W.addSolid(new THREE.Vector3(a, y - 0.7, b), new THREE.Vector3(c, y + 5, d), { noShot: true });
    });
    const [tx1, tz1, tx2, tz2] = boxAt(o, yaw, -2.4, -1.2, 1.4, 1.2);
    return { deck, rails, trigger: [[tx1, y, tz1], [tx2, y + 2, tz2]] };
  }
  const berthStart = berth(startPark, parkYawStart, parkY(start[1]));
  const berthEnd = berth(endPark, parkYawEnd, parkY(end[1]));
  const setBerth = (where) => {
    for (const [b, d] of [[berthStart, startDock], [berthEnd, endDock]]) {
      const on = b === where;
      b.deck.enabled = on;
      for (const r of b.rails) r.enabled = on;
      d.gap.enabled = !on;
    }
  };

  // ---------------------------------------------------------------- the sled, the enemies
  const craft = new Hovercraft(W, game, { pos: [startPark[0], parkY(start[1]), startPark[1]], yaw: parkYawStart });
  const run = { craft, surfaceAt };
  const skiffs = [0, 1, 2].map(() => new RaiderSkiff(W, run));
  const scarabs = [0, 1, 2, 3].map(() => new DuneScarab(W, run));
  const excavator = new Excavator(W, run, { center: [ARENA.x, Q, ARENA.z] });
  excavator.group.userData.noCull = true; // (its parts move in world space under a group left at the origin)
  // shields to fly through: one on each long stretch (B.armor: they come back whenever you respawn)
  const shieldAt = (leg, s) => {
    rails.point(leg, s, _p);
    return B.armor([_p.x, Math.max(terrain.heightAt(_p.x, _p.z), Q) + HOVER - 0.25, _p.z], { respawn: 0, base: false });
  };
  const shields = [shieldAt(0, 202), shieldAt(2, 104)];

  const ctl = new DuneRun({ W, game, B, rails, terrain, surfaceAt, craft, skiffs, scarabs, excavator, shields, perches, wrecks, Q, time,
    startPark, endPark, parkYawStart, parkYawEnd, parkY, start, end, sYaw, eYaw, startCp, endCp, berthStart, berthEnd, setBerth, onDone });
  setBerth(berthStart);
  W.trigger(berthStart.trigger[0], berthStart.trigger[1], () => ctl.board(), { once: false });
  onRespawn(() => ctl.onRespawn());
  devStart('dunes', [start[0] - sfx_ * 2.5, start[1], start[2] - sfz * 2.5], sYaw, [RED, YELLOW]);
  devStart('dunesEnd', [end[0], end[1], end[2]], eYaw, [RED, YELLOW]);
  return ctl;
}

// ---------------------------------------------------------------- the run controller
// One world entity that flies the sled along the rails, scripts the waves by distance along each leg,
// carries every enemy that lives in the sled's frame, and resets / restores the whole thing.
class DuneRun {
  constructor(o) {
    Object.assign(this, o);
    this.state = 'parked';
    this.t = 0;
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.delta = new THREE.Vector3();
    this.escorts = []; // drones and swarms riding along: { e, kind, from, to, t0, life, ph, retireAt }
    this.turrets = [];
    this.streamT = 0;
    this.doomed = []; // escorts to despawn (by the sweeper)
    this.clearPending = false;
    this.W.add(this);
    // (World.update walks its entities from the last to the first, and an entity that removes others
    // mid-walk would shift it: the run only marks them, and this one, first in the list and so updated
    // last, takes them out)
    this.W.entities.unshift({ update: () => this.sweep() });
    this.events = this.script();
  }

  // ---------------------------------------------------------------- the waves
  // [leg, s, fn]: fired once per run as the sled passes s on that leg (leg 1 is the Maw, handled apart).
  script() {
    const L = (x, y, z) => [x, y, z];
    const Y = YELLOW, R = RED;
    return [
      // ---- A: out across the south of the sea
      [0, 8, () => this.game.enterZone('SOLAR · HOLD ON', 'THE DUNE SEA', '#ffd23a', 'music_combat')],
      [0, 40, () => {
        this.drone(L(-26, 14, 30), L(-9, 5, 10));
        this.drone(L(26, 14, 30), L(10, 6, 7));
      }],
      [0, 70, () => this.message('Lumen drones! <b>Shoot</b> — the sled does the driving.', 3)],
      [0, 100, () => this.drone(L(-24, 12, -30), L(-11, 6, 2), R)],
      [0, 128, () => this.scarab(24, -8)],
      [0, 142, () => this.scarab(22, 8, R)],
      [0, 156, () => this.scarab(26, -7)],
      [0, 180, () => {
        this.swarm(L(-6, 7, -32), 6, [Y, Y, R]);
        this.drone(L(18, 9, -30), L(11, 5, -2));
      }],
      [0, 228, () => {
        this.skiff(-1, true);
        this.skiff(1);
      }],
      [0, 300, () => {
        this.drone(L(-20, 12, -34), L(-10, 6, -4), R);
        this.drone(L(20, 12, -36), L(9, 5, 3));
        this.swarm(L(4, 9, 40), 5, [Y, R]);
      }],
      [0, 350, () => this.retireAll()],
      // ---- B: out of the Maw and home across the north
      [2, 30, () => {
        this.scarab(22, 8, R);
        this.skiff(1, true);
      }],
      [2, 46, () => this.scarab(22, -8)],
      [2, 62, () => this.scarab(24, 7, R)],
      [2, 100, () => {
        this.swarm(L(0, 8, -30), 6, [Y, R]);
        this.drone(L(-24, 12, 20), L(-10, 5, 6), R);
      }],
      [2, 150, () => this.skiff(-1)],
      [2, 210, () => {
        this.drone(L(22, 12, 30), L(9, 6, 8), R);
        this.drone(L(-22, 12, 30), L(-9, 5, 5));
        this.swarm(L(-5, 7, -35), 5, [Y, Y, R]);
      }],
      [2, 300, () => this.retireAll()],
    ].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }

  message(html, t = 3) {
    this.game.hud.message(html, t);
  }

  spawned() {
    this.reorder = true;
  }

  drone(from, to, color = YELLOW, life = 32) {
    this.toWorld(from[0], from[1], from[2], _a);
    const e = spawnEnemy(this.W, { type: 'drone', pos: [_a.x, _a.y, _a.z], color, range: 70, fireInterval: 2.3, orbit: 1.4, aggro: true });
    e.aggro = true;
    this.escorts.push({ e, kind: 'drone', from, to, t0: this.t, life, ph: Math.random() * 6.3, retireAt: 0 });
    this.spawned();
    return e;
  }

  swarm(from, count, colors = [YELLOW], life = 28) {
    this.toWorld(from[0], from[1], from[2], _a);
    const e = spawnEnemy(this.W, { type: 'swarm', pos: [_a.x, _a.y, _a.z], colors, count, divers: 1 });
    this.escorts.push({ e, kind: 'swarm', from, to: from, t0: this.t, life, ph: 0, retireAt: 0 });
    this.spawned();
    return e;
  }

  skiff(side, shielded = false) {
    const s = this.skiffs.find((k) => k.gone);
    if (!s) return;
    s.spawn(side, -38, shielded);
    if (shielded && !this.warnedShield) {
      this.warnedShield = true;
      this.message('<b style="color:#ff3344">RED SHIELD</b> on that skiff — switch to <b style="color:#ff3344">red</b> to break it, then <b style="color:#ffd23a">yellow</b>.', 4);
    }
    this.spawned();
  }

  // a scarab bursting out `ahead` m up the rails and `lat` m to the side
  scarab(ahead, lat, color = YELLOW) {
    const k = this.scarabs.find((e) => e.gone);
    if (!k) return;
    this.rails.point(this.leg, Math.min(this.s + ahead, this.legLen() - 1), _a);
    this.rails.tangent(this.leg, Math.min(this.s + ahead, this.legLen() - 1), _t);
    k.spawn(_a.x - _t.z * lat, _a.z + _t.x * lat, color);
    // (the first of each color says how to deal with it)
    this.warnedScarab ??= {};
    if (!this.warnedScarab[color]) {
      this.warnedScarab[color] = true;
      const name = color === RED ? 'RED' : 'YELLOW', hex = color === RED ? '#ff3344' : '#ffd23a';
      k.onLatch = () => this.message(`<b style="color:${hex}">SCARAB ON DECK</b> — shoot it with <b style="color:${hex}">${name}</b> before it lunges!`, 3);
    } else k.onLatch = null;
    this.spawned();
  }

  // send everything still riding along away (drones peel off, swarms scatter)
  retireAll() {
    for (const r of this.escorts) if (!r.retireAt) r.retireAt = this.t;
    for (const s of this.skiffs) if (!s.gone && s.state !== 'crash') s.retreat();
  }

  // craft-local x right, y up (over the deck), z forward -> world (level: the hull's tilt left out)
  toWorld(x, y, z, out) {
    const c = this.craft;
    c.right(_r);
    c.forward(_d);
    return out.copy(c.pos).addScaledVector(_r, x).addScaledVector(_d, z).setY(c.pos.y + y);
  }

  legLen(leg = this.leg) {
    return leg === 0 ? this.rails.lenA : leg === 2 ? this.rails.lenB : Infinity;
  }

  // ---------------------------------------------------------------- boarding, landing, resets
  board() {
    if (this.state !== 'parked' || this.done || this.game.player.dead) return;
    const p = this.game.player;
    this.state = 'spool';
    this.t0 = this.t;
    this.craft.board(p);
    this.setBerth(null);
    if (!p.armor) p.giveArmor(); // a free shield for the ride: a chance against the first hit
    // the start dock's beacon becomes your checkpoint, so a death out there brings you back here
    const cp = this.startCp;
    if (this.game.checkpoint?.ref !== cp) {
      this.game.checkpoint?.ref?.setActive(false);
      cp.setActive(true);
      this.W.fx.checkpoint(cp.pos);
      this.game.setCheckpoint(cp.pos, this.sYaw, cp);
    }
    this.leg = 0;
    this.s = 0;
    this.speed = 0;
    this.lat = 0;
    this.latV = 0;
    this.y = this.craft.pos.y;
    this.vy = 0;
    this.air = 0;
    this.yaw = this.craft.yaw;
    this.bank = 0;
    this.pitch = 0;
    this.fired = 0; // events done
    this.laps = 0;
    this.mawT = 0;
    this.exitArmed = false;
    this.mawWon = false;
    this.pos.copy(this.craft.pos);
    this.prev.copy(this.pos);
    this.perches.forEach((t, i) => {
      // (every other one is behind a red shield: crack it with red, then yellow for the turret)
      const shields = i % 2 ? [RED] : [];
      const e = spawnEnemy(this.W, { type: 'turret', pos: t.pos, color: YELLOW, shields, range: 58, cooldown: 2.4, charge: 1.0, aggro: false });
      e.perch = t;
      this.turrets.push(e);
    });
    this.spawned();
    director.setIntensity(2);
    audio.sample('warp_whoosh', { gain: 0.6, rate: 0.7 }) || audio.sample('jump_pad', { gain: 0.6, rate: 0.7 });
    this.message('<b>HOLD ON.</b> Look around and shoot — the sled does the driving.', 3.5);
  }

  sweep() {
    for (const r of this.doomed) this.despawn(r);
    this.doomed.length = 0;
    // turrets the sled has left behind for good (those of the leg it just finished)
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i];
      if (t.perch.leg < this.leg && this.state === 'ride') {
        t.despawn();
        this.turrets.splice(i, 1);
      }
    }
    if (this.clearPending) {
      this.clearPending = false;
      this.clearEnemies();
    }
  }

  // clear every enemy of the run out of the world (quietly)
  clearEnemies() {
    for (const r of this.escorts) this.despawn(r);
    this.escorts.length = 0;
    for (const t of this.turrets) t.despawn();
    this.turrets.length = 0;
    for (const s of this.skiffs) s.remove();
    for (const k of this.scarabs) k.remove();
  }

  despawn(r) {
    const e = r.e;
    if (r.kind === 'drone') {
      if (this.W.entities.includes(e)) {
        if (!e.dead) this.W.fx.burst(e.pos, 0xffd23a, { count: 16, speed: 3, life: 0.4, size: 0.3, gravity: 0 });
        e.dispose();
      }
    } else if (!e.dead) e.despawn();
  }

  onRespawn() {
    if (this.done) return;
    this.reset();
  }

  // back to the start dock, as if the run never began
  reset() {
    this.clearEnemies();
    this.excavator.reset();
    this.craft.unboard();
    this.craft.followYaw = true;
    this.state = 'parked';
    this.craft.throttle = 0;
    this.craft.vel.set(0, 0, 0);
    this.craft.setPose(_a.set(this.startPark[0], this.parkY(this.start[1]), this.startPark[1]), this.parkYawStart, 0, 0);
    this.setBerth(this.berthStart);
    this.game.hud.bossShow(false);
    director.setIntensity();
    this.fired = 0;
    this.game.setMusic?.('music_solar');
  }

  // the run is done: the sled berths at the end dock and stays there (also on loading a save past it)
  finish(instant = false) {
    this.done = true;
    this.state = 'done';
    this.game.clearedEncounters?.add(RUN_ID);
    if (instant) {
      this.clearPending = true;
      this.excavator.reset();
      this.craft.setPose(_a.set(this.endPark[0], this.parkY(this.end[1]), this.endPark[1]), this.parkYawEnd, 0, 0);
    }
    this.craft.unboard();
    this.craft.followYaw = true;
    this.craft.throttle = 0;
    this.craft.vel.set(0, 0, 0);
    this.setBerth(this.berthEnd);
    this.game.hud.bossShow(false);
    director.setIntensity();
    if (instant) return;
    this.clearPending = true;
    const cp = this.endCp;
    if (this.game.checkpoint?.ref !== cp) {
      this.game.checkpoint?.ref?.setActive(false);
      cp.setActive(true);
      this.W.fx.checkpoint(cp.pos);
      this.game.setCheckpoint(cp.pos, this.eYaw, cp);
    }
    this.game.setMusic('music_solar');
    audio.sample('engine_shutdown', { gain: 0.7 });
    this.message('Landed. <b>Step off</b> onto the dock.', 3);
    this.onDone?.();
  }

  // ---------------------------------------------------------------- per frame
  update(dt, player) {
    this.t += dt;
    this.time.value = this.t;
    const game = this.game, craft = this.craft;
    // a reloaded save past the run: the sled is waiting at the end dock
    if (this.state === 'parked' && !this.done && (game.clearedEncounters?.has(RUN_ID) || game.checkpoint?.ref === this.endCp)) this.finish(true);
    if (player.pos.x < -205 && player.pos.z < -40 && player.pos.z > -240) {
      this.streamers(dt, player);
      this.smoulder(dt);
    }
    if (this.state === 'spool') this.spool(dt);
    else if (this.state === 'ride') this.ride(dt, player);
    else if (this.state === 'arrive') this.arrive(dt);
    if (this.state === 'parked' || this.state === 'done') {
      craft.surfaceY = this.Q;
      craft.update(dt);
    }
    if (this.reorder) {
      // (the run updates before the enemies it carries: entities update last-added first)
      this.reorder = false;
      this.W.remove(this);
      this.W.add(this);
    }
  }

  spool(dt) {
    const k = Math.min(1, (this.t - this.t0) / 1.8);
    const c = this.craft;
    c.throttle = 0.15 + 0.45 * k;
    c.rumble = Math.max(c.rumble, 0.08 * k);
    this.y = this.parkY(this.start[1]) + 0.25 * smooth01(k);
    _a.set(this.startPark[0], this.y, this.startPark[1]);
    c.setPose(_a, this.parkYawStart, 0, -0.04 * k, _b.set(0, 0, 0));
    c.surfaceY = this.Q;
    c.update(dt);
    if (k >= 1) {
      this.state = 'ride';
      this.pos.copy(c.pos);
      this.prev.copy(c.pos);
      audio.sample('warp_whoosh', { gain: 0.8, rate: 1 });
    }
  }

  // live enemies that should slow the sled down (it eases off in a fight)
  threats() {
    let n = 0;
    for (const r of this.escorts) if (!r.e.dead && !r.retireAt) n++;
    for (const s of this.skiffs) if (!s.gone && s.state !== 'crash') n++;
    for (const k of this.scarabs) if (!k.gone) n++;
    return n;
  }

  targetSpeed() {
    const leg = this.leg, s = this.s;
    if (leg === 1) return this.excavator.alive ? 10 : 18;
    let v = 16;
    const prof = leg === 0 ? PROFILE_A : PROFILE_B;
    // boost up to every crest (a key over 4 m): the jump
    for (const [ks, kh] of prof) if (kh > 4 && s > ks - 26 && s < ks + 2) v = 21;
    if (v < 20 && this.threats()) v = 12.5;
    if (leg === 0) {
      v = Math.min(v, 6 + s * 0.9); // pulling away from the dock
      v = Math.min(v, Math.max(10.5, (this.rails.lenA - s) * 0.4)); // easing into the Maw
    } else {
      const left = this.rails.lenB - s;
      v = Math.min(v, Math.sqrt(2 * 3.2 * Math.max(0, left)) + 0.4); // braking for the dock
    }
    return v;
  }

  ride(dt, player) {
    const c = this.craft, rails = this.rails;
    // ---- speed and distance
    const want = this.targetSpeed();
    this.speed += THREE.MathUtils.clamp(want - this.speed, -7 * dt, 5 * dt);
    this.s += this.speed * dt;
    // leg changes: into the Maw, round it until the Excavator is down, out at its east point
    if (this.leg === 0 && this.s >= rails.lenA) {
      this.s -= rails.lenA;
      this.leg = 1;
      this.enterMaw();
    }
    if (this.leg === 1) this.updateMaw(dt);
    if (this.leg === 2 && this.s >= rails.lenB) {
      this.s = rails.lenB;
      this.speed = 0;
      this.state = 'arrive';
      this.arriveT = 0;
      this.arriveYaw = this.yaw;
      this.craft.followYaw = false;
    }
    // ---- the line: the rails plus a weave (wider in the Maw, where it swerves round the spit)
    rails.point(this.leg, this.s, _p);
    rails.tangent(this.leg, this.s, _t);
    const t = this.t;
    let amp = this.leg === 1 ? 3.2 : this.threats() ? 2.2 : 1.1;
    if (this.leg === 0) amp *= smoothstep(20, 50, this.s);
    if (this.leg === 2) amp *= smoothstep(0, 30, rails.lenB - this.s - 20);
    const wantLat = amp * (Math.sin(t * (this.leg === 1 ? 0.9 : 0.55)) * 0.75 + Math.sin(t * 1.37 + 1) * 0.25);
    const oldLat = this.lat;
    this.lat += (wantLat - this.lat) * Math.min(1, dt * 2);
    const latV = (this.lat - oldLat) / Math.max(dt, 1e-3);
    _p.x += -_t.z * this.lat;
    _p.z += _t.x * this.lat;
    // ---- heading, bank
    const heading = Math.atan2(-_t.x, -_t.z) - Math.atan2(latV, Math.max(this.speed, 4)) * 0.8;
    const dy = wrapAngle(heading - this.yaw);
    this.yaw = wrapAngle(this.yaw + dy * Math.min(1, dt * 7));
    const yawRate = dy * 7;
    const bankWant = THREE.MathUtils.clamp(-yawRate * this.speed * 0.03, -0.32, 0.32);
    this.bank += (bankWant - this.bank) * Math.min(1, dt * 4);
    // ---- height: an air cushion (spring) over the sand; off a crest it flies
    const ground = this.surfaceAt(_p.x, _p.z);
    const hover = ground + HOVER;
    const pen = hover - this.y;
    if (pen > 0) this.vy += (pen * 220 - this.vy * 22) * dt;
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y < hover - 0.35) {
      this.y = hover - 0.35;
      this.vy = Math.max(this.vy, 0);
    }
    const airborne = this.y > hover + 0.08;
    if (airborne) this.air += dt;
    else {
      if (this.air > 0.35) this.land(Math.max(0, -this.vy + this.air * 6));
      this.air = 0;
    }
    _p.y = this.y;
    const pitchWant = THREE.MathUtils.clamp(Math.atan2(this.vy, Math.max(this.speed, 4)) * 0.7, -0.3, 0.3);
    this.pitch += (pitchWant - this.pitch) * Math.min(1, dt * 5);
    // ---- move the sled; carry everything that lives in its frame
    this.prev.copy(this.pos);
    this.pos.copy(_p);
    this.delta.subVectors(this.pos, this.prev);
    this.vel.copy(this.delta).divideScalar(Math.max(dt, 1e-3));
    c.setPose(this.pos, this.yaw, this.bank, this.pitch, this.vel);
    c.throttle = THREE.MathUtils.clamp(0.35 + this.speed / 28 + (airborne ? 0.1 : 0), 0, 1);
    c.surfaceY = ground;
    c.overSand = this.terrain.heightAt(_p.x, _p.z) < this.Q + 0.05;
    c.rumble = Math.max(c.rumble, (c.overSand ? 0.12 : 0.06) * Math.min(1, this.speed / 14));
    c.update(dt);
    this.carry(dt);
    this.inherit();
    // ---- the script
    if (this.leg !== 1) {
      while (this.fired < this.events.length) {
        const [leg, at, fn] = this.events[this.fired];
        if (leg < this.leg || (leg === this.leg && at <= this.s)) {
          this.fired++;
          fn();
        } else break;
      }
    }
    // ---- shields you fly through
    for (const a of this.shields) {
      if (a.taken || player.armor > 0) continue;
      const dx = a.pos.x - player.pos.x, dz = a.pos.z - player.pos.z, dyy = a.pos.y + 1.15 - (player.pos.y + 1.1);
      if (dx * dx + dz * dz + dyy * dyy < 7) a.take(player);
    }
  }

  land(speed) {
    const c = this.craft, fx = this.W.fx;
    const k = Math.min(1, speed / 10);
    c.rumble = Math.max(c.rumble, 0.25 + 0.35 * k);
    this.game.player.landKick = Math.max(this.game.player.landKick, 0.08 + 0.12 * k);
    _a.copy(this.pos).setY(c.surfaceY + 0.2);
    fx.burst(_a, 0xd9b46a, { count: 40 * (0.5 + k), speed: 6, life: 0.9, size: 0.4, gravity: 8, mode: 'puff' });
    fx.ring(_a, UP, SAND_DUST, { size: 1, end: 6, life: 0.5, thick: 0.4, k: 0.5 });
    audio.sample('land_sand', { gain: 0.6 + 0.4 * k, rate: 0.8 }) || audio.land(2);
    audio.sample('hydraulic_land', { gain: 0.4 * k, rate: 0.9 });
  }

  // drones: carried, their posts eased in from where they spawned and drifting; swarms: carried
  carry(dt) {
    const D = this.delta;
    for (let i = this.escorts.length - 1; i >= 0; i--) {
      const r = this.escorts[i], e = r.e;
      if (r.kind === 'drone') {
        if (!this.W.entities.includes(e)) {
          this.escorts.splice(i, 1);
          continue;
        }
        if (e.debris) continue; // (its debris is left behind in the sand)
        e.pos.add(D);
        const age = this.t - r.t0, k = smooth01(age / 2.6);
        let x = lerp(r.from[0], r.to[0], k) + Math.sin(age * 0.5 + r.ph) * 2.5;
        let y = lerp(r.from[1], r.to[1], k) + Math.sin(age * 0.8 + r.ph) * 0.7;
        let z = lerp(r.from[2], r.to[2], k) + Math.sin(age * 0.33 + r.ph) * 3;
        if (!r.retireAt && age > r.life) r.retireAt = this.t;
        if (r.retireAt && !e.dead) {
          const rk = smooth01((this.t - r.retireAt) / 2.5);
          x *= 1 + rk * 2;
          y += rk * 26;
          z -= rk * 45;
          if (rk >= 1) {
            this.doomed.push(r);
            this.escorts.splice(i, 1);
            continue;
          }
        }
        this.toWorld(x, y, z, e.home);
      } else {
        if (e.dead) {
          this.escorts.splice(i, 1);
          continue;
        }
        for (const m of e.members) if (!m.dead) m.pos.add(D);
        if (!r.retireAt && this.t - r.t0 > r.life) r.retireAt = this.t;
        if (r.retireAt) {
          this.doomed.push(r);
          this.escorts.splice(i, 1);
        }
      }
    }
  }

  // Enemy shots fired while the sled is moving are fired from its frame (they keep its speed): aimed
  // shots still fly true at you, but every swerve and change of speed throws them off.
  inherit() {
    for (const p of this.W.projectiles) {
      if (p._dunes) continue;
      p._dunes = true;
      if (!p.noInherit && p.vel && p.pos && p.pos.distanceToSquared(this.pos) < 120 * 120) p.vel.add(this.vel);
    }
  }

  // ---------------------------------------------------------------- the Maw
  enterMaw() {
    this.mawT = 0;
    this.exitArmed = false;
    this.retireAll();
    this.game.hud.zoneTitle('SOMETHING BELOW', 'THE MAW', '#ffd23a');
    this.game.setMusic('music_miniboss');
    director.setIntensity(3);
    audio.sample('root_rumble', { gain: 0.8, rate: 0.6 });
    const ex = this.excavator;
    ex.onFight = () => {
      const name = document.querySelector('#boss-bar .boss-name');
      if (name) name.textContent = 'LUMEN EXCAVATOR';
      this.game.hud.bossShow(true);
      this.game.hud.bossBar(1);
      this.message('Blast its <b style="color:#ff3344">RED plates</b> off, pop the globs it spits, and hit the <b style="color:#ffd23a">VENTS</b> while they blow open!', 5);
      this.game.hud.bossHint?.('RED plates first — then YELLOW vents when they open');
    };
    ex.onDamage = () => {
      this.game.hud.bossBar(ex.hpFrac());
      if (ex.ventsLeft === 2 && !this.mawSwarm) {
        this.mawSwarm = true;
        this.swarm([0, 9, -30], 4, [YELLOW, RED], 18);
      }
    };
    ex.onDead = () => {};
    ex.onPlate = () => {
      if (!ex.platesLeft) this.game.hud.bossHint?.('Plates gone — YELLOW on the vents when they blow open!', true);
    };
    this.mawSwarm = false;
  }

  updateMaw(dt) {
    const ex = this.excavator;
    this.mawT += dt;
    if (this.mawT > 1.4 && ex.state === 'buried') ex.emerge();
    if (ex.state === 'fight') this.game.hud.bossBar(ex.hpFrac());
    if (ex.state === 'dying' && !this.mawWon) {
      this.mawWon = true;
      this.game.hud.bossShow(false);
      this.game.setMusic('music_combat');
      director.setIntensity(2);
      this.message('<b style="color:#ffd23a">EXCAVATOR DOWN.</b> Hang on — the way out is east.', 3);
    }
    // out through the east point (θ = 0 on the ring) once it's down (or, failing that, after a lap)
    const th = this.rails.th0 + this.s / ARENA.r; // (starts at -π/2)
    const done = ex.state === 'dying' || ex.state === 'dead' || (ex.state === 'buried' && this.mawT > 30);
    const turns = th / (Math.PI * 2);
    const lap = Math.floor(turns);
    if (done && !this.exitArmed) {
      this.exitArmed = true;
      this.exitLap = th > 0 ? lap + 1 : 0; // the next pass of θ = 0
    }
    if (this.exitArmed && th >= this.exitLap * Math.PI * 2) {
      this.s = (th - this.exitLap * Math.PI * 2) * ARENA.r;
      this.leg = 2;
      this.mawWon = false;
    }
  }

  // ---------------------------------------------------------------- landing
  arrive(dt) {
    const c = this.craft;
    this.arriveT += dt;
    const k = smooth01(this.arriveT / 1.7);
    // a drift turn on the spot: it swings its stern round to the dock
    const yaw = wrapAngle(this.arriveYaw + wrapAngle(this.parkYawEnd - this.arriveYaw) * k);
    const yb = this.parkY(this.end[1]);
    this.y += (yb - this.y) * Math.min(1, dt * 3);
    _a.set(this.endPark[0], this.y, this.endPark[1]);
    c.setPose(_a, yaw, Math.sin(k * Math.PI) * 0.18, 0, _b.set(0, 0, 0));
    c.throttle = 0.5 * (1 - k) + 0.1;
    c.surfaceY = this.Q;
    if (this.arriveT < 1.2 && Math.random() < dt * 30) {
      c.toWorld((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 6, _b);
      _b.y = this.Q + 0.2;
      this.W.fx.puff(_b, (Math.random() - 0.5) * 6, 1, (Math.random() - 0.5) * 6, _c.set(SAND_DUST), 0.4, 1.4, 0.7, 3);
    }
    c.update(dt);
    if (this.arriveT >= 1.9) this.finish(false);
  }

  // ---------------------------------------------------------------- ambience
  // the first skiff wreck still smokes
  smoulder(dt) {
    this.smokeT = (this.smokeT || 0) - dt;
    const w = this.wrecks[0];
    if (this.smokeT > 0 || w.distanceToSquared(this.game.camera.position) > 160 * 160) return;
    this.smokeT = 0.12;
    _a.copy(w).y += 0.8;
    this.W.fx.burst(_a, 0x2e2a28, { count: 2, speed: 1, life: 3.2, size: 1.6, gravity: -2.2, drag: 0.8 });
    if (Math.random() < 0.3) this.W.fx.ember(_a, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2, 0xff7a20, 0.8, 0.12);
  }

  // sand streaming off the dune crests round you on the wind
  streamers(dt, player) {
    this.streamT -= dt;
    if (this.streamT > 0) return;
    this.streamT = 0.05;
    const fx = this.W.fx, cam = this.game.camera.position;
    const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 50;
    const x = cam.x + Math.cos(a) * r, z = cam.z + Math.sin(a) * r;
    if (x < BAND.x1 || x > BAND.x2 || z < BAND.z1 || z > BAND.z2) return;
    const y = this.surfaceAt(x, z);
    _a.set(x, y + 0.3 + Math.random() * 1.5, z);
    fx.puff(_a, 5 + Math.random() * 4, 0.3 + Math.random() * 0.6, -1 + Math.random() * 2, _c.set(0xd8b07a), 0.16, 2 + Math.random() * 1.5, 0.8 + Math.random() * 1.2, 3.5);
  }
}

export { RUN_ID };
