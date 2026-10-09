// VERDANT · THE GOD TREE — the second half of Emerald Hollow. Past the monkey temple's mouth and the rope
// bridge, a colossal tree stands out of a chasm of mist: the harvest's heart. The hive bled it for the Lumen:
// sap taps drilled into its bark, pipelines spiralling up it, algae reactors clamped onto its boughs, a
// harvest line strung from its crown to the Atrium. You climb the OUTSIDE of it, branch by branch, each big
// bough holding a little world of its own, swing up on its vines, ride its bloom pads and finally a giant
// fly round the trunk to the crown, where the Thornmaw guards the Verdant Heart in a temple the tree lifted
// into its branches. Then the harvest line's trolley carries you home over the jungle.
//
// buildGodTree(B, ctx) — ctx.landing: [x, y, z], the top centre of the 6 × 6 m landing the rope bridge ends on
// (the swamp half builds it). Returns { objective(p), arena, ... } (see the end).
//
// The climb, counter-clockwise round the trunk (bearings: 0 north (-z), 90 east (+x)), each beat on its own:
//   THE SURFACE ROOT (y 18 → 20): from the landing north-east over the mist to the trunk; the first look
//   → THE ROOT GATE (y 20, bearing 250): a shrine of standing stones between the buttresses, a giant sap tap
//   → THE ROOT STAIR (20 → 30): carved steps, a borer in the bark to goo-plug, fungus shelves up the bough
//   → BOUGH 1 · THE SAP TAP (30, south): a harvest rig on the bough: reactor, pump, slimes and spiders
//   → THE VINES (30 → 46): a chain of swinging vines round the south-east
//   → BOUGH 2 · THE HANGING NESTS (46, east): woven nests on ropes, the hive's flyers (flak)
//   → THE FLY WALL and THE SEED PODS (46 → 52): goo the bark, the rotflies stick, climb them; goo a swinging
//     seed pod still and hop the pods; a bloom pad throws you up to the next bough
//   → BOUGH 3 · THE MOSS POND (62, north): a pond in the bough's crotch, flytraps, a charging brute
//   → THE SAP PISTONS (62 → 77): a flytrap launch, bark slabs on sap pistons to goo still, a goo membrane
//     over a spore vent, two vines
//   → BOUGH 4 · THE FUNGUS GROVE (77, west): the glowing grove, the hive's last stand, Wren's log 09
//   → THE GIANT FLY (77 → 100): a ride round the trunk on a giant fly's back, attacked all the way
//   → THE CROWN: THE THORNMAW'S COURTYARD (verdantArena.js, cy 100), the Verdant Heart
//   → THE HARVEST LINE: the trolley down the cable to the aqueduct head → THE AQUEDUCT home to the Hub's
//     north balcony port (x 10, y 12), through the one-way green door.
// Falling off the tree is never fatal: a long fall (or the mist) fades you back to the last checkpoint.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RED, YELLOW, GREEN } from '../colors.js';
import { audio } from '../audio.js';
import { Barrier } from '../entities/barrier.js';
import { Checkpoint } from '../entities/misc.js';
import { SlidingDoor } from '../entities/puzzle.js';
import { Thicket } from '../entities/globPuzzle.js';
import { GooPad } from '../entities/gooPad.js';
import { creatureKit } from '../entities/verdantCreatures.js';
import { VineSwing, ZipLine } from '../entities/vineSwing.js';
import { regionOf } from './regions.js';
import { buildVerdantArena } from './verdantArena.js';
import { makeVerdantKit, kitMaterials } from './verdantKit.js';

const PI = Math.PI;
const NORTH = 0, EAST = -PI / 2, SOUTH = PI, WEST = PI / 2; // player yaws
const RY = [RED, YELLOW], RYG = [RED, YELLOW, GREEN];

// ---------------------------------------------------------------- the tree's shape (shared by mesh and body)
export const TREE = { x: 75, z: -385, top: 99, crown: 100 };
const DEG = PI / 180;
// a point at compass bearing b (degrees: 0 north, 90 east), r metres out from the trunk's axis, height y
const P = (b, r, y) => [TREE.x + r * Math.sin(b * DEG), y, TREE.z - r * Math.cos(b * DEG)];
const BUTTRESS = [[20, 15, 46], [75, 13, 40], [128, 17, 48], [168, 11, 36], [205, 15, 44], [292, 16, 46], [332, 12, 38]]; // [bearing, reach m, height]
// the trunk narrows up to the middle of the climb and swells again where it forks into the crown
const baseR = (y) => (y < 0 ? 16.5 - y * 0.04 : y < 60 ? 16.5 - 0.065 * y : 12.6 + (Math.min(y, 102) - 60) ** 2 * 0.0016);
function lobes(b, y) {
  const t = b * DEG + y * 0.0045;
  return 0.075 * Math.sin(3 * t + 0.4) + 0.05 * Math.sin(5 * t - y * 0.02 + 1.3) + 0.03 * Math.sin(9 * t + 2.1 + y * 0.03);
}
const angDiff = (a, b) => {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};
const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
function flare(b, y) {
  let f = 0;
  for (const [bb, reach, h] of BUTTRESS) {
    const k = smooth01((h - y) / (h + 30));
    if (k <= 0) continue;
    const w = 7 + 9 * k; // degrees
    const d = angDiff(b, bb) / w;
    f += reach * k * k * Math.exp(-d * d);
  }
  return f;
}
// the bark's surface radius at bearing b (degrees), height y (no fissures: the walkable skin)
export function trunkR(b, y) {
  return baseR(y) * (1 + lobes(b, y)) + flare(b, y);
}
const bearingOf = (x, z) => ((Math.atan2(x - TREE.x, -(z - TREE.z)) / DEG) + 360) % 360;

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function buildGodTree(B, ctx = {}) {
  const { W, game, level, light, area, zoneTitle, devStart, blocker } = B;
  const zone = 'green';
  const LAND = ctx.landing || [30, 18, -330];
  const rand = mulberry32(90210);
  const R = (a, b) => a + (b - a) * rand();
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const K = makeVerdantKit(B, { seed: 31 });
  const C = creatureKit(B);
  const KM = kitMaterials();
  const tagC = (hex, t) => `<b style="color:${hex}">${t}</b>`;
  const G_ = (t) => tagC('#3dff7a', t), Y_ = (t) => tagC('#ffd23a', t), R_ = (t) => tagC('#ff3344', t);
  const say = (min, max, html, time = 6) => W.trigger(min, max, () => game.hud.message(html, time));
  const cp = (pos, yaw, size = [4, 3, 4], name = null) => new Checkpoint(W, game, { pos, yaw, size, name });
  const MOOD_VIEW = { music: 'music_tree', ambient: 'amb_canopy', atmosphere: 'verdantTreeView' };
  const MOOD = { music: 'music_tree', ambient: 'amb_canopy', atmosphere: 'verdantTree' };

  // ================================================================ ATMOSPHERE
  // The approach: the mist lies low and the air opens up so the whole tree stands in it, lit from the east,
  // its crown hazed in gold. On the tree: close, humid, green; the forest presses in.
  level.atmospheres.verdantTreeView = {
    fog: 0x6d8462, fogNear: 34, fogFar: 330,
    skyTop: [0.05, 0.1, 0.08], skyMid: [0.12, 0.19, 0.12], skyHorizon: [0.24, 0.3, 0.17], aurora: 0.02, stars: 0,
    hemiSky: 0xd8f2b4, hemiGround: 0x1c3420, hemiIntensity: 0.85,
    sunColor: 0xffe2a0, sunIntensity: 1.75, sunDir: [0.62, 0.9, 0.18],
    exposure: 1.02, bloom: 0.6,
  };
  level.atmospheres.verdantTree = {
    fog: 0x4f6846, fogNear: 12, fogFar: 170,
    skyTop: [0.03, 0.07, 0.05], skyMid: [0.08, 0.14, 0.08], skyHorizon: [0.15, 0.21, 0.11], aurora: 0.02, stars: 0,
    hemiSky: 0xcfeab0, hemiGround: 0x16301a, hemiIntensity: 0.78,
    sunColor: 0xffdf98, sunIntensity: 1.5, sunDir: [0.62, 0.9, 0.18],
    exposure: 1.0, bloom: 0.6,
  };
  const DEAD = {
    fog: 0x4c565c, skyTop: [0.02, 0.025, 0.04], skyMid: [0.06, 0.07, 0.085], skyHorizon: [0.13, 0.14, 0.16], aurora: 0, stars: 0.15,
    hemiSky: 0xa9b8c8, hemiGround: 0x16181c, hemiIntensity: 0.62, sunColor: 0xc4d4e6, sunIntensity: 0.85, exposure: 0.9, bloom: 0.32,
  };

  // ================================================================ MATERIALS
  const barkTex = canvasTex(256, 256, (g, s) => {
    g.fillStyle = '#5a4c3a';
    g.fillRect(0, 0, s, s);
    // long ridges and furrows running up the bark, wavering
    for (let i = 0; i < 70; i++) {
      let x = rand() * s;
      const w = 1 + rand() * 5, dark = rand() < 0.55;
      g.fillStyle = dark ? `rgba(${18 + rand() * 18},${14 + rand() * 12},${10 + rand() * 8},${0.45 + rand() * 0.45})` : `rgba(${120 + rand() * 50},${108 + rand() * 40},${84 + rand() * 30},${0.12 + rand() * 0.2})`;
      for (let y = 0; y < s; y += 4) {
        x += (rand() - 0.5) * 2.2;
        g.fillRect(((x % s) + s) % s, y, w, 5);
      }
    }
    // cross-checks between the ridges
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(20,16,12,${0.25 + rand() * 0.35})`;
      g.fillRect(rand() * s, rand() * s, 3 + rand() * 9, 1 + rand() * 1.5);
    }
    // lichen and moss flecks
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rand() < 0.75 ? `rgba(${60 + rand() * 50},${100 + rand() * 70},${40 + rand() * 30},${0.25 + rand() * 0.4})` : `rgba(${150 + rand() * 60},${160 + rand() * 50},${110 + rand() * 30},${0.2 + rand() * 0.3})`;
      g.fillRect(rand() * s, rand() * s, 1 + rand() * 4, 1 + rand() * 3);
    }
  });
  const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, vertexColors: true, roughness: 1 });
  const limbMat = new THREE.MeshStandardMaterial({ map: barkTex, vertexColors: true, roughness: 1, flatShading: true });
  const mossTex = canvasTex(128, 128, (g, s) => {
    g.fillStyle = '#35561f';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${40 + rand() * 70},${80 + rand() * 100},${20 + rand() * 40},${0.35 + rand() * 0.5})`;
      g.beginPath();
      g.arc(rand() * s, rand() * s, 0.6 + rand() * 2.4, 0, PI * 2);
      g.fill();
    }
  });
  const mossMat = new THREE.MeshStandardMaterial({ map: mossTex, color: 0xb8cc98, roughness: 1, flatShading: true });
  // leaf cards: a cutout cluster of leaves (alpha tested), the forest's density for few triangles
  const leafTex = canvasTex(128, 128, (g, s) => {
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 46; i++) {
      const a = rand() * PI * 2, d = rand() * s * 0.36, x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d;
      const l = 9 + rand() * 14, w = l * (0.35 + rand() * 0.2);
      const v = rand();
      g.fillStyle = `rgb(${30 + v * 60},${70 + v * 90},${22 + v * 30})`;
      g.save();
      g.translate(x, y);
      g.rotate(a + (rand() - 0.5));
      g.beginPath();
      g.ellipse(0, 0, l, w, 0, 0, PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(20,40,14,0.6)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(-l, 0);
      g.lineTo(l, 0);
      g.stroke();
      g.restore();
    }
  }, false);
  const leafCardMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, color: 0xcfe0b8 });
  // moss curtains: long hanging strands (alpha tested)
  const curtainTex = canvasTex(64, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = rand() * w, len = h * (0.35 + rand() * 0.65), sw = 1 + rand() * 2.5;
      const v = rand();
      g.fillStyle = `rgba(${48 + v * 50},${78 + v * 70},${30 + v * 30},1)`;
      let xx = x;
      for (let y = 0; y < len; y += 3) {
        xx += (rand() - 0.5) * 1.2;
        g.fillRect(xx, y, sw * (1 - (y / len) * 0.6), 3.5);
      }
    }
  }, false);
  const curtainMat = new THREE.MeshStandardMaterial({ map: curtainTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1, color: 0xb0c890 });
  const blobTex = canvasTex(64, 64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  }, false);
  const shaftTex = canvasTex(64, 64, (g, s) => {
    const h = g.createLinearGradient(0, 0, s, 0);
    h.addColorStop(0, 'rgba(255,255,255,0)');
    h.addColorStop(0.5, 'rgba(255,255,255,1)');
    h.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = h;
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'destination-in';
    const v = g.createLinearGradient(0, 0, 0, s);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.2, 'rgba(0,0,0,1)');
    v.addColorStop(0.75, 'rgba(0,0,0,0.5)');
    v.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = v;
    g.fillRect(0, 0, s, s);
  }, false);
  const mistMat = new THREE.MeshBasicMaterial({ map: blobTex, color: 0xc8e8c0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  const mistGlowMat = new THREE.MeshBasicMaterial({ map: blobTex, color: 0x9dffc4, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTex, color: 0xf6ffd0, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const fungusMat = new THREE.MeshStandardMaterial({ color: 0xc9b98e, roughness: 0.85, flatShading: true, vertexColors: true });
  const capGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5dffc8).multiplyScalar(1.15) });
  const goldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd25a).multiplyScalar(1.4) });
  const stoneMat = KM.granite, glyphMat = KM.glyph;
  const woodTex = canvasTex(64, 64, (g, s) => {
    g.fillStyle = '#5b4630';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 16) {
      g.fillStyle = 'rgba(20,14,8,0.8)';
      g.fillRect(0, y, s, 1.5);
      for (let i = 0; i < 12; i++) {
        g.fillStyle = `rgba(${30 + rand() * 30},${22 + rand() * 18},${12 + rand() * 10},0.5)`;
        g.fillRect(rand() * s, y + 2 + rand() * 12, 4 + rand() * 20, 1);
      }
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${50 + rand() * 40},${90 + rand() * 50},${30 + rand() * 20},0.4)`;
      g.fillRect(rand() * s, rand() * s, 2 + rand() * 4, 1 + rand() * 3);
    }
  });
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, color: 0xc0aa90, roughness: 1, flatShading: true });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 1, flatShading: true });
  // the sap veins: glowing green, a slow pulse climbing them (the tree's blood, being drawn up)
  const veinMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uLife: { value: 1 }, uColor: { value: new THREE.Color(0x3dff6a).multiplyScalar(0.55) } }]),
    vertexShader: `
      attribute float aT;
      varying float vT;
      #include <fog_pars_vertex>
      void main() {
        vT = aT;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime, uLife;
      uniform vec3 uColor;
      varying float vT;
      #include <fog_pars_fragment>
      void main() {
        float p = 0.55 + 0.45 * pow(0.5 + 0.5 * sin(vT * 0.9 - uTime * 2.2), 6.0);
        vec3 c = uColor * (0.7 + 1.1 * p);
        vec3 dead = vec3(0.12, 0.13, 0.11);
        gl_FragColor = vec4(mix(dead, c, uLife), 1.0);
        #include <fog_fragment>
      }`,
    fog: true,
  });
  W.add({ update: (dt) => (veinMat.uniforms.uTime.value += dt) });

  // everything static is collected per material and per AREA (so the climb's far parts cull on their own)
  let lists = new Map();
  const put = (m, geo, x = 0, y = 0, z = 0) => {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'aT'].includes(a)) g.deleteAttribute(a);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (m.vertexColors && !g.attributes.color) {
      const c = new Float32Array(g.attributes.position.count * 3).fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    if (x || y || z) g.translate(x, y, z);
    if (!lists.has(m)) lists.set(m, []);
    lists.get(m).push(g);
    return g;
  };
  const meshes = [];
  function flush(tag) {
    for (const [m, geos] of lists) {
      if (!geos.length) continue;
      // (vertex-colored and plain geometries can't merge together: split by attribute set)
      const groups = new Map();
      for (const g of geos) {
        const key = Object.keys(g.attributes).sort().join();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(g);
      }
      for (const gs of groups.values()) {
        const mesh = new THREE.Mesh(mergeGeometries(gs, false), m);
        gs.forEach((g) => g.dispose());
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        mesh.userData.treeArea = tag;
        if (m.transparent) mesh.renderOrder = 2;
        W.scene.add(mesh);
        meshes.push(mesh);
      }
    }
    lists = new Map();
    K.flush();
  }
  // a vertex color for every vertex of g from fn(x, y, z, nx, ny, nz) → [r, g, b]
  function tint(g, fn) {
    const p = g.attributes.position, n = g.attributes.normal;
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const col = fn(p.getX(i), p.getY(i), p.getZ(i), n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
      c[i * 3] = col[0];
      c[i * 3 + 1] = col[1];
      c[i * 3 + 2] = col[2];
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  }
  // bark shading: dark underneath and low down, moss-tinted where it faces up or north, a damp sheen low
  const barkShade = (x, y, z, nx, ny, nz) => {
    const up = Math.max(0, ny), under = Math.max(0, -ny);
    const moss = Math.min(1, up * 0.9 + Math.max(0, -nz) * 0.25 + (y < 26 ? (26 - y) * 0.012 : 0));
    const dark = 0.62 + 0.38 * (1 - under) - (y < 12 ? (12 - y) * 0.02 : 0);
    const n = 0.9 + 0.2 * Math.sin(x * 1.7 + z * 1.3) * Math.sin(y * 0.9);
    const r = (1 - moss) * 1.0 + moss * 0.55, gg = (1 - moss) * 0.93 + moss * 1.05, b = (1 - moss) * 0.85 + moss * 0.45;
    return [r * dark * n, gg * dark * n, b * dark * n];
  };

  // ---------------------------------------------------------------- collision helpers
  const solid = (x1, y1, z1, x2, y2, z2, kind = 'grass', extra = {}) =>
    W.addSolid(new THREE.Vector3(Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2)), new THREE.Vector3(Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2)), { static: true, kind, ...extra });
  // a walkway along points [[x, y(top), z], ...]: square boxes every ~half its width (each at its point's top),
  // so it can follow any curve; step rises of up to 0.45 m between points walk up by themselves
  function strip(pts, w, { thick = 1.2, kind = 'grass', spacing = 0 } = {}) {
    const h = w / 2;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1, z1] = pts[i], [x2, y2, z2] = pts[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const sloped = Math.abs(y2 - y1) > 0.05;
      // a sloped run along x or z: slices across its full width, each only a step long (so overlapping
      // boxes don't lift the walk ahead of itself); anything else: overlapping squares
      const axisX = Math.abs(z2 - z1) < 0.15 * len, axisZ = Math.abs(x2 - x1) < 0.15 * len;
      const sp = spacing || (sloped ? 0.4 : Math.max(0.4, w * 0.45));
      const n = Math.max(1, Math.ceil(len / sp));
      for (let k = 0; k <= n; k++) {
        if (k === n && i < pts.length - 2) continue;
        const t = k / n, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t, z = z1 + (z2 - z1) * t;
        if (sloped && (axisX || axisZ)) {
          const a = len / n / 2 + 0.02;
          if (axisX) solid(x - a, y - thick, z - h, x + a, y, z + h, kind);
          else solid(x - h, y - thick, z - a, x + h, y, z + a, kind);
        } else solid(x - h, y - thick, z - h, x + h, y, z + h, kind);
      }
    }
  }

  // ---------------------------------------------------------------- organic geometry
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3(), _bn = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  // A limb along a curve: rings of a superellipse cross-section (flat-topped when flat > 2), radius r(u)
  // (u 0..1 along), knobbly; bark texture along it, shaded. topAt(u) gives the flat top's height there.
  function limb(curve, r0, r1, { seg = 14, rings = 0, flat = 2, squash = 1, knob = 0.12, mat: m = limbMat, shade = barkShade, cap = true } = {}) {
    const len = curve.getLength();
    const nR = rings || Math.max(4, Math.ceil(len / 1.4));
    const pos = [], uv = [], idx = [];
    const frames = curve.computeFrenetFrames(nR, false);
    for (let i = 0; i <= nR; i++) {
      const u = i / nR;
      curve.getPointAt(u, _a);
      const T = frames.tangents[i];
      // a frame that keeps "up" up (so the flat top stays flat)
      _n.copy(UP).addScaledVector(T, -UP.dot(T));
      if (_n.lengthSq() < 1e-4) _n.set(1, 0, 0);
      _n.normalize();
      _bn.crossVectors(T, _n).normalize();
      const r = r0 + (r1 - r0) * u;
      for (let j = 0; j <= seg; j++) {
        const th = (j / seg) * PI * 2;
        const c = Math.cos(th), s = Math.sin(th);
        // superellipse: |c|^(2/flat) keeps the shape boxier as flat grows
        const sx = Math.sign(c) * Math.pow(Math.abs(c), 2 / flat), sy = Math.sign(s) * Math.pow(Math.abs(s), 2 / flat);
        const k = 1 + knob * (Math.sin(th * 3 + u * 17) * 0.6 + Math.sin(th * 7 - u * 29) * 0.4);
        const yy = sy < 0 ? sy * squash : sy; // (squash < 1: a flatter underside)
        _b.copy(_a).addScaledVector(_bn, sx * r * k).addScaledVector(_n, yy * r * (flat > 2 ? 0.7 : 1) * k);
        pos.push(_b.x, _b.y, _b.z);
        uv.push((j / seg) * Math.max(1, Math.round(r * 1.2)), u * len * 0.25);
      }
    }
    for (let i = 0; i < nR; i++)
      for (let j = 0; j < seg; j++) {
        const a = i * (seg + 1) + j, b2 = a + seg + 1;
        idx.push(a, b2, a + 1, b2, b2 + 1, a + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (m.vertexColors) tint(g, shade);
    put(m, g);
    if (cap) {
      curve.getPointAt(1, _a);
      const e = new THREE.IcosahedronGeometry(r1 * 1.05, 1);
      if (m.vertexColors) tint(e, shade);
      put(m, e, _a.x, _a.y, _a.z);
    }
    return { len, topAt: (u) => (curve.getPointAt(u, _a), _a.y + (r0 + (r1 - r0) * u) * (flat > 2 ? 0.7 : 1)) };
  }
  const curveOf = (pts, tension = 0.5) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', tension);
  // a cluster of leaf cards round a point (3 crossed quads per card, random sizes)
  function leaves(x, y, z, r, n = 6, size = [2.5, 5]) {
    for (let i = 0; i < n; i++) {
      const s = R(size[0], size[1]);
      const g = new THREE.PlaneGeometry(s, s);
      g.rotateX(R(-1.2, 1.2)).rotateY(R(0, PI)).rotateZ(R(-0.5, 0.5));
      const a = R(0, PI * 2), d = R(0, r), e = R(-0.5, 0.5) * r;
      put(leafCardMat, g, x + Math.cos(a) * d, y + e, z + Math.sin(a) * d);
    }
  }
  // a mass of foliage: a dark core blob and leaf cards round it
  function foliage(x, y, z, r, dense = 1) {
    const core = new THREE.IcosahedronGeometry(r * 0.7, 1).scale(1, 0.62, 1);
    put(rand() < 0.5 ? KM.leaf : KM.leafLit, core, x, y, z);
    leaves(x, y, z, r, Math.round(8 * dense * (r / 4)), [r * 0.6, r * 1.2]);
  }
  // a moss curtain hanging from a point: a few strand cards
  function curtain(x, y, z, len, w = 2.2, yaw = R(0, PI)) {
    const g = new THREE.PlaneGeometry(w, len);
    g.translate(0, -len / 2, 0).rotateY(yaw);
    put(curtainMat, g, x, y, z);
    if (rand() < 0.6) {
      const g2 = new THREE.PlaneGeometry(w * 0.7, len * 0.8);
      g2.translate(0, -len * 0.4, 0).rotateY(yaw + PI / 2 + R(-0.4, 0.4));
      put(curtainMat, g2, x + R(-0.3, 0.3), y, z + R(-0.3, 0.3));
    }
  }
  // a bracket fungus shelf: a flattened half-dome against the bark, facing out along bearing b
  function bracket(x, y, z, r, b, glow = false) {
    const g = new THREE.SphereGeometry(r, 12, 5, 0, PI, 0, PI / 2);
    g.scale(1, 0.32, 0.9);
    // ridges on the cap
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vz = p.getZ(i), d = Math.hypot(vx, vz);
      p.setY(i, p.getY(i) + Math.sin(d * 6) * 0.04 * r);
    }
    g.rotateY(-b * DEG + PI / 2);
    g.computeVertexNormals();
    tint(g, (vx, vy, vz, nx, ny) => {
      const k = 0.75 + 0.25 * Math.max(0, ny);
      const ring = 0.85 + 0.15 * Math.sin(Math.hypot(vx, vz) * 7);
      return [k * ring, k * ring * 0.95, k * ring * 0.8];
    });
    put(fungusMat, g, x, y, z);
    const u = new THREE.CircleGeometry(r * 0.98, 12, 0, PI).rotateX(PI / 2).scale(1, 1, 0.9).rotateY(-b * DEG + PI / 2);
    put(glow ? capGlowMat : fungusMat, u, x, y - 0.02, z);
  }
  // a mushroom (stalk + cap), glowing gills
  function mushroom(x, y, z, h, r, glow = true) {
    const st = new THREE.CylinderGeometry(r * 0.16, r * 0.24, h, 7);
    put(fungusMat, st, x, y + h / 2, z);
    const cap = new THREE.SphereGeometry(r, 12, 5, 0, PI * 2, 0, PI / 2).scale(1, 0.45, 1);
    put(fungusMat, cap, x, y + h, z);
    put(glow ? capGlowMat : fungusMat, new THREE.CircleGeometry(r * 0.96, 12).rotateX(PI / 2), x, y + h - 0.01, z);
  }
  // a giant light shaft through the canopy
  function shaft(x, y, z, h, w, tilt = 0.18, op = 1) {
    const g = new THREE.PlaneGeometry(w, h);
    for (const a of [0, PI / 2]) {
      const c = g.clone().rotateY(a + R(-0.2, 0.2)).rotateZ(tilt).rotateX(tilt * 0.4);
      put(shaftMat, c, x, y, z);
    }
    void op;
  }

  // ================================================================ THE TRUNK
  // One mesh, rings from deep in the mist up into the crown: lobed and slowly twisting, ridged with deep
  // fissures, buttresses flaring out at the base like cliffs. The body is a smooth cylinder push-out (the
  // player is kept off the skin exactly) plus stacks of boxes inside it for shots and creatures.
  const FISSURES = [];
  for (let i = 0; i < 18; i++) FISSURES.push([R(0, 360), R(0.4, 1.0), R(2.5, 5), R(0, 10)]); // bearing, depth, width (deg), phase
  const fissure = (b, y) => {
    let d = 0;
    const tb = b - y * 0.26; // (they spiral with the bark)
    for (const [fb, dep, w, ph] of FISSURES) {
      const k = angDiff(tb, fb) / w;
      if (Math.abs(k) > 3) continue;
      d += dep * Math.exp(-k * k) * (0.6 + 0.4 * Math.sin(y * 0.11 + ph));
    }
    return d;
  };
  // burls: knotty swellings here and there
  const BURLS = [];
  for (let i = 0; i < 26; i++) BURLS.push([R(0, 360), R(8, 95), R(1.2, 3.2), R(3, 7)]); // bearing, y, height (m out), size (m)
  const burl = (b, y, r) => {
    let s = 0;
    for (const [bb, by, h, sz] of BURLS) {
      const dx = (angDiff(b, bb) * DEG * r) / sz, dy = (y - by) / sz;
      const d2 = dx * dx + dy * dy;
      if (d2 < 9) s += h * Math.exp(-d2);
    }
    return s;
  };
  {
    const COLS = 128, Y0 = -36, Y1 = TREE.top, DY = 1.25;
    const rows = Math.round((Y1 - Y0) / DY);
    const pos = [], uv = [], col = [], idx = [];
    for (let i = 0; i <= rows; i++) {
      const y = Y0 + i * DY;
      for (let j = 0; j <= COLS; j++) {
        const b = (j / COLS) * 360;
        const r0 = trunkR(b, y);
        const f = fissure(b, y);
        const r = r0 - f * 0.9 + burl(b, y, r0);
        const [x, , z] = P(b, r, y);
        pos.push(x, y, z);
        uv.push((j / COLS) * 14, y / 5);
        // shading: deep fissures dark, moss on the north side and low down, wet near the mist
        const moss = Math.min(1, Math.max(0, Math.cos(b * DEG) * 0.4 + 0.1) + (y < 30 ? (30 - y) * 0.018 : 0) + (rand() * 0.15));
        const dark = (1 - Math.min(0.75, f * 0.85)) * (y < 10 ? 0.55 + 0.045 * Math.max(0, y) : 1);
        const n = 0.88 + 0.12 * Math.sin(b * 0.31 + y * 0.7);
        col.push(((1 - moss) * 1.0 + moss * 0.58) * dark * n, ((1 - moss) * 0.92 + moss * 1.0) * dark * n, ((1 - moss) * 0.84 + moss * 0.48) * dark * n);
      }
    }
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < COLS; j++) {
        const a = i * (COLS + 1) + j, b2 = a + COLS + 1;
        idx.push(a, a + 1, b2, b2, a + 1, b2 + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const trunk = new THREE.Mesh(g, barkMat);
    trunk.matrixAutoUpdate = false;
    trunk.updateMatrix();
    W.scene.add(trunk);
    meshes.push(trunk);
    // the glowing sap veins: in the deepest fissures, climbing the trunk (aT: metres along, for the pulse)
    const veins = [];
    for (let k = 0; k < 6; k++) {
      const [fb] = FISSURES[k * 3];
      const pts = [];
      const y0 = R(-4, 14), y1 = R(70, 98);
      for (let y = y0; y <= y1; y += 2) {
        const b = fb + y * 0.26 + Math.sin(y * 0.07 + k) * 3 + Math.sin(y * 0.23 + k * 2) * 1.2;
        pts.push(new THREE.Vector3(...P(b, trunkR(b, y) - 0.25, y)));
      }
      const c = new THREE.CatmullRomCurve3(pts);
      const len = c.getLength();
      const tg = new THREE.TubeGeometry(c, Math.ceil(len / 1.5), R(0.09, 0.16), 5, false);
      const t = new Float32Array(tg.attributes.position.count);
      const segs = Math.ceil(len / 1.5);
      for (let i = 0; i < t.length; i++) t[i] = (Math.floor(i / 6) / segs) * len;
      tg.setAttribute('aT', new THREE.BufferAttribute(t, 1));
      veins.push(tg);
      // branches off the vein: little rivulets
      for (let s = 0; s < 5; s++) {
        const u = R(0.1, 0.9);
        const p0 = c.getPointAt(u);
        const b0 = bearingOf(p0.x, p0.z);
        const sub = [];
        for (let q = 0; q < 6; q++) {
          const y = p0.y - q * 1.4, b = b0 + q * R(1, 2.2) * (s % 2 ? 1 : -1);
          sub.push(new THREE.Vector3(...P(b, trunkR(b, y) - 0.15, y)));
        }
        const sc = new THREE.CatmullRomCurve3(sub);
        const st = new THREE.TubeGeometry(sc, 6, 0.08, 4, false);
        st.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(st.attributes.position.count).fill(u * len), 1));
        veins.push(st);
      }
    }
    for (const v of veins) for (const a of Object.keys(v.attributes)) if (!['position', 'aT'].includes(a)) v.deleteAttribute(a);
    const vm = new THREE.Mesh(mergeGeometries(veins.map((v) => (v.index ? v.toNonIndexed() : v)), false), veinMat);
    vm.matrixAutoUpdate = false;
    W.scene.add(vm);
    meshes.push(vm);
  }
  // the body: push the player out of the bark (round, exact) ...
  W.add({
    update(dt, p) {
      if (!p || p.pos.y > TREE.top + 2 || p.pos.y < -40) return;
      const dx = p.pos.x - TREE.x, dz = p.pos.z - TREE.z;
      const d = Math.hypot(dx, dz);
      if (d > 36) return;
      const b = bearingOf(p.pos.x, p.pos.z);
      let r = 0;
      for (const yy of [p.pos.y + 0.1, p.pos.y + 0.9, p.pos.y + 1.7]) r = Math.max(r, trunkR(b, Math.min(yy, TREE.top)));
      r += 0.38;
      if (d < r && d > 1e-3) {
        p.pos.x = TREE.x + (dx / d) * r;
        p.pos.z = TREE.z + (dz / d) * r;
        const vr = (p.vel.x * dx + p.vel.z * dz) / d;
        if (vr < 0) {
          p.vel.x -= (vr * dx) / d;
          p.vel.z -= (vr * dz) / d;
        }
      }
    },
  });
  // ... and slabs inside it, hugging the bark (shots, globs, goo and creatures stop at the skin): per 6 m band,
  // slices along x and along z, each as long as the bark allows (the union is a close polygon)
  for (let y = -6; y < TREE.top; y += 6) {
    const pts = [];
    for (let b = 0; b < 360; b += 1) {
      let r = Infinity;
      for (const yy of [y, y + 3, Math.min(y + 6, TREE.top)]) r = Math.min(r, trunkR(b, yy));
      r -= 0.25;
      pts.push([r * Math.sin(b * DEG), -r * Math.cos(b * DEG)]);
    }
    const N = 14;
    let rmax = 0;
    for (const [px, pz] of pts) rmax = Math.max(rmax, Math.abs(px), Math.abs(pz));
    for (const axis of [0, 1]) {
      for (let i = 0; i < N; i++) {
        const a1 = -rmax + (2 * rmax * i) / N, a2 = -rmax + (2 * rmax * (i + 1)) / N;
        let lo = -Infinity, hi = Infinity;
        for (const pt of pts) {
          const a = pt[axis], c = pt[1 - axis];
          if (a < a1 - 0.5 || a > a2 + 0.5) continue;
          if (c > 0) hi = Math.min(hi, c);
          else lo = Math.max(lo, c);
        }
        if (!(Number.isFinite(hi) && Number.isFinite(lo) && hi > 0.5 && lo < -0.5)) continue;
        if (axis === 0) solid(TREE.x + a1, y, TREE.z + lo, TREE.x + a2, y + 6, TREE.z + hi, 'rock', { treeBody: true });
        else solid(TREE.x + lo, y, TREE.z + a1, TREE.x + hi, y + 6, TREE.z + a2, 'rock', { treeBody: true });
      }
    }
  }

  // ================================================================ THE CHASM: mist, water, the forest walls
  // The tree stands in a drowned sinkhole: black water far down, mist lying over it in sheets, and the jungle
  // rising round it in walls of trunks and leaves. Falling in fades you back to the last checkpoint.
  B.killZone([20, -60, -470], [150, 7, -300]);
  {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(170, 190).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ color: 0x0c1610, roughness: 0.15, metalness: 0.85 }));
    water.position.set(80, -2, -385);
    W.scene.add(water);
    // mist sheets: soft discs stacked low, drifting slowly
    const sheets = [];
    for (let i = 0; i < 70; i++) {
      const a = R(0, PI * 2), d = Math.sqrt(rand()) * 70 + 12;
      const x = TREE.x + Math.cos(a) * d, z = TREE.z + Math.sin(a) * d;
      if (z > -308 || x < 24) continue;
      const s = R(18, 40);
      const g = new THREE.PlaneGeometry(s, s).rotateX(-PI / 2);
      put(i % 4 ? mistMat : mistGlowMat, g, x, R(1, 11), z);
      sheets.push(g);
    }
    // standing veils round the trunk's foot
    for (let i = 0; i < 26; i++) {
      const b = R(0, 360), r = R(24, 45);
      const [x, , z] = P(b, r, 0);
      if (z > -306 || x < 26) continue;
      const g = new THREE.PlaneGeometry(R(16, 30), R(10, 18));
      g.rotateY(-b * DEG);
      put(mistMat, g, x, R(6, 12), z);
    }
  }
  // the forest walls round the chasm: tiers of trunks (no collision: nobody gets out there), the canopy above
  function wildTree(x, y, z, h, r) {
    const lean = [R(-3, 3), R(-3, 3)];
    const pts = [[x, y - 30, z], [x + lean[0] * 0.3, y + h * 0.4, z + lean[1] * 0.3], [x + lean[0], y + h * 0.8, z + lean[1]], [x + lean[0] * 1.2, y + h, z + lean[1] * 1.2]];
    limb(curveOf(pts), r, r * 0.55, { seg: 10, flat: 2, knob: 0.1, cap: false });
    const top = pts[2];
    const n = 5 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2 + R(-0.3, 0.3), d = R(7, 14);
      const end = [top[0] + Math.cos(a) * d, top[1] + R(2, 10), top[2] + Math.sin(a) * d];
      limb(curveOf([[top[0], top[1] - 2, top[2]], [(top[0] + end[0]) / 2, (top[1] + end[1]) / 2 + 2, (top[2] + end[2]) / 2], end]), r * 0.4, r * 0.15, { seg: 6, rings: 5, knob: 0.06 });
      foliage(end[0], end[1] + 1.5, end[2], R(6, 10), 1);
    }
    foliage(pts[3][0], pts[3][1] + 4, pts[3][2], R(9, 13), 1.1);
    for (let i = 0; i < 5; i++) curtain(top[0] + R(-9, 9), top[1] + R(-2, 6), top[2] + R(-9, 9), R(8, 20), R(2.5, 4.5));
  }
  for (const [x, z, h, r] of [
    [126, -328, 44, 3.4], [142, -366, 52, 4.2], [138, -408, 48, 3.8], [124, -448, 56, 4.4], [92, -470, 50, 4], [54, -470, 46, 3.6], [22, -446, 42, 3.2],
    [156, -392, 40, 3], [112, -484, 46, 3.4], [70, -492, 58, 4.6], [30, -476, 38, 3], [150, -436, 50, 3.6], [112, -312, 36, 2.8], [10, -404, 38, 2.8],
    [162, -348, 46, 3.6], [6, -440, 50, 3.8], [84, -500, 44, 3.4], [134, -470, 40, 3.2],
  ])
    wildTree(x, 0, z, h, r);
  flush('chasm');

  // ================================================================ THE GREAT ROOTS (buttresses into the mist, and the walkable one)
  // Surface roots arch out from the buttresses over the mist and dive back in; one of them reaches all the
  // way to the landing: the way in.
  for (const [bb, reach, h] of BUTTRESS) {
    const r0 = trunkR(bb, 4);
    for (const side of [-1, 1]) {
      if (rand() < 0.35) continue;
      const b1 = bb + side * R(6, 14);
      const len = R(14, 30);
      const pts = [P(bb, r0 - 2, R(6, 14)), P(b1, r0 + len * 0.45, R(7, 12)), P(b1 + side * 4, r0 + len, R(-4, 3))];
      limb(curveOf(pts), R(1.6, 2.6), 0.7, { seg: 10, knob: 0.15 });
    }
    void reach;
    void h;
  }
  // THE SURFACE ROOT: the walkable one, from the landing to the Root Gate (with one broken stretch to jump)
  const L0 = [LAND[0] + 3.4, LAND[1], LAND[2] - 1.2];
  const ROOT_A = [L0, [39, 18.3, -336.5], [44.5, 18.7, -342.5], [48.6, 19.1, -348]]; // to the break
  const ROOT_B = [[50.6, 19.3, -351.6], [53.5, 19.6, -357.5], [55.5, 19.9, -363.5], [57.2, 20, -368.8]]; // after it
  const GATE_B = 250; // the Root Gate's bearing
  {
    const rootPts = (pts, extra) => pts.map(([x, y, z]) => [x, y - 1.15, z]).concat(extra || []);
    limb(curveOf(rootPts([[L0[0] - 2, L0[1], L0[2] + 1.5], ...ROOT_A]), 0.4), 2.3, 1.9, { seg: 14, flat: 3.2, squash: 1.2, knob: 0.1 });
    // the broken stretch: the root's end splinters and dives, its other half rears up out of the mist
    limb(curveOf([[48.6, 17.95, -348], [49.3, 15.5, -349.5], [49.6, 8, -350.2]]), 1.8, 0.9, { seg: 10, knob: 0.2 });
    limb(curveOf([[50, 6, -351], [50.3, 15, -351.3], [50.6, 18.15, -351.6]]), 1.0, 1.8, { seg: 10, knob: 0.2, cap: false });
    limb(curveOf(rootPts(ROOT_B, [P(GATE_B + 6, trunkR(GATE_B + 6, 20) - 1, 18.6)]), 0.4), 1.9, 2.6, { seg: 14, flat: 3.2, squash: 1.2, knob: 0.1 });
    strip(ROOT_A, 2.6);
    strip(ROOT_B, 2.6);
    // moss and little plants along its back, curtains hanging off its flanks into the mist
    for (const pts of [ROOT_A, ROOT_B]) {
      const c = curveOf(pts);
      for (let u = 0.05; u < 1; u += 0.12) {
        const p = c.getPointAt(u);
        put(mossMat, new THREE.IcosahedronGeometry(R(0.6, 1.1), 1).scale(1, 0.18, 1), p.x + R(-0.6, 0.6), p.y - 0.06, p.z + R(-0.6, 0.6));
        if (rand() < 0.7) curtain(p.x + R(-1.6, 1.6), p.y - 1.2, p.z + R(-1.6, 1.6), R(3, 8), R(1.2, 2.4));
        if (rand() < 0.4) mushroom(p.x + R(-0.9, 0.9), p.y - 0.05, p.z + R(-0.9, 0.9), R(0.2, 0.5), R(0.12, 0.3));
      }
    }
    // the harvest line's old feeder pipe runs along the root on rusted brackets
    K.pipe([[LAND[0] + 2, LAND[1] - 1.6, LAND[2] + 2.4], [40.6, 17.2, -335.4], [46.4, 17.6, -341.6], [49.8, 17.3, -347.8], [50.4, 15.5, -349.6]], { r: 0.32, leak: [0.92] });
    K.pipe([[51.6, 15.5, -351.4], [52.4, 18.2, -353.5], [55.2, 18.6, -359], [57.6, 18.9, -364.6], [59.6, 19.4, -369]], { r: 0.32 });
  }
  cp([39, 18.3, -336.5], -0.75, [3, 3, 3], 'THE GOD TREE');
  area([L0[0] - 1, LAND[1] - 1, L0[2] - 4], [L0[0] + 6, LAND[1] + 4, L0[2] + 2], MOOD_VIEW);
  zoneTitle([L0[0] - 1, LAND[1] - 1, L0[2] - 6], [L0[0] + 8, LAND[1] + 5, L0[2] + 2], 'EMERALD HOLLOW', 'THE GOD TREE', '#3dff7a');
  say([47, 18, -348], [49.5, 22, -345.5], 'The root is broken here: <b>jump</b> the gap.', 4);
  flush('roots');

  // ================================================================ BOUGHS, LEDGES and DRESSING HELPERS
  // A bough: a flat-topped limb out of the trunk at bearing b (the four boughs point due north, east, south and
  // west), its walk top rising from y0 at the bark to y at r1 m out; a strip of boxes along its top.
  function bough(b, y, r1, { w = 4.6, y0 = y, thick = 3.2, end = 2.2, walkFrom = -0.3 } = {}) {
    const rs = trunkR(b, y0) + walkFrom;
    const n = 7, pts = [], walk = [];
    pts.push(P(b, rs - 5, y0 - thick * 0.7 - 0.6));
    for (let i = 0; i <= n; i++) {
      const t = i / n, r = rs + (r1 - rs) * t, yy = y0 + (y - y0) * t;
      pts.push(P(b, r, yy - thick * 0.7 + Math.sin(t * PI) * 0.12));
      walk.push(P(b, r, yy));
    }
    limb(curveOf(pts, 0.3), thick * 1.25, end, { seg: 16, flat: 3.4, squash: 1.1, knob: 0.09 });
    strip(walk, w * 0.82, { spacing: y0 !== y ? 0.4 : 0 });
    for (let i = 1; i < walk.length; i++) put(mossMat, new THREE.IcosahedronGeometry(w * 0.42, 1).scale(1.2, 0.08, 1.2), walk[i][0], walk[i][1] - 0.02, walk[i][2]);
    return walk;
  }
  // a pocket: the bough's end splays into a flat little world, a mossy floor of interlaced roots, radius rr
  function pocket(cx, y, cz, rr, { boxes = true, seed = 1 } = {}) {
    const n = 28, top = [], side = [];
    const rad = [];
    for (let i = 0; i < n; i++) rad.push(rr * (0.94 + 0.12 * Math.sin(i * 1.7 + seed) + 0.06 * Math.sin(i * 4.3 + seed * 2)));
    // the floor: a moss disc (slightly domed, its rim drooping), bark under it hanging with roots
    const disc = new THREE.CircleGeometry(1, n);
    const p = disc.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), yv = p.getY(i), a = Math.atan2(yv, x), d = Math.hypot(x, yv);
      const k = Math.round(((a + PI * 2) % (PI * 2)) / (PI * 2) * n) % n;
      const r = rad[k] * d;
      p.setXYZ(i, Math.cos(a) * r, Math.sin(a) * r, d > 0.98 ? -0.15 : 0.02);
    }
    disc.rotateX(-PI / 2);
    disc.computeVertexNormals();
    put(mossMat, disc, cx, y, cz);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * PI * 2, a1 = ((i + 1) / n) * PI * 2, r0 = rad[i], r1 = rad[(i + 1) % n];
      top.push([cx + Math.cos(a0) * r0, cz + Math.sin(a0) * r0]);
      side.push([a0, a1, r0, r1]);
    }
    // the underside: a bark bowl (a squashed half-sphere), knotted
    const bowl = new THREE.SphereGeometry(1, n, 6, 0, PI * 2, PI / 2, PI / 2);
    const bp = bowl.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), z = bp.getZ(i), yy = bp.getY(i), a = Math.atan2(z, x);
      const k = Math.round(((a + PI * 2) % (PI * 2)) / (PI * 2) * n) % n;
      const r = rad[k] * 1.01, sq = Math.hypot(x, z);
      bp.setXYZ(i, Math.cos(a) * sq * r, yy * rr * 0.42 * (1 + 0.15 * Math.sin(a * 5 + seed)), Math.sin(a) * sq * r);
    }
    bowl.computeVertexNormals();
    tint(bowl, (x, yy, z, nx, ny) => barkShade(x, yy + y, z, nx, ny, 0));
    put(limbMat, bowl, cx, y - 0.1, cz);
    // roots and moss curtains hanging under it
    for (let i = 0; i < 10; i++) {
      const a = R(0, PI * 2), d = R(0.3, 0.95) * rr;
      curtain(cx + Math.cos(a) * d, y - 0.4 - (1 - d / rr) * rr * 0.3, cz + Math.sin(a) * d, R(3, 9), R(1.5, 3));
    }
    for (let i = 0; i < 6; i++) {
      const a = R(0, PI * 2), d = R(0.7, 1.0) * rr;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      limb(curveOf([[x, y - 0.5, z], [x + Math.cos(a) * 1.2, y - 3, z + Math.sin(a) * 1.2], [x + Math.cos(a) * 1.5, y - R(5, 9), z + Math.sin(a) * 1.5]]), 0.35, 0.08, { seg: 5, rings: 5, knob: 0.2, cap: false });
    }
    if (boxes) {
      // the floor's body: three overlapping boxes inside the disc
      const s1 = rr * 0.93, s2 = rr * 0.62;
      solid(cx - s1, y - 2.2, cz - s2, cx + s1, y, cz + s2);
      solid(cx - s2, y - 2.2, cz - s1, cx + s2, y, cz + s1);
      solid(cx - rr * 0.8, y - 2.2, cz - rr * 0.8, cx + rr * 0.8, y, cz + rr * 0.8);
    }
    return { top, cx, cz, y, rr };
  }
  // a bark ledge on the trunk at bearing b, y: a flat-topped shelf jutting out (depth d m, width w m along)
  function ledge(b, y, { d = 3, w = 3, kind = 'bark', solidBox = true } = {}) {
    const r0 = trunkR(b, y);
    const [x, , z] = P(b, r0 + d / 2 - 0.3, y);
    if (kind === 'fungus') {
      const [fx, , fz] = P(b, r0 - 0.4, y - 0.05);
      bracket(fx, y - 0.32 * Math.max(d, w) * 0.5 + 0.02, fz, Math.max(d, w) * 0.62, b, rand() < 0.4);
    } else {
      const span = (w / (r0 + d / 2)) / DEG;
      const pts = [];
      for (let i = 0; i <= 4; i++) {
        const bb = b - span / 2 + (span * i) / 4;
        pts.push(P(bb, trunkR(bb, y) + d * 0.35 - 0.4, y - 0.7));
      }
      limb(curveOf(pts, 0.5), d * 0.55, d * 0.5, { seg: 12, flat: 3.6, squash: 0.7, knob: 0.12, cap: true });
      put(mossMat, new THREE.IcosahedronGeometry(Math.min(d, w) * 0.5, 1).scale(1.3, 0.12, 1.3), x, y - 0.03, z);
    }
    if (solidBox) {
      const h = Math.min(d, w) / 2;
      solid(x - h, y - 1.2, z - h, x + h, y, z + h, kind === 'fungus' ? 'grass' : 'grass');
    }
    return [x, y, z];
  }
  // a giant sap tap drilled into the bark: a collar plate, the drill's housing, a valve wheel, a fat hose
  function giantTap(b, y, { scale = 1, hose = null } = {}) {
    const r0 = trunkR(b, y);
    const out = (r, yy = y) => P(b, r0 + r, yy);
    const s = scale;
    const q = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(Math.sin(b * DEG), 0, -Math.cos(b * DEG)));
    const cyl = (r1, r2, h, at, m) => {
      const g = new THREE.CylinderGeometry(r1, r2, h, 14).applyQuaternion(q);
      put(m, g, at[0], at[1], at[2]);
    };
    cyl(1.6 * s, 1.8 * s, 0.5 * s, out(0.1), KM.pipeDark);
    cyl(1.1 * s, 1.25 * s, 2.2 * s, out(1.2 * s), KM.pipe);
    cyl(0.75 * s, 0.75 * s, 0.4 * s, out(2.5 * s), KM.pipeDark);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      const [x, yy, z] = out(0.32);
      const tx = Math.cos(b * DEG), tz = Math.sin(b * DEG); // (along the bark, sideways)
      put(KM.pipeDark, new THREE.SphereGeometry(0.12 * s, 6, 4), x + tx * Math.cos(a) * 1.45 * s, yy + Math.sin(a) * 1.45 * s, z + tz * Math.cos(a) * 1.45 * s);
    }
    // the valve wheel on top, a glowing sight glass of sap
    const [vx, vy, vz] = out(1.4 * s, y + 1.25 * s);
    put(KM.rust, new THREE.TorusGeometry(0.45 * s, 0.06 * s, 5, 14).rotateX(PI / 2), vx, vy + 0.3 * s, vz);
    put(KM.pipeDark, new THREE.CylinderGeometry(0.08 * s, 0.08 * s, 0.4 * s, 6), vx, vy + 0.1 * s, vz);
    const [gx, gy, gz] = out(1.4 * s, y - 1.1 * s);
    put(KM.sap, new THREE.CylinderGeometry(0.35 * s, 0.35 * s, 0.8 * s, 10), gx, gy, gz);
    put(KM.glass, new THREE.CylinderGeometry(0.42 * s, 0.42 * s, 0.9 * s, 10, 1, true), gx, gy, gz);
    // sap weeping from the wound round the collar
    for (let i = 0; i < 4; i++) {
      const bb = b + R(-5, 5);
      const [x, , z] = P(bb, trunkR(bb, y) + 0.05, y);
      put(KM.sap, new THREE.CylinderGeometry(0.06, 0.03, R(1.5, 4), 5), x, y - 1.6 * s - R(0.5, 2), z);
    }
    if (hose) K.pipe([out(2.6 * s), ...hose], { r: 0.42 * s, moss: true });
    return out(2.6 * s);
  }
  // a pipe hugging the trunk from (b0, y0) to (b1, y1) at gap m off the bark
  function trunkPipe(b0, y0, b1, y1, { gap = 0.9, r = 0.5, leak = [] } = {}) {
    const pts = [];
    const n = Math.max(4, Math.ceil(Math.abs(b1 - b0) / 12 + Math.abs(y1 - y0) / 6));
    for (let i = 0; i <= n; i++) {
      const t = i / n, b = b0 + (b1 - b0) * t, y = y0 + (y1 - y0) * t;
      pts.push(P(b, trunkR(b, y) + gap, y));
    }
    return K.pipe(pts, { r, leak, moss: true, flanges: true });
  }
  // a side bough holding something up (a vine's anchor): from the bark out and up to `to`, leaves round its tip
  function sideBough(to, { r0 = 1.5, leafy = true } = {}) {
    const b = bearingOf(to[0], to[2]);
    const from = P(b + R(-6, 6), trunkR(b, to[1] - 6) - 1.5, to[1] - R(4, 8));
    const mid = [(from[0] + to[0]) / 2 + R(-1, 1), Math.max(from[1], to[1]) + R(1, 3), (from[2] + to[2]) / 2 + R(-1, 1)];
    const beyond = [to[0] + (to[0] - from[0]) * 0.25, to[1] + R(0.5, 2), to[2] + (to[2] - from[2]) * 0.25];
    limb(curveOf([from, mid, to, beyond]), r0, 0.35, { seg: 9, knob: 0.12 });
    if (leafy) {
      foliage(beyond[0], beyond[1] + 1.5, beyond[2], R(3.5, 5));
      for (let i = 0; i < 3; i++) curtain(to[0] + R(-2, 2), to[1] - 0.4, to[2] + R(-2, 2), R(4, 9), R(1.4, 2.6));
    }
  }
  // epiphytes and moss up a stretch of trunk (claustrophobic: the climb is wrapped in it)
  function overgrow(b0, b1, y0, y1, n) {
    for (let i = 0; i < n; i++) {
      const b = R(b0, b1), y = R(y0, y1), r = trunkR(b, y);
      const k = rand();
      if (k < 0.35) {
        const [x, , z] = P(b, r + 0.2, y);
        curtain(x, y, z, R(4, 12), R(1.6, 3.2), -b * DEG + PI / 2 + R(-0.3, 0.3));
      } else if (k < 0.55) {
        const [x, , z] = P(b, r - 0.2, y);
        bracket(x, y, z, R(0.6, 1.6), b, rand() < 0.3);
      } else if (k < 0.8) {
        const [x, , z] = P(b, r + R(0.5, 1.6), y);
        leaves(x, y, z, 1.2, 3, [1.4, 3]);
      } else {
        const [x, , z] = P(b, r - 0.1, y);
        put(mossMat, new THREE.IcosahedronGeometry(R(0.8, 2), 1).scale(0.5, 1.2, 0.5), x, y, z);
      }
    }
  }
  // a mist sheet hanging round a branch level (the air closes in)
  function mistAt(x, y, z, s, n = 3) {
    for (let i = 0; i < n; i++) put(mistMat, new THREE.PlaneGeometry(s, s).rotateX(-PI / 2), x + R(-s / 3, s / 3), y + R(-2, 2), z + R(-s / 3, s / 3));
  }
  const enc = (o) => B.encounter({ zone, music: 'music_combat', color: '#3dff7a', ...o });
  // seal the way off a pocket with living roots until its fight is won (also on a save: they stay withered)
  function rootSeal(min, max, e) {
    const t = new Thicket(W, { min, max, style: 'roots', sealed: true, material: limbMat, seed: Math.round(min[0]) });
    W.add({ update: () => !t.broken && e.state === 'cleared' && t.wither() });
    return t;
  }
  const lamp = (x, y, z, c, i = 26, d = 26) => light(x, y, z, c, i, d);
  const vines = [];
  const vine = (o) => {
    const v = new VineSwing(W, game, { seed: vines.length + 3, ...o });
    vines.push(v);
    sideBough(o.anchor);
    return v;
  };
  B.onRespawn(() => vines.forEach((v) => v.reset()));

  // ================================================================ THE ROOT GATE (y 20, bearing ~225-262)
  // A terrace among the buttresses where the surface root meets the trunk: two standing stones and a lintel
  // (the old builders came this way), the harvest's first giant tap drilled into the bark, a pump drinking
  // from it, an algae tank glowing in the mist.
  solid(50, 17, -378, 60.5, 20, -366);
  solid(47, 17, -387, 57, 20, -376);
  {
    // the terrace's look: a mound of mossy roots and flat stones
    const c = [53.5, 20, -375];
    const g = new THREE.CylinderGeometry(9, 7.5, 3, 18, 1);
    const pp = g.attributes.position;
    for (let i = 0; i < pp.count; i++) if (pp.getY(i) > 0) pp.setXYZ(i, pp.getX(i) * (1 + 0.06 * Math.sin(i)), pp.getY(i), pp.getZ(i) * (1 + 0.06 * Math.cos(i * 1.3)));
    g.scale(0.85, 1, 1.2).rotateY(0.6);
    put(limbMat, tint(g.toNonIndexed(), barkShade), c[0], 18.5, c[2]);
    put(mossMat, new THREE.CircleGeometry(8.6, 18).rotateX(-PI / 2).scale(0.85, 1, 1.2).rotateY(0.6), c[0], 20.02, c[2]);
    for (let i = 0; i < 9; i++) put(stoneMat, new THREE.BoxGeometry(R(1, 2.2), 0.25, R(1, 2)).rotateY(R(0, PI)), c[0] + R(-5, 4), 20.05, c[2] + R(-6, 6));
    // the standing stones: the gate the root walk passes through
    for (const [x, z] of [[54.2, -369], [59.6, -371.6]]) {
      put(glyphMat, new THREE.BoxGeometry(1.3, 6.2, 1.1).rotateY(0.45), x, 23.1, z);
      put(KM.glow, new THREE.BoxGeometry(1.34, 0.12, 1.14).rotateY(0.45), x, 23.8, z);
      put(mossMat, new THREE.IcosahedronGeometry(0.9, 1).scale(1, 0.3, 1), x, 26.25, z);
      solid(x - 0.65, 20, z - 0.65, x + 0.65, 26.2, z + 0.65, 'rock');
    }
    put(glyphMat, new THREE.BoxGeometry(7.4, 1.1, 1.3).rotateY(0.45), 56.9, 26.7, -370.3);
    curtain(55.5, 26.2, -369.6, 4.5, 2.4, 0.45);
    curtain(58.4, 26.2, -371, 3.5, 2, 0.45);
    // a reactor tank and the pump on the terrace's west side, fed by the giant tap
    K.reactorTank([49.5, 20, -381.5], 7.5, { r: 1.5 });
    const tapEnd = giantTap(248, 23.5, { scale: 1.15 });
    K.pipe([tapEnd, [57.2, 22.8, -381], [53.5, 22.5, -382.6], [51.2, 22.4, -382]], { r: 0.45 });
    K.pumpStation([52.5, 20, -385.2], { yaw: PI / 2, intake: 0 });
    // the conduit: a fat pipe out of the tap spiralling up the trunk all the way to the crown
    trunkPipe(244, 25, 180 - 360 * 1.5, 96, { gap: 1.0, r: 0.6, leak: [0.12, 0.47] });
    trunkPipe(262, 18, 262 - 360 * 1.1, 92, { gap: 1.6, r: 0.38 });
    for (let i = 0; i < 5; i++) mushroom(R(49, 58), 20, R(-384, -372), R(0.3, 0.9), R(0.25, 0.6));
  }
  cp([55, 20, -373], -2.6, [4, 3, 4], 'THE ROOT GATE');
  area([48, 19, -386], [60, 24, -366], MOOD);
  lamp(54, 25, -376, 0x9dffb0, 22, 24);
  say([54, 19, -372], [60, 23, -366], `The hive bleeds this tree. <b>Climb it.</b> Up the carved steps round its south side.`, 6);

  // ================================================================ THE ROOT STAIR (20 → 24.4) and the borer
  // Steps carved into a root hugging the trunk, then a ledge where a borer worm lunges out of the bark across
  // your path: goo its hole shut (or time your run), then up the first bough.
  const STEPS = [];
  for (let i = 0; i < 9; i++) STEPS.push([226 - i * 3.6, 20 + 0.42 * (i + 1)]);
  for (const [b, y] of STEPS) {
    const r0 = trunkR(b, y);
    const [x, , z] = P(b, r0 + 1.4, y);
    solid(x - 1.25, y - 1, z - 1.25, x + 1.25, y, z + 1.25, 'rock');
    // the carved tread: a granite slab set in the root, its face glyph-cut
    put(stoneMat, new THREE.BoxGeometry(2.4, 0.42, 2.4).rotateY(-b * DEG), x, y - 0.21, z);
    put(mossMat, new THREE.BoxGeometry(2.2, 0.05, 1.2).rotateY(-b * DEG), x, y + 0.01, z);
  }
  // the root the steps are cut into, coiling up under them
  limb(curveOf(STEPS.map(([b, y]) => P(b, trunkR(b, y) + 1.2, y - 1.3)), 0.4), 1.6, 1.4, { seg: 10, knob: 0.1 });
  // the borer's ledge: bearings 194 → 186... ends at the first bough
  const L1 = [];
  for (let b = 192.4; b >= 182; b -= 2.6) L1.push(P(b, trunkR(b, 23.8) + 1.5, 23.8));
  strip(L1, 2.6, { kind: 'grass' });
  limb(curveOf(L1.map(([x, y, z]) => [x, y - 0.9, z])), 1.5, 1.4, { seg: 10, flat: 3.4, squash: 0.8, knob: 0.1 });
  for (const [x, y, z] of L1) put(mossMat, new THREE.IcosahedronGeometry(1.2, 1).scale(1, 0.12, 1), x, y - 0.03, z);
  const borer1 = C.borer(P(189, trunkR(189, 25.2) - 0.1, 25.2), [Math.sin(189 * DEG), 0, -Math.cos(189 * DEG)], { color: GREEN, range: 6, length: 14, plugTime: 10 });
  say([L1[0][0] - 2, 23, L1[0][2] - 2], [L1[0][0] + 2, 27, L1[0][2] + 2], `Something lives in that hole. ${G_('Goo it shut')} while it's in — or kill it when it lunges.`, 5);
  overgrow(180, 240, 21, 32, 40);

  // ================================================================ BOUGH 1 · THE SAP TAP (y 30, south)
  // The first great bough slopes up from the bark to a little world at its end: a harvest rig drilled into
  // the wood, an algae reactor, a pump, and the hive's tenders. Win it and the roots let you onto the vines.
  const B1 = { x: 75, z: -350, y: 28.6, r: 8.5 };
  bough(180, B1.y, 26, { y0: 23.8, walkFrom: 2.4, w: 4.8, thick: 3.0, end: 2.6 });
  solid(72, 22.6, -372.4, 78, 23.8, -368.5); // (the bough's flat knuckle against the bark, where the borer's ledge meets it)
  const p1 = pocket(B1.x, B1.y, B1.z, B1.r, { seed: 1 });
  {
    // the rig: a gantry on the pocket's east side, its drill bored into the wood, sap pumped back to the trunk
    const RX = B1.x + 4.6, RZ = B1.z + 1.5;
    for (const sz of [-1, 1]) {
      K.rod(KM.pipeDark, [RX - 1.6, 28.6, RZ + sz * 2], [RX - 0.6, 34.6, RZ + sz * 1.2], 0.2, 0.15, 6);
      K.rod(KM.pipeDark, [RX + 1.6, 28.6, RZ + sz * 2], [RX + 0.6, 34.6, RZ + sz * 1.2], 0.2, 0.15, 6);
    }
    K.rod(KM.pipeDark, [RX, 34.6, RZ - 1.4], [RX, 34.6, RZ + 1.4], 0.25, 0.25, 6);
    K.rod(KM.pipe, [RX, 34.6, RZ], [RX, 29, RZ], 0.55, 0.55, 12);
    put(KM.pipeDark, new THREE.CylinderGeometry(0.9, 0.9, 0.5, 14), RX, 29, RZ);
    put(KM.sap, new THREE.TorusGeometry(0.95, 0.08, 5, 16).rotateX(PI / 2), RX, 28.75, RZ);
    solid(RX - 0.9, 28.6, RZ - 0.9, RX + 0.9, 34.6, RZ + 0.9, 'metal');
    K.pipe([[RX, 34.2, RZ], [RX - 1, 35.2, RZ - 5], [B1.x + 2.6, 33.6, -362], [B1.x + 2.4, 32.1, -368], P(172, trunkR(172, 31.6) + 0.6, 31.6)], { r: 0.4, leak: [0.6] });
    K.reactorTank([B1.x + 5, B1.y, B1.z - 4.5], 6.5, { r: 1.3 });
    K.reactorTank([B1.x - 5.5, B1.y, B1.z + 3.5], 5, { r: 1.0 });
    K.pumpStation([B1.x - 4.8, B1.y, B1.z - 4], { yaw: 0, intake: 0 });
    // cover: a fallen log across the middle, a root hump
    limb(curveOf([[B1.x - 3.5, 29.1, B1.z + 1.2], [B1.x, 29.3, B1.z + 0.8], [B1.x + 3.2, 29.1, B1.z + 1.6]]), 0.7, 0.6, { seg: 9, knob: 0.15 });
    solid(B1.x - 3.4, 28.6, B1.z + 0.5, B1.x + 3.2, 29.8, B1.z + 1.9, 'rock');
    limb(curveOf([[B1.x + 2, 28.2, B1.z + 5.5], [B1.x + 4, 29.5, B1.z + 5], [B1.x + 6, 28.2, B1.z + 4]]), 0.6, 0.4, { seg: 8 });
    solid(B1.x + 2.2, 28.6, B1.z + 4.2, B1.x + 5.6, 29.5, B1.z + 5.8, 'rock');
    for (let i = 0; i < 8; i++) mushroom(B1.x + R(-7, 7), B1.y, B1.z + R(-7, 7), R(0.3, 1), R(0.25, 0.7));
    mistAt(B1.x, 22.6, B1.z, 18, 3);
  }
  const fight1 = enc({
    trigger: [[71, 27.6, -359], [79, 32.6, -355]],
    title: 'THE SAP TAP', sub: 'THE TENDERS WAKE',
    waves: [
      [
        { type: 'slime', pos: [B1.x - 3.5, B1.y, B1.z - 2], color: GREEN, core: RED },
        { type: 'slime', pos: [B1.x + 3.5, B1.y, B1.z + 3], color: GREEN, core: YELLOW },
        { type: 'spider', pos: [B1.x, B1.y, B1.z + 5], color: GREEN, shields: [RED] },
      ],
      [
        { type: 'drone', pos: [B1.x - 4, B1.y + 5, B1.z + 2], color: GREEN, shields: [YELLOW] },
        { type: 'drone', pos: [B1.x + 4, B1.y + 5.5, B1.z - 1], color: YELLOW, shields: [GREEN] },
        { type: 'slime', pos: [B1.x, B1.y, B1.z - 3], color: YELLOW, core: GREEN },
        { type: 'spider', pos: [B1.x - 5, B1.y, B1.z + 4], color: RED, shields: [GREEN] },
      ],
    ],
    checkpoint: { pos: [B1.x, B1.y, B1.z - 6], yaw: EAST },
  });
  const seal1 = rootSeal([B1.x + 7.2, B1.y, B1.z - 5], [B1.x + 8.4, B1.y + 3.2, B1.z + 5], fight1);
  cp([75, 27.3, -361], SOUTH, [4, 3, 3], 'THE SAP TAP');
  B.armor([B1.x - 6.6, B1.y, B1.z - 1]);
  lamp(B1.x + 5, 37, B1.z - 4.5, 0x8dffb0, 22, 26);
  say([71, 29, -357], [79, 33, -351], `Bursting ${G_('globs')} catch the slime clumps; pop the drones' shells with their colors.`, 5);

  // ================================================================ THE VINES (30 → 46), round the south-east
  // Three vines hang from side boughs, each higher than the last: run and jump into one (you grab it), swing,
  // pump with W toward where you look, and jump at the top of the arc to fly to the next.
  const V1 = vine({ anchor: [87.8, 42.4, -351], length: 12.2, sway: [1, 0] });
  const V2 = vine({ anchor: [95.6, 50.4, -360.6], length: 12.6, sway: [0.6, -0.8] });
  const V3 = vine({ anchor: [102.6, 55.4, -369.8], length: 12.8, sway: [0.5, -0.9] });
  say([B1.x + 4, 29, B1.z - 6], [B1.x + 9, 33, B1.z + 6], `<b>Jump into the vine</b> to grab it. Hold <b>W</b> toward where you look to swing higher, <b>JUMP</b> to let go at the top of the arc.`, 8);
  overgrow(100, 175, 30, 50, 46);

  // ================================================================ BOUGH 2 · THE HANGING NESTS (y 46, east)
  // The hive nests here: woven pods hung from the bough above on ropes and heaped on its end, its flyers
  // swarming out of them. Burst the swarms in the air (flak), and the nest choking the catwalk north.
  const B2 = { x: 106, z: -385, y: 46, r: 8.5 };
  bough(90, B2.y, 30, { w: 4.8, thick: 3.0, end: 2.6 });
  const p2 = pocket(B2.x, B2.y, B2.z, B2.r, { seed: 2 });
  // the bough above the nests (their ropes hang from it)
  limb(curveOf([P(84, 11, 58), P(88, 20, 61), P(92, 30, 62.5), P(95, 40, 60)]), 2.4, 0.9, { seg: 12, knob: 0.1 });
  foliage(...P(95, 41, 62), 6);
  foliage(...P(86, 33, 64), 5);
  const nest = (x, y, z, r, rope) => {
    const g = new THREE.SphereGeometry(r, 10, 8);
    const pp = g.attributes.position;
    for (let i = 0; i < pp.count; i++) pp.setXYZ(i, pp.getX(i) * (1 + 0.08 * Math.sin(i * 1.3)), pp.getY(i) * 1.25, pp.getZ(i) * (1 + 0.08 * Math.cos(i)));
    g.computeVertexNormals();
    put(woodMat, g, x, y, z);
    put(KM.glow, new THREE.CircleGeometry(r * 0.35, 8).rotateY(R(0, PI * 2)), x + r * 0.6, y - r * 0.2, z + r * 0.6);
    if (rope) K.rod(ropeMat, [x, y + r * 1.2, z], [x + R(-0.5, 0.5), rope, z + R(-0.5, 0.5)], 0.06, 0.06, 4);
  };
  for (let i = 0; i < 7; i++) {
    const a = R(0, PI * 2), d = R(9, 15);
    nest(B2.x + Math.cos(a) * d * 0.7, R(40, 50), B2.z + Math.sin(a) * d, R(1.2, 2.2), 61);
  }
  // nests heaped on the pocket: cover
  for (const [dx, dz, r] of [[-3.5, -3, 1.4], [3, 2.5, 1.6], [4.5, -4, 1.1], [-4.5, 3.5, 1.2]]) {
    nest(B2.x + dx, B2.y + r * 0.9, B2.z + dz, r, null);
    solid(B2.x + dx - r * 0.8, B2.y, B2.z + dz - r * 0.8, B2.x + dx + r * 0.8, B2.y + r * 1.9, B2.z + dz + r * 0.8, 'grass');
  }
  K.reactorTank([B2.x + 5.5, B2.y, B2.z + 4], 5.5, { r: 1.1 });
  mistAt(B2.x, 40, B2.z, 18, 3);
  const fight2 = enc({
    trigger: [[98, 45, -382], [104, 50, -376]],
    title: 'THE HANGING NESTS', sub: 'THE HIVE SWARMS',
    waves: [
      [
        { type: 'swarm', pos: [B2.x + 2, B2.y + 6, B2.z - 4], color: [GREEN], count: 6 },
        { type: 'drone', pos: [B2.x - 4, B2.y + 5, B2.z + 3], color: GREEN, shields: [RED] },
        { type: 'drone', pos: [B2.x + 5, B2.y + 6, B2.z + 1], color: RED, shields: [GREEN] },
      ],
      [
        { type: 'swarm', pos: [B2.x - 3, B2.y + 7, B2.z - 2], color: [GREEN, YELLOW], count: 7 },
        { type: 'rotflies', pos: [B2.x + 4, B2.y + 1, B2.z + 3], color: GREEN, count: 4, respawn: 0, hive: false },
        { type: 'spider', pos: [B2.x + 3, B2.y, B2.z - 5], color: YELLOW, shields: [GREEN] },
      ],
    ],
    checkpoint: { pos: [B2.x - 6, B2.y, B2.z], yaw: WEST },
  });
  cp([B2.x, B2.y, B2.z + 6], NORTH, [4, 3, 3], 'THE HANGING NESTS');
  B.armor([B2.x + 6.5, B2.y, B2.z - 2]);
  lamp(B2.x, B2.y + 6, B2.z, 0xb8ff9a, 18, 22);
  say([98, 45, -382], [104, 49, -376], `Swarms: a ${G_('glob')} bursting in the air catches the lot.`, 5);

  // ================================================================ THE CUT FACE and THE SEED PODS (46 → 53.4)
  // Where the second bough meets the trunk the harvesters stripped the bark off a whole face of it: flat,
  // raw heartwood weeping sap, too sheer to climb, and a hive nest built over its foot. Burst the nest, goo
  // the face, and the rotflies that hang round the bough fly into the goo and stick: climb them to the
  // catwalk above. It runs north to a gap where seed pods swing on long stems: goo one still when it swings
  // into line and hop across to a bloom pad that throws you up onto the third bough.
  const FACE = { x: TREE.x + trunkR(90, 50) + 0.15, z1: -390.6, z2: -379.6, y1: B2.y, y2: 53.4 };
  solid(FACE.x - 5, FACE.y1, FACE.z1, FACE.x, FACE.y2 - 0.01, FACE.z2, 'rock');
  {
    // the raw heartwood: a pale panel, growth rings, sap weeping down it, curled lips of bark round it
    const ringTex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#8a7656';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        g.strokeStyle = `rgba(${60 + rand() * 30},${44 + rand() * 20},${26 + rand() * 12},${0.3 + rand() * 0.4})`;
        g.lineWidth = 1 + rand() * 2.5;
        g.beginPath();
        const yy = rand() * h * 1.4 - h * 0.2;
        g.moveTo(0, yy);
        for (let x = 0; x <= w; x += 16) g.lineTo(x, yy + Math.sin(x * 0.03 + i) * 6 + (rand() - 0.5) * 3);
        g.stroke();
      }
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgba(20,14,8,${0.2 + rand() * 0.3})`;
        g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 4 + rand() * 18);
      }
    });
    const faceMat = new THREE.MeshStandardMaterial({ map: ringTex, color: 0xd8c8a8, roughness: 0.9 });
    const fg = new THREE.PlaneGeometry(FACE.z2 - FACE.z1, FACE.y2 - FACE.y1 + 0.6).rotateY(PI / 2);
    put(faceMat, fg, FACE.x + 0.01, (FACE.y1 + FACE.y2) / 2 - 0.3, (FACE.z1 + FACE.z2) / 2);
    for (let i = 0; i < 7; i++) {
      const z = R(FACE.z1 + 0.5, FACE.z2 - 0.5), len = R(1.5, 5);
      put(KM.sap, new THREE.BoxGeometry(0.04, len, R(0.08, 0.2)), FACE.x + 0.03, FACE.y2 - 0.4 - len / 2 - R(0, 1.5), z);
    }
    // the bark's curled lips round the cut (top and both sides)
    limb(curveOf([[FACE.x - 0.4, FACE.y1 - 0.5, FACE.z1 - 0.3], [FACE.x - 0.1, (FACE.y1 + FACE.y2) / 2, FACE.z1 - 0.6], [FACE.x - 0.4, FACE.y2 + 0.4, FACE.z1 - 0.3]]), 0.7, 0.6, { seg: 8, knob: 0.2 });
    limb(curveOf([[FACE.x - 0.4, FACE.y1 - 0.5, FACE.z2 + 0.3], [FACE.x - 0.1, (FACE.y1 + FACE.y2) / 2, FACE.z2 + 0.6], [FACE.x - 0.4, FACE.y2 + 0.4, FACE.z2 + 0.3]]), 0.7, 0.6, { seg: 8, knob: 0.2 });
    limb(curveOf([[FACE.x - 0.4, FACE.y2 + 0.3, FACE.z1 - 0.3], [FACE.x - 0.05, FACE.y2 + 0.7, (FACE.z1 + FACE.z2) / 2], [FACE.x - 0.4, FACE.y2 + 0.3, FACE.z2 + 0.3]]), 0.75, 0.75, { seg: 8, knob: 0.2 });
    // the harvesters' marks: a spigot rack bolted across the top of the cut, hoses hanging
    for (let i = 0; i < 4; i++) K.sapTap([FACE.x + 0.05, FACE.y2 - 0.8, FACE.z1 + 1.6 + i * 2.6], { yaw: -PI / 2 });
  }
  const faceNest = new Thicket(W, { min: [FACE.x, FACE.y1, FACE.z1 + 1.5], max: [FACE.x + 1.6, FACE.y1 + 3.2, FACE.z2 - 1.5], style: 'nest', health: 2, seed: 7 });
  const faceFlies = C.rotflies([B2.x - 6.5, B2.y, B2.z - 5.2], { count: 6, aggro: false, attract: 22, stuckTime: 10, respawn: 3, perPatch: 1 });
  say([FACE.x + 0.5, 45, FACE.z1], [FACE.x + 5, 50, FACE.z2], `Raw heartwood: too sheer to climb. Burst the nest, then ${G_('goo the face')} in steps — the rotflies stick to goo.`, 7);
  // the catwalk above the cut, round to the seed pods
  const CWb = [66, 56, 46, 37.5];
  const CW = CWb.map((b) => [...P(b, trunkR(b, 53.4) + 2.1, 0)].filter((_, i) => i !== 1));
  const cwStart = P(76, trunkR(76, 53.4) + 1.6, 53.4);
  solid(cwStart[0] - 1.8, 52.2, cwStart[2] - 1.8, cwStart[0] + 1.8, 53.4, cwStart[2] + 1.8, 'grass');
  ledge(76, 53.4, { d: 3.4, w: 3.6, solidBox: false });
  K.catwalk([[cwStart[0], cwStart[2]], ...CW], 53.4, { w: 2.2 });
  for (const [x, z] of CW) {
    const b = bearingOf(x, z);
    K.rod(KM.pipeDark, [x, 53.2, z], P(b, trunkR(b, 51) - 0.3, 51), 0.1, 0.1, 5);
  }
  cp([cwStart[0], 53.4, cwStart[2]], -2.4, [3, 3, 3], 'THE CUT FACE');
  // the seed pods: from the catwalk's end across to the bloom pad's stub
  const podA = [CW[CW.length - 1][0], 53.4, CW[CW.length - 1][1]];
  const BLOOM = [80.6, 53.4, -411.2];
  solid(BLOOM[0] - 1.9, 51, BLOOM[2] - 1.9, BLOOM[0] + 1.9, 53.4, BLOOM[2] + 1.9, 'grass');
  limb(curveOf([P(12, trunkR(12, 51) - 2, 51), [BLOOM[0] - 0.4, 52, BLOOM[2] + 0.4], [BLOOM[0] + 1.2, 52.2, BLOOM[2] - 1.4]]), 2.2, 1.6, { seg: 12, flat: 3.4 });
  put(mossMat, new THREE.IcosahedronGeometry(2.0, 1).scale(1, 0.12, 1), BLOOM[0], 53.38, BLOOM[2]);
  const pods = [];
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const x = podA[0] + (BLOOM[0] - podA[0]) * t, z = podA[2] + (BLOOM[2] - podA[2]) * t;
    // they swing across the line between the catwalk and the stub
    const dx = BLOOM[0] - podA[0], dz = BLOOM[2] - podA[2], l = Math.hypot(dx, dz);
    const pod = new SeedPod(W, game, { pivot: [x, 66, z], length: 12.6, dir: [-dz / l, dx / l], amp: 0.4, period: 3.1 + i * 0.4, phase: i * 1.9, top: 53.4 });
    W.goo.registerStickable(pod, { duration: 7 });
    pods.push(pod);
  }
  limb(curveOf([P(34, 14, 62), P(22, 22, 66.6), P(8, 30, 66.2)]), 1.8, 0.8, { seg: 10 });
  say([podA[0] - 2, 52.5, podA[2] - 2], [podA[0] + 2, 56, podA[2] + 2], `Swinging seed pods. ${G_('Goo one')} as it swings into line and it hangs there.`, 6);
  // the bloom pad on the stub: lob a glob into it, stand on it as it blooms
  const bloom1 = new GooPad(W, { pos: BLOOM, power: 24, push: [-2.2, 0, 0.4], carry: false, window: 0.8 });
  B.onRespawn(() => bloom1.reset());
  say([BLOOM[0] - 2, 52.9, BLOOM[2] - 2], [BLOOM[0] + 2, 56, BLOOM[2] + 2], `A ${G_('bloom pad')}: lob a ${G_('glob')} into it, stand on it, and ride the bloom.`, 6);
  overgrow(5, 95, 46, 64, 50);

  // ================================================================ BOUGH 3 · THE MOSS POND (y 62, north)
  // Rain pooled in the crotch of the third bough long ago: a mossy pond, flytraps on its rim, and a brute
  // the hive left to guard it. Goo the floor in its path to bog its charge down.
  const B3 = { x: 75, z: -415, y: 62, r: 9.5 };
  bough(0, B3.y, 27, { w: 4.8, thick: 3.2, end: 2.6 });
  const p3 = pocket(B3.x, B3.y, B3.z, B3.r, { seed: 3, boxes: false });
  {
    const { x, z, y } = B3;
    solid(x - 8, y - 2.2, z - 8, x + 8, y, z - 4.2);
    solid(x - 8, y - 2.2, z + 4.2, x + 8, y, z + 8);
    solid(x - 8, y - 2.2, z - 4.2, x - 4.2, y, z + 4.2);
    solid(x + 4.2, y - 2.2, z - 4.2, x + 8, y, z + 4.2);
    solid(x - 6.6, y - 2.2, z - 9.4, x + 6.6, y, z - 8);
    solid(x - 6.6, y - 2.2, z + 8, x + 6.6, y, z + 9.4);
    solid(x - 9.4, y - 2.2, z - 6.6, x - 8, y, z + 6.6);
    solid(x + 8, y - 2.2, z - 6.6, x + 9.4, y, z + 6.6);
    solid(x - 4.2, y - 3.4, z - 4.2, x + 4.2, y - 2.6, z + 4.2, 'rock'); // the pond's bed
    B.water([x - 4.2, y - 2.6, z - 4.2], [x + 4.2, y - 0.35, z + 4.2]);
    const pondMat = new THREE.MeshStandardMaterial({ color: 0x1e3a24, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.82 });
    const pond = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 8.4).rotateX(-PI / 2), pondMat);
    pond.position.set(x, y - 0.36, z);
    W.scene.add(pond);
    put(limbMat, tint(new THREE.BoxGeometry(8.4, 0.3, 8.4).toNonIndexed(), barkShade), x, y - 2.75, z);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * PI * 2;
      put(stoneMat, new THREE.IcosahedronGeometry(R(0.5, 0.9), 0).scale(1, 0.5, 1), x + Math.cos(a) * 4.5, y - 0.1, z + Math.sin(a) * 4.5);
    }
    // lily pads and reeds
    for (let i = 0; i < 9; i++) put(KM.leafLit, new THREE.CircleGeometry(R(0.4, 0.8), 8, 0, PI * 1.8).rotateX(-PI / 2), x + R(-3.5, 3.5), y - 0.33, z + R(-3.5, 3.5));
    for (let i = 0; i < 20; i++) {
      const a = R(0, PI * 2), d = R(4, 5.2);
      K.rod(KM.vine, [x + Math.cos(a) * d, y - 0.5, z + Math.sin(a) * d], [x + Math.cos(a) * d + R(-0.2, 0.2), y + R(0.8, 2), z + Math.sin(a) * d + R(-0.2, 0.2)], 0.04, 0.02, 3);
    }
    for (let i = 0; i < 6; i++) mushroom(x + R(-8, 8), y, z + R(-8, 8), R(0.3, 1.2), R(0.3, 0.8));
    K.harvestTower([x + 6.5, y, z - 6], 9, { r: 1.4 });
    mistAt(x, 56, z, 20, 3);
  }
  const fight3 = enc({
    trigger: [[71, 61, -408], [79, 66, -404]],
    title: 'THE MOSS POND', sub: 'SOMETHING HEAVY WAKES',
    waves: [
      [
        { type: 'slime', pos: [B3.x - 6, B3.y, B3.z - 5], color: GREEN, core: RED },
        { type: 'slime', pos: [B3.x + 6, B3.y, B3.z - 5], color: GREEN, core: YELLOW },
        { type: 'spider', pos: [B3.x, B3.y, B3.z - 7.5], color: GREEN, shields: [YELLOW] },
      ],
      [
        { type: 'brute', pos: [B3.x, B3.y, B3.z - 6.5], color: GREEN, shields: [YELLOW] },
        { type: 'slime', pos: [B3.x - 6.5, B3.y, B3.z + 2], color: YELLOW, core: RED },
      ],
    ],
    checkpoint: { pos: [B3.x - 7, B3.y, B3.z], yaw: WEST },
  });
  cp([75, B3.y, -404], NORTH, [4, 3, 3], 'THE MOSS POND');
  // the snapjaws rooted on the far rim: they wake with you (a closed or stunned head is a step)
  C.snapjaw([B3.x - 5.5, B3.y, B3.z - 6.5], { color: GREEN, yaw: 0.5, reach: 5.5 });
  C.snapjaw([B3.x + 6, B3.y, B3.z - 5.5], { color: YELLOW, shields: [GREEN], yaw: -0.6, reach: 5.5 });
  say([71, 61, -408], [79, 65, -404], `Ground things bog down in ${G_('goo')}: splash the floor in front of anything that charges.`, 6);
  B.armor([B3.x + 7.5, B3.y, B3.z + 3]);
  lamp(B3.x, B3.y + 6, B3.z, 0x9dffd0, 18, 24);

  // ================================================================ THE SAP PISTONS (62 → 77), round the north-west
  // A dormant flytrap grown on the third bough flings you up onto a ledge on the trunk. The ledge has rotted
  // through over a spore vent: goo the hole and walk the membrane (it chokes the vent). Beyond, the hive's
  // sap pistons shove bark slabs out of the trunk and draw them back: goo one while it's out and it jams.
  // Then a vine from the last ledge swings you onto the fourth bough.
  const trapPad = C.snapPad([73.6, B3.y, -403.4], { power: 20, push: [-3.9, 3.9], carry: false, yaw: PI * 0.75 });
  const ledgeRun = (b0, b1, y, step = 3.2) => {
    const pts = [];
    for (let b = b0; b0 > b1 ? b >= b1 - 0.01 : b <= b1 + 0.01; b += b0 > b1 ? -step : step) pts.push(P(b, trunkR(b, y) + 1.7, y));
    strip(pts, 3.0);
    limb(curveOf(pts.map(([x, yy, z]) => [x, yy - 0.95, z]), 0.5), 1.7, 1.6, { seg: 10, flat: 3.4, squash: 0.8 });
    for (const [x, yy, z] of pts) put(mossMat, new THREE.IcosahedronGeometry(1.4, 1).scale(1, 0.12, 1), x, yy - 0.03, z);
    return pts;
  };
  const LD1 = ledgeRun(342, 337.5, 68.4, 2.25);
  const LD1b = ledgeRun(318.5, 312, 68.4, 3.25);
  cp([LD1[0][0], 68.4, LD1[0][2]], WEST, [3, 3, 3], 'THE SAP PISTONS');
  // the rotted hole between them, a vent far down in the hollow below
  const holeC = P(328, trunkR(328, 68.4) + 1.7, 68.4);
  const membrane = W.goo.addGap({ min: [holeC[0] - 1.6, 67.4, holeC[2] - 1.6], max: [holeC[0] + 1.6, 68.4, holeC[2] + 1.6] }, { axis: 'y', duration: 11, onFill: () => (vent.blocked = true), onClear: () => (vent.blocked = false) });
  const vent = new SporeVent(W, game, { pos: [holeC[0], 60, holeC[2]], top: 78 });
  limb(curveOf([P(333, trunkR(333, 66.5) + 1.4, 67.2), P(328, trunkR(328, 65) + 2.6, 64.5), P(323, trunkR(323, 66.5) + 1.4, 67.2)]), 1.1, 1.1, { seg: 8, knob: 0.25, cap: false });
  say([LD1[0][0] - 2, 67.4, LD1[0][2] - 2], [LD1[0][0] + 2, 71, LD1[0][2] + 2], `The ledge has rotted through over a spore vent. ${G_('Goo the hole')}: the membrane holds you and chokes the vent.`, 7);
  const pistons = [];
  [[306, 69.5, 0], [297.5, 70.6, 1.4], [289, 71.7, 2.8]].forEach(([b, y, ph]) => {
    const pis = new SapPiston(W, game, { bearing: b, top: y, phase: ph });
    W.goo.registerStickable(pis, { duration: 8 });
    pistons.push(pis);
  });
  say([LD1b[0][0] - 2, 67.4, LD1b[0][2] - 2], [LD1b[0][0] + 2, 71, LD1b[0][2] + 2], `The pistons won't wait for you. ${G_('Goo a slab')} while it's out and it jams.`, 6);
  const LD2 = ledgeRun(282.5, 279, 72.9, 3.5);
  // the vine to the fourth bough
  const V4 = vine({ anchor: [56.2, 86.6, -394.2], length: 13, sway: [-0.7, 0.7] });
  overgrow(278, 345, 62, 80, 46);

  // ================================================================ BOUGH 4 · THE FUNGUS GROVE (y 77, west)
  // A grove of giant glowing fungus on the last bough, spore light hanging in the air: the hive's last stand
  // below the crown. At its tip, Wren's recorder, and the gap a giant fly hovers beyond.
  const B4 = { x: 44, z: -385, y: 77, r: 9 };
  bough(270, B4.y, 31, { w: 4.8, thick: 3.0, end: 2.6 });
  const p4 = pocket(B4.x, B4.y, B4.z, B4.r, { seed: 4 });
  {
    const { x, z, y } = B4;
    for (const [dx, dz, h, r] of [[-3, -4.5, 3.6, 2.4], [3.5, 4, 4.2, 2.8], [5, -3.5, 2.4, 1.6], [-5.5, 3, 2.8, 1.9]]) {
      mushroom(x + dx, y, z + dz, h, r, true);
      solid(x + dx - r * 0.2, y, z + dz - r * 0.2, x + dx + r * 0.2, y + h, z + dz + r * 0.2, 'grass');
    }
    for (let i = 0; i < 22; i++) mushroom(x + R(-8, 8), y, z + R(-8, 8), R(0.3, 1.1), R(0.2, 0.7), rand() < 0.8);
    K.reactorTank([x + 6.5, y, z + 5], 5, { r: 1.0 });
    mistAt(x, 72, z, 20, 3);
  }
  const fight4 = enc({
    trigger: [[51, 76, -388], [54, 81, -382]],
    title: 'THE FUNGUS GROVE', sub: 'THE HIVE\'S LAST STAND',
    waves: [
      [
        { type: 'spider', pos: [B4.x - 4, B4.y, B4.z - 5], color: GREEN, shields: [RED] },
        { type: 'spider', pos: [B4.x - 4, B4.y, B4.z + 5], color: YELLOW, shields: [GREEN] },
        { type: 'slime', pos: [B4.x - 6, B4.y, B4.z], color: GREEN, core: YELLOW },
      ],
      [
        { type: 'swarm', pos: [B4.x - 2, B4.y + 6, B4.z], color: [GREEN, RED], count: 7 },
        { type: 'drone', pos: [B4.x - 5, B4.y + 5, B4.z - 4], color: GREEN, shields: [RED, YELLOW] },
        { type: 'drone', pos: [B4.x - 5, B4.y + 5, B4.z + 4], color: RED, shields: [GREEN] },
      ],
    ],
    checkpoint: { pos: [B4.x + 6, B4.y, B4.z], yaw: WEST },
  });
  cp([55, B4.y, B4.z], WEST, [3, 3, 4], 'THE FUNGUS GROVE');
  B.armor([B4.x + 2, B4.y, B4.z - 7]);
  lamp(B4.x, B4.y + 5, B4.z, 0x7dffd8, 20, 24);

  // ================================================================ THE GIANT FLY (77 → 100)
  // At the grove's tip a giant fly hovers, tamed to the harvest (a saddle-rig strapped on its back). Leap on
  // and it carries you a whole turn round the trunk up to the crown, the hive coming at you all the way.
  const FLY_PATH = [
    [26, 79, -373], [32, 82, -350], [52, 84.5, -336], [75, 86.5, -333], [99, 88.5, -342], [114, 90.5, -364],
    [117, 92.5, -390], [109, 94, -416], [88, 95.5, -431], [62, 97, -430], [43, 98.6, -414], [33.5, 100, -397],
  ];
  const fly = C.flyRide({
    start: [32.2, B4.y, B4.z],
    yaw: PI * 0.1,
    path: FLY_PATH,
    end: [33.6, 100, -385.6],
    speed: 10,
    checkpoint: [37.5, B4.y, B4.z],
    spawns: [
      { u: 0.1, type: 'rotflies', rel: [0, 3, 22], count: 4, color: GREEN },
      { u: 0.26, type: 'drone', rel: [-12, 4, 18], color: GREEN, shields: [YELLOW], life: 24 },
      { u: 0.3, type: 'drone', rel: [10, 5, 14], color: RED, shields: [GREEN], life: 24 },
      { u: 0.44, type: 'borer', pos: P(95, trunkR(95, 91) - 0.2, 91), normal: [1, 0, 0], range: 13, length: 26, color: GREEN },
      { u: 0.56, type: 'rotflies', rel: [6, 2, 20], count: 4, colors: [GREEN, YELLOW] },
      { u: 0.68, type: 'borer', pos: P(352, trunkR(352, 95) - 0.2, 95), normal: [Math.sin(352 * DEG), 0, -Math.cos(352 * DEG)], range: 13, length: 26, color: YELLOW },
      { u: 0.78, type: 'swarm', rel: [-8, 4, 16], color: [GREEN, RED], count: 6 },
    ],
    title: ['THE GOD TREE · HOLD ON', 'THE GIANT FLY'],
  });
  say([35, 76, -388], [40, 80, -382], `The fly is waiting. <b>Step onto its back.</b>`, 5);

  // ================================================================ THE CROWN: THE THORNMAW'S COURTYARD (y 100)
  // The tree lifted an old temple into its crown; the hive made it the harvest's heart. Its limbs cradle the
  // courtyard from below and rise round it into the canopy.
  const CROWN = [TREE.x, TREE.crown, TREE.z];
  const arena = buildVerdantArena(B, { center: CROWN, size: 44, entry: 'w', exit: 's', colors: RYG, reactorColor: GREEN, world: 'verdant' });
  B.armor([CROWN[0] + 18.5, CROWN[1] + 4.2, CROWN[2] - 17.5]);
  B.armor([CROWN[0] - 18.5, CROWN[1] + 4.2, CROWN[2] + 17.5]);
  B.armor([CROWN[0] + 8.8, CROWN[1], CROWN[2]], { base: false });
  // the fly's landing: a bark platform at the courtyard's west gate
  solid(36.2, 97, -388.8, 43.9, 100, -381.2);
  {
    const g = new THREE.BoxGeometry(7.8, 3, 7.6).toNonIndexed();
    tint(g, barkShade);
    put(limbMat, g, 40, 98.5, -385);
    put(mossMat, new THREE.BoxGeometry(7.6, 0.06, 7.4), 40, 100.03, -385);
  }
  cp([41, 100, -385], EAST, [3, 3, 4], 'THE CROWN');
  area([36, 99, -389], [44, 104, -381], MOOD);
  // the cradle: limbs from the trunk's top out under the courtyard's slab, and up round its walls
  for (let i = 0; i < 12; i++) {
    const b = i * 30 + 15;
    limb(curveOf([P(b, 8, 84), P(b + 4, 16, 92), P(b + 6, 26, 96), P(b + 8, 33, 97.5)]), 3.4, 1.4, { seg: 12, knob: 0.12 });
  }
  // the slab's underside: a bowl of interlaced roots, a ring of limbs round its rim, leaves spilling over it
  {
    const g = new THREE.SphereGeometry(1, 30, 8, 0, PI * 2, PI / 2, PI / 2);
    const pp = g.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const x = pp.getX(i), z = pp.getZ(i), y = pp.getY(i), a = Math.atan2(z, x);
      const k = 1 + 0.08 * Math.sin(a * 5 + 1) + 0.05 * Math.sin(a * 11);
      pp.setXYZ(i, x * 34 * k, y * 15 * (1 + 0.2 * Math.sin(a * 7 + y * 3)), z * 34 * k);
    }
    g.computeVertexNormals();
    put(limbMat, tint(g.toNonIndexed(), (x, y, z, nx, ny, nz) => barkShade(x, y + 97, z, nx, ny, nz)), TREE.x, TREE.crown - 2.7, TREE.z);
    for (let i = 0; i < 14; i++) {
      const b0 = i * (360 / 14) + R(-6, 6), b1 = b0 + R(30, 46);
      const pts = [];
      for (let k = 0; k <= 4; k++) {
        const b = b0 + ((b1 - b0) * k) / 4;
        pts.push(P(b, R(30, 34.5), TREE.crown - R(1.5, 4.5)));
      }
      limb(curveOf(pts), R(1.4, 2.2), R(0.9, 1.4), { seg: 9, knob: 0.15 });
    }
    for (let i = 0; i < 30; i++) {
      const b = R(0, 360), r = R(29, 38);
      const [x, , z] = P(b, r, 0);
      if (Math.abs(angDiff(b, 270)) < 9 || Math.abs(angDiff(b, 180)) < 9) continue; // (the fly's landing and the line's head stay clear)
      foliage(x, TREE.crown - R(-2, 3), z, R(4, 7), 1.1);
    }
    for (let i = 0; i < 34; i++) {
      const a = R(0, PI * 2), d = R(8, 33);
      curtain(TREE.x + Math.cos(a) * d, TREE.crown - 3 - (34 - d) * 0.3, TREE.z + Math.sin(a) * d, R(5, 16), R(2, 4));
    }
  }
  // the crown's upper limbs: out of the cradle past the corners and up into the canopy
  const crownTips = [];
  for (let i = 0; i < 8; i++) {
    const b = i * 45 + 22.5 + R(-8, 8);
    const r1 = R(34, 40), h = R(118, 136);
    const pts = [P(b, 26, 96), P(b + 3, 33, 104), P(b + 6, r1, 112), P(b + 10, r1 + 6, h)];
    limb(curveOf(pts), 3.2, 1.0, { seg: 12, knob: 0.1 });
    crownTips.push(pts[3]);
    for (let k = 0; k < 3; k++) {
      const bb = b + R(-25, 25), rr = r1 + R(4, 16), hh = h + R(-10, 8);
      const end = P(bb, rr, hh);
      limb(curveOf([pts[2], [(pts[2][0] + end[0]) / 2, Math.max(pts[2][1], hh) + 3, (pts[2][2] + end[2]) / 2], end]), 1.1, 0.35, { seg: 7, knob: 0.08 });
      foliage(end[0], end[1] + 2, end[2], R(6, 10), 1.2);
    }
    foliage(pts[3][0], pts[3][1] + 3, pts[3][2], R(8, 12), 1.3);
  }
  // the canopy: masses of leaves in a ring round the courtyard, open over it (light falls on the Heart)
  for (let i = 0; i < 70; i++) {
    const a = R(0, PI * 2), d = R(28, 64);
    foliage(TREE.x + Math.cos(a) * d, R(110, 146) - (d - 28) * 0.2, TREE.z + Math.sin(a) * d, R(8, 15), 1.2);
  }
  for (let i = 0; i < 26; i++) {
    const a = R(0, PI * 2), d = R(26, 48);
    curtain(TREE.x + Math.cos(a) * d, R(108, 128), TREE.z + Math.sin(a) * d, R(8, 22), R(2.5, 4.5));
  }
  shaft(TREE.x + 6, 128, TREE.z - 4, 60, 9, 0.12);
  shaft(TREE.x - 14, 120, TREE.z + 10, 64, 7, -0.16);
  shaft(TREE.x + 18, 110, TREE.z + 22, 70, 6, 0.2);
  shaft(TREE.x - 30, 96, TREE.z - 20, 80, 8, 0.22);
  shaft(TREE.x + 34, 84, TREE.z - 6, 90, 7, -0.18);

  // ================================================================ THE HARVEST LINE (crown → aqueduct head)
  // Out of the courtyard's south gate: a platform on a limb and the harvest line's head frame. The trolley
  // that carried sap canisters down to the Atrium carries you instead, over the jungle to the aqueduct.
  solid(70.8, 97, -361.8, 79.2, 100, -352.6);
  {
    const g = new THREE.BoxGeometry(8.4, 3, 9.2).toNonIndexed();
    tint(g, barkShade);
    put(limbMat, g, 75, 98.5, -357.2);
    put(mossMat, new THREE.BoxGeometry(8.2, 0.06, 9), 75, 100.03, -357.2);
    // the head frame: two posts and a beam holding the cable's end
    for (const sx of [-1, 1]) K.rod(KM.pipeDark, [75 + sx * 2.2, 100, -353.4], [75 + sx * 0.9, 106, -355.4], 0.18, 0.14, 6);
    K.rod(KM.pipeDark, [73.6, 106, -355.4], [76.4, 106, -355.4], 0.2, 0.2, 6);
    put(KM.rust, new THREE.TorusGeometry(0.8, 0.12, 6, 16), 75, 105.2, -355.4);
  }
  const HOME_END = [10, 15.4, -242.4];
  const zip = new ZipLine(W, game, {
    points: [[75, 104.1, -356.2], [66, 94, -340], [52, 76, -314], [36, 52, -286], [22, 30, -262], HOME_END],
    speed: [7, 21],
    enabled: false,
    onBoard: () => game.hud.message('<b>Hold on.</b>', 2),
  });
  W.add({ update: () => (zip.enabled = !!(arena.boss?.defeated || game.isWorldDown?.('verdant'))) });
  B.onRespawn(() => zip.reset());

  flush('climb');

  // ================================================================ THE AQUEDUCT HOME (y 12) — moved here from verdant.js
  // From the harvest line's foot south along the aqueduct over the court to the Hub's north balcony port.
  // Low parapets with invisible walls over them; three gates to blast, each its own color; the gatehouse
  // door into the Hub is one-way (it opens as you come home).
  let homeDoor = null;
  {
    const GLOW = B.GLOW;
    // the line's foot: a relay tower over the aqueduct's head, a deck to land on
    W.box(8.5, 11, -246, 11.5, 12, -237.5, 'floor', zone);
    W.box(8, 12, -246.5, 8.5, 13, -237.5, 'wall', zone);
    W.box(11.5, 12, -246.5, 12, 13, -237.5, 'wall', zone);
    W.box(8, 12, -246.5, 12, 13, -246, 'wall', zone);
    blocker([8, 12, -246.5], [8.5, 40, -237.5]);
    blocker([11.5, 12, -246.5], [12, 40, -237.5]);
    blocker([8, 12, -246.5], [12, 40, -246]);
    W.box(9, -29, -245.5, 11, 11, -243.5, 'wall', zone);
    for (const sx of [8.2, 11.8]) K.rod(KM.pipeDark, [sx, 12, -245.2], [10 + (sx - 10) * 0.3, 18.2, -243.6], 0.16, 0.12, 6);
    K.rod(KM.pipeDark, [9.2, 18.2, -243.6], [10.8, 18.2, -243.6], 0.18, 0.18, 6);
    area([8.5, 12, -246], [11.5, 15, -238], { music: 'music_green', ambient: 'amb_jungle', atmosphere: 'verdant' });
    W.box(8.5, 11, -237.5, 11.5, 12, -158.5, 'floor', zone);
    W.deco(8.45, 11.7, -237.5, 8.5, 11.8, -158.5, GLOW[zone], zone);
    W.deco(11.5, 11.7, -237.5, 11.55, 11.8, -158.5, GLOW[zone], zone);
    for (let z = -160; z > -236; z -= R(3, 5)) {
      const l = Math.min(R(1.5, 3.5), z + 237);
      W.box(8.2, 12, z - l, 8.5, 12 + R(0.6, 0.95), z, 'wall', zone);
      W.box(11.5, 12, z - l * R(0.6, 1), 11.8, 12 + R(0.6, 0.95), z, 'wall', zone);
    }
    blocker([8, 12, -237.5], [8.5, 40, -158.5]);
    blocker([11.5, 12, -237.5], [12, 40, -158.5]);
    const vineRun = (x1, z1, x2, z2, top, n, maxLen) => {
      for (let i = 0; i < n; i++) {
        const t = rand(), x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t, len = R(0.6, maxLen);
        put(KM.vine, new THREE.BoxGeometry(0.06, len, 0.06), x, top - len / 2, z);
      }
    };
    vineRun(8.25, -236, 8.3, -159, 11, 40, 5);
    vineRun(11.7, -236, 11.75, -159, 11, 40, 5);
    for (const [zc, base] of [[-166, 4], [-187, 1], [-206.5, 4.5], [-222, -29]]) {
      W.box(9, base, zc - 1, 11, 11, zc + 1, 'wall', zone);
      W.box(8.4, 10.3, zc - 1.4, 11.6, 11, zc + 1.4, 'metal', zone);
      W.deco(8.98, 9.6, zc - 1.02, 11.02, 9.68, zc + 1.02, GLOW[zone], zone);
      vineRun(8.95, zc - 1, 9, zc + 1, 10.3, 3, 6);
    }
    const gateArch = (z, color) => {
      W.box(7.6, 11, z - 0.45, 8.4, 16.2, z + 0.45, 'wall', zone);
      W.box(11.6, 11, z - 0.45, 12.4, 16.2, z + 0.45, 'wall', zone);
      W.box(7.4, 15.2, z - 0.55, 12.6, 16.2, z + 0.55, 'metal', zone);
      W.box(7.3, 16.2, z - 0.65, 12.7, 16.45, z + 0.65, 'grass', zone);
      new Barrier(W, { min: [8.4, 12, z - 0.2], max: [11.6, 15.2, z + 0.2], color, kind: 'wall', zone });
    };
    gateArch(-226, GREEN);
    gateArch(-196, YELLOW);
    gateArch(-176, RED);
    area([8.5, 12, -237.5], [11.5, 15, -236], { music: 'music_green', ambient: 'amb_jungle', atmosphere: 'verdant' });
    // the gatehouse into the Hub's north balcony port (x 10, y 12): one-way, it opens as you come home
    B.corridor({ zStart: -148.5, zEnd: -158.5, y: 12, zone, cx: 10 });
    vineRun(8.6, -158.4, 11.4, -149, 15.2, 8, 1.2);
    W.box(7.5, 15.7, -158.9, 12.5, 16, -148.5, 'grass', zone);
    homeDoor = new SlidingDoor(W, { min: [8.5, 12, -155.2], max: [11.5, 15.2, -154.8], color: GREEN, zone });
    W.trigger([8.5, 12, -175], [11.5, 15, -156], () => homeDoor.open());
    W.trigger([8.5, 12, -154.8], [11.5, 15, -148.5], () => {
      if (homeDoor.openT >= 0) return;
      game.hud.message('Sealed from this side: this is <b>Verdant\'s way out</b>. Its entrance is the <b style="color:#ffd23a">yellow gate</b> on the Nexus floor below.', 6);
    }, { once: false });
    flush('home');
  }

  // ================================================================ FALLS: never fatal on the tree
  // A long fall anywhere on the tree (off a bough, a missed vine, a bad launch) fades you back to the last
  // checkpoint before you can hit anything below: you lose the climb since it, never your life.
  W.add({
    update(dt, p) {
      if (!p || p.dead || p.mount || game.voidT || game.state !== 'playing') return;
      if (p.pos.x < 18 || p.pos.z > -300 || p.pos.y > 140) return;
      if (!p.grounded && p.fallTop - p.pos.y > 11.5 && p.vel.y < -12) game.fallOutOfWorld();
    },
  });

  // ================================================================ THE ENGINE DIES (after the Heart)
  game.onPowerDown?.((name, { restored }) => {
    if (name !== 'verdant') return;
    Object.assign(level.atmospheres.verdantTreeView, DEAD, { fogFar: 280 });
    Object.assign(level.atmospheres.verdantTree, DEAD, { fogFar: 150 });
    const r = regionOf(game.player.pos);
    if (r === 'verdant' && /verdantTree/.test(game.atmo?.name || '')) game.setAtmosphere(game.atmo.name, restored);
    if (restored) veinMat.uniforms.uLife.value = 0;
    else W.add({ update: (dt) => (veinMat.uniforms.uLife.value = Math.max(0, veinMat.uniforms.uLife.value - dt / 5)) });
  });

  // ================================================================ STARTS
  devStart('verdantTree1', [56, 20, -373], -2.6, RYG, 'The god tree: the Root Gate');
  devStart('verdantTree2', [75, 27.3, -361], SOUTH, RYG, 'Bough 1: the Sap Tap');
  devStart('verdantTree3', [B1.x + 5.8, B1.y, B1.z], EAST, RYG, 'The vines');
  devStart('verdantTree4', [B2.x, B2.y, B2.z + 6], NORTH, RYG, 'Bough 2: the Hanging Nests');
  devStart('verdantTree5', [B2.x - 12, B2.y, B2.z], WEST, RYG, 'The cut face and the seed pods');
  devStart('verdantTree6', [75, B3.y, -404], NORTH, RYG, 'Bough 3: the Moss Pond');
  devStart('verdantTree7', [LD1[0][0], 68.4, LD1[0][2]], WEST, RYG, 'The rotted ledge and the sap pistons');
  devStart('verdantTree8', [55, B4.y, B4.z], WEST, RYG, 'Bough 4: the Fungus Grove');
  devStart('verdantTree9', [36.4, B4.y, B4.z], WEST, RYG, 'The giant fly');
  devStart('verdantBoss', arena.checkpoint, EAST, RYG, 'The Thornmaw');
  devStart('verdantHome', [75, 100, -356], SOUTH, RYG, 'The way home');

  // ================================================================ THE HUD OBJECTIVE (verdant.js asks this)
  function objective(p) {
    if (p.z > -300 || p.x < 18) {
      if (p.y > 11 && p.x > 7.5 && p.x < 12.5 && p.z < -148.5) {
        if (game.isWorldDown?.('verdant')) return 'Follow the aqueduct home to the Nexus: blast each gate with its color.';
        return '';
      }
      return '';
    }
    const down = game.isWorldDown?.('verdant');
    if (p.y > 97) {
      if (down || arena.boss?.defeated) {
        if (p.z > -362) return `Grab the <b>harvest line's trolley</b>: it runs all the way home.`;
        return down ? `The engine is dead. Out through the courtyard's <b>south gate</b> to the harvest line.` : `Shoot the exposed <b>Verdant Heart</b> with ${G_('green')} to shut the engine down.`;
      }
      return 'The Thornmaw guards the Heart in the courtyard. <b>Kill it</b>, then shut the engine down.';
    }
    if (fly.state === 'ride' || fly.state === 'takeoff') return 'Hold on — and shoot back.';
    if (p.y < 22.5 && p.z > -380 && p.x < 62) return p.z > -366 ? 'Follow the great root to the tree.' : 'Up the carved steps round the trunk\'s <b>south</b> side.';
    if (p.y < 25.5 && p.z > -372) return borer1.dead || borer1.plugT > 0 ? 'On up the first bough.' : `Get past the borer: ${G_('goo its hole')} while it's in, or kill it.`;
    if (p.y < 33 && p.z > -362) {
      if (fight1.state !== 'armed' && fight1.state !== 'cleared') return 'Clear the bough.';
      if (fight1.state === 'cleared') return 'Run and <b>jump into the vine</b> off the bough\'s east edge.';
      return 'Up the bough to the harvest rig.';
    }
    if (p.y < 45.5 && p.x > 82 && p.z > -378) return 'Swing up the vines: <b>W</b> pumps toward where you look, <b>JUMP</b> lets go.';
    if (p.y < 50 && p.x > 95) return fight2.state === 'cleared' ? 'Back along the bough to the cut face on the trunk.' : 'Clear the nests.';
    if (p.y < 53 && p.x > 85) return faceNest.broken ? `${G_('Goo the cut face')} in steps; climb the rotflies that stick.` : `Burst the ${G_('nest')} at the foot of the cut face.`;
    if (p.y < 56 && p.z < -388 && p.x > 76) {
      if (Math.hypot(p.x - BLOOM[0], p.z - BLOOM[2]) < 3) return `Shoot the ${G_('bloom pad')}, then stand on it as it opens.`;
      return `${G_('Goo a seed pod')} when it swings into line, then hop across.`;
    }
    if (p.y > 59 && p.y < 66 && p.z < -400) return fight3.state === 'cleared' ? 'The flytrap pad on the pond\'s <b>west</b> rim throws you up the trunk.' : 'Clear the pond.';
    if (p.y > 66 && p.y < 75) {
      const b = bearingOf(p.x, p.z);
      if (b > 322) return `${G_('Goo the rotted hole')}: walk the membrane over the vent.`;
      if (b > 285) return `${G_('Goo a piston\'s slab')} while it's out, and climb.`;
      return 'Jump into the vine and swing onto the fourth bough.';
    }
    if (p.y > 75 && p.y < 82 && p.x < 64) return fight4.state === 'cleared' || fight4.state === 'armed' ? 'Out to the bough\'s tip: <b>jump onto the giant fly</b>.' : 'Clear the grove.';
    return 'Climb the god tree.';
  }

  return { objective, arena, homeDoor, fly, zip, vines, pods, pistons, membrane, vent, borer1, faceFlies, faceNest, FACE, BLOOM, bloom1, trapPad, seal1, fights: [fight1, fight2, fight3, fight4], pockets: [p1, p2, p3, p4], trunkR, TREE };
}

// ================================================================================================
// THE TREE'S OWN MOVING PIECES (the goo freezes them: W.goo.registerStickable, see goo.js)
// ================================================================================================
let pieceKit = null;
function pieces() {
  if (pieceKit) return pieceKit;
  pieceKit = {
    husk: new THREE.MeshStandardMaterial({ color: 0x6a5a34, roughness: 0.9, flatShading: true }),
    huskGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd8ff7a).multiplyScalar(1.2) }),
    moss: new THREE.MeshStandardMaterial({ color: 0x4a7a2c, roughness: 1, flatShading: true }),
    slab: new THREE.MeshStandardMaterial({ color: 0x6a5640, roughness: 1, flatShading: true }),
    spore: new THREE.MeshBasicMaterial({ color: 0xd8ff9a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    mouth: new THREE.MeshStandardMaterial({ color: 0x8a7a4a, roughness: 1, flatShading: true }),
  };
  return pieceKit;
}

// A seed pod swinging on a long stem across a gap: standable (it carries you), and a green burst sticks it
// fast wherever it is (goo.js freezes it: update skipped, the solid's delta zeroed).
class SeedPod {
  constructor(world, game, { pivot, length, dir, amp = 0.35, period = 3.4, phase = 0, top }) {
    this.world = world;
    this.game = game;
    this.pivot = new THREE.Vector3(...pivot);
    this.L = length;
    this.dir = new THREE.Vector3(dir[0], 0, dir[1]).normalize();
    this.axis = new THREE.Vector3(this.dir.z, 0, -this.dir.x);
    this.amp = amp;
    this.w = (PI * 2) / period;
    this.phase = phase;
    this.t = 0;
    this.topOff = top - (this.pivot.y - length); // the pod's top above the stem's end
    const k = pieces();
    this.group = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, length, 5).translate(0, -length / 2, 0), k.moss);
    const husk = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 9).scale(1, 1.25, 1).translate(0, -length + this.topOff - 1.35, 0), k.husk);
    const seams = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.05, 4, 16).rotateX(PI / 2).translate(0, -length + this.topOff - 1.0, 0), k.huskGlow);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.08, 0.3, 12).translate(0, -length + this.topOff - 0.15, 0), k.moss);
    this.group.add(stem, husk, seams, cap);
    this.mesh = this.group;
    this.group.position.copy(this.pivot);
    world.scene.add(this.group);
    this.pos = new THREE.Vector3();
    this.place(this.angle());
    this.solid = world.addSolid(this.pos.clone().add(new THREE.Vector3(-0.85, -0.7, -0.85)), this.pos.clone().add(new THREE.Vector3(0.85, 0, 0.85)), { delta: new THREE.Vector3(), moving: true, kind: 'grass' });
    world.add(this);
  }
  angle() {
    return Math.sin(this.t * this.w + this.phase) * this.amp;
  }
  place(a) {
    // the top of the pod (where you stand)
    this.pos.copy(this.pivot).addScaledVector(this.dir, Math.sin(a) * this.L);
    this.pos.y = this.pivot.y - Math.cos(a) * this.L + this.topOff;
    this.group.quaternion.setFromAxisAngle(this.axis, -a);
  }
  update(dt) {
    const d = this.solid.delta.set(0, 0, 0);
    this.t += dt;
    const prev = this.pos.clone();
    this.place(this.angle());
    d.subVectors(this.pos, prev);
    this.solid.min.set(this.pos.x - 0.85, this.pos.y - 0.7, this.pos.z - 0.85);
    this.solid.max.set(this.pos.x + 0.85, this.pos.y, this.pos.z + 0.85);
  }
  reset() {}
}

// A bark slab on a sap piston: it shoves out of the trunk, waits a moment and draws back in (standing on it
// as it goes in, the bark shoves you off). Goo it while it's out and it jams there.
class SapPiston {
  constructor(world, game, { bearing, top, phase = 0, out = 3.2, size = 2.4, cycle = 4.2, stay = 1.3 }) {
    this.world = world;
    this.game = game;
    this.b = bearing;
    this.top = top;
    this.size = size;
    this.cycle = cycle;
    this.stay = stay;
    this.t = this.t0 = phase;
    this.rIn = trunkR(bearing, top) - size * 0.5 - 0.6;
    this.rOut = trunkR(bearing, top) + out - size * 0.5 + 0.4;
    this.u = 0;
    const k = pieces(), km = kitMaterials();
    this.group = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(size, 0.7, size), k.slab);
    slab.position.y = -0.35;
    const moss = new THREE.Mesh(new THREE.BoxGeometry(size * 0.9, 0.06, size * 0.9), k.moss);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 4, 8).rotateX(PI / 2).translate(0, -0.5, 2.2), km.pipe);
    const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 4, 10).translate(0, -0.5, 1.4), km.sap);
    this.group.add(slab, moss, rod, glowRing);
    this.mesh = this.group;
    this.group.rotation.y = -bearing * DEG + PI; // (the rod points back into the trunk)
    world.scene.add(this.group);
    this.pos = new THREE.Vector3();
    this.place();
    const h = size / 2;
    this.solid = world.addSolid(new THREE.Vector3(this.pos.x - h, top - 0.7, this.pos.z - h), new THREE.Vector3(this.pos.x + h, top, this.pos.z + h), { delta: new THREE.Vector3(), moving: true, kind: 'grass' });
    world.add(this);
  }
  place() {
    const r = this.rIn + (this.rOut - this.rIn) * this.u;
    this.pos.set(...P(this.b, r, this.top));
    this.group.position.copy(this.pos);
  }
  update(dt) {
    const d = this.solid.delta.set(0, 0, 0);
    this.t = (this.t + dt) % this.cycle;
    // out over 0.35 s, stay, back in over 0.5 s, wait
    const t = this.t, o = 0.35, back = 0.5;
    const prevU = this.u;
    this.u = t < o ? t / o : t < o + this.stay ? 1 : t < o + this.stay + back ? 1 - (t - o - this.stay) / back : 0;
    if (prevU === 0 && this.u > 0) audio.at?.(audio.sfxOr('piston_thump', 'door_slam'), this.pos, { gain: 0.5, rate: 1.4, far: 30 });
    const prev = this.pos.clone();
    this.place();
    d.subVectors(this.pos, prev);
    const h = this.size / 2;
    this.solid.min.set(this.pos.x - h, this.top - 0.7, this.pos.z - h);
    this.solid.max.set(this.pos.x + h, this.top, this.pos.z + h);
  }
  reset() {
    this.t = this.t0;
  }
}

// A spore vent far down in a hollow: it blasts a column of spores up through the hole above it every few
// seconds that throws anyone over it up and off the tree (blocked: a goo membrane over the hole chokes it).
class SporeVent {
  constructor(world, game, { pos, top, period = 2.4, blast = 1.4 }) {
    this.world = world;
    this.game = game;
    this.pos = new THREE.Vector3(...pos);
    this.top = top;
    this.period = period;
    this.blast = blast;
    this.blocked = false;
    this.t = 0;
    const k = pieces();
    this.col = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.0, top - pos[1], 12, 1, true), k.spore);
    this.col.position.copy(this.pos).setY((pos[1] + top) / 2);
    world.scene.add(this.col);
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.35, 6, 12).rotateX(PI / 2), k.mouth);
    mouth.position.copy(this.pos);
    world.scene.add(mouth);
    world.add(this);
  }
  update(dt, player) {
    this.t = (this.t + dt) % this.period;
    const blowing = this.t < this.blast && !this.blocked;
    this.col.visible = blowing;
    this.col.material.opacity = 0.16 + 0.1 * Math.sin(this.t * 30);
    if (blowing && Math.random() < dt * 30) this.world.fx.burst(this.pos.clone().setY(this.pos.y + Math.random() * (this.top - this.pos.y)), 0xd8ff9a, { count: 3, speed: 3, life: 0.6, size: 0.2, gravity: -6, mode: 'puff' });
    if (this.t < dt && !this.blocked) audio.at?.(audio.sfxOr('spore_vent', 'spore_burst'), this.pos.clone().setY(this.top - 6), { gain: 0.7, far: 35 });
    if (!blowing || !player || player.mount) return;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    if (dx * dx + dz * dz < 2.2 * 2.2 && player.pos.y < this.top && player.pos.y > this.pos.y) {
      // thrown up and out, away from the trunk
      const ox = player.pos.x - TREE.x, oz = player.pos.z - TREE.z, ol = Math.hypot(ox, oz) || 1;
      player.vel.y = Math.max(player.vel.y, 15);
      player.vel.x += (ox / ol) * 40 * dt;
      player.vel.z += (oz / ol) * 40 * dt;
      player.grounded = false;
      player.launched = true;
    }
  }
  reset() {}
}
