// THE HUB — "the Prism Atrium": a calm, open-roofed atrium joining every color world (ports: LAYOUT.md).
//   floor y 4 · interior x -24..24, z -100..-148 · walls up to y 30, stepped skylight lattice above
//   red entry (S, x 0) + checkpoint · Solar entry (W, z -112) · Verdant entry (N, x -10, yellow door)
//   Azure entry (E, z -112, green door) · U-shaped gallery at y 12 over the north half joins the three
//   return ports (W z -136, N x 10, E z -136); hop its 1 m railing to drop down, or ride the two lifts up
//   (x ±22.7, z -122.5). Windows above y 14 look out into each world; a tall banner of each world's color
//   sits above its door (dim = locked, pulsing = open, bright = complete).
//   One centrepiece, at the Atrium's true centre (x 0, z -124), stacked on one axis: hung from the oculus,
//   the reactor heart (reactor.js), fed by a glass feed from beside every world's door; under it the floating
//   Prism; under that the sunken Prism dais, its down-beam landing on the Prism lift in the dais's middle.
//   Around the lift, four color locks, each on a compass channel of its world's color running out to the rim
//   toward that world's door; each lock beams up into the Prism. With all four attuned the seal drops and the
//   lift rides down to the Prism Core antechamber (prism.js): a 4 m drop, a 14 m run south under the floor,
//   then the 46.8 m plunge.
//   Round it all, what's left of the research station: the first week's glass rooms at the edges and the camp
//   that sprawled out over the floor round the dais in a month (hubOffices.js); the lanes to every door stay open.
import * as THREE from 'three';
import { COLORS, RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { Barrier } from '../entities/barrier.js';
import { Checkpoint } from '../entities/misc.js';
import { Glass, TargetPanel } from '../entities/puzzle.js';
import { boxGeo, mat } from '../materials.js';
import { audio } from '../audio.js';
import { boxOverlap } from '../world.js';
import { buildReactor } from './reactor.js';
import { WorkerSwarm } from '../entities/workerDrone.js';
import { regionOf } from './regions.js';
import { buildOffices } from './hubOffices.js';

const FLOOR = 4; // main floor top
const GAL = 12; // gallery / balcony floor top
const TOP = 30; // wall tops
// The Atrium's one centrepiece sits at its true centre, under the reactor heart (reactor.js): the sunken
// Prism dais (x -7..7, z -131..-117, floor 1.2 m down). Its heart is the Prism lift, a 4×4 m car resting
// flush with the dais floor; with all four locks attuned it drops 4 m into a gallery under the Atrium,
// runs 14 m south beneath the floor (clear of the Warden's arena roof), then plunges down the shaft into
// the Prism Core antechamber (prism.js builds its foot at SHAFT).
const PZ = -124; // the Atrium's centre (z)
export const LIFT = { x1: -2, x2: 2, z1: PZ - 2, z2: PZ + 2, top: FLOOR - 1.2 };
const RUN_Y = -1.2; // the car's top on the run south
export const SHAFT = { x1: -2, x2: 2, z1: -112, z2: -108, top: RUN_Y, bottom: -48 };

// The rectangle [u1,u2]×[v1,v2] minus holes ({ u1, u2, v1, v2 }), as a few rectangles [u1, v1, u2, v2]:
// grid cells merged along u, then identical spans merged along v. Used for walls with ports and windows.
export function rectMinus(u1, v1, u2, v2, holes) {
  const cl = (x, a, b) => Math.max(a, Math.min(b, x));
  const uniq = (a) => [...new Set(a)].sort((p, q) => p - q);
  const us = uniq([u1, u2, ...holes.flatMap((h) => [cl(h.u1, u1, u2), cl(h.u2, u1, u2)])]);
  const vs = uniq([v1, v2, ...holes.flatMap((h) => [cl(h.v1, v1, v2), cl(h.v2, v1, v2)])]);
  const inHole = (u, v) => holes.some((h) => u > h.u1 && u < h.u2 && v > h.v1 && v < h.v2);
  const rows = [];
  for (let j = 0; j < vs.length - 1; j++) {
    const cv = (vs[j] + vs[j + 1]) / 2;
    let start = null;
    for (let i = 0; i < us.length - 1; i++) {
      const solid = !inHole((us[i] + us[i + 1]) / 2, cv);
      if (solid && start === null) start = us[i];
      if (!solid && start !== null) {
        rows.push([start, vs[j], us[i], vs[j + 1]]);
        start = null;
      }
    }
    if (start !== null) rows.push([start, vs[j], us[us.length - 1], vs[j + 1]]);
  }
  rows.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
  const out = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last[0] === r[0] && last[2] === r[2] && last[3] === r[1]) last[3] = r[3];
    else out.push([...r]);
  }
  return out;
}

// A platform that rides between two stops (stop 0 = where it's built, stop 1 = `rise` meters above/below).
// Stand on it for a moment and it carries you to the other stop; step onto a call zone and it comes to
// you; with `home` set it drifts back there once nobody's riding. Riders are carried via solid.delta.
// With `path` (waypoints relative to `min`, the first [0, 0, 0]) it rides that polyline instead, easing
// through every corner (each leg takes at least `legMin` s); `cage` (m) walls its rider in while it moves.
export class Lift {
  constructor(W, { min, max, rise = 0, speed = 4, zone = 'hub', home = null, homeDelay = 2.5, enabled = true, calls = [], glow = 0x9bf6ff, path = null, legMin = 1.3, cage = 0, rideDelay = 0.45 }) {
    this.W = W;
    this.base = new THREE.Vector3(...min);
    this.size = new THREE.Vector3(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    this.rise = rise;
    this.path = null;
    if (path) {
      // each leg gets a share of the ride's "time" (u runs 0..1 at speed / |rise|)
      this.path = path.map((p) => new THREE.Vector3(...p));
      this.legT = this.path.slice(1).map((p, i) => Math.max(legMin, p.distanceTo(this.path[i]) / speed));
      this.rise = this.legT.reduce((a, b) => a + b, 0) * speed;
    }
    this.speed = speed;
    this.home = home;
    this.homeDelay = homeDelay;
    this.enabled = enabled;
    this.calls = calls.map((c) => ({ stop: c.stop, min: new THREE.Vector3(...c.min), max: new THREE.Vector3(...c.max), t: 0 }));
    this.at = home ?? 0;
    this.target = this.at;
    this.u = this.at;
    this.moving = false;
    this.rideT = 0;
    this.idleT = 0;
    this.reboard = false; // after arriving with a rider, they must step off before it moves again
    this.loop = null;
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(boxGeo(this.size.x, this.size.y, this.size.z), mat('plat', zone));
    body.position.copy(this.size).multiplyScalar(0.5);
    this.glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(glow).multiplyScalar(1.6) });
    const rim = new THREE.Mesh(new THREE.BoxGeometry(this.size.x + 0.04, 0.08, this.size.z + 0.04), this.glowMat);
    rim.position.set(this.size.x / 2, this.size.y - 0.06, this.size.z / 2);
    // a chevron inlay so it reads as a lift, not just a floor tile
    const chev = new THREE.Mesh(new THREE.BoxGeometry(this.size.x * 0.5, 0.02, 0.16), this.glowMat);
    chev.position.set(this.size.x / 2, this.size.y + 0.01, this.size.z / 2);
    const chev2 = chev.clone();
    chev2.rotation.y = Math.PI / 2;
    this.mesh.add(body, rim, chev, chev2);
    W.scene.add(this.mesh);
    this.solid = W.addSolid(this.base.clone(), this.base.clone().add(this.size), { delta: new THREE.Vector3(), moving: true, kind: 'metal' });
    // the cage: four thin walls just inside the platform's edges, only up while it carries someone
    this.cage = cage ? [0, 1, 2, 3].map(() => W.addSolid(new THREE.Vector3(), new THREE.Vector3(), { noShot: true })) : [];
    this.cage.forEach((c) => (c.enabled = false));
    this.cageH = cage;
    this.rideDelay = rideDelay; // how long you stand on it before it sets off
    this.prev = new THREE.Vector3();
    this.place(this.u);
    W.add(this);
  }

  get y() {
    return this.solid.max.y;
  }

  place(u) {
    const p = this.base.clone();
    if (this.path) {
      // find the leg u falls in, then ease along it (so every corner is a gentle stop and start)
      let t = u * this.legT.reduce((a, b) => a + b, 0), i = 0;
      while (i < this.legT.length - 1 && t > this.legT[i]) t -= this.legT[i++];
      const k = Math.min(1, Math.max(0, t / this.legT[i])), e = k * k * (3 - 2 * k);
      p.add(this.path[i].clone().lerp(this.path[i + 1], e));
    } else {
      const e = u * u * (3 - 2 * u); // eased so riders aren't jolted
      p.y += this.rise * e;
    }
    // the top stays on a 1/1024 m grid and riders are carried by its change (see update), so a rider's feet
    // stay exactly on it: a hair below would count as inside the platform and shove them off its side
    const top = Math.round((p.y + this.size.y) * 1024) / 1024;
    this.solid.max.set(p.x + this.size.x, top, p.z + this.size.z);
    this.solid.min.set(p.x, top - this.size.y, p.z);
    this.mesh.position.copy(this.solid.min);
    if (this.cage.length) {
      const a = this.solid.min, b = this.solid.max, w = 0.1, y2 = b.y + this.cageH;
      this.cage[0].min.set(a.x, b.y, a.z), this.cage[0].max.set(a.x + w, y2, b.z);
      this.cage[1].min.set(b.x - w, b.y, a.z), this.cage[1].max.set(b.x, y2, b.z);
      this.cage[2].min.set(a.x, b.y, a.z), this.cage[2].max.set(b.x, y2, a.z + w);
      this.cage[3].min.set(a.x, b.y, b.z - w), this.cage[3].max.set(b.x, y2, b.z);
    }
  }

  // raise the cage around a rider (nudged in off the edge first, so no wall starts inside them)
  setCage(on, player) {
    if (!this.cage.length || this.cage[0].enabled === on) return;
    if (on) {
      const m = 0.1 + 0.35 + 0.02, a = this.solid.min, b = this.solid.max; // wall + the player's half-width
      player.pos.x = Math.min(b.x - m, Math.max(a.x + m, player.pos.x));
      player.pos.z = Math.min(b.z - m, Math.max(a.z + m, player.pos.z));
    }
    this.cage.forEach((c) => (c.enabled = on));
  }

  go(stop) {
    if (this.moving || stop === this.at) return;
    this.target = stop;
    this.moving = true;
    audio.sample('elevator_start', { gain: 0.6 });
  }

  // snap back to the home stop (respawns)
  reset() {
    if (this.home === null) return;
    this.at = this.target = this.u = this.home;
    this.moving = false;
    this.place(this.u);
    this.solid.delta.set(0, 0, 0);
    this.setCage(false);
    this.loop?.setGain(0);
  }

  update(dt, player) {
    const delta = this.solid.delta.set(0, 0, 0);
    const riding = player.ground === this.solid;
    if (!this.loop && audio.available) this.loop = audio.createLoop('elevator_loop');
    if (this.moving) {
      if (riding) this.setCage(true, player);
      this.prev.copy(this.solid.max);
      const dir = this.target > this.at ? 1 : -1;
      this.u = Math.max(0, Math.min(1, this.u + (dir * this.speed * dt) / Math.abs(this.rise)));
      this.place(this.u);
      delta.subVectors(this.solid.max, this.prev);
      const d = this.mesh.position.distanceTo(player.pos);
      this.loop?.setGain(0.45 * Math.max(0, 1 - d / 30));
      if (this.u === this.target) {
        this.moving = false;
        this.at = this.target;
        this.reboard = riding;
        this.idleT = 0;
        this.loop?.setGain(0);
        this.setCage(false);
        audio.sample('elevator_stop', { gain: 0.6 * Math.max(0.2, 1 - d / 30) });
      }
      return;
    }
    if (!this.enabled) return;
    if (!riding) this.reboard = false;
    if (riding && !this.reboard) {
      this.rideT += dt;
      if (this.rideT > this.rideDelay) {
        this.rideT = 0;
        return this.go(1 - this.at);
      }
    } else this.rideT = 0;
    const pb = player.bounds();
    for (const c of this.calls) {
      if (c.stop !== this.at && boxOverlap(pb.min, pb.max, c.min, c.max)) {
        c.t += dt;
        if (c.t > 0.35) {
          c.t = 0;
          return this.go(c.stop);
        }
      } else c.t = 0;
    }
    if (this.home !== null && this.at !== this.home && !riding) {
      this.idleT += dt;
      if (this.idleT > this.homeDelay) this.go(this.home);
    } else this.idleT = 0;
  }
}

// Tall world banner: a flowing color panel whose brightness says whether that world is locked, open or done.
const bannerShader = {
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform vec3 uColor; uniform float uLevel; uniform float uTime; varying vec2 vUv;
    void main(){
      float inner = step(0.07, vUv.x) * step(vUv.x, 0.93) * step(0.025, vUv.y) * step(vUv.y, 0.975);
      float flow = 0.5 + 0.5 * sin(vUv.y * 26.0 - uTime * 1.4);
      float chev = smoothstep(0.92, 1.0, sin((vUv.y - abs(vUv.x - 0.5) * 0.5) * 34.0 - uTime * 2.2));
      float spine = 1.0 - smoothstep(0.0, 0.32, abs(vUv.x - 0.5));
      vec3 body = uColor * ((0.18 + 0.82 * spine) * (0.55 + 0.45 * flow) + chev * 0.9);
      vec3 c = mix(uColor * 1.8, body, inner) * uLevel;
      gl_FragColor = vec4(c + vec3(0.025, 0.03, 0.045), 1.0);
    }`,
};

// The elevator seal: a violet hex-field cube.
const sealShader = {
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform float uTime; uniform float uAlpha; varying vec2 vUv;
    void main(){
      vec2 g = abs(fract(vUv * 1.4) - 0.5);
      float hex = smoothstep(0.4, 0.5, max(g.x, g.y));
      float scan = 0.5 + 0.5 * sin(vUv.y * 9.0 - uTime * 2.5);
      vec3 col = vec3(0.7, 0.5, 1.0) * (0.3 + hex * 0.9 + scan * 0.2);
      gl_FragColor = vec4(col, clamp((0.1 + hex * 0.4 + scan * 0.06) * uAlpha, 0.0, 1.0));
    }`,
};

export function buildHub(B) {
  const { W, game, level, hint, zoneTitle, area, light, killZone, devStart, onRespawn } = B;
  const zone = 'hub';
  const box = (x1, y1, z1, x2, y2, z2, kind = 'wall') => W.box(x1, y1, z1, x2, y2, z2, kind, zone);
  const deco = (x1, y1, z1, x2, y2, z2, kind = 'trimWhite') => W.deco(x1, y1, z1, x2, y2, z2, kind, zone);
  const css = (c) => COLORS[c].css;
  const tag = (c, text) => `<b style="color:${css(c)}">${text}</b>`;

  // ---------------------------------------------------------------- floor (holes: lifts, the dais)
  const liftW = { x1: -24.4, x2: -21, z1: -124, z2: -121 };
  const liftE = { x1: 21, x2: 24.4, z1: -124, z2: -121 };
  const plaza = { x1: -7, x2: 7, z1: PZ - 7, z2: PZ + 7 }; // the sunken Prism dais, right under the reactor heart
  const floorHoles = [liftW, liftE, plaza].map((h) => ({ u1: h.x1, u2: h.x2, v1: h.z1, v2: h.z2 }));
  for (const [x1, z1, x2, z2] of rectMinus(-24.5, -148, 24.5, -100, floorHoles)) box(x1, FLOOR - 1, z1, x2, FLOOR, z2, 'floor');
  for (const L of [liftW, liftE]) box(L.x1, FLOOR - 1, L.z1, L.x2, FLOOR - 0.7, L.z2, 'grate'); // lift pits
  // the dais: two 0.4 m steps down on every side to a quiet floor; the Prism lift rests flush in its middle
  const liftHole = { u1: LIFT.x1, u2: LIFT.x2, v1: LIFT.z1, v2: LIFT.z2 };
  for (const [inset, top] of [[0, FLOOR - 0.4], [1, FLOOR - 0.8], [2, FLOOR - 1.2]]) {
    const o = { x1: plaza.x1 + inset, x2: plaza.x2 - inset, z1: plaza.z1 + inset, z2: plaza.z2 - inset };
    const inner = inset < 2 ? [{ u1: o.x1 + 1, u2: o.x2 - 1, v1: o.z1 + 1, v2: o.z2 - 1 }] : [liftHole];
    for (const [x1, z1, x2, z2] of rectMinus(o.x1, o.z1, o.x2, o.z2, inner)) box(x1, FLOOR - 1.8, z1, x2, top, z2, inset === 2 ? 'plat' : 'floor');
    deco(o.x1, top, o.z1, o.x2, top + 0.03, o.z1 + 0.06);
    deco(o.x1, top, o.z2 - 0.06, o.x2, top + 0.03, o.z2);
    deco(o.x1, top, o.z1, o.x1 + 0.06, top + 0.03, o.z2);
    deco(o.x2 - 0.06, top, o.z1, o.x2, top + 0.03, o.z2);
  }
  // A compass of light: from the lift, a channel in each world's color runs out through that world's lock,
  // down the floor and up both steps to the rim, pointing at its door (south the Foundry, west Solar,
  // north Verdant, east Azure)
  const COMPASS = [
    { d: [0, 1], color: RED, kind: 'glow0' },
    { d: [-1, 0], color: YELLOW, kind: 'glow1' },
    { d: [0, -1], color: GREEN, kind: 'glow2' },
    { d: [1, 0], color: BLUE, kind: 'glow3' },
  ];
  // a box spanning r1..r2 out from the centre along d, -w..w across it
  const radial = (d, r1, r2, w, y1, y2, kind = 'trimWhite') => {
    const [dx, dz] = d;
    const xa = dx ? dx * r1 : -w, xb = dx ? dx * r2 : w, za = dz ? PZ + dz * r1 : PZ - w, zb = dz ? PZ + dz * r2 : PZ + w;
    return [Math.min(xa, xb), y1, Math.min(za, zb), Math.max(xa, xb), y2, Math.max(za, zb), kind];
  };
  const LOCK_R1 = 3.2, LOCK_R2 = 4.6, LOCK_W = 1.5; // each lock: a 3 m tile between the lift and the bottom step
  const YD = FLOOR - 1.2; // the dais floor
  for (const { d, kind } of COMPASS) {
    const ch = 0.08;
    deco(...radial(d, 2.05, LOCK_R1 - 0.08, ch, YD, YD + 0.035, kind)); // lift → lock
    deco(...radial(d, LOCK_R2 + 0.08, 5, ch, YD, YD + 0.035, kind)); // lock → first riser
    deco(...radial(d, 4.96, 5, ch, YD, YD + 0.4, kind)); // up the riser
    deco(...radial(d, 5, 6, ch, YD + 0.4, YD + 0.435, kind)); // across the step
    deco(...radial(d, 5.96, 6, ch, YD + 0.4, YD + 0.8, kind));
    deco(...radial(d, 6, 7, ch, YD + 0.8, YD + 0.835, kind));
    deco(...radial(d, 6.96, 7, ch, YD + 0.8, FLOOR, kind));
    deco(...radial(d, 7, 8, ch, FLOOR, FLOOR + 0.035, kind)); // and a little way out onto the Atrium floor
    // a white frame around the lock tile
    deco(...radial(d, LOCK_R1 - 0.08, LOCK_R1, LOCK_W + 0.08, YD, YD + 0.03));
    deco(...radial(d, LOCK_R2, LOCK_R2 + 0.08, LOCK_W + 0.08, YD, YD + 0.03));
    for (const sgn of [-1, 1]) {
      const [x1, y1, z1, x2, y2, z2] = radial(d, LOCK_R1, LOCK_R2, LOCK_W + 0.08, YD, YD + 0.03);
      if (d[0]) deco(x1, y1, sgn < 0 ? z1 : z2 - 0.08, x2, y2, sgn < 0 ? z1 + 0.08 : z2);
      else deco(sgn < 0 ? x1 : x2 - 0.08, y1, z1, sgn < 0 ? x1 + 0.08 : x2, y2, z2);
    }
  }
  // low benches beside the top step, facing in: split either side of the yellow and blue channels, and low
  // enough to step straight over (nothing on the Atrium floor stands in your way)
  for (const s of [-1, 1])
    for (const [z1, z2] of [[PZ - 3.6, PZ - 1.2], [PZ + 1.2, PZ + 3.6]]) {
      box(s * 8.7 - 0.45, FLOOR, z1, s * 8.7 + 0.45, FLOOR + 0.4, z2, 'metal');
      deco(s * 8.7 - 0.47, FLOOR + 0.4, z1, s * 8.7 + 0.47, FLOOR + 0.43, z2);
    }

  // ---------------------------------------------------------------- walls: ports, windows, glass
  // holes are { u1, u2, v1, v2 } (u along the wall, v = y). Window holes get a glass pane and mullions.
  const port = (c, y) => ({ u1: c - 1.5, u2: c + 1.5, v1: y, v2: y + 3.2 });
  const win = (u1, u2, v1 = 14, v2 = 27) => ({ u1, u2, v1, v2, glass: true });
  function wall(axis, t1, t2, u1, u2, holes) {
    for (const [a, yb, b, yt] of rectMinus(u1, FLOOR - 1, u2, TOP, holes)) {
      if (axis === 'x') box(a, yb, t1, b, yt, t2);
      else box(t1, yb, a, t2, yt, b);
    }
    const tm = (t1 + t2) / 2;
    for (const h of holes.filter((o) => o.glass)) {
      if (axis === 'x') new Glass(W, { min: [h.u1, h.v1, tm - 0.05], max: [h.u2, h.v2, tm + 0.05] });
      else new Glass(W, { min: [tm - 0.05, h.v1, h.u1], max: [tm + 0.05, h.v2, h.u2] });
      // mullions every ~4 m and a transom, so the panes read as one big framed window
      const n = Math.max(1, Math.round((h.u2 - h.u1) / 4.2));
      const bar = (a, ya, b, yb) => (axis === 'x' ? deco(a, ya, t1 - 0.05, b, yb, t2 + 0.05, 'metal') : deco(t1 - 0.05, ya, a, t2 + 0.05, yb, b, 'metal'));
      for (let i = 1; i < n; i++) {
        const u = h.u1 + ((h.u2 - h.u1) * i) / n;
        bar(u - 0.12, h.v1, u + 0.12, h.v2);
      }
      if (h.v2 - h.v1 > 8) bar(h.u1, 20.4, h.u2, 20.65);
      // lit sill so the window line reads from the floor
      if (axis === 'x') deco(h.u1, h.v1 - 0.1, t1 - 0.1, h.u2, h.v1, t2 + 0.1);
      else deco(t1 - 0.1, h.v1 - 0.1, h.u1, t2 + 0.1, h.v1, h.u2);
    }
  }
  // the window holes skirt each return port: full height beside it, from y 16.6 above it
  const sideHoles = (zc) => [port(-112, FLOOR), port(zc, GAL), win(-133.6, -125), win(-138, -134, 16.6), win(-147, -138.4)];
  wall('x', -100, -99.5, -24.5, 24.5, [port(0, FLOOR)]); // south (red entry)
  wall('x', -148.5, -148, -24.5, 24.5, [port(-10, FLOOR), port(10, GAL), win(-21, -14), win(-5, 7.6), win(8, 12, 16.6), win(12.4, 22)]); // north
  wall('z', -25, -24.5, -148.5, -99.5, sideHoles(-136)); // west
  wall('z', 24.5, 25, -148.5, -99.5, sideHoles(-136)); // east
  // cornice, a band above the doors and a sill line under the windows
  for (const [y0, y1] of [[TOP - 0.3, TOP - 0.2], [8.2, 8.28], [13.1, 13.16]]) {
    deco(-24.5, y0, -100.1, 24.5, y1, -100);
    deco(-24.5, y0, -148, 24.5, y1, -147.9);
    deco(-24.5, y0, -148, -24.4, y1, -100);
    deco(24.4, y0, -148, 24.5, y1, -100);
  }

  // ---------------------------------------------------------------- stepped skylight lattice (open to the sky)
  const rings = [
    { y: TOP, x: 25, zS: -99.5, zN: -148.5, ix: 18, izS: -106, izN: -142 },
    { y: TOP + 2.6, x: 18.2, zS: -105.8, zN: -142.2, ix: 13, izS: -111, izN: -137 },
    { y: TOP + 5.2, x: 13.2, zS: -110.8, zN: -137.2, ix: 8, izS: -116, izN: -132 },
  ];
  for (const r of rings) {
    const t = 0.7;
    box(-r.x, r.y, r.zN, r.x, r.y + t, r.izN, 'metal');
    box(-r.x, r.y, r.izS, r.x, r.y + t, r.zS, 'metal');
    box(-r.x, r.y, r.izN, -r.ix, r.y + t, r.izS, 'metal');
    box(r.ix, r.y, r.izN, r.x, r.y + t, r.izS, 'metal');
    // lit inner lip
    deco(-r.ix, r.y - 0.06, r.izN, r.ix, r.y, r.izN + 0.1);
    deco(-r.ix, r.y - 0.06, r.izS - 0.1, r.ix, r.y, r.izS);
    deco(-r.ix, r.y - 0.06, r.izN, -r.ix + 0.1, r.y, r.izS);
    deco(r.ix - 0.1, r.y - 0.06, r.izN, r.ix, r.y, r.izS);
    // struts down to the ring below
    if (r.y > TOP) for (const [sx, sz] of [[-1, r.zN], [1, r.zN], [-1, r.zS], [1, r.zS]]) box(sx * r.x - 0.3, r.y - 2.6, sz - 0.3, sx * r.x + 0.3, r.y, sz + 0.3, 'metal');
  }
  // the oculus: a slim cross of beams
  box(-8, TOP + 5.5, -124.2, 8, TOP + 5.9, -123.8, 'metal');
  box(-0.2, TOP + 5.5, -132, 0.2, TOP + 5.9, -116, 'metal');

  // ---------------------------------------------------------------- gallery (y 12) over the north half
  const slab = (x1, z1, x2, z2) => box(x1, GAL - 0.6, z1, x2, GAL, z2, 'floor');
  slab(-24.5, -148, -20, -124); // west
  slab(-20, -148, 20, -144); // north
  slab(20, -148, 24.5, -124); // east
  // fascia trim along the inner edge
  deco(-20.05, GAL - 0.6, -144, -19.98, GAL - 0.5, -124);
  deco(19.98, GAL - 0.6, -144, 20.05, GAL - 0.5, -124);
  deco(-20, GAL - 0.6, -144.05, 20, GAL - 0.5, -143.98);
  deco(-24.5, GAL - 0.6, -124.05, -20, GAL - 0.5, -123.98);
  deco(20, GAL - 0.6, -124.05, 24.5, GAL - 0.5, -123.98);
  // 1 m railings you can hop over to drop down; open in front of each return port (and at the lifts)
  const rail = (x1, z1, x2, z2) => {
    box(x1, GAL, z1, x2, GAL + 1, z2, 'metal');
    deco(x1 - 0.02, GAL + 1, z1 - 0.02, x2 + 0.02, GAL + 1.06, z2 + 0.02);
  };
  for (const s of [-1, 1]) {
    const xi = s * 20, xr = s < 0 ? [-20.2, -20] : [20, 20.2];
    rail(xr[0], -144, xr[1], -138);
    rail(xr[0], -134, xr[1], -124.2);
    rail(s < 0 ? -21 : 20, -124.2, s < 0 ? -20 : 21, -124); // beside the lift landing
    // the open drop in front of the return port is marked with that world's color
    deco(xi - 0.04, GAL - 0.12, -138, xi + 0.04, GAL - 0.02, -134, s < 0 ? 'glow1' : 'glow3');
  }
  rail(-20, -144.2, 8, -144);
  rail(12, -144.2, 20, -144);
  deco(8, GAL - 0.12, -144.04, 12, GAL - 0.02, -143.96, 'glow2');
  // columns under the inner edge
  const col = (x, z) => {
    box(x - 0.3, FLOOR, z - 0.3, x + 0.3, GAL - 0.6, z + 0.3, 'metal');
    deco(x - 0.32, FLOOR, z - 0.32, x + 0.32, FLOOR + 0.08, z + 0.32);
  };
  for (const z of [-129, -142]) {
    col(-20.3, z);
    col(20.3, z);
  }
  for (const x of [-16, -4, 4, 16]) col(x, -144.3);

  // ---------------------------------------------------------------- lifts from the floor to the gallery
  const lifts = [liftW, liftE].map(
    (L) => new Lift(W, { min: [L.x1, FLOOR - 0.6, L.z1], max: [L.x2, FLOOR, L.z2], rise: GAL - FLOOR, speed: 4, home: 0, homeDelay: 2.5 }),
  );
  onRespawn(() => lifts.forEach((l) => l.reset()));
  for (const s of [-1, 1]) {
    // a lit guide rail up the wall behind each lift
    const xw = s * 24.45;
    deco(xw - 0.05, FLOOR, -122.65, xw + 0.05, GAL + 1.2, -122.35);
    deco(xw - 0.05, GAL + 1.2, -123.6, xw + 0.05, GAL + 1.3, -121.4);
  }

  // ---------------------------------------------------------------- doors: frames, gates, banners
  // glowing frame around an entry door in its world's color; axis 'x' = door in a north/south wall
  const frame = (axis, c, t, kind) => {
    const a = c - 1.75, b = c + 1.75, y2 = FLOOR + 3.45;
    if (axis === 'x') {
      deco(a, FLOOR, t - 0.15, a + 0.25, y2, t + 0.15, kind);
      deco(b - 0.25, FLOOR, t - 0.15, b, y2, t + 0.15, kind);
      deco(a, y2 - 0.25, t - 0.15, b, y2, t + 0.15, kind);
    } else {
      deco(t - 0.15, FLOOR, a, t + 0.15, y2, a + 0.25, kind);
      deco(t - 0.15, FLOOR, b - 0.25, t + 0.15, y2, b, kind);
      deco(t - 0.15, y2 - 0.25, a, t + 0.15, y2, b, kind);
    }
  };
  frame('x', 0, -100, 'glow0');
  frame('z', -112, -24.5, 'glow1');
  frame('x', -10, -148, 'glow2');
  frame('z', -112, 24.5, 'glow3');
  // the gates: Verdant answers to yellow, Azure to green
  new Barrier(W, { min: [-11.5, FLOOR, -148.5], max: [-8.5, FLOOR + 3.2, -148], color: YELLOW, kind: 'wall', zone });
  new Barrier(W, { min: [24.5, FLOOR, -113.5], max: [25, FLOOR + 3.2, -110.5], color: GREEN, kind: 'wall', zone });

  // banners: { color, gate (color needed to enter, -1 = open), where }
  const banners = [];
  const bannerGeo = new THREE.PlaneGeometry(3.2, 11.6);
  function banner(color, gate, axis, c, t, facing, lit = null) {
    const y1 = 13.2, y2 = 25.6, cy = (y1 + y2) / 2;
    // dark backing slab with a lit cap
    if (axis === 'x') {
      box(c - 2.2, y1 - 0.4, t, c + 2.2, y2 + 0.4, t + facing * 0.3, 'metal');
      deco(c - 2.25, y2 + 0.4, t, c + 2.25, y2 + 0.5, t + facing * 0.34);
    } else {
      box(t, y1 - 0.4, c - 2.2, t + facing * 0.3, y2 + 0.4, c + 2.2, 'metal');
      deco(t, y2 + 0.4, c - 2.25, t + facing * 0.34, y2 + 0.5, c + 2.25);
    }
    const m = new THREE.ShaderMaterial({
      ...bannerShader,
      uniforms: { uColor: { value: new THREE.Color(COLORS[color].hex) }, uLevel: { value: 0.1 }, uTime: { value: Math.random() * 10 } },
    });
    const panel = new THREE.Mesh(bannerGeo, m);
    const off = facing * 0.32;
    if (axis === 'x') {
      panel.position.set(c, cy, t + off);
      if (facing < 0) panel.rotation.y = Math.PI;
    } else {
      panel.position.set(t + off, cy, c);
      panel.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    W.scene.add(panel);
    // a hovering emblem crystal in front of the banner
    const emMat = new THREE.MeshStandardMaterial({ color: 0x20222c, emissive: new THREE.Color(COLORS[color].hex), emissiveIntensity: 0.1, metalness: 0.3, roughness: 0.2, flatShading: true });
    const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), emMat);
    emblem.scale.y = 1.5;
    emblem.position.copy(panel.position);
    if (axis === 'x') emblem.position.z += facing * 1.3;
    else emblem.position.x += facing * 1.3;
    emblem.position.y = y2 + 1.9;
    W.scene.add(emblem);
    banners.push({ color, gate, m, emMat, emblem, light: lit, level: 0.1, baseY: emblem.position.y });
  }
  const bannerLight = (x, z) => light(x, 18, z, 0xffffff, 0, 26);
  banner(RED, -1, 'x', 0, -100, -1);
  banner(YELLOW, -1, 'z', -112, -24.5, 1, bannerLight(-20, -112));
  banner(GREEN, YELLOW, 'x', -10, -148, 1, bannerLight(-10, -143));
  banner(BLUE, GREEN, 'z', -112, 24.5, -1, bannerLight(20, -112));
  banners.forEach((b) => b.light?.color.set(COLORS[b.color].hex));

  // ---------------------------------------------------------------- the Prism lift, its seal, the Prism and the locks
  // Under the dais: the car drops 4 m, runs south under the Atrium floor and plunges down the shaft into the
  // antechamber ceiling (prism.js). Lights stream past the whole way.
  const L = LIFT, S = SHAFT, sb = -30; // sb: the antechamber's ceiling
  const RB = RUN_Y - 0.6, RC = RUN_Y + 3.2; // the car's underside on the run; the run's ceiling
  box(L.x1 - 0.5, RB - 0.6, L.z1 - 0.5, L.x1, FLOOR - 1.8, S.z2 + 0.5, 'metal'); // the run's west wall
  box(L.x2, RB - 0.6, L.z1 - 0.5, L.x2 + 0.5, FLOOR - 1.8, S.z2 + 0.5, 'metal'); // east wall
  box(L.x1, RB - 0.6, L.z1 - 0.5, L.x2, FLOOR - 1.8, L.z1, 'metal'); // north end, under the dais
  box(L.x1, RB - 0.6, L.z1, L.x2, RB, S.z1, 'metal'); // the run's floor (the car slides over it)
  box(L.x1, RC, L.z2, L.x2, RC + 0.2, S.z2, 'metal'); // its ceiling, south of the drop
  box(S.x1, sb, S.z2, S.x2, RC + 0.2, S.z2 + 0.5, 'metal'); // south end, all the way down
  box(S.x1 - 0.5, sb, S.z1 - 0.5, S.x1, RB - 0.6, S.z2 + 0.5, 'metal'); // the plunge, under the run
  box(S.x2, sb, S.z1 - 0.5, S.x2 + 0.5, RB - 0.6, S.z2 + 0.5, 'metal');
  box(S.x1, sb, S.z1 - 0.5, S.x2, RB - 0.6, S.z1, 'metal');
  for (let y = sb + 2; y < RB - 1; y += 4) {
    deco(S.x1, y, S.z1, S.x1 + 0.05, y + 0.12, S.z2);
    deco(S.x2 - 0.05, y, S.z1, S.x2, y + 0.12, S.z2);
    deco(S.x1, y, S.z1, S.x2, y + 0.12, S.z1 + 0.05);
    deco(S.x1, y, S.z2 - 0.05, S.x2, y + 0.12, S.z2);
  }
  for (let z = L.z1 + 1; z < S.z2; z += 2) {
    // ribs of light down both walls and across the ceiling of the run
    deco(L.x1, RB, z - 0.06, L.x1 + 0.05, RC, z + 0.06);
    deco(L.x2 - 0.05, RB, z - 0.06, L.x2, RC, z + 0.06);
    if (z > L.z2) deco(L.x1, RC - 0.05, z - 0.06, L.x2, RC, z + 0.06);
  }
  deco(L.x1, RB + 1.4, L.z1, L.x1 + 0.05, RB + 1.5, S.z2); // and a rail along each wall
  deco(L.x2 - 0.05, RB + 1.4, L.z1, L.x2, RB + 1.5, S.z2);
  const elevator = new Lift(W, {
    min: [L.x1, L.top - 0.6, L.z1], max: [L.x2, L.top, L.z2], speed: 8, enabled: false, glow: 0xd9a8ff, cage: 3, rideDelay: 1.1, // (a beat longer: you can walk straight over it)
    path: [[0, 0, 0], [0, RUN_Y - L.top, 0], [0, RUN_Y - L.top, S.z1 - L.z1], [0, S.bottom - L.top, S.z1 - L.z1]],
    calls: [
      { stop: 0, min: [-5, L.top, PZ - 5], max: [5, L.top + 3, PZ + 5] }, // down on the dais floor
      { stop: 1, min: [-10, S.bottom, -115], max: [10, S.bottom + 3, -95] }, // anywhere in the antechamber
    ],
  });
  level.prismElevator = elevator;
  // while the car is away, a hex-field iris closes over its well (so nobody walks into a 50 m drop)
  const sealMat = new THREE.ShaderMaterial({ ...sealShader, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 } } });
  const irisMat = new THREE.ShaderMaterial({ ...sealShader, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: sealMat.uniforms.uTime, uAlpha: { value: 0.8 } } });
  const iris = new THREE.Mesh(new THREE.PlaneGeometry(L.x2 - L.x1, L.z2 - L.z1).rotateX(-Math.PI / 2), irisMat);
  iris.position.set((L.x1 + L.x2) / 2, L.top + 0.02, PZ);
  iris.visible = false;
  W.scene.add(iris);
  const irisSolid = W.addSolid(new THREE.Vector3(L.x1, L.top - 0.6, L.z1), new THREE.Vector3(L.x2, L.top, L.z2), { kind: 'metal' });
  irisSolid.enabled = false;

  // the seal: a hex-field cube over the car until all four locks are attuned
  const seal = new THREE.Mesh(boxGeo(4, 3.5, 4, 1), sealMat);
  seal.position.set(0, L.top + 1.75, PZ);
  W.scene.add(seal);
  const sealSolid = W.addSolid(new THREE.Vector3(L.x1, L.top, L.z1), new THREE.Vector3(L.x2, L.top + 3.5, L.z2), {});
  let sealT = -1; // -1 sealed; 0..1 dissolving

  // the Prism: a floating crystal over the lift, under the reactor heart's tip (its down-beam runs through
  // it into the lift), one orbiting shard per color, beams up to it from the four locks around the lift
  const PRISM_Y = 11.5;
  const prismMat = new THREE.MeshStandardMaterial({ color: 0xdfeaff, emissive: 0x7a8cff, emissiveIntensity: 0.35, metalness: 0.25, roughness: 0.08, flatShading: true });
  const prism = new THREE.Mesh(new THREE.OctahedronGeometry(1.7, 0), prismMat);
  prism.scale.y = 1.7;
  prism.position.set(0, PRISM_Y, PZ);
  const cage = new THREE.Mesh(new THREE.OctahedronGeometry(2.3, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9bf6ff).multiplyScalar(0.8), wireframe: true, transparent: true, opacity: 0.35 }));
  cage.scale.y = 1.35;
  cage.position.copy(prism.position);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.06, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfe6ff).multiplyScalar(0.9) }));
  halo.rotation.x = Math.PI / 2;
  halo.position.copy(prism.position);
  W.scene.add(prism, cage, halo);
  // the dais's own halo, hung over its rim: one more ring on the axis (the dais's, the Prism's, the
  // reactor's gimbals), with a node over each lock's channel that wakes in its color once it's attuned
  const DAIS_Y = FLOOR + 3.2, DAIS_R = 6.6;
  const daisRing = new THREE.Mesh(new THREE.TorusGeometry(DAIS_R, 0.05, 6, 120), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfe6ff).multiplyScalar(0.85) }));
  daisRing.rotation.x = Math.PI / 2;
  daisRing.position.set(0, DAIS_Y, PZ);
  W.scene.add(daisRing);
  const nodeGeo = new THREE.OctahedronGeometry(0.3, 0);
  const shardGeo = new THREE.TetrahedronGeometry(0.45, 0);
  const locks = COMPASS.map(({ d, color }) => {
    const [x1, , z1, x2, , z2] = radial(d, LOCK_R1, LOCK_R2, LOCK_W, YD, YD + 0.12);
    return { color, d, min: [x1, YD, z1], max: [x2, YD + 0.12, z2] };
  });
  const up = new THREE.Vector3(0, 1, 0);
  for (const L of locks) {
    const c = new THREE.Color(COLORS[L.color].hex);
    L.nodeMat = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(0.3) });
    L.node = new THREE.Mesh(nodeGeo, L.nodeMat);
    L.node.scale.y = 1.7;
    L.node.position.set(L.d[0] * DAIS_R, DAIS_Y, PZ + L.d[1] * DAIS_R);
    W.scene.add(L.node);
    L.shardMat = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(0.25) });
    L.shard = new THREE.Mesh(shardGeo, L.shardMat);
    W.scene.add(L.shard);
    const from = new THREE.Vector3((L.min[0] + L.max[0]) / 2, YD + 0.15, (L.min[2] + L.max[2]) / 2);
    const to = prism.position.clone();
    const len = from.distanceTo(to);
    L.beamMat = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, len, 6, 1, true), L.beamMat);
    beam.position.copy(from).add(to).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(up, to.clone().sub(from).normalize());
    W.scene.add(beam);
    L.lit = false;
    L.panel = new TargetPanel(W, { min: L.min, max: L.max, color: L.color, face: 'up', onActivate: () => attune(L) });
  }
  function attune(L, silent = false) {
    L.lit = true;
    if (silent) {
      L.panel.light();
      if (locks.every((k) => k.lit)) {
        sealT = 1;
        seal.visible = false;
        sealSolid.enabled = false;
        elevator.enabled = true;
      }
      return;
    }
    const n = locks.filter((k) => k.lit).length;
    if (n < 4) {
      game.hud.message(`${tag(L.color, COLORS[L.color].name)} lock attuned — <b>${n}/4</b>. The Prism Core needs every frequency.`, 4);
      return;
    }
    sealT = 0;
    sealSolid.enabled = false;
    elevator.enabled = true;
    audio.door();
    audio.sample('elevator_start', { gain: 0.5 });
    W.fx.burst(prism.position.clone(), 0xffffff, { count: 160, speed: 9, life: 1.4, size: 0.4, gravity: 0 });
    game.hud.message('All four frequencies attuned. <b>The Prism Core is open</b> — step onto the lift.', 6);
  }
  const centreLight = light(0, 8, PZ, 0xcfe4ff, 12, 32); // over the dais, under the Prism
  // the research station and the camp it grew into, as they left it (hubOffices.js)
  buildOffices(B);
  // the reactor heart hanging over the middle of it all, fed from every world (reactor.js)
  level.reactor = buildReactor(B);
  // its maintenance crew: white worker drones flying service routes from four wall bays (workerDrone.js)
  level.workers = new WorkerSwarm(W, {
    reactor: level.reactor,
    bays: [{ p: [-14, 22.5, -100], n: [0, 0, -1] }, { p: [14, 22.5, -100], n: [0, 0, -1] }, { p: [-24.5, 22.5, -104.5], n: [1, 0, 0] }, { p: [24.5, 22.5, -104.5], n: [-1, 0, 0] }],
  });

  // ---------------------------------------------------------------- director: banners, prism, seal
  let t = 0, moteT = 0;
  const mote = new THREE.Vector3(), moteDir = new THREE.Vector3(0, 1, 0);
  W.add({
    update(dt, player) {
      t += dt;
      // slow motes drifting up through the atrium while you're in it
      const p = player.pos;
      if (p.x > -25 && p.x < 25 && p.z < -99.5 && p.z > -148.5 && p.y > 2 && (moteT += dt) > 0.12) {
        moteT = 0;
        mote.set(-22 + Math.random() * 44, FLOOR + Math.random() * 10, -146 + Math.random() * 44);
        W.fx.burst(mote, Math.random() < 0.5 ? 0x9bf6ff : 0xd9c8ff, { count: 1, speed: 0.4, life: 6, size: 0.12, gravity: -0.25, drag: 0.3, spread: 0.2, dir: moteDir });
      }
      const u = game.blaster.unlocked;
      for (const b of banners) {
        const done = u[b.color], open = b.gate < 0 || u[b.gate];
        const target = done ? 1 : open ? 0.42 + 0.22 * Math.sin(t * 2.2) : 0.1;
        b.level += (target - b.level) * Math.min(1, dt * 3);
        b.m.uniforms.uLevel.value = b.level;
        b.m.uniforms.uTime.value += dt * (done ? 1 : open ? 0.6 : 0.15);
        b.emMat.emissiveIntensity = 0.1 + b.level * 1.9;
        b.emblem.rotation.y += dt * (done ? 1.2 : open ? 0.6 : 0.15);
        b.emblem.position.y = b.baseY + Math.sin(t * 1.3 + b.color) * 0.15;
        if (b.light) b.light.intensity = done ? 14 : open ? 5 * b.level : 0;
      }
      // in the Prism Core with the dais still sealed (a save restored down there: the locks aren't saved):
      // it was opened to get here, so open it again, or the lift could never take you back up
      if (sealT < 0 && p.y < -6 && regionOf(p) === 'prism') for (const L of locks) attune(L, true);
      const n = locks.filter((k) => k.lit).length;
      const open = sealT >= 0;
      prism.rotation.y += dt * (open ? 0.9 : 0.25);
      cage.rotation.y -= dt * 0.15;
      halo.rotation.z += dt * 0.1;
      halo.position.y = prism.position.y = cage.position.y = PRISM_Y + Math.sin(t * 0.7) * 0.25;
      prismMat.emissiveIntensity = 0.2 + n * 0.15 + (open ? 0.3 + Math.sin(t * 3) * 0.1 : 0);
      locks.forEach((L, i) => {
        const a = t * 0.5 + (i * Math.PI) / 2;
        L.shard.position.set(Math.cos(a) * 3.6, halo.position.y + Math.sin(t + i) * 0.3, PZ + Math.sin(a) * 3.6);
        L.shard.rotation.x += dt * 1.5;
        L.shard.rotation.y += dt;
        if (L.lit) {
          L.shardMat.color.set(COLORS[L.color].hex).multiplyScalar(2.6);
          L.nodeMat.color.set(COLORS[L.color].hex).multiplyScalar(2.2 + Math.sin(t * 3 + i) * 0.4);
          L.beamMat.opacity += (0.55 + Math.sin(t * 5 + i) * 0.15 - L.beamMat.opacity) * Math.min(1, dt * 4);
        }
      });
      centreLight.intensity = 12 + n * 3;
      sealMat.uniforms.uTime.value += dt;
      // the iris over the lift's well: shut once the car (and anyone on it) is well below the dais floor,
      // open again as soon as the car comes back up under the well
      const e = elevator, under = e.solid.min.z < L.z1 + 0.1;
      const shut = e.y < L.top - 2.8 && !(e.moving && e.target === 0 && under);
      irisSolid.enabled = iris.visible = shut;
      if (sealT >= 0 && sealT < 1) {
        sealT = Math.min(1, sealT + dt / 1.2);
        sealMat.uniforms.uAlpha.value = 1 - sealT;
        seal.scale.set(1 + sealT * 0.3, 1 - sealT, 1 + sealT * 0.3);
        seal.position.y = L.top + 1.75 * (1 - sealT);
        if (sealT >= 1) seal.visible = false;
      }
    },
  });

  // ---------------------------------------------------------------- arrival, checkpoint, hints, mood
  new Checkpoint(W, game, { pos: [0, FLOOR, -102.4], yaw: 0, size: [6, 3, 2.4] });
  // and one on each return balcony, so coming home from a world (after its shutdown) is saved in the Nexus,
  // not back at that world's last checkpoint (each is reached no later than the welcome-home message below,
  // so its 'Checkpoint' never covers that message)
  new Checkpoint(W, game, { pos: [-23.5, GAL, -136], yaw: -Math.PI / 2, size: [2.2, 3, 3] });
  new Checkpoint(W, game, { pos: [10, GAL, -146.9], yaw: Math.PI, size: [3, 3, 2.2] });
  new Checkpoint(W, game, { pos: [23.5, GAL, -136], yaw: Math.PI / 2, size: [2.2, 3, 3] });
  zoneTitle([-3, FLOOR, -104], [3, FLOOR + 3, -100], 'NEXUS', 'THE PRISM ATRIUM', '#9bf6ff', 'music_hub');
  hint([-4, FLOOR, -105], [4, FLOOR + 3, -103.6],
    `Three chroma signatures detected beyond the Nexus. ${tag(YELLOW, 'SOLAR')} lies west — its way is open.`, 6);
  let daisHintAt = -99;
  W.trigger([plaza.x1, FLOOR - 1.2, plaza.z1], [plaza.x2, FLOOR + 3, plaza.z2], () => {
    if (sealT >= 0 || W.time - daisHintAt < 25) return;
    daisHintAt = W.time;
    const n = locks.filter((k) => k.lit).length;
    game.hud.message(`The <b>Prism Core</b> is sealed by all four chroma frequencies. Shoot each lock with its color — <b>${n}/4</b> attuned.`, 5);
  }, { once: false });
  // coming home from each world: point at the next door
  const back = (min, max, c, html) => W.trigger(min, max, () => game.blaster.unlocked[c] && game.hud.message(html, 6));
  back([-24.5, GAL, -137.5], [-21.5, GAL + 3, -134.5], YELLOW,
    `Solar frequency restored. Drop through the gap in the railing: the ${tag(GREEN, 'VERDANT')} gate (north) answers to ${tag(YELLOW, 'yellow')}.`);
  back([8.5, GAL, -148], [11.5, GAL + 3, -145], GREEN,
    `Verdant frequency restored. The ${tag(BLUE, 'AZURE')} gate (east) answers to ${tag(GREEN, 'green')}.`);
  back([21.5, GAL, -137.5], [24.5, GAL + 3, -134.5], BLUE,
    'Every signature restored. Attune the four locks on the dais under the reactor — <b>the Prism Core awaits.</b>');
  // a mood volume just inside every doorway (and on the elevator, for the ride back up)
  const mood = { music: 'music_hub', ambient: 'amb_hub', atmosphere: 'hub' };
  area([-1.5, FLOOR, -103], [1.5, FLOOR + 3.2, -100], mood); // red entry
  area([-24.5, FLOOR, -113.5], [-21.5, FLOOR + 3.2, -110.5], mood); // Solar entry
  area([-24.5, GAL, -137.5], [-21.5, GAL + 3.2, -134.5], mood); // Solar return
  area([-11.5, FLOOR, -148], [-8.5, FLOOR + 3.2, -145], mood); // Verdant entry
  area([8.5, GAL, -148], [11.5, GAL + 3.2, -145], mood); // Verdant return
  area([21.5, FLOOR, -113.5], [24.5, FLOOR + 3.2, -110.5], mood); // Azure entry
  area([21.5, GAL, -137.5], [24.5, GAL + 3.2, -134.5], mood); // Azure return
  area([L.x1, L.top, L.z1], [L.x2, L.top + 2.5, L.z2], mood); // the Prism lift, arriving back up

  // calm twilight: teal horizon, indigo zenith, a slow aurora over the open roof
  level.atmospheres.hub = {
    fog: 0x16263a, fogNear: 45, fogFar: 240,
    skyTop: [0.02, 0.04, 0.13], skyMid: [0.05, 0.14, 0.24], skyHorizon: [0.22, 0.4, 0.48], aurora: 0.4, stars: 1,
    hemiSky: 0xb8dcff, hemiGround: 0x1e2a3c, hemiIntensity: 1.0,
    sunColor: 0xd2e6ff, sunIntensity: 0.9, sunDir: [-0.35, 1, 0.45],
    exposure: 1.0, bloom: 0.5,
  };
  // the void around the Hub's foundations: anything that falls out of the world beside the Hub or the
  // court dies here instead of landing on the Prism Core's roof
  killZone([-32, -9.6, -208], [32, -5, -117]);
  devStart('hub', [0, FLOOR, -103], 0, [RED]);
}
