// VERDANT'S CREATURES: the living (non-robot) things of the rotting forest. Pure entities: a level places
// them, they need nothing else. Every one is colour-coded like the robots (only its colour hurts it, a
// wrong colour ricochets and builds rage: rage.js; optional colour shields: colorShield.js), asks the
// combat director for a token before it attacks, sleeps when the player is far off, goes back to its
// post on a checkpoint respawn, bleeds yellow-green ichor (no gore) and dies loudly (a wet death cry that
// carries like the robots' screams: enemySfx.js edeath).
//
// ---- SNAPJAW (giant Venus flytrap) -----------------------------------------------------------------
//   new Snapjaw(W, { pos, ...opts })   or  C.snapjaw(pos, opts) (creatureKit below)
//   A rooted plant with a hinged, toothed trap for a head on a swaying stalk and a glowing lure dangling
//   from its lip (the lure is its colour). In reach it rears back, gapes and shivers (the telegraph, 0.75 s)
//   then SNAPS on its stalk at where you stood; farther off it spits a lobbed glob of digestive acid (pop
//   it with the snapjaw's colour). Weak spots: the open mouth (red inside: a crit, and the hit stuns it)
//   and the stem. pos: the root point on the surface it grows from.
//   opts: color (GREEN), shields ([outer, ...]), shieldHp (3), hp (8), size (1), yaw (rad, the way it
//     faces at rest), mount: 'floor' | 'ceiling' | 'wall' | [nx, ny, nz] (the surface normal it grows out
//     of: a ceiling one hangs head-down), reach (6 m: how far its snap reaches from the root), range (24),
//     spit (true), spitRange (22), spitInterval (3.2 s),
//     assist: 'pad' (default) | null — PLATFORM ASSIST: after a snap it holds its closed head still for
//       padTime (2.2 s), and a stun (a hit in the open mouth, or a goo splat on its head) clamps it shut and
//       droops it for stunTime (3.5 s): either way the closed head is a SOLID you can stand on (it shivers
//       before it rears up again). A hanging snapjaw stunned mid-air is a floating stepping stone.
//     padTime, stunTime, emerge (false: true = it lurks under the swamp surface at pos and rears out when
//       you come near, sinking back when you leave), depth (4 m under for emerge), uproot (false, or
//       { speed: 0.7, leash: 8 }: a floor one drags itself after you), aggro (false), onDeath(e)
//
// ---- SNAPPAD (a dormant giant flytrap: a natural launcher) ----------------------------------------
//   new SnapPad(W, { pos, yaw, power, push, size, color, reopen })  (size 1.25: ~3.4 m across)   or  C.snapPad(pos, opts)
//   A huge open trap lying flat (red inside, cilia round the rim, glowing trigger hairs). Step onto it and
//   it quivers, then snaps shut and flings you up: player.launch(power, push). pos: the middle of the pad
//   on the floor; power (17 m/s up), push ([x, z] m/s sideways throw, or null straight up), carry (true:
//   keep part of your run), reopen (1.6 s), size (1.25), color (the trigger hairs' glow: cosmetic).
//
// ---- ROTFLIES (giant flies) and the FLY SWARM -----------------------------------------------------
//   new FlySwarm(W, { pos, ...opts })   or  C.rotflies(pos, opts)
//   Dog-sized carrion flies: compound eyes in their colour, translucent buzzing wings, a bloated bronze
//   abdomen. They swarm erratically round you, one or two at a time hover, buzz up (telegraph) and
//   dive-bomb you, or hover and spit small acid globs. 1 hp: a green flak burst takes out a cluster.
//   GOO PLATFORMS: flies love goo. A goo patch on a surface (a green glob burst against a wall / trunk /
//   floor, onGooPatch() from level code, or goo.js's patches once that lands) draws the nearest free fly
//   within `attract` m: it lands head-first in the goo and is STUCK, a solid box sticking out of the
//   surface you can stand on, buzzing and struggling for stuckTime s (it shakes harder for its last 1.5 s)
//   before it tears free (or dies, stuckEnd: 'die'). Stuck flies are encased: shots glance off them.
//   So: goo a tree trunk in a line, flies stick, hop across them.
//   opts: count (5 alive at once), color (GREEN) or colors: [..] (cycled), shields, hp (1), aggro (true:
//     false = harmless flies that only wander and stick to goo), range (26), leash (18 m from pos while
//     idle), attract (16 m: goo within this of the swarm centre / a fly pulls flies in), perPatch (1 fly
//     per patch), stuckTime (7 s), stuckEnd ('free' | 'die'), respawn (6 s: a dead or freed fly is replaced
//     from the hive after this; 0 = never), hive (true: a rotting fly-blown pod at pos the flies crawl out
//     of), divers (1 diving at once), spit (true), onDeath(swarm) (all dead, no respawn)
//   API: swarm.lure(pos, normal) (= onGooPatch), swarm.stickAt(pos, normal): the nearest free fly sticks
//     there now, swarm.members (Rotfly[]), fly.stickAt(pos, normal), swarm.reset(), swarm.despawn().
//
// ---- GOO (shared with the gun's goo, goo.js) ------------------------------------------------------
//   onGooPatch(W, pos, normal = [0, 1, 0], { radius = 1.2, life = 14, visual = true }) -> patch
//     A sticky patch on a surface: flies stick to it, it plugs a borer's hole / glues an emerged borer,
//     stuns a snapjaw whose head it lands on. Green glob bursts against a surface make one by themselves.
//   gooPatches(W) -> the live patches [{ pos, normal, radius, life, flies }]
//
// ---- BORERS (giant tree worms) -----------------------------------------------------------------------
//   new Borer(W, { pos, normal, ...opts })   or  C.borer(pos, normal, opts)
//   A pale, ribbed grub-worm as long as a bus living in a hole in bark / soil / wood (pos: the hole on the
//   surface, normal: the surface's outward normal). Its hole rumbles and spits bark chips (telegraph), it
//   bursts out and lunges in an arc to bite, hangs out a moment (head exposed: the weak spot, a crit),
//   then pulls back in. It peeks out now and then when you're near.
//   GOO: goo its hole while it's in and it's PLUGGED (can't come out, thrashes inside); goo it while it's
//   out and it's GLUED half-out, rigid: its body is a SOLID ramp / bridge for stuckTime s.
//   BRIDGE MODE (mode: 'bridge', to: [x, y, z], toNormal): every `interval` s (or when you come near) it
//   breaches out of its hole and arcs over into the hole at `to`, holding the arch for holdTime s: the
//   body is a solid, walkable hump bridge (it shudders before it dives on), then it lives in the other hole.
//   opts: color (GREEN), shields, hp (6), size (1), length (14 segments), range (14: lunge reach),
//     mode ('ambush' | 'bridge'), to, toNormal, interval (6 s), holdTime (4 s), arch (2.6 m), stuckTime (8 s),
//     plugTime (9 s), aggro (false), onDeath(e)
//
// ---- THE FLY RIDE: see verdantFlyRide.js (GiantFlyRide: board a giant fly, ride a path, shoot).
//
// ---- placing them from a level: creatureKit(B) --------------------------------------------------------
//   const C = creatureKit(B);  // hooks the checkpoint-respawn reset once
//   C.snapjaw([x, y, z], { color: GREEN, mount: 'wall', yaw: Math.PI });
//   C.snapPad([x, y, z], { power: 18, push: [0, -6] });
//   const flies = C.rotflies([x, y, z], { count: 4, attract: 20 });
//   C.borer([x, y, z], [1, 0, 0], { mode: 'bridge', to: [x2, y2, z2], toNormal: [-1, 0, 0] });
//   C.goo([x, y, z], [1, 0, 0]);  // a goo patch from level code (e.g. a pre-gooed trunk)
//   Also spawnable as data: spawnEnemy(W, { type: 'snapjaw' | 'rotflies' | 'borer', pos, ... }) (combat.js),
//   so encounters can use them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, GREEN } from '../colors.js';
import { audio } from '../audio.js';
import { director } from '../combat/director.js';
import { Enemy, Beam, falloff, hexOf, loopFor, DANGER } from './enemyKit.js';
import { ENEMY_SFX, DEATH_SFX, esfx, edeath, GRUNT_FLOOR } from './enemySfx.js';
import { groundBelow, touchesPlayer, lobVelocity, Glob, Debris, shortRay, moveSafe } from './critters.js';
import { critHit } from '../bossFeel.js';
import { GiantFlyRide } from './verdantFlyRide.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _col = new THREE.Color();
export const UP = new THREE.Vector3(0, 1, 0);
const Y = UP;
const Z = new THREE.Vector3(0, 0, 1);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (k) => k * k * (3 - 2 * k);
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const vec = (a, fb = [0, 0, 0]) => (a?.isVector3 ? a.clone() : new THREE.Vector3(...(a || fb)));

export const ICHOR = 0xc8f03a; // what they bleed: yellow-green goo
const ICHOR_PALE = 0xf0ff9a;
const GOO_HEX = 0x6dff3a;

// ======================================================================================================
// SOUNDS
// New samples (see the report for their prompts). Until a file exists audio.sfxOr hands back the stand-in
// (fb, pitched by fbRate, cut after `cut` s), so every hook is audible today.
// ======================================================================================================
const CREATURE_SFX = {
  flytrap_hiss: { gain: 0.75, near: 4, far: 32, floor: GRUNT_FLOOR, gap: 0.3, fb: 'hydra_hiss', fbRate: 1.35, fbGain: 0.7, cut: 0.9 },
  flytrap_snap: { gain: 1, near: 4, far: 40, floor: GRUNT_FLOOR, gap: 0.12, fb: 'hydra_snap', fbRate: 1.3, fbGain: 1, cut: 0.7 },
  flytrap_spit: { gain: 0.75, near: 4, far: 34, floor: GRUNT_FLOOR, gap: 0.2, fb: 'hydra_spit', fbRate: 1.25, fbGain: 0.8, cut: 0.7 },
  flytrap_pain: { gain: 0.85, near: 4, far: 34, floor: GRUNT_FLOOR, gap: 0.2, fb: 'hydra_pain', fbRate: 1.45, fbGain: 0.65, cut: 0.6 },
  flytrap_creak: { gain: 0.4, near: 3, far: 20, gap: 0.5, fb: 'vine_creak', fbRate: 1.15, fbGain: 0.45, cut: 0.9 },
  flytrap_emerge: { gain: 0.8, near: 4, far: 36, floor: GRUNT_FLOOR, gap: 0.5, fb: 'waves_crash', fbRate: 1.4, fbGain: 0.6, cut: 1.1 },
  fly_dive: { gain: 0.75, near: 3, far: 32, floor: GRUNT_FLOOR, gap: 0.2, fb: 'swarm_dive', fbRate: 0.6, fbGain: 0.8, cut: 0.9 },
  fly_spit: { gain: 0.6, near: 3, far: 28, floor: GRUNT_FLOOR, gap: 0.2, fb: 'spider_spit', fbRate: 0.8, fbGain: 0.8, cut: 0.5 },
  fly_hit: { gain: 0.6, near: 3, far: 26, gap: 0.08, fb: 'critter_hit', fbRate: 0.8, fbGain: 0.8, cut: 0.4 },
  goo_stuck_buzz: { gain: 0.6, near: 3, far: 26, gap: 0.45, fb: 'swarm_buzz', fbRate: 0.55, fbGain: 0.6, cut: 1.1 },
  goo_squelch: { gain: 0.7, near: 3, far: 30, gap: 0.12, fb: 'slime_squelch', fbRate: 0.8, fbGain: 0.8, cut: 0.6 },
  worm_rumble: { gain: 0.8, near: 3, far: 30, floor: GRUNT_FLOOR, gap: 0.3, fb: 'root_rumble', fbRate: 1.25, fbGain: 0.8, cut: 1.0 },
  worm_burst: { gain: 1, near: 4, far: 42, floor: GRUNT_FLOOR, gap: 0.2, fb: 'thorn_erupt', fbRate: 0.85, fbGain: 1, cut: 1.0 },
  worm_screech: { gain: 0.85, near: 4, far: 40, floor: GRUNT_FLOOR, gap: 0.3, fb: 'hydra_roar', fbRate: 1.75, fbGain: 0.6, cut: 0.9 },
  worm_bite: { gain: 0.9, near: 4, far: 34, floor: GRUNT_FLOOR, gap: 0.12, fb: 'hydra_snap', fbRate: 1.75, fbGain: 0.8, cut: 0.5 },
  worm_pain: { gain: 0.8, near: 4, far: 34, floor: GRUNT_FLOOR, gap: 0.2, fb: 'hydra_pain', fbRate: 1.9, fbGain: 0.6, cut: 0.5 },
  worm_slither: { gain: 0.45, near: 3, far: 22, gap: 0.3, fb: 'slime_burble', fbRate: 0.7, fbGain: 0.6, cut: 0.9 },
  creature_squish: { gain: 0.7, near: 3, far: 30, gap: 0.06, fb: 'slime_splat', fbRate: 1.2, fbGain: 0.7, cut: 0.4 },
};
Object.assign(ENEMY_SFX, CREATURE_SFX);
// the death cries (enemySfx.js edeath: loudness-matched, carry ~80 m, a duck of the music)
Object.assign(DEATH_SFX, {
  death_snapjaw: { gain: 1.05, fb: 'hydra_death', fbRate: 1.45, cut: 1.5 },
  death_rotfly: { gain: 0.75, fb: 'critter_die', fbRate: 0.72, cut: 0.7 },
  death_borer: { gain: 1, fb: 'hydra_pain', fbRate: 1.15, cut: 1.2 },
});
// loops: fly_buzz (a swarm), giantfly_wings (the mount, verdantFlyRide.js)
export const CREATURE_LOOPS = { fly_buzz: 'swarm_buzz', giantfly_wings: 'swarm_buzz' };
const STOCK = ['hydra_hiss', 'hydra_snap', 'hydra_spit', 'hydra_pain', 'hydra_death', 'hydra_roar', 'vine_creak', 'waves_crash', 'swarm_dive', 'spider_spit', 'critter_hit', 'critter_die', 'swarm_buzz', 'slime_squelch', 'slime_splat', 'slime_burble', 'root_rumble', 'thorn_erupt', 'glob_pop', 'sand_sink'];
audio.manifest?.then(() => audio.prefetch([...Object.keys(CREATURE_SFX), 'death_snapjaw', 'death_rotfly', 'death_borer', ...Object.keys(CREATURE_LOOPS), ...STOCK]));

// a creature sound from world point p (esfx with the creature table's entries)
const csfx = (name, p, k = 1, rate = 1, delay = 0, floor = null) => esfx(name, p, k, rate, delay, floor);

// ======================================================================================================
// LOOKS: one organic material per (kind, colour), shared by every creature. Vertex-shader breathing (each
// instance on its own phase from where it stands), a wet rim and pulsing veins lit in the creature's
// colour, mottled vertex colours baked into the geometry.
// ======================================================================================================
const SHADER_TIME = { value: 0 };
const KINDS = {
  trap: { rough: 0.42, amp: 0.022, rate: 1.4, freq: 2.2, rimK: 0.28, veinK: 0.3, veinF: 5 },
  maw: { rough: 0.2, amp: 0.035, rate: 2.6, freq: 3.0, rimK: 0.15, veinK: 1.1, veinF: 8, side: THREE.BackSide, emissive: 0x220306 },
  stalk: { rough: 0.6, amp: 0.02, rate: 1.1, freq: 1.5, rimK: 0.22, veinK: 0.25, veinF: 3 },
  leaf: { rough: 0.75, amp: 0.03, rate: 0.9, freq: 1.2, rimK: 0.1, veinK: 0.08, veinF: 4, side: THREE.DoubleSide, flat: true },
  chitin: { rough: 0.26, metal: 0.3, amp: 0.012, rate: 7, freq: 6, rimK: 0.3, veinK: 0.15, veinF: 9 },
  grub: { rough: 0.3, amp: 0.03, rate: 3.2, freq: 2.5, rimK: 0.3, veinK: 0.4, veinF: 6 },
  goo: { rough: 0.06, amp: 0.05, rate: 2, freq: 3, rimK: 1.1, veinK: 0, veinF: 1, base: GOO_HEX, vc: false, transparent: true, opacity: 0.8, emissive: 0x041a03 },
  bark: { rough: 0.95, amp: 0, rate: 0, freq: 0, rimK: 0, veinK: 0.25, veinF: 3, flat: true },
  hive: { rough: 0.45, amp: 0.04, rate: 1.2, freq: 1.8, rimK: 0.4, veinK: 0.9, veinF: 4 },
  eye: { rough: 0.12, metal: 0.45, amp: 0, rate: 0, freq: 0, rimK: 0.7, veinK: 0, veinF: 1, base: 0x3a0e0a, vc: false, flat: true, emissive: 0x120202 },
  tooth: { rough: 0.45, amp: 0, rate: 0, freq: 0, rimK: 0.04, veinK: 0, veinF: 1, base: 0xc8b88a, vc: false, emissive: 0x0c0a06 },
};
const matCache = new Map();
const f3 = (n) => n.toFixed(4);
export function organic(kind, color = GREEN) {
  const key = kind + ':' + color;
  if (matCache.has(key)) return matCache.get(key);
  const K = KINDS[kind];
  const m = new THREE.MeshStandardMaterial({
    color: K.base ?? 0xffffff, vertexColors: K.vc !== false, roughness: K.rough, metalness: K.metal ?? 0, flatShading: !!K.flat,
    side: K.side ?? THREE.FrontSide, transparent: !!K.transparent, opacity: K.opacity ?? 1, emissive: K.emissive ?? 0x000000,
  });
  const rim = new THREE.Color(COLORS[color].hex);
  const uRim = { value: rim };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = SHADER_TIME;
    sh.uniforms.uRim = uRim;
    sh.vertexShader = 'uniform float uTime;\nvarying vec3 vObj;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 wo = vec3(modelMatrix[3]);
      #ifdef USE_INSTANCING
        wo += vec3(instanceMatrix[3]);
      #endif
      float ph = dot(wo, vec3(0.37, 0.21, 0.53));
      float br = sin(uTime * ${f3(K.rate)} + ph + position.y * ${f3(K.freq)}) * 0.6 + sin(uTime * ${f3(K.rate * 1.73)} + ph * 1.3 + position.x * ${f3(K.freq * 1.31)} + position.z * ${f3(K.freq)}) * 0.4;
      transformed += objectNormal * br * ${f3(K.amp)};
      vObj = position;`);
    sh.fragmentShader = 'uniform float uTime;\nuniform vec3 uRim;\nvarying vec3 vObj;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float rimF = 1.0 - abs(dot(normalize(vViewPosition), normal));
      // two crossing, warped vein networks (thin, branching-looking), pulsing slowly
      vec3 q = vObj * ${f3(K.veinF)};
      float va = 1.0 - abs(sin(q.x + sin(q.y * 0.7 + sin(q.z * 1.3) * 1.1) * 1.9 + sin(q.z * 0.9) * 1.2));
      float vb = 1.0 - abs(sin(q.z * 1.17 + sin(q.x * 0.8 + sin(q.y * 1.6) * 0.9) * 2.1 - q.y * 0.5));
      float vein = pow(max(va, vb * 0.85), 18.0) * (0.55 + 0.45 * sin(uTime * 2.3 + vObj.y * 4.0 + vObj.z * 3.0));
      totalEmissiveRadiance += uRim * (rimF * rimF * ${f3(K.rimK)} + vein * ${f3(K.veinK)});`);
  };
  m.customProgramCacheKey = () => 'verdant-organic-' + kind;
  matCache.set(key, m);
  return m;
}

// translucent fly wings: veined membrane drawn once on a canvas, added on top (glassy, iridescent)
let wingMatCache = null;
export function wingMaterial() {
  if (wingMatCache) return wingMatCache;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 64);
  g.save();
  g.beginPath();
  g.ellipse(64, 32, 62, 26, 0, 0, Math.PI * 2);
  g.clip();
  const grd = g.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0, 'rgba(120,150,120,0.6)');
  grd.addColorStop(1, 'rgba(70,95,90,0.35)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 64);
  g.strokeStyle = 'rgba(190,215,180,0.55)';
  g.lineWidth = 1.2;
  for (const [y0, y1, bend] of [[30, 18, -6], [32, 30, 2], [34, 42, 8], [36, 52, 10], [28, 10, -8]]) {
    g.beginPath();
    g.moveTo(2, y0);
    g.quadraticCurveTo(64, y0 + bend, 126, y1);
    g.stroke();
  }
  g.lineWidth = 0.7;
  g.strokeStyle = 'rgba(170,200,165,0.35)';
  for (let x = 18; x < 124; x += 15) {
    g.beginPath();
    g.moveTo(x, 8 + (x % 7));
    g.lineTo(x + 5, 56 - (x % 5));
    g.stroke();
  }
  g.restore();
  g.strokeStyle = 'rgba(160,190,150,0.9)';
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(64, 32, 61, 25, 0, 0, Math.PI * 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  wingMatCache = new THREE.MeshBasicMaterial({ map: tex, color: 0xc8e8d0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  return wingMatCache;
}

// per-colour glow (eyes, lures, pustules) for things that never flash (shared)
const glowCache = new Map();
export function glow(color, k = 1.8) {
  const key = color + ':' + k;
  if (!glowCache.has(key)) glowCache.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(hexOf(color)).multiplyScalar(k) }));
  return glowCache.get(key);
}

// ---- geometry helpers ----
// smooth lumps: push vertices in and out along their normals by a smooth function of position
const noise3 = (x, y, z, s = 1) => Math.sin(x * 2.1 + y * 1.3 + s) * Math.cos(z * 1.9 - y * 2.3 + s * 2.1) + 0.5 * Math.sin(x * 4.7 - z * 3.9 + s * 0.7);
export function gnarl(geo, amt, seed = 1, freq = 1) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = noise3(x * freq, y * freq, z * freq, seed) * amt;
    p.setXYZ(i, x + n.getX(i) * k, y + n.getY(i) * k, z + n.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}
// bake a vertex colour from fn(x, y, z, out: THREE.Color)
export function paint(geo, fn) {
  const p = geo.attributes.position;
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), _col);
    _col.convertSRGBToLinear(); // (the palettes below are written as sRGB)
    arr[i * 3] = _col.r;
    arr[i * 3 + 1] = _col.g;
    arr[i * 3 + 2] = _col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
// merge geometries (any mix of indexed / non-indexed, with or without colours) into one, flagged shared
export function merge(list) {
  const geos = list.map((g) => {
    let h = g.index ? g.toNonIndexed() : g;
    if (h !== g) g.dispose();
    if (!h.attributes.color) paint(h, (x, y, z, c) => c.setRGB(1, 1, 1));
    h.deleteAttribute('uv');
    return h;
  });
  const out = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
  if (geos.length > 1) geos.forEach((g) => g.dispose());
  out.computeBoundingSphere();
  return shared(out);
}
function shared(g) {
  g.userData.shared = true;
  return g;
}
// orient a geometry's +Y along `dir` and move it to `at`
function along(geo, dir, at) {
  _q.setFromUnitVectors(Y, _v.copy(dir).normalize());
  geo.applyQuaternion(_q);
  geo.translate(at[0], at[1], at[2]);
  return geo;
}
const mix3 = (c, a, b, k) => c.setRGB(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);

// ---- feedback ----
// a wet splat of ichor at p (dir: the way the shot was going)
export function splat(world, p, dir = null, k = 1, color = ICHOR) {
  const fx = world.fx;
  if (dir) _a.copy(dir).multiplyScalar(-0.45);
  fx.burst(p, color, { count: 18 * k, speed: 6 * Math.sqrt(k), life: 0.65, size: 0.17, gravity: 15, dir: dir ? _a : null, drag: 1 });
  fx.burst(p, ICHOR_PALE, { count: 6 * k, speed: 3, life: 0.35, size: 0.3, gravity: 6 });
  fx.burst(p, 0x8fb81e, { count: 5 * k, speed: 1.5, life: 1.1, size: 0.5 * Math.sqrt(k), gravity: 3, mode: 'puff', drag: 2 });
}
// a creature bursting: a ring, a gout of goo, drops raining down
export function gooPop(world, p, color, k = 1) {
  const fx = world.fx, hex = hexOf(color);
  fx.flash(p, ICHOR_PALE, { size: 1.2 * k, life: 0.16, k: 1.6, hot: 0.5 });
  fx.ring(p, null, ICHOR, { size: 0.3 * k, end: 3.2 * k, life: 0.4, thick: 0.25, k: 1.4 });
  fx.burst(p, ICHOR, { count: 60 * k, speed: 9 * Math.sqrt(k), life: 1, size: 0.24, gravity: 14, drag: 0.8 });
  fx.burst(p, hex, { count: 25 * k, speed: 6, life: 0.7, size: 0.22, gravity: 8 });
  fx.burst(p, 0x9acb24, { count: 14 * k, speed: 2.5, life: 1.6, size: 0.8 * Math.sqrt(k), gravity: 1.5, mode: 'puff', drag: 1.5 });
  for (let i = 0, n = fx.budget(10 * k); i < n; i++) {
    const s = rnd(3, 8) * Math.sqrt(k);
    const j = fx.shard(p, rnd(-1, 1) * s, rnd(0.3, 1.2) * s, rnd(-1, 1) * s, _col.set(ICHOR), 1.3, rnd(0.6, 1.1), rnd(0.07, 0.14) * k, 1.3);
    fx.grav[j] = 16;
  }
}

// ======================================================================================================
// CREATURE: the shared base (on the combat kit's Enemy: colour hits, shields, rage, dormancy, sight).
// Subclasses build this.group, call register(), and run tick() at the top of update().
// ======================================================================================================
export class Creature extends Enemy {
  constructor(world, opts) {
    super(world, opts);
    this.barkPersona = null; // animals don't radio in
    this.painSound = null; // (each plays its own wet pain sound in onDamage)
    this.armor.dispose(); // (the robots' plating: unused)
    this.mats = [this.glow];
    this.squash = 0; // a damped spring hits kick (0 = rest)
    this.squashV = 0;
    gooField(world); // (goo patches and green splashes reach every creature)
  }

  alert() {}

  // out of an encounter's spawn portal: no robot scale-in (the model has its own size), just a wet burst
  materialize() {
    this.aggro = true;
    splat(this.world, this.pos, null, 1.5);
  }

  // a wet splat instead of sparks; louder and pitched by size
  hitFx(p, dir, amount = 1) {
    splat(this.world, p, dir, amount > 1 ? 1.5 : 1);
    csfx('creature_squish', p, 0.8, rnd(0.9, 1.15));
    this.squashV += 7 * Math.min(2, amount);
  }

  // the weak spots: hit.object.userData.part ('mouth' / 'head' crit 2×, 'stem' 1.5× (rounded up on blasts))
  hitDamage(hit) {
    const part = hit?.object?.userData?.part;
    if (part && this.critParts?.[part]) {
      critHit(this.game, hit, { color: ICHOR, spark: ICHOR_PALE, scale: 0.8, sound: false, shake: 0.12 });
      return this.critParts[part];
    }
    return 1;
  }

  springs(dt) {
    this.squashV += (-120 * this.squash - 10 * this.squashV) * dt;
    this.squash = clamp(this.squash + this.squashV * dt, -0.45, 0.6);
  }

  // freed without a robot's disposeTree: every geometry and material here is shared
  remove() {
    if (this.gone) return;
    this.gone = true;
    this.dead = true;
    director.release(this);
    this.hum?.stop();
    this.hum = null;
    this.world.remove(this);
    this.world.removeHittable(this.group);
    this.world.scene.remove(this.group);
    this.colorShield?.dispose();
    this.rage.dispose();
    for (const m of this.mats) m.dispose();
    gooField(this.world).listeners.delete(this);
    this.cleanup?.();
  }

  despawn() {
    if (this.gone) return;
    this.world.fx.burst(this.pos, ICHOR, { count: 16, speed: 3, life: 0.4, size: 0.3, gravity: 4 });
    this.remove();
  }
}

// ======================================================================================================
// GOO FIELD: the sticky patches flies land in and worms get glued by (one per world, an entity)
// ======================================================================================================
const fields = new WeakMap();
let gooGeo = null;
function gooGeometry() {
  if (gooGeo) return gooGeo;
  const blob = gnarl(new THREE.IcosahedronGeometry(1, 3), 0.18, 3, 2.2).scale(1, 0.22, 1);
  const drips = [];
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3;
    drips.push(new THREE.SphereGeometry(0.16, 8, 6).scale(1, 2.2, 1).translate(Math.cos(a) * 0.7, -0.1, Math.sin(a) * 0.7));
  }
  gooGeo = merge([blob, ...drips]);
  return gooGeo;
}

export function gooField(world) {
  let f = fields.get(world);
  if (!f) {
    f = new GooField(world);
    fields.set(world, f);
  }
  return f;
}

class GooField {
  constructor(world) {
    this.world = world;
    this.patches = [];
    this.listeners = new Set(); // things told of every new patch: onGoo(patch)
    world.add(this);
  }

  // a patch at pos on a surface facing `normal` (merges with one already there)
  add(pos, normal, { radius = 1.2, life = 14, visual = true, permanent = false, mirror = false } = {}) {
    const p = vec(pos), n = vec(normal, [0, 1, 0]).normalize();
    if (permanent) life = Infinity;
    // with the gun's goo system in the world (goo.js), the goo is its patch (its look, its life); ours
    // mirrors it for the creatures
    const sys = this.world.goo;
    if (sys && !mirror) {
      const src = sys.addPatch(p, n, radius, life);
      this.mirror(sys);
      return (src && this.mirrored.get(src)) || null;
    }
    for (const q of this.patches) {
      if (q.pos.distanceTo(p) < Math.max(q.radius, radius) * 0.75 && q.normal.dot(n) > 0.7) {
        q.life = Math.max(q.life, life);
        q.max = Math.max(q.max, q.life);
        for (const l of this.listeners) l.onGoo?.(q, true);
        return q;
      }
    }
    const patch = { pos: p, normal: n, radius, life, max: life, permanent, flies: [], claim: [], mesh: null, t: 0 };
    if (visual) {
      const m = new THREE.Mesh(gooGeometry(), organic('goo', GREEN));
      m.position.copy(p).addScaledVector(n, 0.04);
      m.quaternion.setFromUnitVectors(Y, n);
      m.rotateY(Math.random() * 6.28);
      m.scale.setScalar(radius * 0.55);
      m.raycast = () => {};
      m.renderOrder = 1;
      this.world.scene.add(m);
      patch.mesh = m;
    }
    this.patches.push(patch);
    for (const l of this.listeners) l.onGoo?.(patch, false);
    return patch;
  }

  // a green glob bursting: against a surface (within ~0.9 m of a solid) it leaves a patch of goo
  onSplash(point, radius, color) {
    if (color !== GREEN) return;
    let best = null;
    for (const d of DIRS6) {
      const h = shortRay(this.world, point, d, 1.0);
      if (h && (!best || h.t < best.t)) best = h;
    }
    // (goo.js leaves its own patch: ours mirrors it on the next update)
    if (!this.world.goo && best && !best.solid?.hazard && !best.solid?.creature) this.add(best.point, best.normal, { radius: 1.2 });
    for (const l of this.listeners) l.onGooSplash?.(point, radius);
  }

  // follow world.goo's patches: one of ours per live one of its, the same spot, size and life
  mirror(sys) {
    this.mirrored ??= new Map();
    for (const src of sys.patches) {
      if (this.mirrored.has(src)) continue;
      const P = this.add(src.pos, src.n, { radius: src.r, life: src.life, permanent: src.life === Infinity, visual: false, mirror: true });
      P.src = src;
      this.mirrored.set(src, P);
    }
    for (const [src, P] of this.mirrored) {
      if (src.dead || !sys.patches.includes(src)) {
        P.life = 0;
        this.mirrored.delete(src);
        continue;
      }
      if (!P.permanent) P.life = src.life;
      P.radius = src.r;
    }
  }

  update(dt) {
    if (this.world.goo) this.mirror(this.world.goo);
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const p = this.patches[i];
      p.t += dt;
      p.life -= dt;
      p.flies = p.flies.filter((f) => f.stuckPatch === p);
      p.claim = p.claim.filter((f) => f.seekPatch === p);
      if (p.mesh) {
        const grow = Math.min(1, p.t / 0.25), fade = Math.min(1, p.life / 1.2);
        p.mesh.scale.setScalar(p.radius * 0.55 * easeOut(grow) * Math.max(0.01, fade));
      }
      if (p.life <= 0 && !p.flies.length) {
        if (p.mesh) this.world.scene.remove(p.mesh);
        this.patches.splice(i, 1);
      }
    }
  }
}
const DIRS6 = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];

export function onGooPatch(world, pos, normal = [0, 1, 0], opts = {}) {
  return gooField(world).add(pos, normal, opts);
}
export function gooPatches(world) {
  return gooField(world).patches;
}

// the surface-aligned frame a creature grows out of: 'floor' | 'ceiling' | 'wall' (facing yaw) | [nx, ny, nz]
function mountNormal(mount, yaw) {
  if (Array.isArray(mount) || mount?.isVector3) return vec(mount).normalize();
  if (mount === 'ceiling') return new THREE.Vector3(0, -1, 0);
  if (mount === 'wall') return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  return new THREE.Vector3(0, 1, 0);
}
// quaternion taking local +Y to n, with local -Z turned toward `yaw` as far as the surface allows
function mountQuat(n, yaw, out = new THREE.Quaternion()) {
  const fwd = _a.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  if (Math.abs(n.y) < 0.7) fwd.set(0, 1, 0); // on a wall: "forward" (local -Z) is up the wall
  // -Z = fwd projected on the surface plane
  fwd.addScaledVector(n, -fwd.dot(n));
  if (fwd.lengthSq() < 1e-4) fwd.set(1, 0, 0).addScaledVector(n, -n.x);
  fwd.normalize();
  const zAxis = _b.copy(fwd).negate();
  const xAxis = _c.crossVectors(n, zAxis).normalize();
  _m.makeBasis(xAxis, n, zAxis);
  return out.setFromRotationMatrix(_m);
}

// ======================================================================================================
// SNAPJAW — the giant Venus flytrap (see the top of the file for the options)
// Model space (before `size`): the root bulb at the origin, the stalk up +Y, the head a hinged trap whose
// hinge is the neck point and whose mouth opens toward -Z, 2 m long.
// ======================================================================================================
const SJ_SEGS = 8;
const SJ_B0 = new THREE.Vector3(0, 0.45, 0); // where the stalk leaves the bulb
const HEAD_K = 1.3; // the trap's scale on the stalk
const MOUTH = 1.0 * HEAD_K; // hinge to the middle of the mouth
const SNAP = { windup: 0.75, lock: 0.22, lunge: 0.2, spitWindup: 0.65, recover: 0.7 };
let sjGeo = null;

function lobeGeometry(inner) {
  const g = new THREE.SphereGeometry(1, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  if (inner) g.scale(0.8, 0.34, 0.95).translate(0, 0, -1.0);
  else g.scale(0.86, 0.44, 1.0).translate(0, 0, -1.0);
  gnarl(g, inner ? 0.02 : 0.035, inner ? 4 : 2, 2);
  return paint(g, inner
    ? (x, y, z, c) => {
      const d = Math.hypot(x / 0.8, (z + 1) / 0.95);
      mix3(c, [0.42, 0.03, 0.05], [0.9, 0.32, 0.3], Math.pow(Math.min(1, d), 3));
      if (noise3(x * 11, y * 11, z * 11, 3) > 1.1) c.setRGB(1, 0.75, 0.5); // little glands
    }
    : (x, y, z, c) => {
      const rim = clamp(1 - y / 0.44, 0, 1), n = noise3(x * 3, y * 3, z * 3, 5) * 0.35 + 0.5;
      mix3(c, [0.14 + n * 0.1, 0.32 + n * 0.16, 0.07], [0.6, 0.09, 0.06], Math.pow(rim, 2.4));
      if (noise3(x * 9, y * 9, z * 9, 2) > 1.05) c.multiplyScalar(0.4); // rot speckles
    });
}

function snapjawGeometry() {
  if (sjGeo) return sjGeo;
  // the trap's cilia: long interlocking spines round the lobe's rim (pointing out and down)
  const teeth = [];
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    const x = 0.86 * Math.cos(a), z = -1 + Math.sin(a);
    if (z > -0.3) continue;
    const len = 0.42 + 0.22 * Math.sin(i * 2.7) ** 2;
    teeth.push(along(new THREE.ConeGeometry(0.045, len, 5).translate(0, len / 2, 0), _w.set(Math.cos(a), -0.62, Math.sin(a)), [x, 0, z]));
  }
  const lip = new THREE.TorusGeometry(1, 0.055, 5, 36).rotateX(Math.PI / 2).scale(0.835, 1, 0.975).translate(0, 0, -1.0);
  paint(lip, (x, y, z, c) => c.setRGB(0.55, 0.08, 0.06));
  // glowing pustules on the trap's back (its colour, readable from behind)
  const dome = (x, z) => 0.44 * Math.sqrt(Math.max(0, 1 - (x / 0.86) ** 2 - (z + 1) ** 2));
  const pust = [[0.3, -0.85, 0.09], [-0.28, -1.2, 0.08], [0.05, -1.45, 0.07], [-0.45, -0.7, 0.06], [0.42, -1.4, 0.06]].map(([x, z, r]) => new THREE.SphereGeometry(r, 8, 6).translate(x, dome(x, z) + 0.01, z));
  // the stalk: a ribbed tube one unit long up +Y (scaled per segment)
  const seg = gnarl(new THREE.CylinderGeometry(1, 1, 1, 10, 2, true).translate(0, 0.5, 0), 0.05, 7, 3);
  paint(seg, (x, y, z, c) => {
    const rib = 0.5 + 0.5 * Math.sin(Math.atan2(x, z) * 5);
    mix3(c, [0.08, 0.17, 0.05], [0.25, 0.42, 0.12], rib * 0.7);
  });
  const knot = gnarl(new THREE.SphereGeometry(1, 12, 9).scale(0.4, 0.36, 0.42), 0.04, 8, 3);
  paint(knot, (x, y, z, c) => c.setRGB(0.18, 0.3, 0.08));
  // the root rosette: splayed leaves round a lumpy bulb, roots clawing into the ground
  const leaves = [];
  for (let i = 0; i < 7; i++) {
    const l = new THREE.SphereGeometry(1, 10, 6).scale(0.4, 0.05, 1.25).translate(0, 0, -1.3);
    const p = l.attributes.position;
    for (let j = 0; j < p.count; j++) p.setY(j, p.getY(j) + 0.35 - 0.06 * (p.getZ(j) + 1.3) ** 2 + Math.sin(p.getX(j) * 3) * 0.04);
    l.rotateZ(rnd(-0.2, 0.2)).rotateY((i / 7) * Math.PI * 2 + rnd(-0.2, 0.2));
    l.computeVertexNormals();
    leaves.push(paint(l, (x, y, z, c) => {
      const r = Math.hypot(x, z), mid = Math.abs(Math.sin(Math.atan2(x, z) * 3.5));
      mix3(c, [0.45, 0.1, 0.06], [0.18, 0.4, 0.1], clamp(r / 1.2, 0, 1));
      if (mid < 0.08) c.multiplyScalar(0.6);
    }));
  }
  const bulb = gnarl(new THREE.SphereGeometry(1, 14, 10).scale(0.75, 0.55, 0.75), 0.12, 3, 2.5);
  paint(bulb, (x, y, z, c) => mix3(c, [0.2, 0.14, 0.06], [0.2, 0.35, 0.1], clamp(y / 0.5 + 0.5, 0, 1)));
  const roots = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    roots.push(paint(along(new THREE.CylinderGeometry(0.05, 0.13, 1.4, 5).translate(0, 0.7, 0), _w.set(Math.cos(a), -0.35, Math.sin(a)), [Math.cos(a) * 0.4, 0.1, Math.sin(a) * 0.4]), (x, y, z, c) => c.setRGB(0.17, 0.12, 0.06)));
  }
  sjGeo = {
    lobe: merge([lobeGeometry(false), lip]),
    inner: shared(lobeGeometry(true)),
    teeth: merge(teeth),
    pust: merge(pust),
    seg: shared(seg),
    knot: shared(knot),
    leaves: merge(leaves),
    bulb: merge([bulb, ...roots]),
    lureStalk: shared(new THREE.CylinderGeometry(0.018, 0.026, 0.75, 5).translate(0, -0.375, 0)),
    lureBulb: shared(new THREE.SphereGeometry(0.15, 12, 9)),
    lureHalo: shared(new THREE.SphereGeometry(0.3, 10, 8)),
  };
  return sjGeo;
}

export class Snapjaw extends Creature {
  constructor(world, opts) {
    const { pos, color = GREEN, shields = null, shieldHp = 3, hp = 8, size = 1, yaw = 0, mount = 'floor', reach = 6, range = 24, spit = true, spitRange = 22, spitInterval = 3.2,
      assist = 'pad', padTime = 2.2, stunTime = 3.5, emerge = false, depth = 4, uproot = false, aggro = false, onDeath = null } = opts;
    super(world, { pos, color, shields, shieldHp, hp, range: Math.max(range, spitRange + 2), aggro, onDeath });
    this.spawnOpts = opts;
    this.critter = true;
    this.verdantCreature = true; // (creatureKit's respawn reset)
    this.S = size;
    this.yaw0 = yaw;
    this.reachL = reach / size;
    this.spitOn = spit;
    this.spitRange = spitRange;
    this.spitInterval = spitInterval;
    this.assist = assist;
    this.padTime = padTime;
    this.stunTime = stunTime;
    this.emerge = emerge;
    this.depth = depth;
    this.uproot = uproot ? { speed: 0.7, leash: 8, ...(uproot === true ? {} : uproot) } : null;
    this.normal = mountNormal(mount, yaw);
    this.mq = mountQuat(this.normal, yaw);
    this.mqInv = this.mq.clone().invert();
    this.upL = new THREE.Vector3(0, 1, 0).applyQuaternion(this.mqInv); // world up, in model space
    this.critParts = { mouth: 2, stem: 2 };
    this.headW = new THREE.Vector3();
    this.mouthW = new THREE.Vector3();
    this.neck = new THREE.Vector3(0, 3, 0);
    this.face = new THREE.Vector3(0, 0, -1);
    this.tgtL = new THREE.Vector3(0, 3, -4);
    this.kick = new THREE.Vector3(); // hit recoil of the neck (model space)
    this.build();
    this.register();
    gooField(world).listeners.add(this);
    // goo on its head (goo.js) clamps it shut: a stun, the head a platform, gobs of goo clinging to it
    this.gooHandle = world.goo?.registerStickable(this, {
      box: (out) => out.setFromCenterAndSize(this.mouthW, _s.set(2.4, 1.4, 2.4).multiplyScalar(this.S)),
      freeze: false, duration: this.stunTime, parent: this.head, pad: 0.4,
      onStick: () => this.stun(),
    });
    this.reset();
  }

  build() {
    const G = snapjawGeometry(), c = this.color;
    const g = this.group;
    g.scale.setScalar(this.S);
    g.quaternion.copy(this.mq);
    const base = new THREE.Group();
    base.add(new THREE.Mesh(G.leaves, organic('leaf', c)), new THREE.Mesh(G.bulb, organic('stalk', c)));
    for (const m of base.children) m.userData.part = 'stem';
    g.add(base);
    // the stalk: one instanced mesh of SJ_SEGS ribbed segments (one draw)
    this.stalk = new THREE.InstancedMesh(G.seg, organic('stalk', c), SJ_SEGS);
    this.stalk.userData.part = 'stem';
    this.stalk.frustumCulled = false;
    g.add(this.stalk);
    const head = (this.head = new THREE.Group());
    const knot = new THREE.Mesh(G.knot, organic('stalk', c));
    knot.userData.part = 'stem';
    head.add(knot);
    const jaw = (lower) => {
      const j = new THREE.Group();
      const parts = [new THREE.Mesh(G.lobe, organic('trap', c)), new THREE.Mesh(G.inner, organic('maw', c)), new THREE.Mesh(G.teeth, organic('tooth', c)), new THREE.Mesh(G.pust, this.glow)];
      parts[1].userData.part = 'mouth';
      for (const p of parts) {
        if (lower) p.rotation.z = Math.PI;
        j.add(p);
      }
      head.add(j);
      return j;
    };
    this.upper = jaw(false);
    this.lower = jaw(true);
    // the lure: a glowing bulb on a thread off the upper lip, the creature's colour
    this.lure = new THREE.Group();
    this.lure.position.set(0, 0.08, -1.92);
    const ls = new THREE.Mesh(G.lureStalk, organic('stalk', c));
    const lb = new THREE.Mesh(G.lureBulb, this.glow);
    lb.position.y = -0.78;
    this.haloMat = new THREE.MeshBasicMaterial({ color: hexOf(c), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
    const halo = new THREE.Mesh(G.lureHalo, this.haloMat);
    halo.position.y = -0.78;
    halo.raycast = () => {};
    this.mats.push(this.haloMat);
    this.lure.add(ls, lb, halo);
    this.upper.add(this.lure);
    g.add(head);
  }

  shieldView() {
    return { parent: this.head, center: [0, 0, -1], size: 1.2 };
  }

  sightFrom() {
    return this.headW;
  }

  center(out) {
    return out.copy(this.headW);
  }

  // back to its post (every checkpoint respawn, unless it's dead)
  reset() {
    if (this.dead) return;
    director.release(this);
    this.pos.copy(this.home);
    this.state = 'idle';
    this.timer = 0;
    this.cool = rnd(0.5, 1.5);
    this.spitCool = rnd(1, 2);
    this.stunCool = 0;
    this.open = 0.45;
    this.aggro = this.spawnOpts.aggro ?? false;
    this.hp = this.maxHp;
    this.colorShield?.restore();
    this.neck.set(0, 3, 0);
    this.kick.set(0, 0, 0);
    this.rise = this.emerge ? 0 : 1;
    this.lostT = 0;
    this.group.visible = this.rise > 0.02;
    this.setPad(false);
    this.pose(0);
  }

  // ---------------------------------------------------------------- per frame
  update(dt, player) {
    SHADER_TIME.value = this.world.time;
    if (this.state === 'dying') {
      this.t += dt;
      this.timer -= dt;
      this.dying();
      if (!this.gone) this.pose(dt);
      return;
    }
    if (!this.tick(dt, player)) return;
    this.cool -= dt;
    this.spitCool -= dt;
    this.stunCool -= dt;
    this.timer -= dt;
    this.springs(dt);
    // where you are, in model space (chest height)
    this.group.updateMatrixWorld();
    this.aimPoint(player, _eye);
    this.tgtL.copy(_eye);
    this.group.worldToLocal(this.tgtL);
    const st = this.state;
    if (this.emerge) this.updateEmerge(dt);
    if (this.uproot && (st === 'idle' || st === 'track') && this.rise >= 1) this.creep(dt, player);
    switch (st) {
      case 'idle':
      case 'track': this.think(dt, player); break;
      case 'windup': this.windup(dt); break;
      case 'lunge': this.lunge(dt, player); break;
      case 'chew': if (this.timer <= 0) this.recover(); break;
      case 'spit': this.spitting(dt, player); break;
      case 'stun': if (this.timer <= 0) this.recover(); break;
      case 'recover': if (this.timer <= 0) this.state = this.aggro ? 'track' : 'idle'; break;
    }
    this.pose(dt);
    this.glowFlash(this.state === 'windup' && Math.sin(this.t * 38) > 0 ? 3 : 1.6);
    this.haloMat.opacity = 0.16 + 0.12 * Math.sin(this.t * 2.4);
  }

  // idle sway / tracking; picks a snap or a spit
  think(dt, player) {
    if (this.aggro && this.state === 'idle') {
      this.state = 'track';
      csfx('flytrap_hiss', this.headW, 0.7, 1.2);
    }
    if (!this.aggro || !this.sees || this.rise < 1) return;
    const dMouth = this.mouthW.distanceTo(_eye);
    const reachW = (this.reachL + MOUTH) * this.S;
    const fromRoot = _v.copy(this.tgtL).sub(SJ_B0).length() * this.S;
    if (this.cool <= 0 && fromRoot < reachW + 0.6) {
      if (director.request(this, (SNAP.windup + SNAP.lunge) / this.rage.warp + 0.4)) {
        this.state = 'windup';
        this.timer = SNAP.windup;
        this.lock = this.tgtL.clone();
        csfx('flytrap_hiss', this.headW, 1, 1, 0, GRUNT_FLOOR);
      } else this.cool = rnd(0.3, 0.6);
    } else if (this.spitOn && this.spitCool <= 0 && dMouth < this.spitRange && fromRoot > reachW * 0.7) {
      if (director.request(this, SNAP.spitWindup + 0.6)) {
        this.state = 'spit';
        this.timer = SNAP.spitWindup;
        this.fired = false;
        csfx('flytrap_creak', this.headW, 1, 1.2);
      } else this.spitCool = rnd(0.4, 0.8);
    }
  }

  windup() {
    if (this.timer > SNAP.lock) this.lock = this.tgtL.clone(); // the aim fixes on you SNAP.lock s before it strikes
    if (Math.random() < 0.3) this.world.fx.burst(this.mouthW, ICHOR, { count: 1, speed: 1.5, life: 0.5, size: 0.1, gravity: 9 }); // drool
    if (this.timer > 0) return;
    this.state = 'lunge';
    this.timer = SNAP.lunge;
    this.neckFrom = this.neck.clone();
    // the head goes for the locked point: the mouth's middle lands on it (or as far as the stalk reaches)
    _v.subVectors(this.lock, this.neckFrom).normalize();
    this.lungeFace = _v.clone();
    this.neckTo = this.lock.clone().addScaledVector(_v, -MOUTH * 0.85);
    _w.subVectors(this.neckTo, SJ_B0);
    if (_w.length() > this.reachL) this.neckTo.copy(SJ_B0).addScaledVector(_w.normalize(), this.reachL);
    csfx('flytrap_creak', this.headW, 0.8, 1.6);
  }

  lunge(dt, player) {
    if (this.timer > 0) return;
    // SNAP: the jaws slam shut; anything in them is caught
    this.state = 'chew';
    this.timer = this.assist === 'pad' ? this.padTime : 0.9;
    director.release(this);
    this.pose(0);
    csfx('flytrap_snap', this.mouthW, 1, rnd(0.95, 1.05));
    const fx = this.world.fx;
    fx.burst(this.mouthW, ICHOR, { count: 26, speed: 6, life: 0.5, size: 0.16, gravity: 12 });
    fx.ring(this.mouthW, null, ICHOR_PALE, { size: 0.3 * this.S, end: 2.4 * this.S, life: 0.25, thick: 0.15, k: 1.2 });
    this.squashV -= 6;
    player.shake = Math.max(player.shake, 0.25 * falloff(this.dist, 3, 14));
    if (!player.dead && touchesPlayer(player, this.mouthW, 1.45 * this.S)) player.damage(1, 'slime');
    if (this.assist === 'pad') this.setPad(true);
  }

  spitting(dt, player) {
    if (this.timer > 0) {
      if (!this.fired && Math.random() < 0.5) this.world.fx.burst(this.mouthW, hexOf(this.color), { count: 1, speed: 2, life: 0.3, size: 0.12, gravity: -2 });
      return;
    }
    if (!this.fired) {
      this.fired = true;
      const from = this.mouthW.clone();
      const to = director.aim(this, from, this.aimPoint(player, _a));
      const T = clamp(from.distanceTo(to) / 15, 0.5, 1.4) / this.rage.shot;
      const vel = lobVelocity(from, to, T, 12, new THREE.Vector3());
      new Glob(this.world, from, vel, this.color, { radius: 0.3 * Math.sqrt(this.S), gravity: 12, life: 4, cause: 'acid spit' });
      csfx('flytrap_spit', from, 1, rnd(0.95, 1.1));
      this.world.fx.burst(from, ICHOR, { count: 14, speed: 4, life: 0.4, size: 0.14, gravity: 10 });
      this.squashV += 5;
      this.timer = 0.5;
      this.spitCool = this.spitInterval * this.rage.cool * rnd(0.85, 1.2);
      this.cool = Math.max(this.cool, 0.8);
      return;
    }
    this.recover(0.45);
  }

  recover(t = SNAP.recover) {
    this.state = 'recover';
    this.timer = t;
    this.cool = Math.max(this.cool, rnd(0.9, 1.6) * this.rage.cool);
    director.release(this);
    this.setPad(false);
  }

  // clamped shut and drooping (a hit in the mouth, a goo splat on the head): a platform for a moment
  stun(time = this.stunTime) {
    if (this.dead || this.stunCool > 0 || this.rise < 1) return;
    director.release(this);
    this.state = 'stun';
    this.timer = time;
    this.stunCool = time + 1.5;
    csfx('flytrap_pain', this.headW, 1, 0.85);
    if (this.assist === 'pad') this.setPad(true);
  }

  onStagger() {
    this.kick.addScaledVector(this.face, -1.2);
  }

  onDamage(hit, dir, amount) {
    // recoil along the shot, a wet yelp; a mouth hit with its colour clamps it shut
    _v.copy(dir).applyQuaternion(this.mqInv);
    this.kick.addScaledVector(_v, 0.5 + 0.3 * amount);
    if (this.hp > 0) csfx('flytrap_pain', this.headW, 0.8, rnd(1, 1.15));
    if (this.hp > 0 && hit?.object?.userData?.part === 'mouth' && this.open > 0.3) this.stun();
  }

  // (without goo.js: our own goo field's patches and green splashes)
  onGoo(patch) {
    if (!this.gooHandle && patch.pos.distanceTo(this.mouthW) < 1.6 * this.S) this.stun();
  }

  onGooSplash(p, r) {
    if (!this.gooHandle && p.distanceTo(this.mouthW) < r * 0.4 + 1.1 * this.S) this.stun();
  }

  // ---------------------------------------------------------------- variants
  updateEmerge(dt) {
    const want = this.aggro && this.dist < this.range + 4;
    if (want) this.lostT = 0;
    else this.lostT += dt;
    if (want && this.rise < 1) {
      if (this.rise === 0) {
        csfx('flytrap_emerge', this.pos, 1);
        csfx('flytrap_hiss', this.pos, 1, 0.9, 0.3, GRUNT_FLOOR);
        this.world.fx.splash?.(this.pos, 10);
        splat(this.world, this.pos, null, 2, 0x9acb6a);
      }
      this.rise = Math.min(1, this.rise + dt / 1.1);
    } else if (!want && this.lostT > 4 && (this.state === 'idle' || this.state === 'track') && this.rise > 0) {
      this.rise = Math.max(0, this.rise - dt / 1.4);
      if (this.rise === 0) this.world.fx.splash?.(this.pos, 5);
    }
    this.group.visible = this.rise > 0.02;
    if (this.rise > 0 && this.rise < 1 && Math.random() < dt * 20) this.world.fx.bubbles?.(_v.copy(this.pos).addScaledVector(this.normal, 0.2), 2);
  }

  // drag itself after you along the floor (uproot), roots tearing at the dirt
  creep(dt, player) {
    _v.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const d = _v.length();
    if (!this.aggro || d < this.reachL * this.S * 0.75 || d < 0.1) return;
    _v.multiplyScalar(Math.min(d, this.uproot.speed * dt) / d);
    const old = _w.copy(this.pos);
    this.pos.add(_v);
    if (Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > this.uproot.leash) return this.pos.copy(old);
    const g = groundBelow(this.world, this.pos, 0.6, 2);
    if (!g || g.solid?.hazard || g.solid?.creature) return this.pos.copy(old);
    this.pos.y = g.point.y;
    if (Math.random() < dt * 6) this.world.fx.burst(this.pos, 0x5a4a2a, { count: 2, speed: 1.5, life: 0.6, size: 0.25, gravity: 5, mode: 'puff' });
    if (Math.random() < dt * 0.8) csfx('flytrap_creak', this.pos, 0.8, 0.8);
  }

  // ---------------------------------------------------------------- the pad assist
  setPad(on) {
    if (on && !this.pad) this.pad = this.world.addSolid(new THREE.Vector3(), new THREE.Vector3(), { entity: this, creature: true, kind: 'moss' });
    if (this.pad) this.pad.enabled = !!on;
    if (on) this.placePad();
  }

  placePad() {
    const h = this.S;
    this.pad.min.set(this.mouthW.x - 1.15 * h, this.mouthW.y - 0.5 * h, this.mouthW.z - 1.15 * h);
    this.pad.max.set(this.mouthW.x + 1.15 * h, this.mouthW.y + 0.52 * h, this.mouthW.z + 1.15 * h);
  }

  // ---------------------------------------------------------------- the pose: neck, stalk, head, jaws
  pose(dt) {
    const t = this.t, st = this.state;
    // which way it looks: at you (clamped away from its own stalk), else out ahead with a slow sway
    const want = _a;
    if (this.aggro && st !== 'stun' && st !== 'dying') want.subVectors(this.tgtL, this.neck);
    else want.set(Math.sin(t * 0.3) * 0.8, -0.2, -1);
    if (want.lengthSq() < 1e-4) want.set(0, 0, -1);
    want.normalize();
    if (want.dot(this.upL) < -0.75) want.addScaledVector(this.upL, -0.75 - want.dot(this.upL));
    want.normalize();
    // the neck's target for this state
    const n = _b;
    const fh = _c.copy(want).addScaledVector(Y, -want.y);
    if (fh.lengthSq() < 1e-4) fh.set(0, 0, -1);
    fh.normalize();
    let open = 0.45 + 0.12 * Math.sin(t * 1.3), k = 1 - Math.exp(-dt * 5);
    switch (st) {
      case 'idle':
      case 'track':
      case 'recover':
        n.set(Math.sin(t * 0.7) * 0.35, 3 + Math.sin(t * 1.1) * 0.15, Math.cos(t * 0.5) * 0.3).addScaledVector(fh, 0.7);
        if (st === 'track') open = 0.75 + 0.1 * Math.sin(t * 3);
        break;
      case 'windup': {
        const w = 1 - Math.max(0, this.timer) / SNAP.windup;
        n.set(0, 3.4 + 0.4 * w, 0).addScaledVector(fh, -0.9 * w);
        n.x += (Math.random() - 0.5) * 0.12 * w;
        n.z += (Math.random() - 0.5) * 0.12 * w;
        open = 0.75 + 0.65 * w;
        k = 1 - Math.exp(-dt * 9);
        break;
      }
      case 'lunge': {
        const w = easeOut(1 - Math.max(0, this.timer) / SNAP.lunge);
        n.lerpVectors(this.neckFrom, this.neckTo, w);
        want.copy(this.lungeFace);
        open = w < 0.65 ? 1.4 : 1.4 * (1 - (w - 0.65) / 0.35);
        k = 1;
        break;
      }
      case 'chew':
        n.copy(this.neck);
        if (this.lungeFace) want.copy(this.lungeFace);
        open = 0.03 + 0.04 * Math.abs(Math.sin(t * 9));
        if (this.timer < 0.6) open += (0.1 * (0.6 - this.timer)) / 0.6 + (Math.random() - 0.5) * 0.05; // shivers before it lets go
        k = 1;
        break;
      case 'spit': {
        const w = this.fired ? 1 : 1 - Math.max(0, this.timer) / SNAP.spitWindup;
        n.set(0, 3.3 + 0.4 * w, 0).addScaledVector(fh, -0.5 * w + (this.fired ? 0.8 : 0));
        open = 0.6 + 0.6 * w;
        break;
      }
      case 'stun': {
        // droops forward, clamped shut, level: something to stand on (hanging ones dangle lower: room to stand)
        n.set(0, this.upL.y < -0.5 ? 3.4 : 1.85, 0).addScaledVector(fh, this.upL.y < -0.5 ? 1.2 : 2.1);
        want.copy(fh).addScaledVector(this.upL, -0.12).normalize();
        open = 0;
        if (this.timer < 0.8) open = Math.random() * 0.08;
        k = 1 - Math.exp(-dt * 7);
        break;
      }
      case 'dying': {
        const w = clamp(1 - this.timer / 1.1, 0, 1);
        n.set(0, 3 - 2.3 * ease(w), 0).addScaledVector(fh, 1.2 + 0.8 * w);
        want.copy(fh).addScaledVector(this.upL, -0.6 * w).normalize();
        open = 0.3 + 0.8 * w;
        k = 1 - Math.exp(-dt * 4);
        break;
      }
    }
    if (dt === 0) k = 1;
    // hit recoil (decays)
    n.add(this.kick);
    this.kick.multiplyScalar(Math.exp(-dt * 6));
    if (this.pad?.enabled && st === 'chew') k = 0; // a pad holds still
    if (st === 'stun' && this.pad?.enabled && this.timer < this.stunTime - 0.6) k = 0;
    this.neck.lerp(n, k);
    this.face.lerp(want, st === 'lunge' || dt === 0 ? 1 : 1 - Math.exp(-dt * 8)).normalize();
    this.open += (open - this.open) * (st === 'lunge' || st === 'chew' || dt === 0 ? 1 : 1 - Math.exp(-dt * 10));
    // emerging: the whole plant sinks under the surface
    this.group.position.copy(this.pos).addScaledVector(this.normal, -(1 - ease(this.rise)) * this.depth * this.S);
    // stalk: a quadratic curve from the bulb to the neck, bowing out behind the head
    const p0 = SJ_B0, p2 = this.neck;
    const L = _d.subVectors(p2, p0).length();
    const p1 = _s.copy(p0).addScaledVector(Y, L * 0.55).addScaledVector(this.face, -L * 0.18);
    const prev = bez(p0, p1, p2, 0, _eye);
    for (let i = 0; i < SJ_SEGS; i++) {
      const next = bez(p0, p1, p2, (i + 1) / SJ_SEGS, _w);
      _d.subVectors(next, prev);
      const len = _d.length();
      _q.setFromUnitVectors(Y, _d.divideScalar(Math.max(len, 1e-4)));
      const r = 0.3 - 0.13 * (i / SJ_SEGS) + (i === 0 ? 0.05 : 0);
      this.stalk.setMatrixAt(i, _m.compose(prev, _q, _v.set(r, len * 1.08, r)));
      prev.copy(next);
    }
    this.stalk.instanceMatrix.needsUpdate = true;
    this.stalk.computeBoundingSphere();
    // head: hinge at the neck, mouth toward `face`, upright in the world
    this.head.position.copy(this.neck);
    _m.lookAt(_v.set(0, 0, 0), this.face, Math.abs(this.face.dot(this.upL)) > 0.97 ? Z : this.upL);
    this.head.quaternion.setFromRotationMatrix(_m);
    const sq = 1 + this.squash * 0.5;
    this.head.scale.set(HEAD_K / Math.sqrt(sq), HEAD_K * sq, HEAD_K / Math.sqrt(sq));
    this.upper.rotation.x = this.open * 0.5;
    this.lower.rotation.x = -this.open * 0.5;
    // the lure hangs down (counter the head's pitch and the jaw), swinging
    this.lure.rotation.set(-this.open * 0.5 - Math.asin(clamp(this.face.dot(this.upL), -1, 1)) + Math.sin(t * 2.1) * 0.25, 0, Math.sin(t * 1.7) * 0.2);
    // world points
    this.group.updateMatrixWorld(true);
    this.headW.copy(this.neck);
    this.group.localToWorld(this.headW);
    this.mouthW.copy(this.face).multiplyScalar(MOUTH).add(this.neck);
    this.group.localToWorld(this.mouthW);
    if (this.pad?.enabled) this.placePad();
  }

  // ---------------------------------------------------------------- death
  die(hit, dir) {
    if (this.state === 'dying') return;
    this.dead = true; // (no more hits; the body plays out its collapse)
    this.state = 'dying';
    this.timer = 1.1;
    director.release(this);
    this.setPad(false);
    this.gooHandle?.remove();
    this.gooHandle = null;
    this.world.removeHittable(this.group);
    edeath('death_snapjaw', this.headW, 1, rnd(0.95, 1.05));
    splat(this.world, this.mouthW, dir, 2.5);
    this.onDeath?.(this);
  }

  dying() {
    if (Math.random() < 0.4) this.world.fx.burst(this.mouthW, ICHOR, { count: 2, speed: 2, life: 0.6, size: 0.14, gravity: 12 });
    this.glow.color.multiplyScalar(0.94);
    if (this.timer > 0) return;
    // it bursts: a gout of goo, the trap and the stalk tumbling away
    gooPop(this.world, this.mouthW, this.color, 1.3 * this.S);
    csfx('goo_squelch', this.mouthW, 1, 0.7);
    audio.sample('glob_pop', { gain: 0.7 * falloff(this.dist, 4, 40), rate: 0.6 });
    this.group.updateMatrixWorld(true);
    new Debris(this.world, [this.upper, this.lower], { from: this.mouthW, speed: 6 });
    this.remove();
  }

  cleanup() {
    this.gooHandle?.remove();
    if (this.pad) {
      const i = this.world.solids.indexOf(this.pad);
      if (i >= 0) this.world.solids.splice(i, 1);
      this.pad = null;
    }
  }
}

function bez(p0, p1, p2, t, out) {
  const u = 1 - t;
  return out.set(u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y, u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z);
}

// ======================================================================================================
// SNAPPAD — a dormant giant flytrap lying open on the ground: step on it, it snaps shut and flings you up
// Model: the midrib along Z at pad height, two bowl-shaped lobes opening flat to either side.
// ======================================================================================================
let padGeo = null;
function padGeometry() {
  if (padGeo) return padGeo;
  const bowl = (inner) => {
    // a quarter of a squashed sphere: the dome's z ≥ 0 half, turned to x ≥ 0, flipped into a bowl
    const g = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI, 0, Math.PI / 2).rotateY(Math.PI / 2).rotateX(Math.PI);
    if (inner) g.scale(1.22, 0.3, 1.36);
    else g.scale(1.3, 0.38, 1.45);
    gnarl(g, 0.03, inner ? 6 : 5, 2);
    return paint(g, inner
      ? (x, y, z, c) => {
        const d = Math.hypot(x / 1.22, z / 1.36);
        mix3(c, [0.5, 0.04, 0.06], [0.95, 0.35, 0.3], Math.pow(Math.min(1, d), 2.5));
        if (noise3(x * 10, y * 10, z * 10, 1) > 1.1) c.setRGB(1, 0.8, 0.5);
      }
      : (x, y, z, c) => {
        const rim = clamp(1 + y / 0.38, 0, 1), n = noise3(x * 3, y * 3, z * 3, 2) * 0.3 + 0.5;
        mix3(c, [0.14 + n * 0.1, 0.34 + n * 0.12, 0.07], [0.6, 0.1, 0.06], Math.pow(rim, 3));
      });
  };
  const cilia = [], hairs = [];
  for (let i = 0; i <= 16; i++) {
    const u = (i / 16) * Math.PI;
    const x = 1.3 * Math.sin(u), z = 1.45 * Math.cos(u);
    const len = 0.5 + 0.25 * Math.sin(i * 2.3) ** 2;
    cilia.push(along(new THREE.ConeGeometry(0.05, len, 5).translate(0, len / 2, 0), _w.set(Math.sin(u), 0.75, Math.cos(u) * 1.1), [x, 0, z]));
  }
  for (const [x, z] of [[0.5, -0.5], [0.55, 0.45], [0.75, 0]]) hairs.push(new THREE.ConeGeometry(0.03, 0.42, 4).translate(x, 0.09, z));
  const rib = paint(new THREE.CylinderGeometry(0.16, 0.16, 2.9, 8).rotateX(Math.PI / 2), (x, y, z, c) => c.setRGB(0.25, 0.12, 0.06));
  padGeo = { outer: shared(bowl(false)), inner: shared(bowl(true)), cilia: merge(cilia), hairs: merge(hairs), rib: merge([rib]) };
  return padGeo;
}

export class SnapPad {
  constructor(world, { pos, yaw = 0, size = 1.25, power = 17, push = null, carry = true, reopen = 1.6, color = GREEN }) {
    this.world = world;
    this.game = world.game;
    this.pos = vec(pos);
    this.size = size;
    this.verdantCreature = true;
    this.power = power;
    this.push = push ? new THREE.Vector3(push[0], 0, push[1]) : null;
    this.carry = carry;
    this.reopen = reopen;
    this.color = color;
    this.t = Math.random() * 10;
    this.state = 'open';
    this.timer = 0;
    this.ang = 0.08;
    const G = padGeometry(), SG = snapjawGeometry();
    const g = (this.group = new THREE.Group());
    g.position.copy(this.pos);
    g.rotation.y = yaw;
    g.scale.setScalar(size);
    const piv = (this.pivot = new THREE.Group());
    piv.position.y = 0.4;
    g.add(piv);
    piv.add(new THREE.Mesh(G.rib, organic('stalk', color)));
    this.lobes = [-1, 1].map((s) => {
      const l = new THREE.Group();
      l.scale.x = s; // (the left lobe is the right one mirrored)
      l.add(new THREE.Mesh(G.outer, organic('trap', color)), new THREE.Mesh(G.inner, organic('maw', color)), new THREE.Mesh(G.cilia, organic('tooth', color)), new THREE.Mesh(G.hairs, glow(color, 2.2)));
      piv.add(l);
      return l;
    });
    const base = new THREE.Mesh(SG.leaves, organic('leaf', color));
    base.scale.set(1.3, 0.6, 1.3);
    base.position.y = -0.25;
    g.add(base);
    world.scene.add(g);
    // the solid you step on: the pad's footprint (an axis-aligned box round the turned rectangle)
    const hx = 1.35 * size, hz = 1.5 * size, c = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
    const ex = hx * c + hz * sn, ez = hx * sn + hz * c;
    this.solid = world.addSolid(new THREE.Vector3(this.pos.x - ex, this.pos.y, this.pos.z - ez), new THREE.Vector3(this.pos.x + ex, this.pos.y + 0.36 * size, this.pos.z + ez), { static: true, kind: 'moss' });
    world.add(this);
  }

  reset() {
    this.state = 'open';
    this.timer = 0;
  }

  update(dt, player) {
    this.t += dt;
    this.timer -= dt;
    if (this.pos.distanceTo(player.pos) > 90) return;
    SHADER_TIME.value = this.world.time;
    let ang = 0.1 + 0.04 * Math.sin(this.t * 1.2), quiver = 0;
    switch (this.state) {
      case 'open':
        if (player.grounded && player.ground === this.solid && !player.dead) {
          this.state = 'arm';
          this.timer = 0.22;
          csfx('flytrap_creak', this.pos, 1, 1.5);
          this.world.fx.burst(_v.copy(this.pos).setY(this.pos.y + 0.6 * this.size), hexOf(this.color), { count: 10, speed: 2.5, life: 0.4, size: 0.12, gravity: -1 });
        }
        break;
      case 'arm':
        quiver = 1;
        ang += 0.12 * (1 - this.timer / 0.22);
        if (this.timer <= 0) this.snap(player);
        break;
      case 'snap': {
        const k = clamp(1 - this.timer / 0.12, 0, 1);
        ang = 0.25 + (Math.PI / 2 - 0.15) * easeOut(k);
        if (this.timer <= 0) {
          this.state = 'closed';
          this.timer = this.reopen;
        }
        break;
      }
      case 'closed':
        ang = Math.PI / 2 - 0.12 + Math.sin(this.t * 18) * 0.01;
        if (this.timer <= 0) {
          this.state = 'opening';
          this.timer = 0.7;
          csfx('flytrap_creak', this.pos, 0.6, 0.8);
        }
        break;
      case 'opening': {
        const k = clamp(1 - this.timer / 0.7, 0, 1);
        ang = Math.PI / 2 - 0.12 - (Math.PI / 2 - 0.22) * ease(k);
        if (this.timer <= 0) this.state = 'open';
        break;
      }
    }
    this.ang = ang;
    this.lobes[1].rotation.z = ang + (quiver ? (Math.random() - 0.5) * 0.06 : 0);
    this.lobes[0].rotation.z = -ang - (quiver ? (Math.random() - 0.5) * 0.06 : 0);
  }

  snap(player) {
    this.state = 'snap';
    this.timer = 0.12;
    const p = _v.copy(this.pos).setY(this.pos.y + 0.6 * this.size);
    const on = player.ground === this.solid || (Math.abs(player.pos.x - this.pos.x) < 1.6 * this.size && Math.abs(player.pos.z - this.pos.z) < 1.6 * this.size && Math.abs(player.pos.y - this.solid.max.y) < 0.6);
    if (on && !player.dead) {
      player.launch(this.power, this.push, this.carry);
      player.landKick = Math.max(player.landKick, 0.15);
      player.shake = Math.max(player.shake, 0.3);
    }
    csfx('flytrap_snap', p, 1.1, 0.85);
    audio.pad();
    const fx = this.world.fx;
    fx.burst(p, ICHOR, { count: 30, speed: 7, life: 0.6, size: 0.18, gravity: 12 });
    fx.ring(_w.copy(this.pos).setY(this.pos.y + 0.4 * this.size), UP, ICHOR_PALE, { size: 0.5 * this.size, end: 3.5 * this.size, life: 0.35, thick: 0.2, k: 1.2 });
  }
}

// ======================================================================================================
// ROTFLY — a giant carrion fly (one member of a FlySwarm). Model: thorax at the origin, head toward -Z,
// the bloated abdomen behind, ~1.1 m long before `size`.
// ======================================================================================================
const FLY = { windup: 0.6, lock: 0.2, dive: 17, maxSpeed: 9.5, spitWindup: 0.5 };
let flyGeo = null;
export function flyGeometry() {
  if (flyGeo) return flyGeo;
  const thorax = gnarl(new THREE.SphereGeometry(1, 14, 10).scale(0.3, 0.27, 0.34), 0.03, 2, 4);
  paint(thorax, (x, y, z, c) => {
    const n = noise3(x * 14, y * 14, z * 14, 1);
    mix3(c, [0.05, 0.07, 0.04], [0.2, 0.26, 0.1], clamp(0.4 + n * 0.4, 0, 1));
    if (Math.abs(x) < 0.05 && y > 0.1) c.setRGB(0.28, 0.24, 0.12); // a pale stripe down the back
  });
  const abdomen = gnarl(new THREE.SphereGeometry(1, 18, 12).scale(0.34, 0.29, 0.52).translate(0, -0.03, 0.62), 0.025, 4, 5);
  paint(abdomen, (x, y, z, c) => {
    const band = 0.5 + 0.5 * Math.sin(z * 21);
    mix3(c, [0.04, 0.08, 0.035], [0.25, 0.36, 0.09], band * 0.8); // bottle-fly bronze-green bands
    if (noise3(x * 7, y * 7, z * 7, 6) > 0.95) c.setRGB(0.55, 0.48, 0.24); // rot blotches
    if (y < -0.15) c.multiplyScalar(0.55);
  });
  const head = paint(new THREE.SphereGeometry(1, 10, 8).scale(0.21, 0.19, 0.15).translate(0, 0.02, -0.36), (x, y, z, c) => c.setRGB(0.12, 0.1, 0.06));
  const prob = paint(along(new THREE.CylinderGeometry(0.022, 0.05, 0.3, 6).translate(0, 0.15, 0), _w.set(0, -1, -0.5), [0, -0.1, -0.42]), (x, y, z, c) => c.setRGB(0.2, 0.12, 0.08));
  const pad = paint(new THREE.SphereGeometry(0.06, 6, 4).scale(1.4, 0.6, 1).translate(0, -0.37, -0.53), (x, y, z, c) => c.setRGB(0.35, 0.2, 0.12));
  const legs = [];
  for (const s of [-1, 1]) {
    for (const z of [-0.16, 0.02, 0.2]) {
      const hip = new THREE.Vector3(s * 0.16, -0.16, z), knee = hip.clone().add(new THREE.Vector3(s * 0.28, 0.06, z * 0.6)), foot = knee.clone().add(new THREE.Vector3(s * 0.12, -0.42, 0.1 + z * 0.3));
      for (const [a, b, r] of [[hip, knee, 0.026], [knee, foot, 0.018]]) {
        const d = _v.subVectors(b, a), len = d.length();
        legs.push(paint(along(new THREE.CylinderGeometry(r * 0.7, r, len, 5).translate(0, len / 2, 0), d, [a.x, a.y, a.z]), (x, y, z2, c) => c.setRGB(0.05, 0.05, 0.04)));
      }
    }
  }
  const eyes = [-1, 1].map((s) => new THREE.IcosahedronGeometry(1, 2).scale(0.15, 0.17, 0.15).translate(s * 0.13, 0.05, -0.39));
  const spots = [[0.12, 0.42], [-0.12, 0.6], [0.1, 0.8], [-0.08, 0.95]].map(([x, z]) => new THREE.SphereGeometry(0.045, 6, 4).translate(x, 0.22 - (z - 0.62) ** 2 * 0.4, z));
  const wing = new THREE.PlaneGeometry(1, 0.38).translate(0.55, 0, 0).rotateX(-Math.PI / 2).rotateY(-0.3);
  flyGeo = { body: merge([thorax, abdomen, head, prob, pad, ...legs]), glow: merge([...eyes, ...spots]), wing: shared(wing), hit: shared(new THREE.SphereGeometry(1, 8, 6)) };
  return flyGeo;
}
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });

export class Rotfly extends Creature {
  constructor(world, swarm, { pos, color = GREEN, shields = null, hp = 1, aggro = true, size = 1 }) {
    super(world, { pos, color, shields, shieldHp: 2, hp, range: swarm?.range ?? 28, aggro });
    this.swarm = swarm;
    this.S = size;
    this.sightEvery = 0.4;
    this.vel = new THREE.Vector3(rnd(-2, 2), rnd(1, 3), rnd(-2, 2));
    this.goal = this.pos.clone();
    this.goalT = 0;
    this.state = 'wander';
    this.timer = 0;
    this.diveIn = rnd(2, 4.5);
    this.spitIn = rnd(3, 6);
    this.stickCool = 0;
    this.diveDir = new THREE.Vector3();
    this.flap = Math.random() * 10;
    this.yaw = Math.random() * 6.28;
    this.bank = 0;
    this.pitch = 0;
    this.stuckQuat = new THREE.Quaternion();
    this.seekPatch = null;
    this.stuckPatch = null;
    const G = flyGeometry();
    const body = (this.body = new THREE.Group());
    body.add(new THREE.Mesh(G.body, organic('chitin', color)), new THREE.Mesh(G.glow, this.glow));
    this.wings = [-1, 1].map((s) => {
      const p = new THREE.Group();
      p.position.set(s * 0.09, 0.22, -0.03);
      const w = new THREE.Mesh(G.wing, wingMaterial());
      w.scale.x = s;
      w.raycast = () => {};
      w.renderOrder = 3;
      p.add(w);
      body.add(p);
      return p;
    });
    const hb = new THREE.Mesh(G.hit, HIDDEN); // a forgiving hit ball
    hb.scale.set(0.5, 0.42, 0.75);
    hb.position.z = 0.2;
    body.add(hb);
    this.group.add(body);
    this.group.scale.setScalar(size);
    this.beam = new Beam(world.scene, DANGER);
    this.register();
  }

  shieldView() {
    return { parent: this.body, center: [0, 0, 0.2], size: 0.75 };
  }

  // airborne (the green globs' flak fuse airbursts beside it: weapons/globs.js), unless it's stuck in goo
  get flier() {
    return this.state !== 'stuck' && !this.dead;
  }

  get flakPad() {
    return 0.45 * this.S;
  }

  // shots glance off a fly stuck in goo (it's a platform: you can't pop it by accident)
  onHit(color, hit) {
    if (this.state === 'stuck') {
      this.immuneFlash = 0.6;
      return 'immune';
    }
    return super.onHit(color, hit);
  }

  update(dt, player) {
    if (!this.tick(dt, player)) return;
    const S = this.swarm;
    this.timer -= dt;
    this.goalT -= dt;
    this.stickCool -= dt;
    this.springs(dt);
    const target = this.aimPoint(player, _eye);
    const st = this.state;
    let accel = 18, top = FLY.maxSpeed, drag = 1.6;
    if ((st === 'wander' || st === 'circle') && this.aggro !== (st === 'circle') && S.aggro) this.state = this.aggro ? 'circle' : 'wander';
    switch (this.state) {
      case 'wander':
        if (this.goalT <= 0) {
          this.goalT = rnd(0.5, 1.4);
          this.goal.copy(S.home).add(_v.set(rnd(-1, 1), rnd(0.2, 1), rnd(-1, 1)).multiplyScalar(S.leash * 0.45)).setY(S.home.y + rnd(1.5, 5));
        }
        top = 5;
        accel = 12;
        break;
      case 'circle':
        // darting about you: a new spot every fraction of a second, never right on top of you
        if (this.goalT <= 0) {
          this.goalT = rnd(0.3, 0.85);
          const a = Math.random() * Math.PI * 2, r = rnd(4, 8.5);
          this.goal.set(player.pos.x + Math.cos(a) * r, player.pos.y + rnd(1.4, 4.2), player.pos.z + Math.sin(a) * r);
        }
        accel = 26;
        if (this.ready) {
          this.diveIn -= dt;
          if (S.spit) this.spitIn -= dt;
        }
        if (this.diveIn <= 0 && this.sees && this.dist < 22 && S.claimDive(this)) {
          if (director.request(this, FLY.windup + 0.9)) {
            this.state = 'windup';
            this.timer = FLY.windup;
            csfx('fly_dive', this.pos, 1, rnd(0.95, 1.1), 0, GRUNT_FLOOR);
          } else {
            S.releaseDive(this);
            this.diveIn = rnd(0.5, 1);
          }
        } else if (this.spitIn <= 0 && this.sees && this.dist < 20) {
          if (director.request(this, FLY.spitWindup + 0.4)) {
            this.state = 'spitwind';
            this.timer = FLY.spitWindup;
          } else this.spitIn = rnd(0.6, 1.2);
        }
        break;
      case 'windup': {
        // hovering, buzzing up, a danger streak at you; the aim locks for the last FLY.lock s
        this.vel.multiplyScalar(Math.exp(-7 * dt));
        accel = 0;
        const locked = this.timer <= FLY.lock;
        if (!locked) this.diveDir.subVectors(target, this.pos).normalize();
        const k = 1 - this.timer / FLY.windup;
        const len = Math.max(0.5, Math.min(this.dist - 1.4, locked ? 12 : 2 + k * 6));
        this.beam.set(this.pos, _v.copy(this.pos).addScaledVector(this.diveDir, len), locked ? 0.05 : 0.035 + 0.03 * k, locked ? 0.9 : Math.sin(this.t * 50) > 0 ? 0.75 : 0.3, locked ? 0xffb090 : DANGER);
        if (this.timer <= 0) {
          this.state = 'dive';
          this.vel.copy(this.diveDir).multiplyScalar(FLY.dive * this.rage.shot);
          this.travel = 0;
          this.maxTravel = this.dist + 6;
          this.beam.hide();
        }
        break;
      }
      case 'dive':
        accel = 0;
        drag = 0;
        top = 99;
        this.travel += this.vel.length() * dt;
        if (Math.random() < dt * 30) this.world.fx.burst(this.pos, ICHOR, { count: 1, speed: 1, life: 0.3, size: 0.12, gravity: 4 });
        if (this.travel > this.maxTravel) this.endDive();
        break;
      case 'dazed':
        // bounced off a wall: tumbling, buzzing angrily, sinking a little (an easy shot)
        accel = 0;
        drag = 2.5;
        this.vel.y -= 4 * dt;
        if (this.timer <= 0) this.state = 'circle';
        break;
      case 'spitwind':
        this.vel.multiplyScalar(Math.exp(-6 * dt));
        accel = 0;
        if (this.timer <= 0) {
          const from = _a.copy(this.pos).addScaledVector(_v.set(-Math.sin(this.yaw), -0.3, -Math.cos(this.yaw)), 0.5 * this.S);
          const to = director.aim(this, from, target);
          const vel = _b.subVectors(to, from).normalize().multiplyScalar(15 * this.rage.shot);
          vel.y += 1.5;
          new Glob(this.world, from, vel, this.color, { radius: 0.17, gravity: 5, life: 3, cause: 'acid spit' });
          csfx('fly_spit', from, 1, rnd(1, 1.15));
          this.vel.addScaledVector(vel, -0.15);
          this.state = 'circle';
          this.spitIn = rnd(4, 7) * this.rage.cool;
          director.release(this);
        }
        break;
      case 'seek': {
        // off to the goo: an approach point out from the surface, then straight in
        const P = this.seekPatch;
        if (!P || P.life <= 0) {
          this.seekPatch = null;
          this.state = this.aggro ? 'circle' : 'wander';
          break;
        }
        const stuckAt = this.stuckPoint(P, _c);
        const appr = _d.copy(stuckAt).addScaledVector(P.normal, 2.2);
        const near = this.pos.distanceTo(appr) < 1.2 || this.seekIn;
        if (near) this.seekIn = true;
        this.goal.copy(this.seekIn ? stuckAt : appr);
        accel = 30;
        top = this.seekIn ? 5 : 11;
        if (this.seekIn && this.pos.distanceTo(stuckAt) < 0.35) this.stick(P);
        break;
      }
      case 'stuck':
        this.stuckUpdate(dt);
        break;
      case 'free':
        accel = 0;
        if (this.timer <= 0) this.state = this.aggro ? 'circle' : 'wander';
        break;
    }
    if (this.state === 'stuck' || this.gone) {
      this.pose(dt, player);
      return;
    }
    // steer toward the goal, keep apart from the rest of the swarm, never bump into you while circling
    if (accel > 0) {
      _v.subVectors(this.goal, this.pos);
      const d = _v.length();
      if (d > 0.05) this.vel.addScaledVector(_v.divideScalar(d), accel * dt * Math.min(1, d));
      if (this.state === 'circle' || this.state === 'wander') {
        for (const o of S.members) {
          if (o === this || o.dead || o.state === 'stuck') continue;
          _w.subVectors(this.pos, o.pos);
          const d2 = _w.lengthSq();
          if (d2 < 2.5 && d2 > 1e-4) this.vel.addScaledVector(_w, (5 / d2) * dt);
        }
        _w.subVectors(this.pos, target);
        const near = _w.length();
        if (near < 2.6 && this.state === 'circle') this.vel.addScaledVector(_w.divideScalar(Math.max(near, 0.1)), (2.6 - near) * 30 * dt);
        // insect jitter
        this.vel.x += rnd(-1, 1) * 22 * dt;
        this.vel.y += rnd(-1, 1) * 14 * dt;
        this.vel.z += rnd(-1, 1) * 22 * dt;
      }
    }
    if (drag) this.vel.multiplyScalar(Math.exp(-drag * dt));
    if (this.vel.length() > top) this.vel.setLength(top);
    _v.copy(this.vel).multiplyScalar(dt);
    const blocked = moveSafe(this.world, this.pos, _v, 0.32 * this.S);
    if (blocked.any) {
      if (this.state === 'dive') return this.wallHit(player);
      for (const k of ['x', 'y', 'z']) if (blocked[k]) this.vel[k] *= -0.5;
    }
    // a diving fly that reaches you
    if (this.state === 'dive' && !player.dead && touchesPlayer(player, this.pos, 0.55 * this.S)) {
      player.damage(1, 'scarab');
      this.vel.multiplyScalar(-0.3);
      this.endDive();
      this.state = 'dazed';
      this.timer = 0.8;
    }
    this.pose(dt, player);
  }

  endDive() {
    this.state = 'circle';
    this.diveIn = rnd(2.5, 5) * this.rage.cool;
    this.swarm.releaseDive(this);
    director.release(this);
    this.beam.hide();
  }

  wallHit() {
    this.endDive();
    this.state = 'dazed';
    this.timer = 1.1;
    this.vel.multiplyScalar(-0.4);
    splat(this.world, this.pos, null, 0.6);
    csfx('fly_hit', this.pos, 1, 0.8);
    this.pose(0, null);
  }

  // where its body sits stuck in patch P: out from the surface (head first into a wall, belly down on a floor)
  stuckPoint(P, out) {
    const n = P.normal, i = Math.max(0, P.flies.indexOf(this)), k = P.flies.length > 1 ? i - (P.flies.length - 1) / 2 : 0;
    out.copy(P.pos);
    if (k) {
      _w.crossVectors(n, Math.abs(n.y) > 0.9 ? Z : Y).normalize();
      out.addScaledVector(_w, k * 1.15 * this.S);
    }
    return out.addScaledVector(n, (Math.abs(n.y) < 0.5 ? 0.52 : 0.3) * this.S);
  }

  // ---- goo ----
  seek(P) {
    if (this.state === 'windup' || this.state === 'dive') this.endDive();
    director.release(this);
    this.state = 'seek';
    this.seekPatch = P;
    this.seekIn = false;
    P.claim.push(this);
  }

  // stick in goo patch P right now (fly.stickAt(pos, normal) makes a patch and sticks there)
  stickAt(pos, normal = [0, 1, 0]) {
    const P = onGooPatch(this.world, pos, normal);
    this.stick(P, true);
    return P;
  }

  stick(P, snap = false) {
    if (this.state === 'windup' || this.state === 'dive') this.endDive();
    this.state = 'stuck';
    this.seekPatch = null;
    this.stuckPatch = P;
    if (!P.flies.includes(this)) P.flies.push(this);
    this.timer = this.swarm.stuckTime;
    this.stuckTime = this.timer;
    this.vel.set(0, 0, 0);
    this.stuckPoint(P, this.pos);
    // facing: head into a wall (body level, sticking straight out: a ledge), or belly down on a floor
    const n = P.normal;
    if (Math.abs(n.y) < 0.5) {
      const z = _a.copy(n).setY(0).normalize(), x = _b.crossVectors(Y, z).normalize();
      _m.makeBasis(x, Y, z);
    } else {
      const up = _a.copy(n), f = _b.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
      const x = _c.crossVectors(up, f.negate()).normalize();
      _m.makeBasis(x, up, _d.crossVectors(x, up).normalize());
    }
    this.stuckQuat.setFromRotationMatrix(_m);
    // the solid: a box round the stuck body (top flush with its back)
    const S = this.S, half = Math.abs(n.y) < 0.5 ? [0.5, 0.3, 0.62] : [0.6, 0.3, 0.6];
    const cen = _c.copy(this.pos);
    if (Math.abs(n.y) < 0.5) cen.addScaledVector(n, 0.3 * S);
    const hx = Math.abs(n.x) * half[2] + Math.abs(n.z) * half[0], hz = Math.abs(n.z) * half[2] + Math.abs(n.x) * half[0];
    this.solid ??= this.world.addSolid(new THREE.Vector3(), new THREE.Vector3(), { entity: this, creature: true, kind: 'moss' });
    this.solid.min.set(cen.x - hx * S, cen.y - half[1] * S, cen.z - hz * S);
    this.solid.max.set(cen.x + hx * S, cen.y + half[1] * S, cen.z + hz * S);
    this.solid.enabled = true;
    const fx = this.world.fx;
    fx.burst(P.pos, GOO_HEX, { count: snap ? 6 : 16, speed: 3, life: 0.5, size: 0.14, gravity: 10 });
    if (!snap) {
      csfx('goo_squelch', this.pos, 1, rnd(0.9, 1.1));
      csfx('goo_stuck_buzz', this.pos, 1, rnd(0.95, 1.05));
    }
    this.pose(0, null);
  }

  stuckUpdate(dt) {
    const end = this.timer < 1.5; // the last stretch: it strains harder (get off!)
    if (Math.random() < dt * (end ? 2.5 : 0.8)) csfx('goo_stuck_buzz', this.pos, end ? 1 : 0.7, end ? rnd(1.15, 1.3) : rnd(0.9, 1.05));
    if (Math.random() < dt * (end ? 10 : 3)) this.world.fx.burst(this.stuckPatch.pos, GOO_HEX, { count: 2, speed: 1.5, life: 0.5, size: 0.1, gravity: 8 });
    if (this.timer > 0) return;
    this.solid.enabled = false;
    const P = this.stuckPatch;
    this.stuckPatch = null;
    if (this.swarm.stuckEnd === 'die') return this.damage({ point: this.pos.clone(), dir: P.normal.clone().negate() }, this.hp);
    // tears free: pulls out along the normal, trailing goo
    this.state = 'free';
    this.timer = 0.7;
    this.stickCool = 5;
    this.vel.copy(P.normal).multiplyScalar(5).add(_v.set(0, 2, 0));
    this.world.fx.burst(this.pos, GOO_HEX, { count: 20, speed: 4, life: 0.6, size: 0.14, gravity: 10 });
    csfx('goo_squelch', this.pos, 1, 1.3);
    if (!P.permanent) {
      P.life = Math.min(P.life, 1.5); // (the goo is spent)
      if (P.src && P.src.life !== Infinity) P.src.life = Math.min(P.src.life, 1.5);
    }
  }

  // ---- look ----
  pose(dt, player) {
    const st = this.state;
    this.group.position.copy(this.pos);
    let flapRate = 55, amp = 0.75;
    if (st === 'stuck') {
      const k = this.timer < 1.5 ? 1 : 0.4;
      this.group.quaternion.copy(this.stuckQuat);
      this.body.position.set((Math.random() - 0.5) * 0.05 * k, (Math.random() - 0.5) * 0.04 * k, (Math.random() - 0.5) * 0.05 * k);
      this.body.rotation.set(0, 0, Math.sin(this.t * 31) * 0.05 * k);
      flapRate = 80;
      amp = 0.5 + 0.4 * k;
    } else {
      // face where it flies (at you while winding up / spitting), bank into turns
      let fx = this.vel.x, fz = this.vel.z;
      if ((st === 'windup' || st === 'spitwind') && player) {
        fx = player.pos.x - this.pos.x;
        fz = player.pos.z - this.pos.z;
      }
      if (fx * fx + fz * fz > 0.04) {
        const want = Math.atan2(-fx, -fz);
        let dy = want - this.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.yaw += dy * Math.min(1, dt * 9);
        this.bank += (clamp(-dy * 1.2, -0.7, 0.7) - this.bank) * Math.min(1, dt * 6);
      }
      const pitchWant = st === 'windup' ? -0.35 : st === 'dive' ? 0.4 : st === 'dazed' ? Math.sin(this.t * 13) * 0.8 : clamp(-this.vel.y * 0.06, -0.4, 0.4) + 0.12;
      this.pitch += (pitchWant - this.pitch) * Math.min(1, dt * 6);
      this.group.rotation.set(this.pitch, this.yaw, this.bank + (st === 'dazed' ? this.t * 9 : 0), 'YXZ');
      this.body.position.set(0, Math.sin(this.t * 7) * 0.04, 0);
      this.body.rotation.set(0, 0, 0);
      if (st === 'windup') {
        this.body.position.x += (Math.random() - 0.5) * 0.05;
        flapRate = 75;
      }
    }
    this.flap += dt * flapRate;
    const sq = 1 + this.squash * 0.6;
    this.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      this.wings[i].rotation.set(0, s * 0.1, s * (0.2 + Math.sin(this.flap + i * 0.3) * amp));
    }
    if (st === 'windup' && Math.sin(this.t * 40) > 0) this.glow.color.set(DANGER).multiplyScalar(2.4);
    else this.glowFlash(1.05);
  }

  onDamage(hit, dir) {
    this.vel.addScaledVector(dir, 6);
    csfx('fly_hit', this.pos, 1, rnd(0.9, 1.2));
  }

  die(hit, dir) {
    if (this.gone) return;
    this.dead = true;
    if (this.state === 'windup' || this.state === 'dive') this.endDive();
    if (this.solid) this.solid.enabled = false;
    gooPop(this.world, this.pos, this.color, 0.45 * this.S);
    edeath('death_rotfly', this.pos, 1, rnd(0.9, 1.15));
    csfx('goo_squelch', this.pos, 0.8, 1.2);
    this.group.updateMatrixWorld(true);
    new Debris(this.world, [this.body], { from: this.pos, speed: 4 });
    this.onDeath?.(this);
    this.remove();
  }

  cleanup() {
    this.beam.dispose();
    this.swarm?.releaseDive(this);
    if (this.solid) {
      const i = this.world.solids.indexOf(this.solid);
      if (i >= 0) this.world.solids.splice(i, 1);
      this.solid = null;
    }
  }
}

// ======================================================================================================
// FLY SWARM — keeps `count` rotflies alive round a hive, shares one buzz, hands out dives, and sends free
// flies to fresh goo (see the top of the file for the options)
// ======================================================================================================
let hiveGeo = null;
function hiveGeometry() {
  if (hiveGeo) return hiveGeo;
  const pod = gnarl(new THREE.SphereGeometry(1, 20, 14).scale(1, 1.25, 1), 0.2, 9, 1.8);
  paint(pod, (x, y, z, c) => {
    const n = noise3(x * 4, y * 4, z * 4, 2);
    mix3(c, [0.22, 0.1, 0.12], [0.42, 0.34, 0.12], clamp(0.5 + n * 0.5, 0, 1));
    if (n > 1.05) c.setRGB(0.75, 0.68, 0.3); // pus-yellow blisters
  });
  const holes = [];
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, y = 0.2 + (i % 3) * 0.3;
    const r = Math.sqrt(Math.max(0.05, 1 - (y / 1.25) ** 2));
    holes.push(paint(new THREE.SphereGeometry(0.16, 8, 6).scale(1, 1, 0.4).lookAt(new THREE.Vector3(Math.cos(a), 0, Math.sin(a))).translate(Math.cos(a) * r * 0.97, y, Math.sin(a) * r * 0.97), (x, yy, z, c) => c.setRGB(0.02, 0.01, 0.01)));
  }
  const stalks = [];
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + 0.3;
    stalks.push(paint(along(new THREE.CylinderGeometry(0.06, 0.16, 1.4, 5).translate(0, 0.7, 0), _w.set(Math.cos(a), -0.6, Math.sin(a)), [Math.cos(a) * 0.6, -0.7, Math.sin(a) * 0.6]), (x, y, z, c) => c.setRGB(0.2, 0.12, 0.08)));
  }
  hiveGeo = { pod: merge([pod]), holes: merge([...holes, ...stalks]) };
  return hiveGeo;
}

export class FlySwarm {
  constructor(world, opts) {
    const { pos, count = 5, color = GREEN, colors = null, shields = null, hp = 1, aggro = true, range = 26, leash = 18, attract = 16, perPatch = 1, stuckTime = 7, stuckEnd = 'free', respawn = 6,
      hive = true, divers = 1, spit = true, size = 1, onDeath = null } = opts;
    this.world = world;
    this.game = world.game;
    this.spawnOpts = opts;
    this.critter = true;
    this.verdantCreature = true; // (creatureKit's respawn reset)
    this.home = vec(pos);
    this.count = count;
    this.colors = colors || (Array.isArray(color) ? color : [color]);
    this.color = this.colors[0];
    this.shields = shields;
    this.hp = hp;
    this.aggro = aggro;
    this.range = range;
    this.leash = leash;
    this.attract = attract;
    this.perPatch = perPatch;
    this.stuckTime = stuckTime;
    this.stuckEnd = stuckEnd;
    this.respawn = respawn;
    this.divers = divers;
    this.spit = spit;
    this.size = size;
    this.onDeath = onDeath;
    this.diving = new Set();
    this.members = [];
    this.timers = [];
    this.dead = false;
    this.dist = Infinity;
    this.k = 0;
    this.scanT = 0;
    this.t = Math.random() * 10;
    this.group = new THREE.Group();
    this.group.position.copy(this.home);
    if (hive) {
      const G = hiveGeometry();
      this.hiveMesh = new THREE.Group();
      this.hiveMesh.add(new THREE.Mesh(G.pod, organic('hive', this.color)), new THREE.Mesh(G.holes, organic('bark', this.color)));
      this.hiveMesh.position.y = 1.1;
      this.group.add(this.hiveMesh);
    }
    world.scene.add(this.group);
    this.field = gooField(world);
    world.add(this);
    for (let i = 0; i < count; i++) this.spawnFly(true);
    this.hum = loopFor('fly_buzz', 'swarm_buzz', { rate: 0.7 });
  }

  get alive() {
    return this.members.filter((m) => !m.dead);
  }

  spawnFly(initial = false) {
    const i = this.members.length + this.timers.length;
    const p = this.hiveMesh ? _v.copy(this.home).add(_w.set(rnd(-0.6, 0.6), 2.5, rnd(-0.6, 0.6))) : _v.copy(this.home).add(_w.set(rnd(-1, 1) * 2, rnd(0, 2), rnd(-1, 1) * 2));
    const f = new Rotfly(this.world, this, { pos: p.toArray(), color: this.colors[i % this.colors.length], shields: this.shields, hp: this.hp, aggro: false, size: this.size });
    f.diveIn = rnd(1.5, 3) + i * 0.6;
    if (!initial) {
      f.vel.set(rnd(-2, 2), 5, rnd(-2, 2));
      this.world.fx.burst(p, 0x8a6a3a, { count: 8, speed: 2, life: 0.5, size: 0.2, gravity: 4, mode: 'puff' });
    }
    if (this.carrier) f.carried = true;
    this.members.push(f);
    return f;
  }

  // at most `divers` at once, and never two dives within 0.8 s
  claimDive(m) {
    if (this.diving.size >= this.divers || this.world.time - (this.lastDive ?? -9) < 0.8) return false;
    this.diving.add(m);
    this.lastDive = this.world.time;
    return true;
  }

  releaseDive(m) {
    this.diving.delete(m);
  }

  // goo here (a patch, as if the gun had splattered it): flies come to it
  lure(pos, normal = [0, 1, 0], opts = {}) {
    return onGooPatch(this.world, pos, normal, opts);
  }

  // the nearest free fly sticks at pos right now (it snaps there; null if every fly is busy)
  stickAt(pos, normal = [0, 1, 0]) {
    const p = vec(pos);
    let best = null, bd = Infinity;
    for (const m of this.members) {
      if (m.dead || m.state === 'stuck') continue;
      const d = m.pos.distanceTo(p);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best ? (best.stickAt(p, normal), best) : null;
  }

  update(dt, player) {
    this.t += dt;
    SHADER_TIME.value = this.world.time;
    for (let i = this.members.length - 1; i >= 0; i--) if (this.members[i].gone) this.members.splice(i, 1);
    // replacements crawl out of the hive
    const missing = this.count - this.members.length - this.timers.length;
    if (this.respawn > 0) for (let i = 0; i < missing; i++) this.timers.push(this.respawn);
    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i] -= dt;
      if (this.timers[i] <= 0 && this.home.distanceTo(player.pos) < 90) {
        this.timers.splice(i, 1);
        this.spawnFly();
      }
    }
    let near = this.home.distanceTo(player.pos), n = 0, stuck = 0;
    for (const m of this.members) {
      if (m.dead) continue;
      n++;
      if (m.state === 'stuck') stuck++;
      near = Math.min(near, m.dist);
    }
    this.dist = near;
    if (!n && !this.timers.length && this.respawn <= 0 && !this.dead) {
      this.dead = true;
      this.onDeath?.(this);
    }
    if (this.hiveMesh && near < 80) {
      const s = 1 + Math.sin(this.t * 1.7) * 0.04;
      this.hiveMesh.scale.set(s, 1 / s, s);
      if (Math.random() < dt * 2) this.world.fx.burst(_v.copy(this.home).setY(this.home.y + 0.4), ICHOR, { count: 1, speed: 0.5, life: 1.2, size: 0.12, gravity: 6 }); // drips
    }
    // the swarm turns on you when one of them sees you (or one was shot)
    if (this.aggro) for (const m of this.members) if (m.aggro && !m.dead) for (const o of this.members) o.aggro = true;
    if (!this.aggro) for (const m of this.members) m.aggro = false;
    // fresh goo pulls in the nearest free fly
    this.scanT -= dt;
    if (this.scanT <= 0 && n) {
      this.scanT = 0.2;
      for (const P of this.field.patches) {
        if (P.life < 2 || P.flies.length + P.claim.length >= this.perPatch) continue;
        let best = null, bd = Infinity;
        for (const m of this.members) {
          if (m.dead || m.stickCool > 0 || !['wander', 'circle', 'dazed', 'free'].includes(m.state)) continue;
          const d = m.pos.distanceTo(P.pos);
          if (d < bd) {
            bd = d;
            best = m;
          }
        }
        if (best && (bd < this.attract || P.pos.distanceTo(this.home) < this.attract)) best.seek(P);
      }
    }
    // one buzz for the pack: louder the closer the nearest, higher with more of them and when one dives
    const k = falloff(near, 3, 34);
    this.hum?.setGain(0.42 * k * k * Math.min(1, 0.35 + (n - stuck) * 0.16));
    this.hum?.setRate(0.62 + n * 0.03 + (this.diving.size ? 0.22 : 0));
  }

  // every fly back at the hive (a checkpoint respawn)
  reset() {
    for (const m of this.members) if (!m.gone) m.remove();
    this.members = [];
    this.timers = [];
    this.diving.clear();
    this.dead = false;
    for (let i = 0; i < this.count; i++) this.spawnFly(true);
  }

  despawn() {
    for (const m of this.members) if (!m.gone) m.despawn();
    this.members = [];
    this.timers = [];
    this.dead = true;
    this.world.remove(this);
    this.world.scene.remove(this.group);
    this.hum?.stop();
    this.hum = null;
  }

  materialize() {
    for (const m of this.members) m.materialize();
  }
}

// ======================================================================================================
// BORER — a giant tree worm in a hole (see the top of the file for the options). Its body is a chain of
// ribbed segments (one instanced mesh) laid along a path: down into its hole, out through it, and along a
// curve to wherever it's going; `ext` is how far along the path its head is.
// ======================================================================================================
const BORER = { seg: 0.55, rumble: 0.9, burst: 0.38, exposed: 1.6, retract: 0.75, peek: 0.5 };
let borerGeo = null;
function borerGeometry() {
  if (borerGeo) return borerGeo;
  const seg = gnarl(new THREE.SphereGeometry(1, 16, 10).scale(0.5, 0.5, 0.44), 0.025, 3, 6);
  paint(seg, (x, y, z, c) => {
    const ring = Math.abs(z) / 0.44; // the fold between segments: darker, wetter
    mix3(c, [0.82, 0.72, 0.52], [0.36, 0.24, 0.16], Math.pow(ring, 3));
    if (y > 0.3 && Math.abs(x) < 0.12) c.multiplyScalar(0.7); // a dark dorsal vessel
    if (y < -0.25) c.setRGB(0.88, 0.8, 0.62); // pale belly
    if (noise3(x * 8, y * 8, z * 8, 4) > 1.05) c.setRGB(0.5, 0.36, 0.2); // blotches
  });
  const pust = merge([new THREE.SphereGeometry(0.085, 8, 6).translate(0, 0.45, 0), new THREE.SphereGeometry(0.06, 6, 4).translate(0.22, 0.39, 0.05), new THREE.SphereGeometry(0.06, 6, 4).translate(-0.22, 0.39, -0.05)]);
  // head: a fat bulb with a ring of teeth round a round maw (facing -Z) and four hooked mandibles
  const bulb = gnarl(new THREE.SphereGeometry(1, 18, 12).scale(0.66, 0.62, 0.62), 0.04, 5, 4);
  paint(bulb, (x, y, z, c) => {
    mix3(c, [0.75, 0.6, 0.45], [0.55, 0.2, 0.16], clamp(-z / 0.62, 0, 1) ** 2);
    if (noise3(x * 9, y * 9, z * 9, 7) > 1) c.multiplyScalar(0.6);
  });
  const teeth = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    teeth.push(along(new THREE.ConeGeometry(0.045, 0.24, 4).translate(0, 0.12, 0), _w.set(-Math.cos(a), -Math.sin(a), -0.6), [Math.cos(a) * 0.32, Math.sin(a) * 0.32, -0.5]));
  }
  const throat = paint(new THREE.SphereGeometry(0.3, 12, 8).scale(1, 1, 0.5).translate(0, 0, -0.46), (x, y, z, c) => c.setRGB(0.08, 0.02, 0.02));
  const maw = new THREE.CircleGeometry(0.2, 16).rotateY(Math.PI).translate(0, 0, -0.55); // the glowing gullet (weak spot)
  const mand = gnarl(new THREE.ConeGeometry(0.15, 0.75, 6).translate(0, 0.375, 0).rotateX(-Math.PI / 2 - 0.25), 0.02, 2, 6);
  paint(mand, (x, y, z, c) => mix3(c, [0.32, 0.18, 0.1], [0.08, 0.05, 0.03], clamp(-z / 0.7, 0, 1)));
  // the hole: torn bark round a black pit, a wet rim
  const lip = gnarl(new THREE.TorusGeometry(0.95, 0.28, 8, 20).rotateX(Math.PI / 2).scale(1, 0.55, 1), 0.12, 2, 3);
  paint(lip, (x, y, z, c) => {
    const n = noise3(x * 5, y * 5, z * 5, 3);
    mix3(c, [0.12, 0.08, 0.05], [0.3, 0.2, 0.1], clamp(0.5 + n * 0.5, 0, 1));
  });
  const splinters = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7 + rnd(0, 0.3);
    splinters.push(paint(along(new THREE.ConeGeometry(0.08, rnd(0.4, 0.8), 4).translate(0, 0.25, 0), _w.set(Math.cos(a), 0.5, Math.sin(a)), [Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1]), (x, y, z, c) => c.setRGB(0.34, 0.24, 0.13)));
  }
  const pit = paint(new THREE.CircleGeometry(0.85, 18).rotateX(-Math.PI / 2).translate(0, 0.02, 0), (x, y, z, c) => c.setRGB(0, 0, 0));
  borerGeo = {
    seg: shared(seg), pust,
    bulb: merge([bulb, ...teeth, throat]), maw: shared(maw), mand: shared(mand),
    hole: merge([lip, ...splinters]), pit: merge([pit]),
  };
  return borerGeo;
}
const NO_RAY = () => {};
const leftHoles = new WeakMap(); // world -> hole key -> the burrow meshes a dead borer left
const _mat = new THREE.Matrix4();
const _sc = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

// a curve sampled into a polyline (s: metres along it). Before the start it runs straight back into the
// start hole (along -n0); past the end, into the end hole (along -n1) or straight on.
class SpinePath {
  constructor() {
    this.pts = [];
    this.cum = [];
    this.len = 0;
    this.n0 = new THREE.Vector3(0, 1, 0);
    this.n1 = null;
  }

  // a cubic Bézier from a to b with control points c1, c2
  bezier(a, c1, c2, b, n0, n1 = null, count = 28) {
    this.pts.length = 0;
    this.cum.length = 0;
    let L = 0;
    for (let i = 0; i <= count; i++) {
      const t = i / count, u = 1 - t;
      const p = new THREE.Vector3()
        .addScaledVector(a, u * u * u).addScaledVector(c1, 3 * u * u * t).addScaledVector(c2, 3 * u * t * t).addScaledVector(b, t * t * t);
      if (i) L += p.distanceTo(this.pts[i - 1]);
      this.pts.push(p);
      this.cum.push(L);
    }
    this.len = L;
    this.n0.copy(n0);
    this.n1 = n1 ? n1.clone() : null;
    return this;
  }

  at(s, out, tan) {
    const P = this.pts, C = this.cum, n = P.length;
    if (s <= 0) {
      tan.copy(this.n0);
      return out.copy(P[0]).addScaledVector(this.n0, s);
    }
    if (s >= this.len) {
      if (this.n1) tan.copy(this.n1).negate();
      else tan.subVectors(P[n - 1], P[n - 2]).normalize();
      return out.copy(P[n - 1]).addScaledVector(tan, s - this.len);
    }
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (C[mid] < s) lo = mid;
      else hi = mid;
    }
    const k = (s - C[lo]) / Math.max(1e-6, C[hi] - C[lo]);
    tan.subVectors(P[hi], P[lo]).normalize();
    return out.lerpVectors(P[lo], P[hi], k);
  }
}

export class Borer extends Creature {
  constructor(world, opts) {
    let { pos, normal = [0, 1, 0], color = GREEN, shields = null, shieldHp = 3, hp = 6, size = 1, length = 18, range = 9, mode = 'ambush', to = null, toNormal = null,
      interval = 6, holdTime = 4, arch = 2.6, stuckTime = 8, plugTime = 9, aggro = false, onDeath = null } = opts;
    super(world, { pos, color, shields, shieldHp, hp, range: range + 4, aggro, onDeath });
    this.spawnOpts = opts;
    this.critter = true;
    this.verdantCreature = true; // (creatureKit's respawn reset)
    this.S = size;
    this.mode = mode;
    this.holes = [{ pos: vec(pos), n: vec(normal, [0, 1, 0]).normalize() }];
    if (to) this.holes.push({ pos: vec(to), n: vec(toNormal || normal, [0, 1, 0]).normalize() });
    this.interval = interval;
    this.holdTime = holdTime;
    this.arch = arch;
    this.stuckTime = stuckTime;
    this.plugTime = plugTime;
    this.seg = BORER.seg * size;
    this.path = new SpinePath();
    if (mode === 'bridge' && this.holes.length > 1) {
      this.arcPath(0, 1);
      length = Math.max(length, Math.ceil((this.path.len + 1.5) / this.seg));
    }
    this.N = length;
    this.bodyLen = length * this.seg;
    this.reach = Math.min(range, this.bodyLen - 1.2);
    this.critParts = { head: 2 };
    this.headW = new THREE.Vector3();
    this.headTan = new THREE.Vector3(0, 1, 0);
    this.sway = new THREE.Vector3();
    this.lockW = new THREE.Vector3();
    this.segPos = Array.from({ length: this.N }, () => new THREE.Vector3());
    this.segR = new Float32Array(this.N);
    this.segOn = new Uint8Array(this.N);
    this.solids = [];
    // (a worm rebuilt at the same hole takes over the burrow its dead predecessor left behind)
    const key = this.holes[0].pos.toArray().map((v) => v.toFixed(2)).join(',');
    leftHoles.get(world)?.get(key)?.forEach((g) => g.removeFromParent());
    this.holeKey = key;
    this.build();
    this.register();
    this.group.userData.noCull = true; // (it reaches far out of its hole: don't let culling clip it)
    gooField(world).listeners.add(this);
    if (world.goo) this.hookGoo(world.goo);
    this.reset();
  }

  build() {
    const G = borerGeometry(), c = this.color, S = this.S;
    this.body = new THREE.InstancedMesh(G.seg, organic('grub', c), this.N);
    this.body.userData.part = 'body';
    this.body.frustumCulled = false;
    this.pusts = new THREE.InstancedMesh(G.pust, this.glow, this.N);
    this.pusts.raycast = NO_RAY;
    this.pusts.frustumCulled = false;
    this.group.add(this.body, this.pusts);
    const head = (this.head = new THREE.Group());
    const bulb = new THREE.Mesh(G.bulb, organic('grub', c));
    const maw = new THREE.Mesh(G.maw, this.glow);
    bulb.userData.part = maw.userData.part = 'head';
    head.add(bulb, maw);
    this.mands = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * 0.36, Math.sin(a) * 0.36, -0.36);
      g.rotation.z = a - Math.PI / 2;
      const m = new THREE.Mesh(G.mand, organic('bark', c));
      m.userData.part = 'head';
      g.add(m);
      head.add(g);
      this.mands.push(g);
    }
    head.scale.setScalar(S);
    this.group.add(head);
    // the hole(s)
    this.holeMeshes = this.holes.map((h) => {
      const g = new THREE.Group();
      g.position.copy(h.pos).sub(this.holes[0].pos);
      g.quaternion.setFromUnitVectors(Y, h.n);
      const lip = new THREE.Mesh(G.hole, organic('bark', c)), pit = new THREE.Mesh(G.pit, organic('bark', c));
      lip.raycast = pit.raycast = NO_RAY;
      g.add(lip, pit);
      g.scale.setScalar(S * 0.85);
      this.group.add(g);
      return g;
    });
  }

  shieldView() {
    return { parent: this.head, center: [0, 0, -0.1], size: 0.9 };
  }

  sightFrom() {
    return _s.copy(this.hole.pos).addScaledVector(this.hole.n, 0.8);
  }

  center(out) {
    return out.copy(this.headW);
  }

  get hole() {
    return this.holes[this.at ?? 0];
  }

  reset() {
    if (this.dead) return;
    director.release(this);
    this.at = 0;
    this.pos.copy(this.holes[0].pos);
    this.state = 'hidden';
    this.timer = this.mode === 'bridge' ? 2.5 : 0;
    this.ext = -0.6;
    this.extFrom = 0;
    this.extTo = 0;
    this.cool = rnd(1, 2);
    this.peekT = rnd(2, 5);
    this.plugT = 0;
    this.open = 0;
    this.hp = this.maxHp;
    this.aggro = this.spawnOpts.aggro ?? false;
    this.colorShield?.restore();
    this.sway.set(0, 0, 0);
    this.setSolids(false);
    this.straightPath(1.5);
    this.place(0);
  }

  // ---------------------------------------------------------------- paths
  straightPath(len) {
    const h = this.hole;
    const a = h.pos, b = _a.copy(a).addScaledVector(h.n, len);
    return this.path.bezier(a, _b.copy(a).addScaledVector(h.n, len * 0.33), _c.copy(a).addScaledVector(h.n, len * 0.66), b, h.n);
  }

  // out of the hole along its normal, then curving onto the target point T
  lungePath(T) {
    const h = this.hole;
    _d.subVectors(T, h.pos);
    const d = _d.length();
    if (d > this.reach) T = _d.multiplyScalar(this.reach / d).add(h.pos);
    const c1 = _a.copy(h.pos).addScaledVector(h.n, Math.min(3, Math.max(1.2, d * 0.5)));
    const c2 = _b.lerpVectors(T, h.pos, 0.25).addScaledVector(Y, 1.2);
    this.path.bezier(h.pos, c1, c2, T, h.n);
    // a path longer than the body would pull its tail out of the hole: shorten it
    if (this.path.len > this.bodyLen - 0.8) {
      const T2 = _c.lerpVectors(h.pos, T, (this.bodyLen - 0.8) / this.path.len);
      this.path.bezier(h.pos, c1.lerpVectors(h.pos, c1, 0.8), c2, T2, h.n);
    }
    return this.path;
  }

  // the bridge: out of hole i, an arch, into hole j
  arcPath(i, j) {
    const A = this.holes[i], B = this.holes[j];
    const span = A.pos.distanceTo(B.pos);
    const h = this.arch * this.S + span * 0.15;
    // out along each hole's normal, and always humped upward (a wall-to-wall bridge still arches)
    _a.copy(A.pos).addScaledVector(A.n, h * 0.7).addScaledVector(Y, h * 0.5);
    _b.copy(B.pos).addScaledVector(B.n, h * 0.7).addScaledVector(Y, h * 0.5);
    return this.path.bezier(A.pos, _a, _b, B.pos, A.n, B.n, 36);
  }

  // ---------------------------------------------------------------- per frame
  update(dt, player) {
    SHADER_TIME.value = this.world.time;
    if (this.state === 'dying') {
      this.t += dt;
      this.timer -= dt;
      return this.dying(dt);
    }
    if (!this.tick(dt, player)) return;
    this.timer -= dt;
    this.cool -= dt;
    this.peekT -= dt;
    this.springs(dt);
    if (this.plugT > 0) {
      this.plugT -= dt;
      if (Math.random() < dt * 1.5) {
        csfx('worm_rumble', this.hole.pos, 0.6, 1.3);
        this.world.fx.burst(this.hole.pos, GOO_HEX, { count: 4, speed: 2, life: 0.5, size: 0.12, gravity: 8 });
      }
    }
    this.aimPoint(player, _eye);
    if (this.mode === 'bridge') this.bridgeAI(dt, player);
    else this.ambushAI(dt, player);
    this.place(dt);
    this.glowFlash(this.state === 'rumble' && Math.sin(this.t * 36) > 0 ? 3.2 : 2.2);
  }

  ambushAI(dt, player) {
    const h = this.hole;
    switch (this.state) {
      case 'hidden':
        this.ext = -0.6;
        if (this.plugT > 0) break;
        if (this.aggro && this.sees && this.cool <= 0 && h.pos.distanceTo(_eye) < this.reach + 1.5) {
          if (director.request(this, BORER.rumble + BORER.burst + 0.4)) {
            this.state = 'rumble';
            this.timer = BORER.rumble;
            csfx('worm_rumble', h.pos, 1, 1, 0, GRUNT_FLOOR);
          } else this.cool = rnd(0.3, 0.6);
        } else if (this.peekT <= 0 && h.pos.distanceTo(_eye) < this.range * 1.8) {
          this.state = 'peek';
          this.timer = BORER.peek * 3;
          this.straightPath(2.4 * this.S);
          csfx('worm_slither', h.pos, 0.8, 1.1);
        }
        break;
      case 'peek': {
        const k = 1 - this.timer / (BORER.peek * 3);
        this.ext = (k < 0.33 ? easeOut(k / 0.33) : k > 0.66 ? 1 - ease((k - 0.66) / 0.34) : 1) * 1.7 * this.S - 0.4;
        this.open = 0.3 + 0.3 * Math.sin(this.t * 6);
        if (this.timer <= 0) {
          this.state = 'hidden';
          this.peekT = rnd(4, 8);
        }
        break;
      }
      case 'rumble': {
        // the hole shakes and spits bark; it fixes on where you are
        if (Math.random() < dt * 22) this.world.fx.burst(_v.copy(h.pos).addScaledVector(h.n, 0.3), Math.random() < 0.5 ? 0x6a4a2a : 0x3a2a18, { count: 2, speed: 4, life: 0.6, size: 0.18, gravity: 12, dir: h.n });
        if (this.timer > 0.25) this.lockW.copy(_eye);
        this.ext = -0.6 + Math.random() * 0.25;
        if (this.timer <= 0) {
          if (this.plugT > 0) {
            this.state = 'hidden';
            director.release(this);
            break;
          }
          this.lungePath(director.aim(this, h.pos, this.lockW));
          this.state = 'burst';
          this.timer = BORER.burst / this.rage.shot;
          this.extFrom = -0.6;
          this.extTo = this.path.len;
          csfx('worm_burst', h.pos, 1, rnd(0.95, 1.05));
          csfx('worm_screech', h.pos, 1, rnd(0.95, 1.1), 0.1, GRUNT_FLOOR);
          this.burstFx(h);
        }
        break;
      }
      case 'burst': {
        const k = 1 - Math.max(0, this.timer) / (BORER.burst / this.rage.shot);
        this.ext = this.extFrom + (this.extTo - this.extFrom) * easeOut(k);
        this.open = k < 0.8 ? 1 : 1 - (k - 0.8) * 5;
        if (this.timer <= 0) {
          this.state = 'exposed';
          this.timer = BORER.exposed;
          director.release(this);
          csfx('worm_bite', this.headW, 1, rnd(0.95, 1.1));
          this.squashV -= 6;
          this.place(0);
          if (!player.dead && touchesPlayer(player, this.headW, 0.95 * this.S)) player.damage(1, 'fish');
        }
        break;
      }
      case 'exposed':
        // hanging out, swaying, mandibles working: shoot its head now
        this.ext = this.extTo;
        this.sway.set(Math.sin(this.t * 2.3) * 0.5, Math.sin(this.t * 1.7) * 0.35, Math.cos(this.t * 2.0) * 0.5).multiplyScalar(this.S);
        this.open = 0.45 + 0.4 * Math.sin(this.t * 5);
        if (this.timer <= 0) this.startRetract();
        break;
      case 'retract': {
        const k = 1 - Math.max(0, this.timer) / BORER.retract;
        this.ext = this.extFrom + (-0.6 - this.extFrom) * ease(k);
        this.sway.multiplyScalar(Math.exp(-dt * 5));
        this.open *= Math.exp(-dt * 6);
        if (this.timer <= 0) {
          this.state = 'hidden';
          this.cool = rnd(2, 3.5) * this.rage.cool;
          this.peekT = rnd(4, 7);
        }
        break;
      }
      case 'stuck':
        this.stuckAI(dt);
        break;
    }
  }

  bridgeAI(dt, player) {
    switch (this.state) {
      case 'hidden': {
        this.ext = -0.6;
        if (this.plugT > 0) break;
        const near = this.holes.some((h) => h.pos.distanceTo(player.pos) < 12);
        if (this.timer <= 0 || (near && this.timer < this.interval - 2)) {
          this.state = 'rumble';
          this.timer = 0.8;
          csfx('worm_rumble', this.hole.pos, 1, 0.9, 0, GRUNT_FLOOR);
        }
        break;
      }
      case 'rumble':
        if (Math.random() < dt * 20) this.world.fx.burst(this.hole.pos, 0x5a3c20, { count: 2, speed: 4, life: 0.6, size: 0.18, gravity: 12, dir: this.hole.n });
        this.ext = -0.6 + Math.random() * 0.2;
        if (this.timer <= 0) {
          if (this.plugT > 0) {
            this.state = 'hidden';
            break;
          }
          this.arcPath(this.at, 1 - this.at);
          this.state = 'breach';
          this.timer = 1.4;
          this.extFrom = -0.6;
          this.extTo = Math.min(this.bodyLen, (this.path.len + this.bodyLen) / 2);
          csfx('worm_burst', this.hole.pos, 1, 0.9);
          csfx('worm_screech', this.hole.pos, 0.8, 0.85, 0.15);
          this.burstFx(this.hole);
        }
        break;
      case 'breach': {
        const k = 1 - Math.max(0, this.timer) / 1.4;
        this.ext = this.extFrom + (this.extTo - this.extFrom) * easeOut(k);
        this.open = 0.8;
        if (this.timer <= 0) {
          this.state = 'hold';
          this.timer = this.holdTime;
          this.setSolids(true);
          csfx('worm_slither', this.headW, 1, 0.8);
        }
        break;
      }
      case 'hold':
        // the bridge: still, breathing; it shudders before it dives on (get across!)
        this.ext = this.extTo;
        this.open = 0.2 + 0.2 * Math.sin(this.t * 3);
        if (this.timer < 0.9) this.sway.set((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.08);
        else this.sway.set(0, 0, 0);
        if (this.timer <= 0) {
          this.state = 'dive';
          this.timer = 1.1;
          this.extFrom = this.ext;
          this.setSolids(false);
          this.sway.set(0, 0, 0);
          csfx('worm_slither', this.headW, 1, 1.2);
        }
        break;
      case 'dive': {
        const k = 1 - Math.max(0, this.timer) / 1.1;
        this.ext = this.extFrom + (this.path.len + this.bodyLen + 0.6 - this.extFrom) * ease(k);
        if (this.timer <= 0) {
          this.at = 1 - this.at;
          this.pos.copy(this.hole.pos);
          this.state = 'hidden';
          this.timer = this.interval;
          this.ext = -0.6;
          this.straightPath(1.5);
        }
        break;
      }
      case 'stuck':
        this.stuckAI(dt);
        break;
    }
  }

  burstFx(h) {
    const fx = this.world.fx, p = _v.copy(h.pos).addScaledVector(h.n, 0.3);
    fx.burst(p, 0x6a4a2a, { count: 40, speed: 9, life: 0.9, size: 0.22, gravity: 16, dir: h.n, mode: 'shard' });
    fx.burst(p, 0x4a3a22, { count: 16, speed: 3, life: 1.4, size: 0.9, gravity: 1, mode: 'puff', drag: 1.5 });
    fx.burst(p, ICHOR, { count: 18, speed: 6, life: 0.6, size: 0.16, gravity: 12, dir: h.n });
    const pl = this.game.player;
    pl.shake = Math.max(pl.shake, 0.3 * falloff(this.dist, 4, 18));
  }

  startRetract() {
    this.state = 'retract';
    this.timer = BORER.retract;
    this.extFrom = this.ext;
    csfx('worm_slither', this.headW, 0.9, 1);
  }

  // glued half-out: rigid, solid, thrashing its head; then it tears itself back in
  stuckAI() {
    this.open = 0.5 + 0.5 * Math.sin(this.t * 14);
    if (this.timer < 1.2) this.sway.set((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06);
    if (Math.random() < 0.02) csfx('worm_screech', this.headW, 0.6, rnd(1.1, 1.3));
    if (this.timer > 0) return;
    this.setSolids(false);
    this.world.fx.burst(this.headW, GOO_HEX, { count: 20, speed: 4, life: 0.6, size: 0.14, gravity: 10 });
    if (this.mode === 'bridge' && this.extTo > this.path.len * 0.5) {
      this.state = 'dive';
      this.timer = 1.1;
      this.extFrom = this.ext;
    } else this.startRetract();
  }

  glue() {
    if (['hidden', 'rumble', 'dying', 'stuck'].includes(this.state)) return;
    director.release(this);
    this.prevState = this.state;
    this.state = 'stuck';
    this.timer = this.stuckTime;
    this.extTo = this.ext;
    this.sway.set(0, 0, 0);
    this.place(0);
    this.setSolids(true);
    csfx('goo_squelch', this.headW, 1, 0.8);
    csfx('worm_screech', this.headW, 1, 1.2, 0.05, GRUNT_FLOOR);
  }

  plug() {
    if (this.state !== 'hidden' && this.state !== 'rumble') return;
    if (this.state === 'rumble') director.release(this);
    this.state = 'hidden';
    this.plugT = this.plugTime;
    csfx('goo_squelch', this.hole.pos, 1, 0.7);
  }

  // goo.js: a goo membrane over each hole (fill it while it's in: plugged till the membrane bursts), and its
  // body a stickable (gooed while it's out: glued, gobs of goo on it)
  hookGoo(sys) {
    this.gaps = this.holes.map((h, i) => {
      const n = h.n, ax = Math.abs(n.x) > 0.7 ? 'x' : Math.abs(n.z) > 0.7 ? 'z' : 'y', r = 0.95 * this.S;
      const min = h.pos.clone().subScalar(r), max = h.pos.clone().addScalar(r);
      if (ax === 'y') {
        min.y = h.pos.y - 0.32;
        max.y = h.pos.y + 0.03;
        if (n.y < 0) {
          min.y = h.pos.y - 0.03;
          max.y = h.pos.y + 0.32;
        }
      } else {
        const a = h.pos[ax], b = a + Math.sign(n[ax]) * 0.3;
        min[ax] = Math.min(a, b);
        max[ax] = Math.max(a, b);
      }
      return sys.addGap({ min, max }, { axis: ax, duration: this.plugTime, onFill: () => this.holeGoo(i, true), onClear: () => this.holeGoo(i, false) });
    });
    this.gooHandle = sys.registerStickable(this, {
      box: (out) => {
        out.makeEmpty();
        if (this.state === 'hidden' || this.state === 'rumble' || this.state === 'dying') return out;
        for (let i = 0; i < this.N; i++) if (this.segOn[i]) out.expandByPoint(_s.copy(this.segPos[i]).addScalar(0.45 * this.S)).expandByPoint(_s.copy(this.segPos[i]).subScalar(0.45 * this.S));
        return out.expandByPoint(this.headW);
      },
      freeze: false, duration: this.stuckTime, pad: 0.3,
      onStick: () => this.glue(),
    });
  }

  holeGoo(i, on) {
    if (i !== (this.at ?? 0)) return;
    if (on) {
      this.plug();
      if (this.plugT > 0) this.plugT = Infinity; // (until the membrane bursts)
    } else if (this.plugT === Infinity) this.plugT = 0;
  }

  // goo (our own goo field, without goo.js): on its hole while it's in → plugged; on its body while it's
  // out → glued
  onGoo(P) {
    if (!this.gooHandle) this.gooAt(P.pos, 0);
  }

  onGooSplash(p, r) {
    if (!this.gooHandle) this.gooAt(p, r * 0.35);
  }

  gooAt(p, r) {
    if (this.dead) return;
    const h = this.hole;
    if ((this.state === 'hidden' || this.state === 'rumble') && p.distanceTo(h.pos) < 1.5 * this.S + r) return this.plug();
    if (this.state === 'hidden' || this.state === 'rumble' || this.state === 'stuck') return;
    if (p.distanceTo(this.headW) < 1.3 * this.S + r) return this.glue();
    for (let i = 0; i < this.N; i++) if (this.segOn[i] && p.distanceTo(this.segPos[i]) < 1.0 * this.S + r) return this.glue();
  }

  onDamage(hit, dir, amount) {
    this.sway.addScaledVector(dir, 0.3 * amount);
    if (this.hp > 0) csfx('worm_pain', this.headW, 1, rnd(0.95, 1.1));
    // hurt badly while hanging out: it flinches back into its hole
    if (this.state === 'exposed' && amount > 1 && this.hp > 0) this.timer = Math.min(this.timer, 0.15);
  }

  // ---------------------------------------------------------------- the body along the path
  setSolids(on) {
    if (on && !this.solids.length) for (let i = 0; i < this.N; i++) this.solids.push(this.world.addSolid(new THREE.Vector3(), new THREE.Vector3(), { entity: this, creature: true, kind: 'moss' }));
    for (let i = 0; i < this.solids.length; i++) this.solids[i].enabled = false;
    this.solidsOn = !!on;
    if (on) this.placeSolids();
  }

  placeSolids() {
    for (let i = 0; i < this.N; i++) {
      const s = this.solids[i];
      if (!this.segOn[i]) {
        s.enabled = false;
        continue;
      }
      const p = this.segPos[i], h = Math.max(0.3, 0.44 * this.segR[i]) * this.S;
      s.min.set(p.x - h, p.y - h, p.z - h);
      s.max.set(p.x + h, p.y + h * 0.95, p.z + h);
      s.enabled = true;
    }
  }

  // segment frame: z along the body, x level, y up-ish
  frame(tan, out) {
    _z.copy(tan);
    _x.crossVectors(Math.abs(_z.y) > 0.95 ? Z : Y, _z).normalize();
    _y.crossVectors(_z, _x);
    return out.makeBasis(_x, _y, _z);
  }

  place(dt) {
    const S = this.S, base = this.holes[0].pos, t = this.t, out = this.ext;
    const visibleAny = out > -0.5;
    this.body.visible = this.pusts.visible = this.head.visible = visibleAny;
    for (let i = 0; i < this.N; i++) {
      const s = out - (i + 0.5) * this.seg;
      const inStart = s < -0.3 * S, inEnd = this.path.n1 && s > this.path.len + 0.3 * S;
      if (inStart || inEnd || !visibleAny) {
        this.segOn[i] = 0;
        _mat.makeScale(0, 0, 0);
        this.body.setMatrixAt(i, _mat);
        this.pusts.setMatrixAt(i, _mat);
        continue;
      }
      this.segOn[i] = 1;
      this.path.at(s, _v, _w);
      // sway grows toward the head; a peristaltic swell runs down the body
      const k = clamp(s / Math.max(1, out), 0, 1);
      _v.addScaledVector(this.sway, k * k);
      this.segPos[i].copy(_v);
      const r = (1 - 0.4 * Math.pow(i / this.N, 1.4)) * (1 + 0.09 * Math.sin(s * 3.2 - t * 8)) * (1 + this.squash * 0.3);
      this.segR[i] = r;
      this.frame(_w, _mat);
      _mat.scale(_sc.set(r * S, r * S, 1.05 * S));
      _mat.setPosition(_v.sub(base));
      this.body.setMatrixAt(i, _mat);
      this.pusts.setMatrixAt(i, _mat);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.pusts.instanceMatrix.needsUpdate = true;
    this.body.computeBoundingSphere();
    // the head at the front of the body, looking along it (at you while it hangs out)
    this.path.at(out, this.headW, this.headTan);
    this.headW.add(this.sway);
    if (this.state === 'exposed' || this.state === 'stuck') {
      _a.subVectors(this.game.player.pos, this.headW).setY(this.game.player.pos.y + 1.2 - this.headW.y).normalize();
      this.headTan.lerp(_a, 0.5).normalize();
    }
    this.head.position.copy(this.headW).sub(base);
    this.frame(_w.copy(this.headTan).negate(), _mat);
    this.head.quaternion.setFromRotationMatrix(_mat);
    this.head.visible = out > -0.2 * S;
    for (let i = 0; i < 4; i++) this.mands[i].rotation.x = -0.2 + this.open * 0.9;
    if (this.solidsOn) this.placeSolids();
  }

  // ---------------------------------------------------------------- death
  die(hit, dir) {
    if (this.state === 'dying') return;
    this.dead = true;
    director.release(this);
    this.setSolids(false);
    this.state = 'dying';
    this.timer = 0.9;
    this.world.removeHittable(this.group);
    edeath('death_borer', this.headW, 1, rnd(0.95, 1.05));
    splat(this.world, this.headW, dir, 2.5);
    this.onDeath?.(this);
  }

  // it writhes, then bursts along its length and the stub slumps back into the hole
  dying(dt) {
    this.open = 1;
    this.sway.set(Math.sin(this.t * 25) * 0.25, Math.sin(this.t * 19) * 0.2, Math.cos(this.t * 23) * 0.25).multiplyScalar(this.S);
    if (Math.random() < 0.5) this.world.fx.burst(this.headW, ICHOR, { count: 2, speed: 2, life: 0.6, size: 0.14, gravity: 12 });
    this.place(dt);
    if (this.timer > 0) return;
    gooPop(this.world, this.headW, this.color, 1.2 * this.S);
    for (let i = 2; i < this.N; i += 4) if (this.segOn[i]) gooPop(this.world, this.segPos[i], this.color, 0.5 * this.S);
    csfx('goo_squelch', this.headW, 1, 0.6);
    audio.sample('glob_pop', { gain: 0.7 * falloff(this.dist, 4, 40), rate: 0.55 });
    this.group.updateMatrixWorld(true);
    new Debris(this.world, [...this.mands, this.head], { from: this.headW, speed: 5 });
    this.remove();
  }

  // (the hole stays: a dead worm leaves its burrow behind)
  remove() {
    if (this.gone) return;
    for (const g of this.holeMeshes) {
      g.position.add(this.holes[0].pos);
      this.world.scene.add(g);
    }
    if (!leftHoles.has(this.world)) leftHoles.set(this.world, new Map());
    leftHoles.get(this.world).set(this.holeKey, this.holeMeshes);
    super.remove();
  }

  cleanup() {
    this.gooHandle?.remove();
    for (const g of this.gaps || []) g.remove?.();
    for (const s of this.solids) {
      const i = this.world.solids.indexOf(s);
      if (i >= 0) this.world.solids.splice(i, 1);
    }
    this.solids = [];
  }
}

// ======================================================================================================
// LEVEL KIT: const C = creatureKit(B) — one-line placement for the level modules, with the checkpoint-
// respawn reset hooked once (every living creature back to its post, fly swarms re-hatched).
// ======================================================================================================
const hooked = new WeakSet();
export function creatureKit(B) {
  const { W } = B;
  if (!hooked.has(W)) {
    hooked.add(W);
    B.onRespawn(() => {
      for (const e of [...W.entities]) if (e.verdantCreature && !e.dead) e.reset?.();
    });
  }
  return {
    snapjaw: (pos, o = {}) => new Snapjaw(W, { pos, ...o }),
    snapPad: (pos, o = {}) => new SnapPad(W, { pos, ...o }),
    rotflies: (pos, o = {}) => new FlySwarm(W, { pos, ...o }),
    borer: (pos, normal = [0, 1, 0], o = {}) => new Borer(W, { pos, normal, ...o }),
    // a goo patch placed by the level (permanent: true never dries up or gets used up)
    goo: (pos, normal = [0, 1, 0], o = {}) => onGooPatch(W, pos, normal, o),
    flyRide: (o) => new GiantFlyRide(W, o),
  };
}
