// Solar ground enemies, built by the Lumen for the desert: the Scarab (a six-legged burrowing excavator
// drone that tunnels at you as a moving sand mound and bursts out in a pounce) and the Mummy (an
// unnervingly tall stilt-legged android that hurls curving sand-plasma bolts, sidesteps and lunges, strides
// out into the quicksand, and raises a hard-light shield of another color). Both are restockable (see
// groundKit.js). House look: warm ceramic armor over a graphite frame, seams and sensors lit in the
// enemy's color.
import * as THREE from 'three';
import { COLORS, YELLOW, RED } from '../colors.js';
import { audio } from '../audio.js';
import { director } from '../combat/director.js';
import { GroundEnemy, Trooper, RigDef, Bolt, sfx, falloff, rnd, esfx, barks, angleTo, isQuicksand } from './groundKit.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const TAU = Math.PI * 2;
const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const SAND = 0xc9a26a;
const DUST = 0xa88758;

const glowHex = (color, k = 2.4) => new THREE.Color(COLORS[color].hex).multiplyScalar(k);
const sandPuff = (fx, p, spread = 1, up = 1, size = 0.5, life = 1) =>
  fx.puff(p, rnd(-spread, spread), rnd(0.3, 1) * up, rnd(-spread, spread), _c.set(DUST), 0.45, life * rnd(0.7, 1.2), size * rnd(0.7, 1.3), 3);

// The hard-surface materials both machines share (never change per instance, so one set for every
// scarab and mummy; never disposed). The lit parts (glow, thrusters, coils) are per instance: they take
// the enemy's color and pulse with its tells.
let SHARED = null;
function sharedMats() {
  SHARED ??= {
    armor: new THREE.MeshStandardMaterial({ color: 0xb2ab9c, metalness: 0.3, roughness: 0.42, flatShading: true }), // warm ceramic
    frame: new THREE.MeshStandardMaterial({ color: 0x1d1f26, metalness: 0.8, roughness: 0.4, flatShading: true }), // graphite hull, frame and joints
    steel: new THREE.MeshStandardMaterial({ color: 0x8d929c, metalness: 0.95, roughness: 0.24, flatShading: true }), // cutters, pistons
    cable: new THREE.MeshStandardMaterial({ color: 0x1b1c22, metalness: 0.4, roughness: 0.55 }),
  };
  return SHARED;
}

// a six-sided prism lying along z with a flat top (front radius rf at +z, back rb), squashed to (sx, sy)
const hexSeg = (rf, rb, len, sx, sy, open = false) =>
  new THREE.CylinderGeometry(rf, rb, len, 6, 1, open).rotateY(Math.PI / 6).rotateX(Math.PI / 2).scale(sx, sy, 1);
// its upper half (the armor cap over a graphite hull)
const hexTop = (rf, rb, len, sx, sy) =>
  new THREE.CylinderGeometry(rf, rb, len, 3, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(sx, sy, 1);
// a rod from a to b (both [x, y, z]) of radius r
function rod(r, a, b, mat, node, R, sides = 6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  R.add(node, mat, new THREE.CylinderGeometry(r, r, len, sides), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [e.x, e.y, e.z]);
}

// ================================================================ SCARAB
// A burrowing excavator drone: a segmented ceramic carapace (three hex armor sections with glowing seams
// and a lit spine in its color), a graphite radiator of heat-sink fins on its tail, a cutter head up front
// (a spinning drill between two serrated mandible cutters), a sensor cluster of three lenses and a mast,
// six jointed legs (the front pair are digging spades) and two dust jets at the back. It lies buried as a
// small mound with only its sensor periscope showing, lens lit in its color; when it notices you the
// mound ploughs toward you, stops, swells and sprays (0.6 s: the drill and its head break the surface, and
// it can be shot from then on) and the drone bursts out in a pounce, armor vanes flaring over thrusters.
// On the surface it scuttles in, rears up (0.5 s: mandibles spread, drill spinning up, seams flaring) and
// pounces again, then drills back in under a spray from its jets. A wrong-color hit while it's on the
// ground flips it onto its back for a moment. 1 hp.
// Shielded (colorShield.js), energy plating of hard-light hex tiles arches over its carapace, 2 hits a
// layer, and breaking a layer flips it: { color: YELLOW, shields: [RED] }, or the legacy palette
// `color: [YELLOW, RED]` (the body first, the last color the outer shell).
const EMERGE_T = 0.6;
const SCARAB_SCALE = 1.3;
const CROUCH_T = 0.5;
const DIG_T = 0.7;
const SCARAB_LEGS = [
  [0.22, 0.24, 0.75], [0.27, 0.02, 0.05], [0.24, -0.2, -0.6],
  [-0.22, 0.24, 0.75], [-0.27, 0.02, 0.05], [-0.24, -0.2, -0.6],
];

const SCARAB = new RigDef((r) => {
  r.node('body', null, [0, 0.3, 0]);
  // the carapace: head, middle and tail sections, each a flattened hex prism (a graphite hull with a
  // ceramic armor cap)
  r.add('body', 'frame', hexSeg(0.17, 0.2, 0.2, 1.25, 0.62), [0, -0.01, 0.37]);
  r.add('body', 'frame', hexSeg(0.28, 0.3, 0.34, 1.2, 0.6), [0, 0.0, 0.08]);
  r.add('body', 'frame', hexSeg(0.27, 0.15, 0.32, 1.2, 0.58), [0, -0.01, -0.25]);
  r.add('body', 'armor', hexTop(0.18, 0.21, 0.2, 1.25, 0.62), [0, -0.005, 0.37]);
  r.add('body', 'armor', hexTop(0.29, 0.31, 0.34, 1.2, 0.6), [0, 0.005, 0.08]);
  r.add('body', 'armor', hexTop(0.28, 0.16, 0.32, 1.2, 0.58), [0, -0.005, -0.25]);
  // graphite bands under each section, and the glowing seams between them
  r.add('body', 'frame', hexSeg(0.215, 0.215, 0.06, 1.25, 0.66), [0, -0.01, 0.255]);
  r.add('body', 'frame', hexSeg(0.29, 0.29, 0.06, 1.2, 0.62), [0, -0.005, -0.1]);
  r.add('body', 'glow', hexSeg(0.222, 0.222, 0.018, 1.25, 0.66, true), [0, -0.01, 0.255]);
  r.add('body', 'glow', hexSeg(0.297, 0.297, 0.018, 1.2, 0.62, true), [0, -0.005, -0.1]);
  // the lit spine
  r.box('body', 'glow', [0.028, 0.012, 0.5], [0, 0.163, 0.02]);
  r.box('body', 'frame', [0.06, 0.008, 0.52], [0, 0.158, 0.02]);
  // the radiator: heat-sink fins on the tail, glowing between them
  r.box('body', 'glow', [0.17, 0.012, 0.2], [0, 0.135, -0.24]);
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.038, h = 0.075 - Math.abs(i - 2) * 0.012;
    r.box('body', 'frame', [0.012, h, 0.24], [x, 0.135 + h / 2, -0.25]);
  }
  // the belly plate, and the core showing through it (seen when it's flipped)
  r.box('body', 'frame', [0.36, 0.03, 0.6], [0, -0.165, 0.05]);
  r.box('body', 'glow', [0.07, 0.012, 0.3], [0, -0.183, 0.05]);
  for (const s of [-1, 1]) r.box('body', 'glow', [0.012, 0.012, 0.4], [s * 0.12, -0.183, 0.05]);
  // the cutter head and its sensor cluster
  r.box('body', 'frame', [0.24, 0.1, 0.1], [0, -0.02, 0.5]);
  r.box('body', 'frame', [0.2, 0.03, 0.12], [0, 0.04, 0.49], [-0.25, 0, 0]);
  r.node('sensor', 'body', [0, 0.085, 0.42]);
  r.box('sensor', 'frame', [0.12, 0.05, 0.08], [0, 0, 0]);
  r.box('sensor', 'frame', [0.13, 0.03, 0.02], [0, 0.0, 0.045]);
  for (const [x, y, s] of [[-0.036, -0.002, 0.021], [0.036, -0.002, 0.021], [0, 0.018, 0.016]]) r.add('sensor', 'glow', new THREE.SphereGeometry(s, 8, 6), [x, y, 0.055]);
  rod(0.006, [0.04, 0.02, -0.02], [0.05, 0.16, -0.06], 'frame', 'sensor', r, 4);
  r.add('sensor', 'glow', new THREE.SphereGeometry(0.012, 6, 4), [0.05, 0.165, -0.06]);
  // the drill
  r.node('drill', 'body', [0, -0.03, 0.55]);
  r.add('drill', 'steel', new THREE.ConeGeometry(0.06, 0.2, 6).rotateX(Math.PI / 2), [0, 0, 0.1]);
  for (let i = 0; i < 3; i++) r.box('drill', 'frame', [0.012, 0.075, 0.12], [0, 0, 0.07], [0, 0, (i / 3) * Math.PI]); // flutes
  r.add('drill', 'frame', new THREE.CylinderGeometry(0.07, 0.07, 0.03, 8).rotateX(Math.PI / 2), [0, 0, 0]);
  r.add('drill', 'glow', new THREE.TorusGeometry(0.07, 0.009, 4, 12), [0, 0, 0.012]);
  // the mandible cutters, serrated on the inside
  for (const [name, s] of [['mandL', 1], ['mandR', -1]]) {
    r.node(name, 'body', [s * 0.1, -0.04, 0.52]);
    r.box(name, 'steel', [0.035, 0.04, 0.16], [0, 0, 0.07], [0, -s * 0.25, 0]);
    r.box(name, 'steel', [0.03, 0.035, 0.1], [-s * 0.035, 0, 0.17], [0, -s * 0.85, 0]);
    for (let i = 0; i < 3; i++) r.add(name, 'steel', new THREE.ConeGeometry(0.012, 0.04, 4), [-s * (0.012 + i * 0.008), 0, 0.04 + i * 0.05], [0, 0, s * Math.PI / 2]);
  }
  // the dust jets
  for (const s of [-1, 1]) {
    r.add('body', 'frame', new THREE.CylinderGeometry(0.035, 0.042, 0.09, 8).rotateX(Math.PI / 2), [s * 0.085, -0.02, -0.44]);
    r.add('body', 'glow', new THREE.CylinderGeometry(0.024, 0.024, 0.01, 8).rotateX(Math.PI / 2), [s * 0.085, -0.02, -0.488]);
  }
  // armor vanes over the middle section: they flare open over thrusters when it flies
  for (const [name, s] of [['wingL', 1], ['wingR', -1]]) {
    r.node(name, 'body', [s * 0.035, 0.162, 0.08]);
    r.box(name, 'armor', [0.17, 0.022, 0.3], [s * 0.095, 0, 0], [0, 0, -s * 0.22]);
    r.box(name, 'glow', [0.012, 0.024, 0.26], [s * 0.18, -0.02, 0], [0, 0, -s * 0.22]);
    r.box(name, 'wing', [0.14, 0.006, 0.24], [s * 0.095, -0.018, 0], [0, 0, -s * 0.22]);
  }
  // six jointed legs; the front pair end in digging spades
  SCARAB_LEGS.forEach(([x, z, splay], i) => {
    const s = x > 0 ? 1 : -1;
    const leg = 'leg' + i;
    r.node(leg, 'body', [x, -0.06, z], { rot: [0, (s > 0 ? 0 : Math.PI) - s * splay, 0] });
    r.add(leg, 'frame', new THREE.CylinderGeometry(0.04, 0.04, 0.07, 8), [0.0, 0.0, 0], [0, 0, Math.PI / 2]);
    r.box(leg, 'armor', [0.26, 0.055, 0.07], [0.12, 0.06, 0], [0, 0, 0.45]);
    r.box(leg, 'frame', [0.2, 0.018, 0.018], [0.13, 0.02, 0.03], [0, 0, 0.45]);
    r.add(leg, 'frame', new THREE.CylinderGeometry(0.03, 0.03, 0.08, 6), [0.235, 0.115, 0], [Math.PI / 2, 0, 0]);
    r.box(leg, 'frame', [0.36, 0.04, 0.045], [0.34, -0.06, 0], [0, 0, -1.0]);
    if (i % 3 === 0) {
      r.box(leg, 'frame', [0.13, 0.018, 0.085], [0.44, -0.2, 0], [0, 0, -1.0]);
      r.add(leg, 'frame', new THREE.ConeGeometry(0.03, 0.08, 4), [0.5, -0.27, 0], [0, 0, -2.57]);
    } else r.add(leg, 'frame', new THREE.ConeGeometry(0.028, 0.09, 4), [0.455, -0.215, 0], [0, 0, Math.PI]);
  });
});

// the periscope that shows above the mound while it's buried (not shootable: it's not on the drone)
const SCOPE = new RigDef((r) => {
  r.node('scope', null, [0, 0, 0]);
  r.add('scope', 'frame', new THREE.CylinderGeometry(0.022, 0.03, 0.4, 6), [0, 0.2, 0]);
  r.box('scope', 'frame', [0.11, 0.075, 0.12], [0, 0.42, 0.01]);
  r.box('scope', 'glow', [0.09, 0.03, 0.012], [0, 0.425, 0.072]);
  r.add('scope', 'glow', new THREE.TorusGeometry(0.035, 0.008, 4, 10).rotateX(Math.PI / 2), [0, 0.37, 0.01]);
  r.add('scope', 'frame', new THREE.CylinderGeometry(0.004, 0.004, 0.14, 4), [0.03, 0.51, -0.02]);
  r.add('scope', 'glow', new THREE.SphereGeometry(0.01, 6, 4), [0.03, 0.58, -0.02]);
});

let moundGeo = null;
let moundMat = null;
let scarabProxyGeo = null;
let proxyMat = null;

export class Scarab extends GroundEnemy {
  constructor(world, opts) {
    super(world, opts, { radius: 0.6, height: 0.7, hp: 1, range: 18, color: YELLOW, patrol: 4, accel: 35, shieldHp: 2 });
    this.burrows = opts.burrow ?? true;
    this.legPhase = Math.random() * 10;
    this.pounces = 0;
    this.leapCool = 0;
    this.waitT = rnd(0.5, 2);
    this.target = null;
    this.pulse = 0;
    this.drillSpin = 0;
    this.mandOpen = 0;
    const S = sharedMats();
    this.m = {
      armor: S.armor,
      frame: S.frame,
      steel: S.steel,
      glow: this.mat(new THREE.MeshBasicMaterial({ color: 0xffffff })),
      wing: this.mat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })),
    };
    // the drone (shootable) and its sand mound (not) are separate children of the group
    const rig = SCARAB.build(this.m);
    this.n = rig.n;
    this.legs = SCARAB_LEGS.map((_, i) => rig.n['leg' + i]);
    this.beetle = rig.root;
    rig.root.scale.setScalar(SCARAB_SCALE);
    scarabProxyGeo ??= new THREE.SphereGeometry(0.55, 8, 6).scale(0.9, 0.7, 1.15);
    proxyMat ??= new THREE.MeshBasicMaterial({ visible: false });
    const proxy = new THREE.Mesh(scarabProxyGeo, proxyMat);
    proxy.position.set(0, 0.3, 0.05);
    this.beetle.add(proxy);
    moundGeo ??= new THREE.SphereGeometry(0.6, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    moundMat ??= new THREE.MeshStandardMaterial({ color: SAND, roughness: 1, flatShading: true });
    this.mound = new THREE.Mesh(moundGeo, moundMat);
    this.mound.scale.set(1, 0.32, 1.25);
    this.scope = SCOPE.build(this.m).root;
    this.scope.position.set(0, 0.05, 0.15);
    this.group.add(this.beetle, this.mound, this.scope);
    this.applyColor();
    this.attach(this.beetle);
    this.setState(this.burrows ? 'buried' : 'surface');
    this.showBuried(this.burrows);
  }

  applyColor() {
    this.m.glow.color.copy(glowHex(this.color));
    this.m.wing.color.copy(glowHex(this.color, 1.2));
  }

  // the energy plating: a dome over the carapace that rides (and flips) with the body
  shieldView() {
    return { parent: this.n.body, center: [0, -0.07, 0.06], size: [0.42, 0.36, 0.66], dome: -0.12, detail: 2, spin: 0 };
  }

  showBuried(buried) {
    this.beetle.visible = !buried;
    this.mound.visible = buried;
    this.scope.visible = buried;
  }

  onAlert() {
    if (this.state === 'buried') this.setState('tunnel');
    else if (this.state === 'surface') this.setState('scuttle');
  }

  onCalm() {
    if (this.state === 'tunnel') this.setState('buried');
  }

  // where its dust jets are (world space), side s = ±1
  jetPos(s, out) {
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    const back = -0.62, x = s * 0.11;
    return out.set(this.pos.x + sn * back + c * x, this.pos.y + 0.36 + this.beetle.position.y, this.pos.z + c * back - sn * x);
  }

  // the jets blast dust out behind it (digging in, bursting out)
  jetDust(k = 1) {
    const fx = this.world.fx;
    const bx = -Math.sin(this.yaw), bz = -Math.cos(this.yaw);
    for (const s of [-1, 1]) {
      this.jetPos(s, _w);
      fx.puff(_w, bx * 3 * k + rnd(-0.6, 0.6), rnd(0.4, 1.4), bz * 3 * k + rnd(-0.6, 0.6), _c.set(DUST), 0.5, rnd(0.5, 0.9), rnd(0.2, 0.35), 3.5);
    }
  }

  think(dt, player) {
    const s = this.state;
    const buried = s === 'buried' || s === 'tunnel';
    this.leapCool -= dt;
    this.move.set(0, 0, 0);
    if (!buried && s !== 'dig' && this.touches(player, 0.15)) player.damage(1, 'scarab');
    const d = this.toPlayer(player, _v);
    const faceYaw = Math.atan2(_v.x, _v.z);
    if (s === 'buried') {
      if (this.aggro) this.setState('tunnel');
    } else if (s === 'tunnel') {
      // plough toward you under the sand
      this.move.copy(_v).multiplyScalar(4.2);
      this.turnToward(faceYaw, 5, dt);
      this.digT = (this.digT || 0) - dt;
      if (this.digT <= 0 && this.dist < 25) {
        this.digT = 0.16;
        this.world.fx.puff(this.pos, rnd(-0.6, 0.6), rnd(0.6, 1.4), rnd(-0.6, 0.6), _c.set(DUST), 0.45, 1, 0.45, 3);
        const g = 0.3 * falloff(this.dist, 3, 20);
        sfx('scarab_dig', g, { synth: (gg) => audio.noise({ dur: 0.18, gain: 0.25 * gg, freq: 380, q: 0.7, type: 'lowpass' }) });
      }
      const stuck = this.blockedBy?.ledge || this.blockedBy?.x || this.blockedBy?.z;
      this.stuckT = stuck ? (this.stuckT || 0) + dt : 0;
      this.attackWait = Math.max(0, (this.attackWait || 0) - dt);
      const ready = (d < 4.5 && Math.abs(player.pos.y - this.pos.y) < 2.5) || (this.stuckT > 1.2 && this.dist < 8) || this.stateT > 6;
      if (ready && d < 4.5) this.move.set(0, 0, 0); // close enough: lurk until it may strike
      // (bursting out and the pounce happen only while it holds one of the director's attack tokens)
      if (ready && this.attackWait <= 0 && this.mayAttack(EMERGE_T + 0.9)) this.startEmerge();
      else if (this.stuckT > 3) this.stuckT = 0; // keep pacing the edge
    } else if (s === 'emerge') {
      this.turnToward(faceYaw, 6, dt);
      if (Math.random() < dt * 30) {
        _w.copy(this.pos).y += 0.1;
        sandPuff(this.world.fx, _w, 1.2, 2.5, 0.4, 0.8);
        this.world.fx.burst(_w, SAND, { count: 2, speed: 4, life: 0.6, size: 0.15, gravity: 12, dir: UP });
      }
      if (this.stateT >= EMERGE_T) this.pounce(player, true);
    } else if (s === 'leap') {
      return;
    } else if (s === 'land') {
      if (this.stateT > 0.35) this.setState('scuttle');
    } else if (s === 'flipped') {
      if (this.stateT > 1.3) {
        this.setState('scuttle');
        this.world.fx.burst(this.pos, DUST, { count: 6, speed: 2, life: 0.4, size: 0.3, gravity: 3 });
      }
    } else if (s === 'surface') {
      // a surface scarab with nothing to chase pokes about its patch
      this.patrolStep(dt);
      if (this.aggro) this.setState('scuttle');
    } else if (s === 'scuttle') {
      this.turnToward(faceYaw, 7, dt);
      this.move.copy(_v).multiplyScalar(d > 2 ? 3.2 : 0);
      this.lostSight = this.sees ? 0 : (this.lostSight || 0) + dt;
      if (this.burrows && (this.pounces >= 2 || this.lostSight > 2) && this.stateT > 0.6) this.setState('dig');
      else if (!this.aggro && !this.burrows) this.setState('surface');
      else if (this.sees && this.dist < 7.5 && this.leapCool <= 0 && this.stateT > 0.5) {
        if (this.mayAttack(CROUCH_T + 0.9)) this.setState('crouch');
        else this.leapCool = this.attackWait;
      }
    } else if (s === 'crouch') {
      this.turnToward(faceYaw, 9, dt);
      if (this.stateT < dt * 1.5) this.chitter();
      if (this.stateT >= CROUCH_T) {
        if (this.sees) this.pounce(player, false);
        else {
          director.release(this);
          this.setState('scuttle');
        }
      }
    } else if (s === 'dig') {
      if (Math.random() < dt * 25) sandPuff(this.world.fx, this.pos, 1, 1.5, 0.45, 0.9);
      if (this.stateT < DIG_T * 0.6 && Math.random() < dt * 30) this.jetDust(1);
      if (this.stateT >= DIG_T) {
        this.pounces = 0;
        this.showBuried(true);
        this.setState(this.aggro ? 'tunnel' : 'buried');
      }
    }
  }

  patrolStep(dt) {
    if (!this.target) {
      this.waitT -= dt;
      if (this.waitT <= 0) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * this.patrol;
        const x = this.home.x + Math.cos(a) * r, z = this.home.z + Math.sin(a) * r;
        if (this.pathClear(x, z, 0.4)) this.target = new THREE.Vector3(x, 0, z);
        this.waitT = rnd(0.6, 2);
      }
      return;
    }
    _w.set(this.target.x - this.pos.x, 0, this.target.z - this.pos.z);
    const len = _w.length();
    if (len < 0.3 || this.blockedBy?.ledge || this.blockedBy?.x || this.blockedBy?.z) {
      this.target = null;
      return;
    }
    _w.divideScalar(len);
    this.move.copy(_w).multiplyScalar(1.6);
    this.turnToward(Math.atan2(_w.x, _w.z), 5, dt);
  }

  chitter() {
    const g = 0.4 * falloff(this.dist, 3, 24);
    sfx('scarab_chitter', g, { synth: (gg) => {
      for (let i = 0; i < 6; i++) audio.noise({ dur: 0.025, gain: 0.14 * gg, freq: 3200 + i * 300, q: 4, delay: i * 0.045 });
    } });
  }

  startEmerge() {
    this.setState('emerge');
    this.beetle.visible = true;
    this.scope.visible = false;
    this.chitter();
    const g = 0.5 * falloff(this.dist, 3, 26);
    sfx('scarab_emerge', g, { synth: (gg) => audio.noise({ dur: 0.6, gain: 0.25 * gg, freq: 500, f2: 2500, q: 0.8 }) });
  }

  pounce(player, fromSand) {
    const T = THREE.MathUtils.clamp(0.3 + this.dist * 0.05, 0.38, 0.7);
    _w.copy(player.pos);
    _w.y += player.eye * 0.55 - 0.3;
    _w.x += player.vel.x * T * 0.5;
    _w.z += player.vel.z * T * 0.5;
    const v = this.leapVelocity(this.aimAt(this.center(new THREE.Vector3()), _w), T, new THREE.Vector3());
    if (v.length() > 16) v.setLength(16);
    this.vel.copy(v);
    this.grounded = false;
    this.ground = null;
    this.pounces++;
    this.leapCool = rnd(1, 1.6) * this.rage.cool;
    this.showBuried(false);
    this.setState('leap');
    const fx = this.world.fx;
    if (fromSand) {
      // bursting out of the sand
      for (let i = 0; i < 10; i++) sandPuff(fx, this.pos, 2, 2, 0.6, 1.2);
      fx.burst(this.pos, SAND, { count: 30, speed: 6, life: 0.8, size: 0.2, gravity: 14, dir: UP });
      fx.ring(_w.copy(this.pos).setY(this.pos.y + 0.05), UP, DUST, { size: 0.3, end: 2.5, life: 0.4, thick: 0.25, k: 0.6 });
    }
    this.jetDust(1.5);
    const g = 0.45 * falloff(this.dist, 3, 24);
    sfx('scarab_pounce', g, { alt: 'crab_leap', synth: (gg) => audio.noise({ dur: 0.3, gain: 0.2 * gg, freq: 1500, f2: 4500, q: 1 }) });
  }

  onLand() {
    if (this.state !== 'leap') return;
    this.setState('land');
    this.mandOpen = -0.3; // the cutters snap shut
    sandPuff(this.world.fx, this.pos, 1, 0.8, 0.4, 0.7);
  }

  animate(dt) {
    const n = this.n;
    const s = this.state;
    const crouch = s === 'crouch' ? Math.min(1, this.stateT / 0.2) : 0;
    // the drill: idling, spun up to rear and burst out, screaming while it digs
    const spinT = s === 'emerge' || s === 'dig' || s === 'leap' ? 40 : s === 'crouch' ? 10 + 30 * crouch : s === 'flipped' ? 18 : 3;
    this.drillSpin += (spinT - this.drillSpin) * Math.min(1, dt * 6);
    n.drill.rotation.z += this.drillSpin * dt;
    if (s === 'buried' || s === 'tunnel') {
      // the mound: breathing at rest, rolling along when it moves; the periscope scans, or leads the way
      const moving = s === 'tunnel';
      this.mound.scale.set(1 + Math.sin(this.t * 9) * 0.05 * (moving ? 1 : 0.3), 0.3 + Math.sin(this.t * 2.3) * 0.02 + (moving ? Math.abs(Math.sin(this.t * 12)) * 0.06 : 0), 1.25);
      this.mound.position.y = 0;
      this.scope.rotation.y = moving ? Math.sin(this.t * 7) * 0.12 : Math.sin(this.t * 0.6) * 1.1 + Math.sin(this.t * 1.7) * 0.25;
      this.scope.position.y = moving ? 0.0 + Math.abs(Math.sin(this.t * 12)) * 0.03 : 0.04 + Math.sin(this.t * 2.3) * 0.015;
      this.scope.rotation.x = moving ? 0.25 : 0;
      this.m.glow.color.copy(glowHex(this.color, 2.4 + (moving ? Math.sin(this.t * 14) * 0.6 : 0)));
      return;
    }
    if (s === 'emerge') {
      // the mound swells and shakes; the cutter head breaks the surface
      const k = this.stateT / EMERGE_T;
      this.mound.visible = true;
      this.mound.scale.set(1.1 + k * 0.4, 0.35 + k * 0.35 + Math.sin(this.t * 60) * 0.04, 1.35 + k * 0.3);
      this.mound.position.x = Math.sin(this.t * 47) * 0.04;
      this.beetle.position.y = -0.75 + 0.6 * k * (2 - k);
      n.body.rotation.x = -0.5;
    } else if (s === 'dig') {
      const k = this.stateT / DIG_T;
      this.beetle.position.y = -0.8 * k * k;
      n.body.rotation.x = 0.4 * Math.min(1, k * 3);
      this.mound.visible = k > 0.5;
      this.mound.scale.set(k, 0.3 * k, 1.25 * k);
    } else {
      this.beetle.position.y = 0;
      this.mound.visible = false;
    }
    if (s === 'dig' && this.stateT > DIG_T * 0.55) this.beetle.visible = false; // under: no longer shootable
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const air = this.grounded ? 0 : 1;
    const flipped = s === 'flipped';
    const k = Math.min(1, speed / 2) * (1 - air);
    this.legPhase += dt * (5 + speed * 7) * (k > 0.05 || flipped ? 1 : 0) * (flipped ? 3 : 1);
    this.legs.forEach((leg, i) => {
      const tri = (i % 3 + (i < 3 ? 0 : 1)) % 2;
      const ph = this.legPhase + tri * Math.PI;
      const base = (leg.userData.baseY ??= leg.rotation.y);
      leg.rotation.y = base + Math.sin(ph) * (flipped ? 0.6 : 0.35 * k);
      leg.rotation.z = Math.max(0, Math.cos(ph)) * 0.4 * (flipped ? 1 : k) + air * 0.5 + crouch * 0.3 + (flipped ? 0.5 : 0);
    });
    // a servo tick for each tripod of legs swinging through (rate-limited across every scarab)
    const tick = Math.sin(this.legPhase) >= 0 ? 1 : -1;
    if (tick !== this.tickSign) {
      this.tickSign = tick;
      if ((k > 0.1 || flipped) && this.dist < 14) esfx('servo_tick', this.pos, flipped ? 1 : 0.4 + 0.6 * k, rnd(0.8, 1.0));
    }
    // body: rears up to pounce, pitches along the arc, flips on its back when stunned
    const pitch = air ? -Math.atan2(this.vel.y, Math.hypot(this.vel.x, this.vel.z) + 0.01) * 0.6 : s === 'emerge' ? -0.5 : s === 'dig' ? n.body.rotation.x : -crouch * 0.45;
    n.body.rotation.x = THREE.MathUtils.lerp(n.body.rotation.x, pitch, Math.min(1, dt * 12));
    const roll = flipped ? Math.PI : 0;
    n.body.rotation.z = THREE.MathUtils.lerp(n.body.rotation.z, roll + (crouch ? Math.sin(this.t * 50) * 0.04 : 0), Math.min(1, dt * 14));
    n.body.position.y = 0.3 + (flipped ? 0.12 : 0) - crouch * 0.06 + Math.abs(Math.sin(this.legPhase * 2)) * 0.015 * k;
    // the mandible cutters: spread wide to strike, open in flight, snap shut on landing, a slow chew otherwise
    const openT = crouch ? 1 + Math.sin(this.t * 30) * 0.08 : air ? 0.8 : s === 'emerge' ? 0.6 : flipped ? 0.5 + Math.sin(this.t * 20) * 0.4 : Math.max(0, Math.sin(this.t * 3)) * 0.18;
    this.mandOpen += (openT - this.mandOpen) * Math.min(1, dt * 14);
    n.mandL.rotation.y = this.mandOpen * 0.55;
    n.mandR.rotation.y = -this.mandOpen * 0.55;
    // the sensor cluster cocks toward you
    const player = this.world.game.player;
    const want = clamp(angleTo(this.yaw, Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z)), -0.7, 0.7);
    n.sensor.rotation.y += ((this.aggro ? want : Math.sin(this.t * 0.9) * 0.4) - n.sensor.rotation.y) * Math.min(1, dt * 8);
    // armor vanes flare over the thrusters in flight; twitch while it rears
    const open = air ? 1 : crouch * 0.25;
    for (const [w, sgn] of [[n.wingL, 1], [n.wingR, -1]]) {
      w.rotation.z = sgn * open * (0.75 + Math.sin(this.t * 90) * 0.12);
    }
    this.m.wing.opacity = 0.12 + open * 0.75;
    this.pulse = Math.max(0, this.pulse - dt * 4);
    if (this.immuneFlash > 0) this.m.glow.color.setRGB(0.7, 0.7, 0.8);
    else this.m.glow.color.copy(glowHex(this.color, 2.4 + crouch * 1.5 + (s === 'emerge' ? 1.5 : 0)));
  }

  onHit(color, hit) {
    if (this.dead) return undefined;
    if (!this.aggro) {
      this.aggro = true;
      this.onAlert();
    }
    if (color !== this.color) {
      this.knockOver();
      return this.immune(hit);
    }
    this.hp--;
    this.hitSparks(hit);
    audio.droneHit(Math.max(0.5, falloff(this.dist, 6, 40)));
    if (this.hp > 0) {
      this.flash = 1;
      esfx('robot_pain_light', this.pos, 0.8, 1.6);
      return 'hit';
    }
    this.die(hit);
    barks.died(this);
    return 'kill';
  }

  // a wrong color on its plating knocks it over just the same; a broken layer always does
  shieldHit(color, hit) {
    const r = super.shieldHit(color, hit);
    if (r === 'immune') this.knockOver();
    return r;
  }

  onShieldStagger() {
    this.knockOver();
  }

  // knocked onto its back while it's on the ground
  knockOver() {
    if (!this.grounded || !['scuttle', 'crouch', 'land', 'surface'].includes(this.state)) return;
    if (this.state === 'crouch') director.release(this);
    this.setState('flipped');
    this.world.fx.burst(this.pos, DUST, { count: 8, speed: 3, life: 0.4, size: 0.3, gravity: 4 });
  }

  // burst apart: the carapace and legs fly, ceramic shards, sparks and a puff of sand
  die(hit) {
    this.dead = true;
    this.shield?.dispose(); // (a shell still flying apart goes with it)
    director.release(this);
    const c = this.center(new THREE.Vector3());
    const fx = this.world.fx;
    const hex = COLORS[this.color].hex;
    fx.flash(c, hex, { size: 1.2, life: 0.15, k: 1.8, hot: 0.6 });
    fx.burst(c, hex, { count: 30, speed: 7, life: 0.6, size: 0.3, gravity: 8 });
    fx.burst(c, 0xe4ddcc, { count: 20, speed: 6, life: 0.7, size: 0.2, gravity: 12, mode: 'shard' });
    fx.sparks(c, UP, 0xffd9a0, { count: 14, speed: 9, spread: 2, life: 0.4 });
    for (let i = 0; i < 5; i++) sandPuff(fx, c, 1.5, 1.2, 0.5, 1);
    const g = Math.max(0.3, falloff(this.dist, 5, 45));
    sfx('scarab_crunch', 0.7 * g, { alt: 'shatter', altRate: 1.5, altGain: 0.6, synth: () => audio.shatter() });
    this.onDeath?.(this);
    const push = hit?.dir ? hit.dir.clone().multiplyScalar(3) : null;
    this.scatter([...this.legs, this.n.wingL, this.n.wingR, this.n.mandL, this.n.mandR, this.n.body], push, { speed: 5, up: 0.9, life: 1.3 });
  }

  cool(t) {
    const k = Math.max(0, 1 - t / 0.8);
    this.m.glow.color.copy(glowHex(this.color, 2.4 * k + 0.05));
  }

  resetExtra() {
    this.pounces = 0;
    this.leapCool = 0;
    this.beetle.position.y = 0;
    if (this.burrows) {
      this.showBuried(true);
      this.setState('buried');
    } else {
      this.showBuried(false);
      this.setState('surface');
    }
  }

  idleFar() {}
}

// ================================================================ MUMMY
// An unnervingly tall stilt-walker, twice your height: long digitigrade stilt legs (a ceramic thigh, a
// telescoping graphite shin with a lit collar, a backward-folding ankle and a small pointed foot), a bare
// spine for a waist, a slim wedge of a chest up high, long thin actuator arms with three-fingered hands,
// and a sensor head craned forward on a long neck, its slit visor lit in its color. Cable tethers swing
// from its head, elbows, wrist and hips. A forked emitter on its back charges its bolts. It walks slowly,
// in long strides, swaying over each planted stilt, while the head stays level and locked on you; it
// turns its body slowly but its head smoothly, with the odd twitch. It keeps its distance, and its stilts
// carry it out over quicksand without sinking: it likes to stand out in it, so you fight from the edge.
// It hurls fans of three sand-plasma bolts that curve in toward you (arms reaching up and the emitter's
// prongs charging a ball of light between them for 0.65 s first; the bolts are shootable in its color),
// sidesteps and lunges low and sideways when you aim, and when hurt may raise a hard-light shield (arms
// crossed, a ring of its color at its feet and motes rising for 0.5 s first) of ANOTHER color: while it's
// up, only that color does anything (three hits shatter it and stagger it); it drops after ~2.4 s. Under
// a low ceiling it folds down onto bent stilts and hunches. Its chest and head are the big target, but a
// hit anywhere on it counts. 5 hp.
const CAST_T = 0.65;
const WARD_T = 0.5;
const SHIELD_T = 2.4;
const HIP = 2.4; // hip height, standing tall
const LOW_HIP = 1.15; // hip height folded right down (under a low ceiling)
const THIGH = 0.95;
const SHIN = 1.1;
const META = 0.5;
const HIP_X = 0.13; // the hip joints either side of the pelvis
const FOOT_X = 0.2; // the feet a little wider than the hips
const STRIDE = 1.5; // m per step: long, slow strides
const STAND_TOP = 3.75; // the emitter prongs' tips, standing tall
const COLLIDE_H = 2.4; // the headroom it needs (it folds down to fit)
const TORSO_REST = 0.1;
const NECK_REST = 0.55; // the head craned forward
const SHOULDER_Y = 0.86; // shoulders above the hips

const MUMMY = new RigDef((r) => {
  r.node('body', null, [0, HIP, 0]);
  // the hips: a narrow armored block between the hip joints
  r.node('pelvis', 'body', [0, 0, 0]);
  r.box('pelvis', 'armor', [0.28, 0.12, 0.2], [0, 0.03, 0]);
  r.box('pelvis', 'frame', [0.34, 0.06, 0.14], [0, -0.04, 0]);
  r.box('pelvis', 'glow', [0.18, 0.016, 0.012], [0, 0.035, 0.105]);
  for (const s of [-1, 1]) r.add('pelvis', 'frame', new THREE.CylinderGeometry(0.055, 0.055, 0.09, 8), [s * HIP_X, -0.04, 0], [0, 0, Math.PI / 2]);
  // the waist: a bare spine and two pistons, thin enough to look wrong
  r.box('pelvis', 'frame', [0.05, 0.3, 0.05], [0, 0.22, -0.02]);
  for (let i = 0; i < 3; i++) r.box('pelvis', 'frame', [0.08, 0.025, 0.07], [0, 0.12 + i * 0.08, -0.02]);
  for (const s of [-1, 1]) rod(0.012, [s * 0.075, 0.08, 0.02], [s * 0.07, 0.38, 0.0], 'frame', 'pelvis', r);
  // the chest: a slim wedge, widest at the shoulders, with seams lit down its front
  r.node('torso', 'pelvis', [0, 0.36, -0.02], { rot: [TORSO_REST, 0, 0] });
  r.add('torso', 'armor', new THREE.CylinderGeometry(0.25, 0.12, 0.5, 4).rotateY(Math.PI / 4).scale(1, 1, 0.55), [0, 0.27, 0]);
  r.add('torso', 'frame', new THREE.CylinderGeometry(0.19, 0.1, 0.4, 4).rotateY(Math.PI / 4).scale(1, 1, 0.55), [0, 0.28, 0.018]);
  r.box('torso', 'glow', [0.018, 0.36, 0.012], [0, 0.28, 0.083], [0.09, 0, 0]);
  for (const s of [-1, 1]) r.box('torso', 'glow', [0.012, 0.32, 0.012], [s * 0.1, 0.32, 0.083], [0.09, 0, -s * 0.2]);
  r.box('torso', 'frame', [0.56, 0.05, 0.1], [0, 0.5, 0]); // the shoulder bar
  for (const s of [-1, 1]) {
    r.add('torso', 'frame', new THREE.SphereGeometry(0.058, 8, 6), [s * 0.28, 0.5, 0]);
    r.box('torso', 'armor', [0.13, 0.04, 0.15], [s * 0.27, 0.56, 0], [0, 0, -s * 0.3]);
  }
  r.box('torso', 'frame', [0.2, 0.3, 0.05], [0, 0.32, -0.1]); // the back plate the emitter mounts on
  // the neck, craned forward, and the sensor head: a narrow wedge with a slit visor and a crest blade
  r.node('neck', 'torso', [0, 0.52, 0.02], { rot: [NECK_REST, 0, 0] });
  r.box('neck', 'frame', [0.032, 0.3, 0.032], [0, 0.15, -0.01]);
  for (const s of [-1, 1]) rod(0.011, [s * 0.03, 0.0, 0.02], [s * 0.022, 0.3, 0.02], 'frame', 'neck', r);
  r.node('head', 'neck', [0, 0.3, 0]);
  r.add('head', 'armor', new THREE.CylinderGeometry(0.065, 0.1, 0.32, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2).scale(1, 0.85, 1), [0, 0.04, 0.06]);
  r.box('head', 'frame', [0.115, 0.07, 0.03], [0, 0.04, 0.215]);
  r.box('head', 'glow', [0.11, 0.024, 0.012], [0, 0.045, 0.232]);
  r.box('head', 'glow', [0.03, 0.036, 0.014], [0, 0.045, 0.234]); // the lens behind the slit
  for (const s of [-1, 1]) r.box('head', 'glow', [0.01, 0.018, 0.13], [s * 0.068, 0.045, 0.14], [0, s * 0.13, 0]);
  r.box('head', 'frame', [0.014, 0.06, 0.28], [0, 0.12, 0.03]);
  r.box('head', 'frame', [0.08, 0.03, 0.12], [0, -0.025, 0.12]);
  for (const s of [-1, 1]) {
    r.add('head', 'frame', new THREE.CylinderGeometry(0.024, 0.024, 0.05, 6), [s * 0.08, 0.04, 0.02], [0, 0, Math.PI / 2]);
    r.add('head', 'glow', new THREE.SphereGeometry(0.01, 6, 4), [s * 0.106, 0.04, 0.02]);
  }
  // the forked emitter on its back: two prongs wound with coils, a lit tip on each, and between them the
  // point (core) where a bolt's charge gathers
  r.node('emitter', 'torso', [0, 0.38, -0.14]);
  r.box('emitter', 'frame', [0.14, 0.12, 0.08], [0, 0, 0]);
  r.box('emitter', 'armor', [0.1, 0.16, 0.04], [0, 0.03, -0.045]);
  for (const s of [-1, 1]) {
    const a = -s * 0.42, len = 0.6;
    const dx = -Math.sin(a), dy = Math.cos(a);
    r.add('emitter', 'frame', new THREE.CylinderGeometry(0.016, 0.022, len, 6), [s * 0.01 + dx * len * 0.5, 0.04 + dy * len * 0.5, -0.04], [0, 0, a]);
    for (const f of [0.45, 0.6, 0.75]) r.add('emitter', 'coil', new THREE.TorusGeometry(0.036, 0.011, 4, 10).rotateX(Math.PI / 2), [s * 0.01 + dx * len * f, 0.04 + dy * len * f, -0.04], [0, 0, a]);
    r.add('emitter', 'glow', new THREE.OctahedronGeometry(0.035), [s * 0.01 + dx * len, 0.04 + dy * len, -0.04]);
    r.node(s > 0 ? 'tipL' : 'tipR', 'emitter', [s * 0.01 + dx * (len + 0.04), 0.04 + dy * (len + 0.04), -0.04]);
  }
  r.node('core', 'emitter', [0, 0.5, -0.04]);
  // long thin arms: a ceramic sleeve over each bone, a piston, a lit wrist ring, three long fingers
  for (const [arm, fore, hand, s] of [['armL', 'foreL', 'handL', 1], ['armR', 'foreR', 'handR', -1]]) {
    r.node(arm, 'torso', [s * 0.3, 0.5, 0]);
    r.box(arm, 'frame', [0.04, 0.82, 0.04], [0, -0.41, 0]);
    r.box(arm, 'armor', [0.075, 0.36, 0.085], [0, -0.2, 0]);
    r.box(arm, 'glow', [0.012, 0.28, 0.01], [0, -0.2, 0.044]);
    rod(0.011, [s * 0.035, -0.08, -0.03], [s * 0.03, -0.7, -0.03], 'frame', arm, r);
    r.node(fore, arm, [0, -0.82, 0]);
    r.add(fore, 'frame', new THREE.SphereGeometry(0.045, 8, 6), [0, 0, 0]);
    r.box(fore, 'frame', [0.036, 0.8, 0.036], [0, -0.4, 0]);
    r.box(fore, 'armor', [0.065, 0.3, 0.075], [0, -0.48, 0]);
    r.add(fore, 'glow', new THREE.TorusGeometry(0.04, 0.009, 4, 12).rotateX(Math.PI / 2), [0, -0.72, 0]);
    r.node(hand, fore, [0, -0.8, 0]);
    r.box(hand, 'frame', [0.06, 0.07, 0.03], [0, -0.035, 0]);
    r.box(hand, 'glow', [0.03, 0.03, 0.01], [0, -0.04, 0.017]);
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.022, ang = (i - 1) * 0.14;
      r.box(hand, 'frame', [0.012, 0.13, 0.012], [x + Math.sin(ang) * 0.06, -0.12, 0.012], [-0.12, 0, ang]);
      r.box(hand, 'frame', [0.01, 0.1, 0.01], [x + Math.sin(ang) * 0.13, -0.235, 0.04], [-0.42, 0, ang]);
    }
    r.box(hand, 'frame', [0.012, 0.1, 0.012], [-s * 0.035, -0.07, 0.03], [-0.5, 0, -s * 0.4]); // the thumb
  }
  // the stilt legs: thigh down to the knee, the telescoping shin back down to the hock, the ankle down
  // to a small pointed foot (posed by inverse kinematics: poseLegs)
  for (const [leg, shin, meta, foot, s] of [['legL', 'shinL', 'metaL', 'footL', 1], ['legR', 'shinR', 'metaR', 'footR', -1]]) {
    r.node(leg, 'body', [s * HIP_X, -0.04, 0]);
    r.box(leg, 'frame', [0.038, THIGH, 0.038], [0, -THIGH / 2, 0]);
    r.add(leg, 'armor', new THREE.CylinderGeometry(0.07, 0.045, THIGH * 0.78, 4).rotateY(Math.PI / 4).scale(0.8, 1, 1), [0, -THIGH * 0.42, 0.01]);
    r.box(leg, 'glow', [0.012, THIGH * 0.55, 0.01], [0, -THIGH * 0.42, 0.058], [-0.03, 0, 0]);
    r.box(leg, 'armor', [0.07, 0.1, 0.05], [0, -THIGH, 0.05], [0.2, 0, 0]); // knee cap
    r.node(shin, leg, [0, -THIGH, 0]);
    r.add(shin, 'frame', new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8), [0, 0, 0], [0, 0, Math.PI / 2]);
    r.add(shin, 'steel', new THREE.CylinderGeometry(0.034, 0.03, SHIN * 0.48, 8), [0, -SHIN * 0.26, 0]);
    r.add(shin, 'glow', new THREE.TorusGeometry(0.035, 0.008, 4, 10).rotateX(Math.PI / 2), [0, -SHIN * 0.5, 0]);
    r.add(shin, 'frame', new THREE.CylinderGeometry(0.021, 0.021, SHIN * 0.55, 6), [0, -SHIN * 0.75, 0]);
    r.node(meta, shin, [0, -SHIN, 0]);
    r.add(meta, 'frame', new THREE.SphereGeometry(0.036, 8, 6), [0, 0, 0]);
    r.add(meta, 'armor', new THREE.ConeGeometry(0.022, 0.16, 4).rotateX(-Math.PI / 2), [0, 0.02, -0.08]); // the hock spur
    r.add(meta, 'frame', new THREE.CylinderGeometry(0.018, 0.016, META, 6), [0, -META / 2, 0]);
    r.box(meta, 'armor', [0.04, META * 0.4, 0.035], [0, -META * 0.35, 0.012]);
    r.node(foot, meta, [0, -META, 0]);
    r.add(foot, 'steel', new THREE.SphereGeometry(0.03, 8, 6), [0, 0, 0]);
    r.add(foot, 'steel', new THREE.ConeGeometry(0.03, 0.18, 4).rotateX(Math.PI / 2), [0, -0.012, 0.085]);
    r.add(foot, 'steel', new THREE.ConeGeometry(0.02, 0.09, 4).rotateX(-Math.PI / 2), [0, -0.01, -0.05]);
  }
});

// Cables: verlet chains in world space, drawn as thin three-sided tubes (one mesh per mummy). Each hangs
// from an anchor; one with a second anchor is a loop that sags between the two and swings.
const CAB_N = 8;
class Cables {
  constructor(scene, defs, mat) {
    this.defs = defs; // [{ a, b|null, len, r }]
    this.pts = defs.map(() => Array.from({ length: CAB_N }, () => ({ p: new THREE.Vector3(), o: new THREE.Vector3() })));
    this.pos = new Float32Array(defs.length * CAB_N * 3 * 3);
    const idx = [];
    for (let c = 0; c < defs.length; c++)
      for (let i = 0; i < CAB_N - 1; i++)
        for (let j = 0; j < 3; j++) {
          const a = (c * CAB_N + i) * 3, j2 = (j + 1) % 3;
          idx.push(a + j, a + 3 + j, a + j2, a + j2, a + 3 + j, a + 3 + j2);
        }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noCull = true;
    scene.add(this.mesh);
    this.placed = false;
  }

  update(dt, t) {
    dt = Math.min(dt, 1 / 30);
    this.defs.forEach((d, c) => {
      const chain = this.pts[c];
      const seg = d.len / (CAB_N - 1);
      d.a.getWorldPosition(chain[0].p);
      const end = d.b ? d.b.getWorldPosition(_u) : null;
      if (!this.placed) for (const q of chain) q.p.copy(chain[0].p), q.o.copy(chain[0].p);
      chain[0].o.copy(chain[0].p);
      // gravity and a hot, gusting breeze (heavy cables: they mostly hang and swing)
      const wx = Math.sin(t * 0.7 + c) * 0.5 + 0.3, wz = Math.cos(t * 0.9 + c * 1.7) * 0.4;
      for (let i = 1; i < CAB_N; i++) {
        const q = chain[i];
        _v.subVectors(q.p, q.o).multiplyScalar(0.94);
        q.o.copy(q.p);
        q.p.add(_v);
        q.p.x += wx * dt * dt;
        q.p.z += wz * dt * dt;
        q.p.y -= 9 * dt * dt;
      }
      for (let it = 0; it < 3; it++) {
        for (let i = 1; i < CAB_N; i++) {
          const a0 = chain[i - 1].p, b0 = chain[i].p;
          _v.subVectors(b0, a0);
          const len = _v.length() || 1e-4;
          if (len > seg || !d.b) b0.copy(a0).addScaledVector(_v, seg / len);
        }
        if (end) {
          chain[CAB_N - 1].p.copy(end);
          for (let i = CAB_N - 2; i > 0; i--) {
            const a0 = chain[i + 1].p, b0 = chain[i].p;
            _v.subVectors(b0, a0);
            const len = _v.length() || 1e-4;
            if (len > seg) b0.copy(a0).addScaledVector(_v, seg / len);
          }
        }
      }
      // the tube: three vertices round each point, in a frame across the chain
      for (let i = 0; i < CAB_N; i++) {
        const p = chain[i].p, q = chain[Math.min(CAB_N - 1, i + 1)].p, o = chain[Math.max(0, i - 1)].p;
        _v.subVectors(q, o).normalize();
        _w.crossVectors(_v, Math.abs(_v.y) > 0.9 ? X_AXIS : UP).normalize();
        _u.crossVectors(_v, _w).normalize();
        const r = d.r * (d.b ? 1 : 1 - (i / CAB_N) * 0.3);
        for (let j = 0; j < 3; j++) {
          const a = (j / 3) * TAU, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
          const k = ((c * CAB_N + i) * 3 + j) * 3;
          this.pos[k] = p.x + _w.x * ca + _u.x * sa;
          this.pos[k + 1] = p.y + _w.y * ca + _u.y * sa;
          this.pos[k + 2] = p.z + _w.z * ca + _u.z * sa;
        }
      }
    });
    this.placed = true;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.geo.dispose();
  }
}

// Sand-plasma bolts: the sand bolt (a churning ball of glowing grit) wrapped in two spinning rings of
// its color and shedding embers. Shootable in its color, like every bolt.
let plasmaRingGeo = null;
const plasmaRingMats = new Map();
class PlasmaBolt extends Bolt {
  constructor(world, pos, vel, color, opts) {
    super(world, pos, vel, color, { ...opts, style: 'sand' });
    plasmaRingGeo ??= new THREE.TorusGeometry(1, 0.07, 4, 18);
    if (!plasmaRingMats.has(color)) plasmaRingMats.set(color, new THREE.MeshBasicMaterial({ color: glowHex(color, 2.2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    const m = plasmaRingMats.get(color);
    this.rings = [0, 1].map((i) => {
      const ring = new THREE.Mesh(plasmaRingGeo, m);
      ring.scale.setScalar(this.radius * 1.3);
      ring.rotation.set(i * Math.PI / 2, i * 0.7, 0);
      this.mesh.add(ring);
      return ring;
    });
  }

  update(dt, player) {
    super.update(dt, player);
    if (!this.alive) return;
    this.rings[0].rotation.y += dt * 9;
    this.rings[1].rotation.x += dt * 7;
    if (Math.random() < dt * 35) this.world.fx.ember(this.pos, rnd(-0.4, 0.4), rnd(-0.2, 0.5), rnd(-0.4, 0.4), COLORS[this.color].hex, rnd(0.25, 0.45), 0.035);
  }
}

let shieldGeo = null;
let tileGeo = null;
let chargeGeo = null;
let mummyProxy = null;

export class Mummy extends Trooper {
  constructor(world, opts) {
    super(world, opts, { radius: 0.5, height: HIP + 1.3, hp: 5, range: 28, color: YELLOW, patrol: 4, speed: 2.4, prefer: [9, 17], dodge: 2.6, accel: 22 });
    this.shieldColor = opts.shieldColor === undefined ? (this.color === RED ? YELLOW : RED) : opts.shieldColor;
    this.castCool = rnd(1, 2);
    this.shieldCool = 0.5;
    this.shieldUp = false;
    this.turnRate = 3.2; // the body comes round slowly; the head tracks you at once
    this.wadesQuicksand = true; // stilts: it strides out over the quicksand (groundKit.js)
    this.stepUp = 1.1; // and steps up and down a metre without a thought
    this.stepDown = 1.15;
    this.hipY = HIP;
    this.lowK = 0;
    this.headroomT = 0;
    this.twitch = 0;
    this.twitchT = rnd(2, 5);
    this.visY = null;
    this.footU = [0, 0.5];
    this.barkPersona = 'solar'; // combat/barks.js
    this.painSound = 'robot_pain_light';
    this.voicePitch = 0.8;
    const S = sharedMats();
    this.m = {
      armor: S.armor,
      frame: S.frame,
      steel: S.steel,
      glow: this.mat(new THREE.MeshBasicMaterial({ color: 0xffffff })),
      coil: this.mat(new THREE.MeshBasicMaterial({ color: 0xffffff })),
    };
    const rig = MUMMY.build(this.m);
    this.n = rig.n;
    for (const a of [this.n.armL, this.n.armR]) a.rotation.order = 'YXZ';
    for (const l of [this.n.legL, this.n.legR]) l.rotation.order = 'ZYX'; // pitch in the leg's plane, then splay
    this.n.neck.rotation.order = 'YXZ';
    this.group.add(rig.root);
    // the big readable target: invisible volumes round the chest and head (the limbs are hittable too)
    mummyProxy ??= { mat: new THREE.MeshBasicMaterial({ visible: false }), chest: new THREE.BoxGeometry(0.5, 0.95, 0.36), head: new THREE.BoxGeometry(0.26, 0.24, 0.4) };
    const chest = new THREE.Mesh(mummyProxy.chest, mummyProxy.mat);
    chest.position.set(0, 0.2, 0);
    this.n.torso.add(chest);
    const head = new THREE.Mesh(mummyProxy.head, mummyProxy.mat);
    head.position.set(0, 0.04, 0.07);
    this.n.head.add(head);
    // the charge gathering between the emitter's prongs
    chargeGeo ??= new THREE.IcosahedronGeometry(1, 1);
    this.chargeMat = this.mat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.charge = new THREE.Mesh(chargeGeo, this.chargeMat);
    this.charge.visible = false;
    this.n.core.add(this.charge);
    // cable tethers: head to back, a hose looped at each elbow, a cable off the right wrist, two from the hips
    const anchor = (parent, x, y, z) => {
      const o = new THREE.Object3D();
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };
    const n = this.n;
    this.cables = new Cables(world.scene, [
      { a: anchor(n.head, 0, 0.03, -0.08), b: anchor(n.torso, 0.06, 0.3, -0.13), len: 0.75, r: 0.014 },
      { a: anchor(n.armL, 0, -0.14, -0.04), b: anchor(n.foreL, 0, -0.28, -0.03), len: 0.8, r: 0.012 },
      { a: anchor(n.armR, 0, -0.14, -0.04), b: anchor(n.foreR, 0, -0.28, -0.03), len: 0.8, r: 0.012 },
      { a: anchor(n.foreR, 0, -0.66, -0.03), b: null, len: 0.6, r: 0.01 },
      { a: anchor(n.pelvis, 0.08, -0.05, -0.1), b: null, len: 1.05, r: 0.013 },
      { a: anchor(n.pelvis, -0.06, -0.04, -0.1), b: null, len: 0.8, r: 0.011 },
    ], S.cable);
    // the hard-light shield: a faceted shell of light (it takes the hits) with a lattice over it and
    // hexagonal field tiles orbiting
    shieldGeo ??= new THREE.IcosahedronGeometry(1, 1);
    tileGeo ??= new THREE.CylinderGeometry(0.17, 0.17, 0.025, 6).rotateX(Math.PI / 2);
    const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
    this.shieldMat = this.mat(new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.14, side: THREE.DoubleSide, ...add }));
    this.latticeMat = this.mat(new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.55, wireframe: true, ...add }));
    this.tileMat = this.mat(new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.7, side: THREE.DoubleSide, ...add }));
    this.shield = new THREE.Group();
    this.shell = new THREE.Mesh(shieldGeo, this.shieldMat);
    this.shell.userData.part = 'shield';
    const lattice = new THREE.Mesh(shieldGeo, this.latticeMat);
    lattice.scale.setScalar(1.015);
    lattice.userData.part = 'shield';
    this.shell.add(lattice);
    this.shield.add(this.shell);
    this.plates = [];
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Mesh(tileGeo, this.tileMat);
      p.userData.part = 'shield';
      p.userData.a = (i / 9) * Math.PI * 2;
      p.userData.y = ((i % 3) - 1) * 0.6;
      this.shield.add(p);
      this.plates.push(p);
    }
    this.shield.visible = false;
    this.group.add(this.shield);
    this.applyColor();
    this.attach();
  }

  applyColor() {
    this.m.glow.color.copy(glowHex(this.color));
    this.m.coil.color.copy(glowHex(this.color, 0.5));
    this.chargeMat.color.copy(glowHex(this.color, 1.8));
    const sc = this.shieldColor ?? this.color;
    this.shieldMat.color.copy(glowHex(sc, 0.9));
    this.latticeMat.color.copy(glowHex(sc, 1.6));
    this.tileMat.color.copy(glowHex(sc, 1.4));
  }

  // its middle: the chest, wherever the stilts have it
  center(out = new THREE.Vector3()) {
    return out.copy(this.pos).setY(this.pos.y + this.hipY + 0.55);
  }

  // Is your crosshair on (or within `extra` m of) its body? Tested along its column, stilts to head, not
  // as one big sphere round its middle (it's thin: the air beside its chest isn't it).
  aimedAt(extra = 0) {
    const cam = this.world.game.camera;
    const look = cam.getWorldDirection(_u);
    const r = 0.45 + extra;
    for (const h of [0.6, this.hipY * 0.55, this.hipY, this.hipY + 0.55, this.hipY + 1.1]) {
      _w.set(this.pos.x, this.pos.y + h, this.pos.z).sub(cam.position);
      const along = _w.dot(look);
      if (along > 0 && _w.lengthSq() - along * along < r * r) return true;
    }
    return false;
  }

  // it only needs COLLIDE_H of headroom to get somewhere: it folds down under anything lower than itself
  blocked(x, y, z) {
    const h = this.height;
    this.height = COLLIDE_H;
    const b = super.blocked(x, y, z);
    this.height = h;
    return b;
  }

  // (a big step up or down eases the body over it instead of popping)
  sync() {
    if (this.visY === null || Math.abs(this.pos.y - this.visY) > 2.5 || !this.grounded) this.visY = this.pos.y;
    else this.visY += (this.pos.y - this.visY) * Math.min(1, (this.dtLast ?? 1 / 60) * 9);
    this.group.position.set(this.pos.x, this.visY, this.pos.z);
    this.group.rotation.y = this.yaw;
  }

  // how much headroom it has: folds down under a low ceiling (checked a few times a second)
  probeHeadroom(dt) {
    if ((this.headroomT -= dt) <= 0) {
      this.headroomT = 0.2;
      let room = STAND_TOP + 0.3;
      for (let h = COLLIDE_H; h <= STAND_TOP + 0.2; h += 0.15) {
        if (this.world.pointInSolid(_w.set(this.pos.x, this.pos.y + h, this.pos.z), 0.35)) {
          room = h;
          break;
        }
      }
      this.lowTarget = clamp((STAND_TOP + 0.15 - room) / (STAND_TOP + 0.15 - COLLIDE_H), 0, 1);
    }
    this.lowK += ((this.lowTarget ?? 0) - this.lowK) * Math.min(1, dt * 4);
  }

  onAlert() {
    this.setState('engage');
    sfx('mummy_alert', 0.6 * falloff(this.dist, 5, 35), { synth: (g) => {
      audio.noise({ dur: 0.7, gain: 0.16 * g, freq: 900, f2: 400, q: 2 });
      audio.tone({ type: 'sawtooth', f: 110, f2: 80, dur: 0.6, gain: 0.05 * g });
    } });
  }

  // a stilt comes down: a creak from the long joints, a servo whir, a little sand (rings in quicksand)
  onStep(amp = 1, foot = null) {
    const fx = this.world.fx;
    const p = foot ? foot.getWorldPosition(_w) : _w.copy(this.pos);
    p.y = this.pos.y + 0.02;
    if (isQuicksand(this.ground)) {
      if (this.dist < 30) fx.ring(p, UP, DUST, { size: 0.15, end: 1.1, life: 0.7, thick: 0.2, k: 0.5 });
      if (this.dist < 18) sandPuff(fx, p, 0.3, 0.6, 0.25, 0.6);
    } else if (this.dist < 14 && Math.random() < 0.6) sandPuff(fx, p, 0.25, 0.3, 0.22, 0.6);
    if (Math.random() < 0.7) esfx('mummy_creak', this.pos, 0.5 + 0.5 * amp, rnd(0.85, 1.15));
    esfx('servo_light', this.pos, 0.3 + 0.4 * amp, 0.75 + 0.3 * amp);
  }

  onRoll(kind) {
    sandPuff(this.world.fx, this.pos, 0.6, 0.5, 0.4, 0.8);
    const g = 0.35 * falloff(this.dist, 3, 26);
    sfx('mummy_dodge', g, { synth: (gg) => audio.noise({ dur: kind === 'step' ? 0.15 : 0.35, gain: 0.18 * gg, freq: 1800, f2: 700, q: 0.8 }) });
    esfx('hydraulic_hiss', this.pos, kind === 'step' ? 0.45 : 0.8, 1.2);
  }

  // three in five dodges are quick sidesteps, the rest low lunges
  tryRoll(player, kind = Math.random() < 0.6 ? 'step' : 'roll') {
    return super.tryRoll(player, kind);
  }

  canDodge() {
    return this.state === 'engage' || this.state === 'cover';
  }

  // Out in the quicksand you can't get at it: it heads for a patch it can fight you from, then holds
  // its ground there (it won't strafe back out while it can see you).
  seekSand(dt, player) {
    if (isQuicksand(this.ground)) {
      this.sandSpot = null;
      if (!this.sees) return;
      const m = this.move, len = Math.hypot(m.x, m.z);
      if (len > 0.1) {
        const k = 1 / len;
        if (!isQuicksand(this.groundAt(this.pos.x + m.x * k, this.pos.y, this.pos.z + m.z * k))) {
          this.strafeDir *= -1;
          this.strafeT = rnd(1.2, 2.5);
          m.set(0, 0, 0);
        }
      }
      return;
    }
    if ((this.sandT = (this.sandT ?? rnd(0.3, 1)) - dt) <= 0) {
      this.sandT = rnd(1.2, 2);
      this.sandSpot = this.findSand(player);
    }
    if (this.sandSpot && this.sees) {
      _v.set(this.sandSpot.x - this.pos.x, 0, this.sandSpot.z - this.pos.z);
      const len = _v.length();
      if (len < 0.4 || this.blockedBy?.ledge) this.sandSpot = null;
      else this.move.copy(_v.divideScalar(len)).multiplyScalar(this.speed);
    }
  }

  // a patch of quicksand nearby it can walk straight to, a metre or so in from the edge, at a range it
  // can still fight you from
  findSand(player) {
    let best = null, bestD = Infinity;
    const a0 = Math.random() * TAU;
    for (let i = 0; i < 14; i++) {
      const a = a0 + (i / 14) * TAU, r = rnd(2, 12);
      const ux = Math.cos(a), uz = Math.sin(a);
      let x = this.pos.x + ux * r, z = this.pos.z + uz * r;
      if (!isQuicksand(this.groundAt(x, this.pos.y, z))) continue;
      if (isQuicksand(this.groundAt(x + ux * 1.2, this.pos.y, z + uz * 1.2))) (x += ux * 1.2), (z += uz * 1.2);
      const dp = Math.hypot(player.pos.x - x, player.pos.z - z);
      if (dp < 4 || dp > this.prefer[1] + 6) continue;
      if (r >= bestD || !this.pathClear(x, z, 0)) continue;
      bestD = r;
      best = new THREE.Vector3(x, this.pos.y, z);
    }
    return best;
  }

  engage(dt, player, d) {
    this.seekSand(dt, player);
    this.castCool -= dt;
    this.shieldCool -= dt;
    if (this.stagger > 0) return;
    if (this.wardNext && this.shieldCool <= 0) {
      this.wardNext = false;
      return this.setState('ward');
    }
    if (!this.sees) return;
    // you're drawing a bead and it can't dodge right now: shield up
    if (this.shieldCool <= 0 && this.rollCool > 0 && this.aimedAt(0.2) && Math.random() < dt * 0.9) return this.setState('ward');
    if (this.castCool <= 0 && d > 3 && this.attackWait <= 0 && this.mayAttack(CAST_T + 0.5)) this.setState('cast');
  }

  act(dt, player, d) {
    const s = this.state;
    if (s === 'cast') {
      this.move.multiplyScalar(0);
      // light streams in to the emitter's prongs
      if (this.dist < 40 && Math.random() < dt * 40) {
        this.group.updateMatrixWorld(true);
        const core = this.n.core.getWorldPosition(_w);
        const a = Math.random() * Math.PI * 2;
        _u.set(Math.cos(a) * 0.8, rnd(-0.5, 0.5), Math.sin(a) * 0.8);
        this.world.fx.puff(_v.copy(core).add(_u), -_u.x * 2.4, -_u.y * 2.4, -_u.z * 2.4, _c.set(0xd9b070), 0.6, 0.33, 0.12, 0.5);
        if (Math.random() < 0.5) this.world.fx.ember(_v, -_u.x * 2.6, -_u.y * 2.6, -_u.z * 2.6, COLORS[this.color].hex, 0.3, 0.03);
      }
      if (this.stateT < dt * 1.5) barks.say(this, 'reload'); // "The sands gather."
      if (this.stateT < dt * 1.5) sfx('mummy_cast', 0.5 * falloff(this.dist, 4, 34), { alt: 'charge_up', altRate: 1.5, altGain: 0.6, synth: (g) => audio.tone({ type: 'triangle', f: 300, f2: 900, dur: 0.6, gain: 0.06 * g }) });
      if (this.stateT >= CAST_T) {
        this.castVolley(player);
        director.release(this);
        this.castCool = rnd(2.4, 3.4);
        this.setState('release');
      }
    } else if (s === 'release') {
      this.move.set(0, 0, 0);
      if (this.stateT > 0.3) this.setState('engage');
    } else if (s === 'ward') {
      this.move.set(0, 0, 0);
      const hex = COLORS[this.shieldColor ?? this.color].hex;
      if (this.stateT < dt * 1.5) {
        this.world.fx.ring(_w.copy(this.pos).setY(this.pos.y + 0.1), UP, hex, { size: 1.6, end: 0.4, life: WARD_T, thick: 0.2, k: 1.2 });
        barks.say(this, 'reload');
        esfx('servo_light', this.pos, 0.8, 0.8); // the arms cross with a dry whir
        sfx('mummy_shield', 0.5 * falloff(this.dist, 4, 30), { alt: 'barrier_reform', altRate: 1.2, synth: (g) => audio.noise({ dur: 0.5, gain: 0.2 * g, freq: 400, f2: 1600, q: 1 }) });
      }
      // motes of the shield's color spiral up round it
      if (Math.random() < dt * 40) {
        const a = Math.random() * Math.PI * 2;
        _w.set(this.pos.x + Math.cos(a) * 1.1, this.pos.y + rnd(0, 0.6), this.pos.z + Math.sin(a) * 1.1);
        this.world.fx.ember(_w, -Math.sin(a) * 1.5, rnd(2.5, 4.5), Math.cos(a) * 1.5, hex, rnd(0.4, 0.7), 0.04);
      }
      if (this.stateT >= WARD_T) this.raiseShield();
    } else if (s === 'shield') {
      // edge sideways behind the shield, no attacks
      this.toPlayer(player, _v);
      this.strafeT -= dt;
      if (this.strafeT <= 0 || this.blockedBy?.x || this.blockedBy?.z) {
        this.strafeDir *= -1;
        this.strafeT = rnd(0.8, 1.6);
      }
      this.move.set(-_v.z * this.strafeDir, 0, _v.x * this.strafeDir).multiplyScalar(this.speed * 0.5);
      if (this.stateT >= SHIELD_T) this.dropShield(false);
    }
  }

  castVolley(player) {
    this.group.updateMatrixWorld(true);
    _w.copy(player.pos).y += player.eye * 0.7;
    const aimed = this.aimAt(this.center(_u), _w);
    const warning = aimed.distanceTo(_w) > 0.5; // the director's off-screen miss: don't let the bolts home in
    _w.copy(aimed);
    // from the left prong, the core between them and the right prong
    const from = [this.n.tipL, this.n.core, this.n.tipR];
    [-0.38, 0, 0.38].forEach((a, i) => {
      const p = from[i].getWorldPosition(new THREE.Vector3());
      const dir = _v.subVectors(_w, p).normalize();
      dir.applyAxisAngle(UP, a);
      dir.y += 0.05;
      // the outer bolts bend in toward you; the middle one flies true
      new PlasmaBolt(this.world, p, dir.normalize().multiplyScalar(9.5), this.color, { radius: 0.24, turn: a ? 1.5 : 0.4, turnTime: warning ? 0 : 1.1, life: 5 });
      this.world.fx.flash(p, COLORS[this.color].hex, { size: 0.38, life: 0.1, k: 1.5 });
    });
    this.pS.kick(3.5); // follow-through: it throws its weight after the volley
    esfx('servo_light', this.pos, 0.8, 1.2);
    sfx('mummy_bolt', 0.6 * falloff(this.dist, 4, 40), { alt: 'enemy_shot', altRate: 1.25, synth: () => audio.enemyShoot() });
  }

  raiseShield() {
    this.shieldUp = true;
    this.shieldHp = 3;
    this.shield.visible = true;
    this.setState('shield');
    const hex = COLORS[this.shieldColor ?? this.color].hex;
    this.world.fx.burst(this.center(_w), hex, { count: 30, speed: 4, life: 0.5, size: 0.2, gravity: 0 });
    this.world.fx.ring(_w, null, hex, { size: 0.4, end: 2.2, life: 0.3, thick: 0.12, k: 1.4 });
  }

  dropShield(broken) {
    if (!this.shieldUp) return;
    this.shieldUp = false;
    this.shield.visible = false;
    this.shieldCool = rnd(6, 8);
    const c = this.center(new THREE.Vector3());
    const fx = this.world.fx;
    const hex = COLORS[this.shieldColor ?? this.color].hex;
    // the field collapses: tiles of light scatter and fade
    fx.burst(c, hex, { count: broken ? 16 : 10, speed: broken ? 3 : 1.5, life: 0.5, size: 0.25, gravity: 0, drag: 2 });
    if (broken) {
      fx.burst(c, hex, { count: 40, speed: 8, life: 0.7, size: 0.35, gravity: 6, mode: 'shard' });
      fx.ring(c, null, hex, { size: 0.5, end: 3, life: 0.35, thick: 0.15, k: 1.5 });
      sfx('mummy_shield_break', 0.8 * Math.max(0.4, falloff(this.dist, 4, 40)), { alt: 'shield_break', altRate: 1.3, synth: () => audio.shieldBreak() });
      this.stagger = 0.8;
      this.pS.kick(-5);
      this.hS.kick(-8);
      this.sqS.kick(-0.8);
      this.castCool = Math.max(this.castCool, 1.2);
    }
    if (this.state === 'shield') this.setState('engage');
  }

  interrupt() {
    director.release(this);
    this.castCool = Math.max(this.castCool, 1);
    this.setState('engage');
  }

  // ---- the procedural body ----
  // The stilts: each foot is planted while the body walks over it (its offset slides back exactly as far
  // as the body travels) and swings forward in a high arc, the ankle folding back; the legs are posed by
  // inverse kinematics to wherever the foot is. The hips ride high, dropping to fold under a low ceiling,
  // into a lunge, a stagger or a landing.
  poseLegs(hipY, sway, amp, splay, dt) {
    const n = this.n;
    const L = STRIDE * amp;
    const sink = isQuicksand(this.ground) ? 0.28 : 0; // the stilts plunge into the quicksand a little
    const legs = [[n.legL, n.shinL, n.metaL, n.footL, 1, 0], [n.legR, n.shinR, n.metaR, n.footR, -1, Math.PI]];
    for (let i = 0; i < 2; i++) {
      const [leg, shin, meta, foot, sgn, off] = legs[i];
      let u = (this.gaitPhase + off) / TAU;
      u -= Math.floor(u);
      let o, lift;
      if (u < 0.5) {
        o = 0.5 - 2 * u;
        lift = 0;
      } else {
        const w = (u - 0.5) * 2;
        o = -0.5 + smooth01(w);
        lift = Math.sin(w * Math.PI);
      }
      // footfall: the swing ends
      if (dt && this.footU[i] >= 0.5 && u < 0.5 && amp > 0.25 && this.grounded && !this.dying) this.onStep(amp, foot);
      this.footU[i] = u;
      lift *= amp;
      // the foot relative to its hip joint: (fx across, fy down, fz along)
      const fz = o * L * this.gfk;
      const fx = sgn * (FOOT_X - HIP_X + splay * 0.4) + o * L * this.gsk - sway;
      const fy = -(hipY - 0.04) + lift * (0.32 + 0.25 * splay) - sink;
      // splay the leg out to the foot, then solve the rest in the leg's own plane
      const phi = Math.atan2(fx, -fy);
      const py = -Math.hypot(fx, fy), pz = fz;
      const thM = -0.22 + lift * 0.9; // the ankle (metatarsal) leans forward, folding back as it swings
      const hz = pz + META * Math.sin(thM), hy = py + META * Math.cos(thM);
      const D = clamp(Math.hypot(hz, hy), Math.abs(THIGH - SHIN) + 1e-3, THIGH + SHIN - 1e-3);
      const base = Math.atan2(-hz, -hy);
      const a = Math.acos(clamp((THIGH * THIGH + D * D - SHIN * SHIN) / (2 * THIGH * D), -1, 1));
      const b = Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - D * D) / (2 * THIGH * SHIN), -1, 1));
      const thT = base - a; // the knee forward
      const thS = thT + (Math.PI - b);
      leg.rotation.set(thT, 0, phi);
      shin.rotation.x = thS - thT;
      meta.rotation.x = thM - thS;
      foot.rotation.x = lift * 0.6 - thM;
    }
  }

  // (replaces the humanoid poseBase: same outputs for the arms, head and footfalls)
  poseBase(dt) {
    const n = this.n;
    this.dtLast = dt;
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    const fwd = this.vel.x * sn + this.vel.z * c;
    const side = this.vel.x * c - this.vel.z * sn;
    const speed = Math.hypot(fwd, side);
    const dodging = this.state === 'roll';
    const stepping = dodging && this.rollKind === 'step';
    const u = dodging ? Math.min(1, this.stateT / (stepping ? 0.28 : 0.55)) : 0;
    const lunge = dodging ? Math.sin(Math.PI * u) * (stepping ? 0.35 : 1) : 0;
    const k = Math.min(1, speed / this.speed);
    this.gaitAmp += (k - this.gaitAmp) * Math.min(1, dt * 5);
    const amp = this.gaitAmp;
    this.gaitPhase += ((speed * dt) / STRIDE) * Math.PI;
    if (speed > 0.2) {
      this.gfk = fwd / speed;
      this.gsk = side / speed;
    }
    const stag = this.stagger > 0 ? Math.min(1, this.stagger * 4) : 0;
    const low = this.lowK;
    const sq = Math.min(0.05, this.sqS.step(0, dt));
    const p = this.gaitPhase;
    // hips: high at mid-stance, lurching over the planted stilt, a slow balancing sway on top
    const bob = (Math.abs(Math.cos(p)) - 0.6) * 0.1 * amp;
    const hipY = HIP - low * (HIP - LOW_HIP) - lunge * 0.85 - stag * 0.25 + sq * 3 + bob;
    this.hipY = hipY;
    this.height = hipY + 1.3;
    const sway = -Math.cos(p) * 0.1 * amp + Math.sin(this.t * 0.7 + this.seed) * 0.025;
    n.body.position.set(sway, hipY, 0);
    this.poseLegs(hipY, sway, amp, lunge, dt);
    // the upper body: leans into the walk, the hunch, its attack lean, flinches; rolls over the stance
    // leg and into a lunge
    const accel = clamp((speed - (this.lastSpeed ?? speed)) / Math.max(dt, 1e-3), -8, 8);
    this.lastSpeed = speed;
    const pitchT = this.gfk * k * 0.1 + low * 0.5 + this.actPitch + stag * 0.2 + accel * 0.01 + lunge * 0.25;
    const rollT = -this.gsk * k * 0.08 + this.actRoll + Math.cos(p) * 0.05 * amp + (dodging ? -this.rollLocal * 0.4 * lunge : 0) + Math.sin(this.t * 0.7 + this.seed) * 0.02;
    const pitch = this.pS.step(pitchT, dt);
    const roll = this.rS.step(rollT, dt);
    const twist = this.tS.step(this.actTwist, dt);
    const hipTwist = -Math.sin(p) * 0.12 * amp * this.gfk;
    const breathe = Math.sin(this.t * 1.3 + this.seed) * 0.018 * (1 - amp);
    n.pelvis.rotation.set(0, hipTwist, roll * 0.3);
    n.torso.rotation.set(TORSO_REST + pitch + breathe, -hipTwist * 1.6 + twist, roll * 0.7);
    this.breath = breathe;
    this.hunch = n.torso.rotation.x;
    this.bodyTwist = hipTwist + n.torso.rotation.y;
    this.tuck = 0;
    this.tumble = 0;
    this.crouch = low;
    // the head: level and locked on you whatever the body does (or scanning slowly), with a twitch now
    // and then
    const player = this.world.game.player;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const hd = Math.max(0.5, Math.hypot(dx, dz));
    this.aimErr = clamp(angleTo(this.yaw, Math.atan2(dx, dz)), -0.9, 0.9);
    let hy, hp;
    if (this.aggro) {
      hy = clamp(angleTo(this.yaw, Math.atan2(dx, dz)) - this.bodyTwist, -1.4, 1.4);
      hp = -Math.atan2(player.pos.y + player.eye - (this.pos.y + hipY + 1.25), hd);
    } else {
      const scan = Math.sin(this.t * 0.31 + this.seed) + Math.sin(this.t * 0.77 + this.seed * 2) * 0.5;
      hy = Math.abs(scan) > 0.5 ? scan * 0.7 : 0;
      hp = 0.15 + Math.sin(this.t * 0.45 + this.seed) * 0.08;
    }
    const hk = Math.min(1, dt * (this.aggro ? 5 : 2));
    this.headYaw += (hy - this.headYaw) * hk;
    this.headPitch += (clamp(hp, -0.8, 0.8) - this.headPitch) * hk;
    if ((this.twitchT -= dt) <= 0) {
      this.twitchT = rnd(2.5, 6);
      this.twitch = (Math.random() < 0.5 ? -1 : 1) * rnd(0.25, 0.5);
    }
    this.twitch *= Math.exp(-dt * 9);
    const nod = this.hS.step(this.headNod, dt);
    const neckX = NECK_REST + low * 0.25;
    n.neck.rotation.set(neckX, this.headYaw * 0.6, 0);
    n.head.rotation.set(this.headPitch - n.torso.rotation.x - neckX + nod, this.headYaw * 0.4 + this.twitch * 0.4, -roll + Math.sin(this.t * 0.8) * 0.08 + this.twitch);
    // the arms counter-swing to the stilts
    this.armSwing = Math.sin(p) * 0.3 * amp * Math.max(0.35, Math.abs(this.gfk));
    this.idleSounds(dt);
  }

  animate(dt, player) {
    const n = this.n;
    const s = this.state;
    const u = this.stateT;
    this.probeHeadroom(dt);
    // body language: it leans back and reaches up while the emitter charges (anticipation), throws itself
    // forward with the volley (castVolley kicks the follow-through), bows over its crossed arms to ward,
    // and sways behind the shield
    let ap = 0, ar = 0, at = 0;
    const draw = s === 'cast' ? smooth01(u / (CAST_T * 0.6)) * (1 - smooth01((u - CAST_T * 0.7) / (CAST_T * 0.3))) : 0;
    if (s === 'cast') {
      ap = -0.22 * draw + 0.12 * smooth01((u - CAST_T * 0.7) / (CAST_T * 0.3));
      at = this.aimErr * 0.4;
    } else if (s === 'release') ap = 0.16 * (1 - u / 0.3);
    else if (s === 'ward') ap = 0.3;
    else if (s === 'shield') ar = Math.sin(this.t * 2.2) * 0.06;
    this.actPitch = ap;
    this.actRoll = ar;
    this.actTwist = at;
    this.headNod = s === 'ward' ? 0.3 : 0;
    this.poseBase(dt);
    const aimX = this.aimPitch(player, this.hipY + SHOULDER_Y);
    // arms: hanging long and loose; reaching up and out as it charges, flung forward with the volley,
    // crossed over the chest to ward, held out wide while shielded, thrown out for balance in a lunge
    const br = this.breath * 1.5;
    let lx = this.armSwing * 0.7 + 0.05, rx = -this.armSwing * 0.7 + 0.05, ly = 0, ry = 0, lz = 0.08 + br, rz = -0.08 - br, fl = -0.3, fr = -0.22;
    let hl = -0.2 + Math.sin(this.t * 3.1 + this.seed) * 0.06, hr = -0.2 + Math.sin(this.t * 2.7) * 0.06;
    let rate = 7;
    if (s === 'cast') {
      const k = Math.min(1, u / 0.25);
      const shake = Math.sin(this.t * 40) * 0.03;
      lx = rx = lerp(lx, aimX - 0.1 - draw * 0.3, k) + shake;
      lz = 0.3 * k;
      rz = -0.3 * k;
      ly = -0.15 * k + (this.aimErr - this.bodyTwist) * 0.5 * k;
      ry = 0.15 * k + (this.aimErr - this.bodyTwist) * 0.5 * k;
      fl = fr = -0.15 * k - draw * 0.15;
      hl = hr = (0.5 + draw * 0.4) * k; // the long fingers splay back
      rate = 14;
    } else if (s === 'release') {
      lx = rx = aimX + 0.15;
      ly = -0.3;
      ry = 0.3;
      fl = fr = 0;
      hl = hr = -0.3;
      rate = 18;
    } else if (s === 'ward') {
      lx = rx = -0.75;
      ly = -0.55;
      ry = 0.55;
      lz = rz = 0;
      fl = fr = -1.75;
      hl = hr = 0.3;
      rate = 14;
    } else if (s === 'shield') {
      lx = rx = -0.9;
      lz = 0.95;
      rz = -0.95;
      fl = fr = -0.35;
      hl = hr = 0.6;
      rate = 12;
    } else if (s === 'roll') {
      lz = 0.7;
      rz = -0.7;
      lx = rx = -0.4;
      rate = 14;
    }
    const sm = Math.min(1, dt * rate);
    n.armL.rotation.set(lerp(n.armL.rotation.x, lx, sm), lerp(n.armL.rotation.y, ly, sm), lerp(n.armL.rotation.z, lz, sm));
    n.armR.rotation.set(lerp(n.armR.rotation.x, rx, sm), lerp(n.armR.rotation.y, ry, sm), lerp(n.armR.rotation.z, rz, sm));
    n.foreL.rotation.x = lerp(n.foreL.rotation.x, fl, sm);
    n.foreR.rotation.x = lerp(n.foreR.rotation.x, fr, sm);
    n.handL.rotation.x = lerp(n.handL.rotation.x, hl, sm);
    n.handR.rotation.x = lerp(n.handR.rotation.x, hr, sm);
    // the emitter: a ball of light swells between the prongs as it charges; the coils and visor flare
    const charge = s === 'cast' ? u / CAST_T : s === 'release' ? Math.max(0, 1 - u / 0.15) : 0;
    this.charge.visible = charge > 0.01;
    if (this.charge.visible) {
      this.charge.scale.setScalar(0.03 + charge * 0.15 + Math.sin(this.t * 50) * 0.01 * charge);
      this.charge.rotation.set(this.t * 7, this.t * 5, 0);
    }
    this.m.coil.color.copy(glowHex(this.color, 0.5 + charge * 3.5 + (s === 'ward' ? 1 : 0)));
    if (this.flash > 0) this.m.glow.color.setRGB(3, 3, 3);
    else if (this.immuneFlash > 0) this.m.glow.color.setRGB(0.7, 0.7, 0.8);
    else this.m.glow.color.copy(glowHex(this.color, 2.4 + charge * 2));
    // the shield: wraps it from its feet to its head, tiles orbiting
    if (this.shieldUp) {
      const k = Math.min(1, this.stateT / 0.2);
      const half = (this.hipY + 1.45) / 2;
      const fade = this.stateT > SHIELD_T - 0.4 ? (Math.sin(this.t * 40) > 0 ? 1 : 0.35) : 1; // flickers before it drops
      this.shield.position.y = half;
      this.shell.scale.set(1.05 * k, (half + 0.2) * k, 1.05 * k);
      this.shell.rotation.y = this.t * 0.6;
      this.plates.forEach((p, i) => {
        const a = p.userData.a + this.t * (i % 2 ? 1.6 : -1.2);
        p.position.set(Math.cos(a) * 1.12 * k, p.userData.y * half + Math.sin(this.t * 3 + i) * 0.08, Math.sin(a) * 1.12 * k);
        p.rotation.set(0, -a + Math.PI / 2, 0);
      });
      const fl2 = this.shieldFlash || 0;
      this.shieldMat.opacity = (0.12 + fl2 * 0.3) * fade;
      this.latticeMat.opacity = (0.45 + fl2 * 0.5) * fade * (0.85 + Math.sin(this.t * 13) * 0.15);
      this.tileMat.opacity = 0.7 * fade;
      this.shieldFlash = Math.max(0, fl2 - dt * 6);
    }
    this.cables.mesh.visible = true;
    if (this.dist < 45) this.cables.update(dt, this.t);
  }

  idleFar() {
    this.cables.mesh.visible = false;
  }

  onHit(color, hit) {
    if (this.dead) return undefined;
    if (!this.aggro) this.onAlert();
    if (this.shieldUp) {
      // only the shield's color does anything to it
      const hex = COLORS[this.shieldColor ?? this.color].hex;
      if (this.shieldColor !== null && color === this.shieldColor) {
        this.shieldHp--;
        this.shieldFlash = 1;
        this.world.fx.burst(hit?.point ?? this.center(_w), hex, { count: 12, speed: 5, life: 0.4, size: 0.2, gravity: 0, mode: 'shard' });
        audio.droneHit(0.6 * Math.max(0.5, falloff(this.dist, 6, 40)));
        if (this.shieldHp <= 0) this.dropShield(true);
        return 'hit';
      }
      this.world.fx.burst(hit?.point ?? this.center(_w), hex, { count: 6, speed: 3, life: 0.3, size: 0.15, gravity: 0 });
      return this.immune();
    }
    if (color !== this.color) {
      if (this.rollCool <= 0 && this.canDodge() && Math.random() < 0.4) this.tryRoll(this.world.game.player);
      return this.immune();
    }
    const r = this.takeHit(hit, { stagger: 0.28, knock: 1.8, keep: this.state === 'ward' });
    if (r === 'hit' && this.hp >= 2 && this.shieldCool <= 0 && Math.random() < 0.55) this.wardNext = true;
    return r;
  }

  onDie() {
    this.dropShield(false);
    this.charge.visible = false;
    this.dieHip = this.hipY;
    sfx('mummy_death', 0.7 * Math.max(0.3, falloff(this.dist, 5, 45)), { synth: (g) => {
      audio.noise({ dur: 1.2, gain: 0.25 * g, freq: 700, f2: 150, q: 0.6, type: 'lowpass' });
      audio.tone({ type: 'sawtooth', f: 140, f2: 50, dur: 0.9, gain: 0.06 * g });
    } });
  }

  // the stilts give way: the hips drop as the long legs fold up under it, it keels over along the killing
  // shot, arms flopping, head lolling; then finishDeath() blows it apart
  updateDying(dt) {
    this.dyingT += dt;
    const k = Math.min(1, this.dyingT / 1.0);
    const kk = k * k;
    const n = this.n;
    this.knock.multiplyScalar(Math.exp(-5 * dt));
    this.move.copy(this.knock);
    this.vel.x = this.move.x;
    this.vel.z = this.move.z;
    if (this.grounded) this.walk(this.vel.x * dt, this.vel.z * dt);
    this.sync();
    const jolt = Math.sin(Math.min(1, k * 3) * Math.PI) * 0.25;
    const f = this.deathF ?? -1, s = this.deathS ?? 0;
    const hipY = lerp(this.dieHip ?? HIP, 0.75, smooth01(k * 1.25));
    this.hipY = hipY;
    this.gaitAmp *= Math.exp(-4 * dt);
    n.body.position.set(0, hipY, 0);
    this.poseLegs(hipY, 0, this.gaitAmp, kk * 0.6, 0);
    n.torso.rotation.set(TORSO_REST + f * (kk * 1.1 + jolt), Math.sin(this.dyingT * 30) * 0.05 * (1 - k), -s * (kk * 0.9 + jolt));
    n.neck.rotation.x = NECK_REST + k * 0.4;
    n.head.rotation.set(k * 0.6 - jolt, 0, Math.sin(this.dyingT * 9) * 0.2 * (1 - k) + k * 0.4);
    n.armL.rotation.set(-k * 0.5 + jolt, 0, 0.1 + k * 0.6);
    n.armR.rotation.set(-k * 0.3 - jolt, 0, -0.1 - k * 0.5);
    n.foreL.rotation.x = -k * 0.6;
    n.foreR.rotation.x = -k * 0.9;
    this.dyingFx(dt, k);
    if (k >= 1) {
      this.dying = false;
      this.onDeath?.(this);
      this.finishDeath();
    }
  }

  dyingFx(dt, k) {
    // sparks spit from the failing joints; the visor gutters out
    if (Math.random() < dt * 22) {
      const j = [this.n.shinL, this.n.shinR, this.n.metaL, this.n.metaR, this.n.torso][Math.floor(Math.random() * 5)];
      this.group.updateMatrixWorld(true);
      this.world.fx.sparks(j.getWorldPosition(_w), UP, 0xffd9a0, { count: 5, speed: 5, spread: 1.4, life: 0.3 });
    }
    this.m.glow.color.copy(glowHex(this.color, Math.random() < 0.3 ? 2 : 0.3 * (1 - k)));
    this.m.coil.color.copy(glowHex(this.color, 0.4 * (1 - k)));
    this.cables.update(dt, this.t);
  }

  // it comes apart where it falls: limbs and plates flung, a flash of its color and a slump of sand
  finishDeath() {
    const c = this.center(new THREE.Vector3());
    const fx = this.world.fx;
    const hex = COLORS[this.color].hex;
    for (let i = 0; i < 10; i++) sandPuff(fx, _w.copy(c).setY(this.pos.y + rnd(0.1, 0.8)), 1.8, 0.8, 0.6, 1.4);
    fx.burst(c, 0xe4ddcc, { count: 26, speed: 6, life: 0.8, size: 0.2, gravity: 12, mode: 'shard' });
    fx.burst(c, hex, { count: 24, speed: 5, life: 0.6, size: 0.3, gravity: 4 });
    fx.sparks(c, UP, 0xffd9a0, { count: 18, speed: 9, spread: 2, life: 0.45 });
    fx.flash(c, hex, { size: 1.6, life: 0.2, k: 1.6 });
    this.cables.mesh.visible = false;
    const n = this.n;
    this.scatter([n.head, n.emitter, n.armL, n.armR, n.legL, n.legR, n.torso, n.pelvis], this.deathDir.clone().multiplyScalar(1), { speed: 2.5, up: 0.4, life: 1.4, spin: 5 });
  }

  cool(t) {
    this.m.glow.color.copy(glowHex(this.color, Math.max(0, 1 - t) * 0.5));
  }

  resetExtra() {
    this.dropShield(false);
    this.shieldCool = 0.5;
    this.castCool = rnd(1, 2);
    this.wardNext = false;
    this.stagger = 0;
    this.sandSpot = null;
    this.visY = null;
    this.cables.placed = false;
  }

  disposeExtra() {
    this.cables.dispose(this.world.scene);
  }
}
