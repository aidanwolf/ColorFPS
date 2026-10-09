// THE DROWNED CISTERN — the Azure mini-boss arena: a 50×50 m chamber flooded 22 m deep under a ceiling
// slab, home of CHARYBDIS (entities/leviathan.js), which guards the AZURE ENGINE: a colossal turbine on
// the floor that churns the sea into power for the machine god (and drives the cistern's currents).
//   Entry (+z side): a doorway → an alcove with a shore ledge (checkpoint) and a small pool; dive in and
//   swim north under the lip into the chamber: bars slam shut behind you and the fight begins.
//   Air: the central shaft (open water surface, 14×14 m, where it breaches) and four lit domes in the
//   corners (7×7 m). Light shafts point the way up from anywhere in the murk.
//   Cover: four columns around the shaft (shelter from the vortex), wreck containers on the floor.
//   Vortex tunnels (entities/vortex.js): up-tubes into the two north domes, a lap of cross-tubes along the walls, a down-tube
//   from the south-east dome to the floor near the engine. All die with the engine.
//   After the kill the engine's shield drops: shoot its core with BLUE to shut it down.
//
// PLACEMENT API
//   buildLeviathanArena(B, { center, size = 50, depth = 22, colors, onDefeated, music, zone, door, world,
//                            engine = true })
//     Builds the whole cistern above (walls, water, air domes, columns, tubes, entry alcove with its
//     checkpoint) and the fight in it. center = the pool floor's center (world). The entrance doorway is on
//     the +z side: 3 m wide, CH tall, floor y = center.y + depth + 0.3, at z = center.z + size / 2 + 12.5
//     (returned as `entry`); door: false walls it up. Returns { boss, engine, entry, checkpoint, setSeal,
//     setDefeated, reset, defeated }.
//   placeLeviathan(B, { center, half, depth, pillars, breachAt, pool, breach, trigger, seals, checkpoint,
//                       colors, music, bossMusic, engine = false, engineAt, world, onStart, onKilled,
//                       onDefeated, onPowerDown })
//     Only the fight, inside a flooded tank someone else built (the Azure world's arena): boss, start
//     trigger, seals, optional checkpoint, music, respawn reset, the optional engine. Options documented
//     at the function below.
// Local coordinates: origin = the pool floor's center, +y up; center = that point in the world.
import * as THREE from 'three';
import { Checkpoint } from '../entities/misc.js';
import { Leviathan } from '../entities/leviathan.js';
import { VortexTunnel } from '../entities/vortex.js';
import { COLORS, BLUE } from '../colors.js';
import { waterSurface } from '../liquid.js';
import { rectMinus } from './hub.js';
import { audio } from '../audio.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Color();
const rnd = (a, b) => a + Math.random() * (b - a);
const noHit = (o) => {
  o.raycast = () => {};
  return o;
};

// tiny seeded RNG so the seabed comes out the same every load
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A soft light shaft falling from an opening in the ceiling: additive, ignores the murk so you can always
// find the way up to air.
function lightShaft(W, x, yTop, z, rTop, rBottom, len, color = 0x9bf6ff, strength = 0.16) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, len, 24, 1, true).translate(0, -len / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uK: { value: strength } },
    vertexShader: 'varying float vY; varying vec3 vN, vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uK; varying float vY; varying vec3 vN, vV; void main(){ float edge = pow(1.0 - abs(dot(vN, vV)), 0.6); float a = uK * vY * vY * (1.0 - edge * 0.7); gl_FragColor = vec4(uColor * a, 1.0); }',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const m = noHit(new THREE.Mesh(geo, mat));
  m.position.set(x, yTop, z);
  m.userData.noCull = true;
  W.scene.add(m);
  return m;
}

// ------------------------------------------------------------------ the engine
// The AZURE ENGINE: a colossal turbine bolted to the cistern floor, its rotor churning the sea into power
// for the machine god. While Charybdis lives a shield of light wraps it (shots splash off); once it dies the
// shield collapses and BLUE hits on the core shut it down.
class AzureEngine {
  constructor(B, { pos, color = BLUE, onShutdown }) {
    const { W, game } = B;
    this.world = W;
    this.game = game;
    this.pos = new THREE.Vector3(...pos);
    this.color = color;
    this.onShutdown = onShutdown;
    this.hp = 22;
    this.state = 'shielded'; // 'shielded' → 'exposed' → 'dying' → 'down'
    this.power = 1;
    this.spin = 0;
    this.boost = 0;
    this.t = 0;
    const g = (this.group = new THREE.Group());
    g.position.copy(this.pos);
    g.userData.hit = this;
    g.userData.part = 'housing';
    g.userData.noCull = true;
    const metal = new THREE.MeshStandardMaterial({ color: 0x33475c, metalness: 0.8, roughness: 0.32, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x141d28, metalness: 0.6, roughness: 0.5 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    const add = (geo, m, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    // base housing, intake vanes, the hub column, the rotor and the core cage on top
    add(new THREE.CylinderGeometry(5.2, 5.8, 1.8, 8), metal, 0, 0.9, 0);
    add(new THREE.CylinderGeometry(5.3, 5.3, 0.12, 32), this.glowMat, 0, 1.8, 0);
    add(new THREE.CylinderGeometry(1.7, 2.2, 5, 8), dark, 0, 2.5, 0);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const vane = add(new THREE.BoxGeometry(0.22, 2.8, 0.7), metal, Math.cos(a) * 5, 3.2, Math.sin(a) * 5);
      vane.rotation.y = -a + 0.5;
    }
    add(new THREE.TorusGeometry(5, 0.2, 6, 32).rotateX(Math.PI / 2), metal, 0, 4.6, 0);
    this.rotor = new THREE.Group();
    this.rotor.position.y = 3.2;
    for (let k = 0; k < 6; k++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.18, 1.3).translate(3.1, 0, 0), metal);
      blade.rotation.set(0.45, (k / 6) * Math.PI * 2, 0, 'YXZ');
      this.rotor.add(blade);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 1.35).translate(4.5, 0, 0), this.glowMat);
      tip.rotation.copy(blade.rotation);
      this.rotor.add(tip);
    }
    g.add(this.rotor);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const strut = add(new THREE.BoxGeometry(0.3, 2.6, 0.3), metal, Math.cos(a) * 1.4, 6.0, Math.sin(a) * 1.4);
      strut.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
    }
    add(new THREE.TorusGeometry(1.75, 0.16, 6, 24).rotateX(Math.PI / 2), metal, 0, 7.2, 0);
    this.core = add(new THREE.IcosahedronGeometry(1.25, 1), this.coreMat, 0, 6.1, 0);
    this.core.userData.hit = this;
    this.core.userData.part = 'core';
    this.coreHalo = noHit(add(new THREE.SphereGeometry(1.9, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), 0, 6.1, 0));
    // the shield: a fresnel bubble of hexes
    this.shieldMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x7fe8ff) }, uK: { value: 1 }, uHit: { value: 0 } },
      vertexShader: 'varying vec3 vN, vV, vP; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `
        uniform float uTime, uK, uHit; uniform vec3 uColor; varying vec3 vN, vV, vP;
        void main(){
          float f = pow(1.0 - abs(dot(vN, vV)), 2.2);
          vec2 h = vec2(atan(vP.z, vP.x) * 4.0, vP.y * 1.3);
          vec2 g = abs(fract(h + vec2(0.5 * floor(h.y), 0.0)) - 0.5);
          float hex = smoothstep(0.42, 0.5, max(g.x, g.y));
          float scan = 0.5 + 0.5 * sin(vP.y * 2.0 - uTime * 3.0);
          float a = (f * 0.3 + hex * (0.05 + 0.07 * scan) + uHit * 0.45) * uK;
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.shield = add(new THREE.IcosahedronGeometry(7, 3), this.shieldMat, 0, 3.6, 0);
    this.shield.userData.hit = this;
    this.shield.userData.part = 'shield';
    // light conduits running out across the floor to the four columns (they darken when it dies)
    this.conduitMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    for (let k = 0; k < 4; k++) {
      const c = noHit(add(new THREE.BoxGeometry(0.35, 0.08, 4.2), this.conduitMat, 0, 0.04, 0));
      const a = (k / 4) * Math.PI * 2;
      c.position.set(Math.sin(a) * 7.3, 0.04, Math.cos(a) * 7.3);
      c.rotation.y = a;
    }
    W.scene.add(g);
    W.add(this);
    W.addHittable(g);
    // it's solid to swimmers and to the leviathan's lunge (crash into it and it reels); the shield keeps
    // you out of its heart while it's up
    W.addSolid(_v.set(-4.6, 0, -4.6).add(this.pos).clone(), _w.set(4.6, 1.8, 4.6).add(this.pos).clone(), { static: true });
    W.addSolid(_v.set(-1.8, 1.8, -1.8).add(this.pos).clone(), _w.set(1.8, 5, 1.8).add(this.pos).clone(), { static: true });
    this.keepOut = W.addSolid(_v.set(-4.8, 0, -4.8).add(this.pos).clone(), _w.set(4.8, 8.6, 4.8).add(this.pos).clone(), { noShot: true });
    this.light = W.addLight(0x6ff0ff, 40, 26, 1.5);
    this.light.position.set(this.pos.x, this.pos.y + 6, this.pos.z);
    this.hum = null;
    this.paint();
  }

  // the guardian is dead: its shield collapses
  unshield() {
    if (this.state !== 'shielded') return;
    this.state = 'exposed';
    const p = _v.set(this.pos.x, this.pos.y + 3.6, this.pos.z), fx = this.world.fx;
    fx.burst(p, 0x7fe8ff, { count: 120, speed: 12, life: 1.2, size: 0.45, gravity: 0, mode: 'shard' });
    fx.ring(p, null, 0x9bf6ff, { size: 2, end: 16, life: 0.8, thick: 0.08, k: 1.5 });
    audio.shieldBreak();
    this.shield.visible = false;
    this.keepOut.enabled = false;
  }

  onHit(color, hit) {
    if (this.state === 'shielded' || hit.part === 'shield') {
      this.shieldMat.uniforms.uHit.value = 1;
      return 'shield';
    }
    if (hit.part !== 'core' || this.state !== 'exposed') return 'world';
    if (color !== this.color) return 'immune';
    this.hp--;
    this.flash = 1;
    audio.bossCoreHit();
    this.world.fx.sparks(hit.point, hit.normal || UP, COLORS[this.color].hex, { count: 10, speed: 9, spread: 1, life: 0.4, gravity: 0 });
    if (this.hp <= 0) this.shutDown();
    return 'hit';
  }

  shutDown() {
    this.state = 'dying';
    this.dyingT = 0;
    audio.sample('engine_shutdown', { gain: 1 }) || (audio.sample('elevator_stop', { gain: 1, rate: 0.6 }), audio.slam());
    this.game.hud.message('The Azure engine is failing…', 3);
  }

  // instantly dead (the save says this world is already down)
  setDown() {
    this.state = 'down';
    this.power = 0;
    this.spin = 0;
    this.shield.visible = false;
    this.keepOut.enabled = false;
    this.paint();
  }

  paint() {
    const p = this.power, hex = COLORS[this.color].hex;
    const flick = this.state === 'dying' ? (Math.random() < 0.3 ? 0.2 : 1) : 1;
    _c.set(hex).multiplyScalar((0.06 + 2.2 * p + (this.flash || 0) * 1.5) * flick);
    this.coreMat.color.copy(_c);
    this.coreHalo.material.color.set(hex);
    this.coreHalo.material.opacity = 0.4 * p * flick;
    _c.set(0x6ff0ff).multiplyScalar(0.05 + 1.6 * p * flick);
    this.glowMat.color.copy(_c);
    this.conduitMat.color.copy(_c);
    this.light.intensity = 40 * p * flick + (this.flash || 0) * 30;
  }

  update(dt, player) {
    this.t += dt;
    if (this.state === 'dying') {
      const t = (this.dyingT += dt);
      const fx = this.world.fx;
      this.power = Math.max(0, 1 - t / 5);
      if (Math.random() < dt * 14 * this.power) {
        const a = Math.random() * Math.PI * 2;
        _v.set(this.pos.x + Math.cos(a) * 5, this.pos.y + rnd(1, 4.5), this.pos.z + Math.sin(a) * 5);
        fx.sparks(_v, _w.set(Math.cos(a), 0.4, Math.sin(a)), 0xffd28a, { count: 6, speed: 8, spread: 0.6, life: 0.4, gravity: 4 });
        fx.bubbles(_v, 4);
      }
      player.shake = Math.max(player.shake, 0.25 * this.power);
      if (t > 4.4 && !this.popped) {
        this.popped = true;
        const p = _v.set(this.pos.x, this.pos.y + 6.1, this.pos.z);
        fx.burst(p, COLORS[this.color].hex, { count: 140, speed: 11, life: 1.4, size: 0.5, gravity: 0, mode: 'shard' });
        fx.burst(p, 0xffffff, { count: 40, speed: 6, life: 0.6, size: 0.7, gravity: 0 });
        fx.ring(p, null, 0x9bf6ff, { size: 1, end: 22, life: 1.2, thick: 0.06, k: 1.4 });
        fx.bubbles(p, 40);
        audio.explode?.(true);
        player.shake = Math.max(player.shake, 0.7);
        this.core.visible = false;
        this.coreHalo.visible = false;
      }
      if (t > 6) {
        this.state = 'down';
        this.power = 0;
        this.onShutdown?.();
      }
    }
    // the rotor: spins with power (and races while the vortex churns)
    const want = this.power * (4 + this.boost * 6);
    this.spin += (want - this.spin) * Math.min(1, dt * (this.state === 'dying' ? 0.8 : 2));
    this.rotor.rotation.y += this.spin * dt;
    this.core.rotation.y += dt * 0.6 * this.power;
    this.core.rotation.x += dt * 0.4 * this.power;
    this.flash = Math.max(0, (this.flash || 0) - dt * 5);
    this.shieldMat.uniforms.uTime.value = this.t;
    this.shieldMat.uniforms.uHit.value = Math.max(0, this.shieldMat.uniforms.uHit.value - dt * 4);
    this.paint();
    if (this.power > 0.05 && Math.random() < dt * 6 && player.pos.distanceTo(this.pos) < 40) {
      const a = Math.random() * Math.PI * 2;
      this.world.fx.bubbles(_v.set(this.pos.x + Math.cos(a) * 3.5, this.pos.y + 4.6, this.pos.z + Math.sin(a) * 3.5), 2);
    }
    // the turbine's drone
    if (!this.hum && audio.available) {
      const own = audio.available.has('engine_hum');
      this.hum = audio.createLoop(own ? 'engine_hum' : 'sun_hum', { rate: own ? 1 : 0.55 });
    }
    if (this.hum) {
      const d = player.pos.distanceTo(this.pos);
      this.hum.setGain(0.5 * this.power * Math.max(0, 1 - d / 45));
      this.hum.setRate((this.hum.name === 'engine_hum' ? 1 : 0.55) * (0.5 + 0.5 * this.power + this.boost * 0.15));
    }
  }
}

// ------------------------------------------------------------------ the arena
// buildLeviathanArena(B, { center, size, depth, colors, onDefeated, music, zone, door })
//   center: the pool floor's center (world). The entrance doorway is on the +z side, centered on x, at
//   floor y = center.y + depth + 0.3, z = center.z + size / 2 + 12.5 (3 m wide, CH tall, facing +z);
//   door: false closes it (a dev range). engine: false leaves the power source to the world (onDefeated then
//   fires when the beast dies). Returns { boss, engine, entry, checkpoint, setSeal, setDefeated, reset }.
export function buildLeviathanArena(B, { center, size = 50, depth = 22, colors = [0, 1, 2, 3], onDefeated = null, music = 'music_blue', zone = 'blue', door = true, world = 'azure', engine = true } = {}) {
  const { W, game, level, T, CH, light, hint, zoneTitle, onRespawn } = B;
  const [cx, cy, cz] = center;
  const H = size / 2, D = depth;
  const X = (x) => cx + x, Y = (y) => cy + y, Z = (z) => cz + z;
  const box = (x1, y1, z1, x2, y2, z2, kind = 'wall') => W.box(X(x1), Y(y1), Z(z1), X(x2), Y(y2), Z(z2), kind, zone);
  const deco = (x1, y1, z1, x2, y2, z2, kind = 'glow3') => W.deco(X(x1), Y(y1), Z(z1), X(x2), Y(y2), Z(z2), kind, zone);
  const rng = mulberry32(0x1e71a7);

  // ---- moods ----
  level.atmospheres.leviathan ??= {
    fog: 0x04121f, fogNear: 6, fogFar: 70,
    skyTop: [0.002, 0.006, 0.015], skyMid: [0.006, 0.02, 0.05], skyHorizon: [0.02, 0.06, 0.12], aurora: 0, stars: 0.2,
    hemiSky: 0x5aa0d0, hemiGround: 0x040c14, hemiIntensity: 0.5,
    sunColor: 0x7fdcff, sunIntensity: 0.25, sunDir: [0.1, 1, 0.2],
    exposure: 0.92, bloom: 0.9,
  };
  level.atmospheres.leviathanStill ??= { ...level.atmospheres.leviathan, fog: 0x020810, hemiIntensity: 0.3, sunIntensity: 0.08, exposure: 0.8, bloom: 0.7 };

  // ---- the chamber shell ----
  const TOP = D + 1.5;
  box(-H - T, -1, -H - T, H + T, 0, H + T, 'rock');
  box(-H - T, 0, -H - T, H + T, TOP, -H); // north
  box(-H - T, 0, -H, -H, TOP, H); // west
  box(H, 0, -H, H + T, TOP, H); // east
  // south wall: the underwater passage from the entry alcove (x -3..3, y D-6..D-1)
  B.wallX(Z(H), Z(H + T), X(-H - T), X(H + T), Y(0), Y(D + 5), [{ c: X(0), w: 6, y0: Y(D - 6), h: 5 }], zone, 'wall');
  // the ceiling slab, open over the central shaft and the four air domes
  const POOL = 7, POCKET = 3.5;
  const pockets = [[-17, -17], [17, -17], [-17, 17], [17, 17]];
  const holes = [{ u1: -POOL, u2: POOL, v1: -POOL, v2: POOL }, ...pockets.map(([x, z]) => ({ u1: x - POCKET, u2: x + POCKET, v1: z - POCKET, v2: z + POCKET }))];
  for (const [x1, z1, x2, z2] of rectMinus(-H - T, -H - T, H + T, H + T, holes)) box(x1, D, z1, x2, TOP, z2, 'ceil');
  // a ring of steel ribs across the underside so the ceiling's height reads in the murk
  // (visual only: a swimmer racing for air must never snag on one)
  for (const k of [-21, -12, 12, 21]) {
    deco(-H, D - 0.35, k - 0.2, H, D, k + 0.2, 'metal');
    deco(k - 0.2, D - 0.35, -H, k + 0.2, D, H, 'metal');
  }
  // the central shaft: open water under a tall dome (it breaches here)
  const SH = 12;
  box(-POOL - T, TOP, -POOL - T, POOL + T, D + SH, -POOL);
  box(-POOL - T, TOP, POOL, POOL + T, D + SH, POOL + T);
  box(-POOL - T, TOP, -POOL, -POOL, D + SH, POOL);
  box(POOL, TOP, -POOL, POOL + T, D + SH, POOL);
  box(-POOL - T, D + SH, -POOL - T, POOL + T, D + SH + 0.5, POOL + T, 'ceil');
  for (const y of [D + 1.6, D + 6, D + 10]) {
    deco(-POOL, y, -POOL, POOL, y + 0.08, -POOL + 0.06);
    deco(-POOL, y, POOL - 0.06, POOL, y + 0.08, POOL);
    deco(-POOL, y, -POOL, -POOL + 0.06, y + 0.08, POOL);
    deco(POOL - 0.06, y, -POOL, POOL, y + 0.08, POOL);
  }
  waterSurface(W, X(-POOL), Z(-POOL), X(POOL), Z(POOL), Y(D));
  light(X(0), Y(D + 9), Z(0), 0xbfe8ff, 40, 34);
  lightShaft(W, X(0), Y(D), Z(0), 6.5, 9, D, 0xbfe8ff, 0.07);
  // air domes: lit from inside, a light shaft beneath each
  const pocketLights = [];
  for (const [x, z] of pockets) {
    const a = x - POCKET, b = x + POCKET, c = z - POCKET, d = z + POCKET, top = D + 4.5;
    box(a - T, TOP, c - T, b + T, top, c);
    box(a - T, TOP, d, b + T, top, d + T);
    box(a - T, TOP, c, a, top, d);
    box(b, TOP, c, b + T, top, d);
    box(a - T, top, c - T, b + T, top + 0.5, d + T, 'ceil');
    deco(a, D + 1.6, c, b, D + 1.7, c + 0.06);
    deco(a, D + 1.6, d - 0.06, b, D + 1.7, d);
    deco(a, D + 1.6, c, a + 0.06, D + 1.7, d);
    deco(b - 0.06, D + 1.6, c, b, D + 1.7, d);
    deco(x - 0.6, top - 0.05, z - 0.6, x + 0.6, top, z + 0.6, 'trimWhite');
    waterSurface(W, X(a), Z(c), X(b), Z(d), Y(D));
    pocketLights.push(light(X(x), Y(D + 3.4), Z(z), 0x9bf6ff, 26, 20));
    lightShaft(W, X(x), Y(D), Z(z), 3.2, 5, 16, 0x9bf6ff, 0.1);
  }
  // the columns around the shaft hold the slab up (and break the vortex's pull)
  const pillars = [[10, 0], [-10, 0], [0, 10], [0, -10]];
  const pillarBoxes = [];
  for (const [x, z] of pillars) {
    box(x - 1.5, 0, z - 1.5, x + 1.5, D, z + 1.5, 'metal');
    for (const y of [3.5, 10.5, 17.5]) deco(x - 1.56, y, z - 1.56, x + 1.56, y + 0.14, z + 1.56);
    pillarBoxes.push([X(x - 1.5), Z(z - 1.5), X(x + 1.5), Z(z + 1.5)]);
  }
  // wrecked containers on the floor: cover
  box(-16, 0, 4, -10, 2.2, 6.5, 'metal');
  box(12, 0, -16, 14.5, 2.2, -10, 'metal');
  box(-4, 0, -21, 2, 2.2, -18.5, 'metal');
  box(14, 0, 9, 16.5, 1.6, 13, 'metal');
  deco(-16, 2.2, 4, -10, 2.26, 4.06, 'glow3');
  deco(12, 2.2, -16, 12.06, 2.26, -10, 'glow3');
  // rocks heaped along the walls
  for (let i = 0; i < 26; i++) {
    const side = i % 4, k = -H + 2 + rng() * (2 * H - 4), s = 1 + rng() * 2.2, h = 1 + rng() * 3.5;
    const [x, z] = side === 0 ? [k, -H + s / 2] : side === 1 ? [k, H - s / 2] : side === 2 ? [-H + s / 2, k] : [H - s / 2, k];
    if (side === 1 && Math.abs(x) < 5) continue; // keep the passage clear
    box(x - s / 2, 0, z - s / 2, x + s / 2, h, z + s / 2, 'rock');
  }
  light(X(-15), Y(6), Z(-15), 0x3ab8ff, 22, 24);
  light(X(15), Y(6), Z(15), 0x3ab8ff, 22, 24);

  // ---- seabed: the bones of an older leviathan, glowing anemones ----
  const bone = new THREE.MeshStandardMaterial({ color: 0xb8b29c, roughness: 0.7, emissive: 0x101410 });
  const bones = new THREE.Group();
  bones.userData.noCull = true;
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 16, 6).rotateZ(Math.PI / 2), bone);
  bones.add(spine);
  for (let k = 0; k < 9; k++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(2.6 - k * 0.12, 0.18, 5, 12, Math.PI * 0.85), bone);
    rib.position.set(-7 + k * 1.7, 0, 0);
    rib.rotation.set(0, Math.PI / 2, 0.15);
    bones.add(rib);
  }
  const skull = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4.2, 6).rotateZ(Math.PI / 2), bone);
  skull.position.set(-9.5, 0.3, 0);
  bones.add(skull);
  bones.position.set(X(-6), Y(0.4), Z(-16));
  bones.rotation.set(0, 0.3, 0.12);
  bones.traverse(noHit);
  W.scene.add(bones);
  const anemoneGeo = new THREE.SphereGeometry(0.14, 8, 6).scale(1, 1.4, 1).translate(0, 1, 0);
  const anemones = noHit(new THREE.InstancedMesh(anemoneGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), 90));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < 90; i++) {
    let x, z;
    do {
      x = -H + 1 + rng() * (2 * H - 2);
      z = -H + 1 + rng() * (2 * H - 2);
    } while (Math.hypot(x, z) < 7 || pillars.some(([px, pz]) => Math.abs(x - px) < 2 && Math.abs(z - pz) < 2));
    const h = 0.5 + rng() * 1.6;
    q.setFromEuler(e.set((rng() - 0.5) * 0.6, 0, (rng() - 0.5) * 0.6));
    m4.compose(_v.set(X(x), Y(0), Z(z)), q, _w.set(0.6 + h * 0.4, h, 0.6 + h * 0.4));
    anemones.setMatrixAt(i, m4);
    anemones.setColorAt(i, _c.set(rng() < 0.8 ? 0x2fd8ff : [0xff3344, 0xffd23a, 0x3dff7a][Math.floor(rng() * 3)]).multiplyScalar(1.1));
  }
  anemones.userData.noCull = true;
  W.scene.add(anemones);

  // ---- water ----
  B.water([X(-H), Y(0), Z(-H)], [X(H), Y(D), Z(H)], { surface: false });

  // ---- entry alcove: shore ledge, checkpoint, a small pool down to the passage ----
  const A0 = H + T, A1 = H + 12.5, AY = D + 0.3;
  box(-4 - T, D - 7, A0, 4 + T, D - 6, A0 + 4.5, 'rock'); // pool floor
  box(-4, D - 7, A0 + 4.5, 4, AY, A1, 'floor'); // shore ledge
  box(-4 - T, D - 7, A0, -4, D + 4.5, A1 + T);
  box(4, D - 7, A0, 4 + T, D + 4.5, A1 + T);
  box(-4 - T, D + 4.5, A0, 4 + T, D + 5, A1 + T, 'ceil');
  B.wallX(Z(A1), Z(A1 + T), X(-4), X(4), Y(AY), Y(D + 4.5), door ? [{ c: X(0), w: 3, y0: Y(AY), h: CH }] : [], zone, 'wall');
  deco(-4, AY + 0.02, A0 + 4.5, 4, AY + 0.1, A0 + 4.56);
  B.water([X(-4), Y(D - 6), Z(H)], [X(4), Y(D), Z(A0 + 4.5)]);
  light(X(0), Y(D + 3.6), Z(A0 + 7), 0x9bf6ff, 22, 16);
  new Checkpoint(W, game, { pos: [X(0), Y(AY), Z(A0 + 8.5)], yaw: 0, size: [8, 4, 3] });
  zoneTitle([X(-4), Y(AY), Z(A0 + 5)], [X(4), Y(AY + 4), Z(A1)], 'AZURE ENGINE', 'THE DROWNED CISTERN', COLORS[BLUE].css);
  hint([X(-4), Y(AY), Z(A0 + 4.5)], [X(4), Y(AY + 4), Z(A0 + 6.5)], 'Something vast circles the engine below. Dive in — <b>Space</b> up, <b>C</b> down, <b>Shift</b> to swim fast.', 6);
  let still = false;
  W.trigger([X(-4), Y(D - 7), Z(H)], [X(4), Y(D + 4.5), Z(A1)], () => {
    game.setAmbient('amb_abyss');
    game.setAtmosphere(still ? 'leviathanStill' : 'leviathan');
  }, { once: false });

  // ---- the fight ----
  const fight = placeLeviathan(B, {
    center,
    half: H,
    depth: D,
    pillars: pillarBoxes,
    pool: POOL,
    trigger: [[X(-H), Y(0), Z(-H)], [X(H), Y(D), Z(H - 1.2)]], // swim in under the lip and it begins
    seals: [{ min: [X(-3), Y(D - 6), Z(H + 0.05)], max: [X(3), Y(D - 1), Z(H + 0.45)] }],
    colors,
    music,
    engine,
    world,
    onDefeated,
    onPowerDown: () => {
      still = true;
      game.setAtmosphere('leviathanStill');
      pocketLights.forEach((l) => (l.intensity *= 0.5));
    },
  });

  // ---- vortex tunnels (the shared VortexTunnel): fast water the engine drives ----
  const tubes = [];
  const tube = (a, b, opts) => tubes.push(new VortexTunnel(W, { from: [X(a[0]), Y(a[1]), Z(a[2])], to: [X(b[0]), Y(b[1]), Z(b[2])], radius: 1.4, color: 0x3a8a9c, ...opts }));
  tube([-17, 1.5, -17], [-17, D - 3.5, -17], { speed: 15, exitSpeed: 5 }); // up into the north-west dome
  tube([17, 1.5, -17], [17, D - 3.5, -17], { speed: 15, exitSpeed: 5 }); // up into the north-east dome
  tube([22.3, 9, 18], [22.3, 9, -18], { speed: 16 }); // east wall, northward
  tube([18, 4, -22.3], [-18, 4, -22.3], { speed: 16 }); // north wall, westward
  tube([-22.3, 9, -18], [-22.3, 9, 18], { speed: 16 }); // west wall, southward
  tube([17, D - 2.6, 17], [8, 3, 5], { speed: 14 }); // down from the south-east dome toward the engine
  // they run on the engine: they slacken as it grinds to a halt
  W.add({ update: () => (fight.engine ? fight.engine.power < 0.5 : fight.boss.defeated) && tubes[0].active && tubes.forEach((t) => t.setActive(false)) });

  const entry = [X(0), Y(AY), Z(A1 + T)];
  const checkpoint = [X(0), Y(AY), Z(A0 + 8.5)];
  return { ...fight, entry, checkpoint, get defeated() { return fight.boss.defeated; } };
}

// ------------------------------------------------------------------ the fight alone
// placeLeviathan(B, opts): Charybdis in a flooded tank someone else built (e.g. the Azure world's own
// arena). It adds no walls or water, only the boss, its trigger, seals, checkpoint, music and resets.
//   center [x, y, z]  the tank floor's center (world); half: half the tank's width (m, ~25; it patrols at
//                     0.72 × half); depth: the water depth (m, 20-26; the surface is center.y + depth)
//   pillars           [[x1, z1, x2, z2], ...] world columns: it steers around them, they break the vortex
//   breachAt [x, z]   (local) an open patch of surface with ~8 m of air above it, where it leaps out;
//                     pool: that patch's half-width; breach: false if the tank has no such headroom
//   trigger [min, max]  the volume that starts the fight (default: the tank, 2 m in from its walls)
//   seals [{ min, max }]  doorways that slam shut while it lives (glowing bars + a solid)
//   checkpoint { pos, yaw, size }  an optional Checkpoint (put it outside the seals)
//   colors            the blaster colors in play (default all four; the engine wants BLUE)
//   music / bossMusic the track to resume after (default 'music_blue') / during ('music_miniboss')
//   engine            true: build the AZURE ENGINE turbine at engineAt (local [x, z], default the
//                     center): shielded during the fight, shot down with BLUE after it, then
//                     game.shutDownWorld(world) and onDefeated. false (default): the world owns the power
//                     source; onDefeated fires when the beast dies.
//   world             the name for game.shutDownWorld / game.isWorldDown (default 'azure'): when that
//                     world is already down the beast is simply gone
//   onStart, onKilled (the beast died), onDefeated, onPowerDown (engine stopped, or found already down)
// Returns { boss, engine, setSeal(on), setDefeated(), reset() }.
export function placeLeviathan(B, { center, half = 25, depth = 22, pillars = [], pool = 7, breachAt = [0, 0], breach = true, trigger = null, seals = [], checkpoint = null, colors = [0, 1, 2, 3], music = 'music_blue', bossMusic = 'music_miniboss', engine: wantEngine = false, engineAt = [0, 0], world = 'azure', onStart = null, onKilled = null, onDefeated = null, onPowerDown = null } = {}) {
  const { W, game, onRespawn } = B;
  const [cx, cy, cz] = center;

  // seals: bars of light across each doorway
  const sealMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7fe8ff).multiplyScalar(1.6), fog: false });
  const sealParts = seals.map(({ min, max }) => {
    const w = max[0] - min[0], h = max[1] - min[1], d = max[2] - min[2], alongX = w >= d, span = alongX ? w : d;
    const g = new THREE.Group();
    const n = Math.max(2, Math.round(span / 0.7));
    for (let k = 0; k <= n; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, h, 0.16), sealMat);
      bar.position[alongX ? 'x' : 'z'] = -span / 2 + (k / n) * span;
      g.add(bar);
    }
    for (const f of [-0.33, 0, 0.33]) {
      const rail = new THREE.Mesh(alongX ? new THREE.BoxGeometry(span, 0.14, 0.14) : new THREE.BoxGeometry(0.14, 0.14, span), sealMat);
      rail.position.y = f * h;
      g.add(rail);
    }
    g.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    g.traverse(noHit);
    g.visible = false;
    g.userData.noCull = true;
    W.scene.add(g);
    const solid = W.addSolid(new THREE.Vector3(...min), new THREE.Vector3(...max), {});
    solid.enabled = false;
    return { g, solid };
  });
  const setSeal = (on) => {
    if (sealParts.length && sealParts[0].g.visible !== on) audio.door();
    for (const s of sealParts) {
      s.g.visible = on;
      s.solid.enabled = on;
    }
  };
  if (checkpoint) new Checkpoint(W, game, { pos: checkpoint.pos, yaw: checkpoint.yaw ?? 0, size: checkpoint.size ?? [4, 4, 3] });

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onDefeated?.();
  };
  const engineColor = colors.includes(BLUE) ? BLUE : colors[colors.length - 1];
  const engine = wantEngine
    ? new AzureEngine(B, {
      pos: [cx + engineAt[0], cy, cz + engineAt[1]],
      color: engineColor,
      onShutdown: () => {
        onPowerDown?.();
        game.hud.zoneTitle('AZURE ENGINE', 'OFFLINE', COLORS[BLUE].css);
        game.shutDownWorld?.(world);
        finish();
      },
    })
    : null;
  const boss = new Leviathan(W, game, {
    center,
    half,
    depth,
    pillars,
    pool,
    breachAt,
    breach,
    colors,
    onStart: () => {
      setSeal(true);
      game.setMusic(bossMusic);
      onStart?.();
    },
    onDefeated: () => {
      setSeal(false);
      game.setMusic(music);
      onKilled?.();
      if (engine) {
        game.guardianBeaten?.(world);
        engine.unshield();
        game.hud.message(`Its guardian is dead and the engine's shield is down — shoot its core with <b>${COLORS[engineColor].name}</b>!`, 6);
      } else finish();
    },
  });
  const [tmin, tmax] = trigger || [[cx - half + 2, cy, cz - half + 2], [cx + half - 2, cy + depth, cz + half - 2]];
  const startTrigger = W.trigger(tmin, tmax, () => {
    if (!boss.defeated && !game.isWorldDown?.(world)) boss.start();
  });
  // the vortex is the engine's own current, wrenched round by the beast; a world already shut down
  // (restored from a save) leaves nothing to fight
  let down = false;
  W.add({
    update: (dt) => {
      if (engine) engine.boost += ((boss.state === 'vortex' ? 1 : 0) - engine.boost) * Math.min(1, dt * 2);
      if (!down && game.isWorldDown?.(world)) {
        down = true;
        boss.vanish();
        engine?.setDown();
        setSeal(false);
        startTrigger.enabled = false;
        onPowerDown?.();
      }
    },
  });
  const reset = () => {
    const fighting = boss.active || boss.state === 'dying';
    if (boss.defeated) return;
    boss.reset();
    boss.hideHud();
    setSeal(false);
    startTrigger.fired = false;
    startTrigger.inside = false;
    if (fighting) {
      game.setMusic(music);
      audio.setIntensity?.(0);
    }
  };
  onRespawn(reset);
  return {
    boss,
    engine,
    setSeal,
    reset,
    // restore from a save: the beast already dead (an engine stays up until shot unless the world is down)
    setDefeated() {
      boss.setDefeated();
      engine?.unshield();
      startTrigger.enabled = false;
      if (!engine) finished = true;
    },
  };
}
