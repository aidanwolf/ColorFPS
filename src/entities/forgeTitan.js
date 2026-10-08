// THE FORGE TITAN — the Crimson Foundry's mini-boss: a hunched smelter golem of riveted iron with molten
// seams, a furnace in its chest, a forge hammer for a right hand and a crucible ladle in its left.
// You only have red here, so the fight is about timing and position, not colors: its iron hide turns
// every shot aside (and its furnace doors glow Solar yellow, so red shots ricochet off them), but after
// each attack the joints it strained vent red-hot — shoot them (each opened vent takes a couple of hits,
// then blows its steam and shuts). Enough vent hits and it OVERHEATS: it drops to a knee, its joints
// spark and stutter, and the furnace doors swing open on the core — THE weak point: a clean full unload
// into it ends a phase (3-4 windows win the fight), with crits, groans and a target to say so.
// Attacks (all telegraphed): hammer slams that send molten shockwaves rolling across the floor (jump them),
// ladle flings that flood a patch of floor (or catwalk) with lava, mortar volleys of slag from its stacks
// (shoot them down), and a charge that ends in the wall (dodge it: it's stunned and every vent opens).
// Land on its back and it panics: its stack vents open point-blank, then a steam blast throws you clear.
// Phase 2 calls in red drones; phase 3 the arena floor drops into lava (the arena does that, see onPhase)
// and it wades into the pit. The arena owns doors, music and the floor; this owns the boss and its HUD bar.
import * as THREE from 'three';
import { COLORS, RED, YELLOW } from '../colors.js';
import { audio } from '../audio.js';
import { mat } from '../materials.js';
import { liquidMaterial } from '../liquid.js';
import { Orb, Drone } from './drone.js';
import { director } from '../combat/director.js';
import { critHit, PainVoice, Malfunction, WeakMarker, prefetchFeel, play } from '../bossFeel.js';

const MAX_HP = 900;
const PHASE_HP = [0, 900, 600, 300]; // hp at which each phase begins (damage never skips a phase)
const VENT_DMG = 3; // a shoulder vent
const STACK_DMG = 4; // a smokestack vent (harder to reach)
// The furnace core while overheated, per phase: one full unload into the open core (~6 s at the
// blaster's 7.5 shots/s, 39-47 shots) is ~330-350 damage, more than a phase's 300 chunk, so a steady
// player ends each phase in one window (3-4 windows for the fight); the phase floor still stops it
// at each threshold so every phase plays. Vent hits are chip damage: they're how you overheat it.
const CORE_DMG = [0, 8, 9, 10];
const HEAT_MAX = [0, 8, 9, 10]; // vent hits to overheat it
const VENT_HEAT = 2; // heat one opened vent takes before it vents itself shut (so overheating takes a few attacks)
const OVERHEAT_T = [0, 6.5, 6, 5.5]; // seconds the core stays open
const VENT_T = 3.4; // seconds a vent stays open after the attack that strained it
const RING_H = 0.5; // shockwave wall height (m): any jump clears it
const RING_SPEED = [0, 10, 11, 12.5];
const RING_MAX = 34;
const HIP_Y = 2.5;
const RISE_DEPTH = 11; // the titan sleeps this far under the lava
const BACK_R = 1.7; // half-size of the walkable plate on its back
const BODY_R = 2.6; // you can't walk through it
export const FORGE_TITAN_SOUNDS = ['titan_roar', 'titan_steam', 'titan_slam', 'titan_pour', 'titan_death', 'titan_step', 'titan_charge', 'floor_collapse', 'titan_groan', 'titan_groan_big'];
const NAME = 'THE FORGE TITAN';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const STEAM = new THREE.Color(0xcfc6bc);
const SMOKE = new THREE.Color(0x3a3230);
const rand = (n) => Math.floor(Math.random() * n);
const rnd = (a, b) => a + Math.random() * (b - a);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = THREE.MathUtils.clamp;

// a new sound if it's been generated, otherwise the closest existing one
const sfx = (name, opts, fallback) => audio.sample(name, opts) || fallback?.();

// Slag lobbed from the smokestacks: a red orb (shoot it down) that falls under gravity, trailing embers,
// and bursts into a splash of sparks where it lands.
class SlagBall extends Orb {
  constructor(world, pos, vel, gravity) {
    super(world, pos, vel, RED, { damage: 1, life: 4, radius: 0.5 });
    this.gravity = gravity;
    this.trailT = 0;
  }

  update(dt, player) {
    this.vel.y -= this.gravity * dt;
    if ((this.trailT -= dt) <= 0) {
      this.trailT = 0.035;
      this.world.fx.ember(this.pos, rnd(-1, 1), rnd(0, 1.5), rnd(-1, 1), 0xff6a1a, 0.6, 0.16);
    }
    super.update(dt, player);
  }

  pop() {
    if (!this.alive) return;
    super.pop();
    const fx = this.world.fx;
    fx.ring(this.pos, UP, 0xff6a1a, { size: 0.3, end: 2.2, life: 0.4, k: 1.4 });
    for (let i = 0; i < 10; i++) fx.ember(this.pos, rnd(-4, 4), rnd(2, 6), rnd(-4, 4), 0xff7a2a, rnd(0.5, 1), 0.14);
  }
}

export class ForgeTitan {
  // o: { floorY, rise: [x, z] (where it sleeps under the lava), home: [x, z] (where it steps to), yaw,
  //      bounds / pitBounds: { minX, maxX, minZ, maxZ } (where it walks; phase 3 in the pit),
  //      chargeBounds (where a charge hits the wall), pitY (its feet in phase 3),
  //      poolBounds (where floor floods can land), catwalks: [{ minX, maxX, minZ, maxZ, y }],
  //      safeSpots: [[x, y, z]] (where its steam blast throws riders), hatches / droneSpots: [[x, y, z]],
  //      colors (that hurt its weak points, default [RED]), powerFrom (Vector3: the power source it draws on),
  //      lavaY (the pit's lava surface), onPhase(phase), onCollapse(), onDying(), onDefeated() }
  constructor(world, game, o) {
    this.world = world;
    this.game = game;
    this.o = o;
    this.floorY = o.floorY;
    this.colors = o.colors || [RED]; // the colors that hurt its weak points (red only in the Foundry)
    this.root = new THREE.Group();
    world.scene.add(this.root);
    this.build();
    world.addHittable(this.root);
    this.light = world.addLight(0xff6a20, 0, 20, 1.5);
    // the flat of its back is a moving platform you can land on and ride
    this.backSolid = world.addSolid(new THREE.Vector3(), new THREE.Vector3(), { delta: new THREE.Vector3(), moving: true, noShot: true, kind: 'metal' });
    this.backSolid.enabled = false;
    this.rings = [];
    this.blobs = [];
    this.drones = [];
    this.pools = [0, 1].map(() => this.makePool());
    this.marker = this.makeMarker();
    // the "this is IT" kit: pained groans, sparking joints while it's down, a target on the open core
    this.pain = new PainVoice(world, { name: 'titan_groan', fallback: 'titan_roar', rate: 1.25, gain: 0.8, big: 'titan_groan_big', bigFallback: 'titan_roar', bigRate: 0.78, gap: 1.8 });
    const L = this.legs, A = this.arms;
    this.joints = [A.R.pivot, A.L.pivot, A.R.elbow, A.L.elbow, L[0].knee, L[1].knee, this.head, A.R.hand, A.L.hand];
    this.malfunction = new Malfunction(game, this.joints, { scale: 1.5, spark: 0xfff0b0, arc: 0x8fd8ff, rate: 14 });
    this.coreMarker = new WeakMarker(world, game, { color: 0xff8a2a, size: 1.5 });
    // a molten tether it draws power through from the arena's geothermal core (o.powerFrom)
    this.beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a1a).multiplyScalar(2.2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 10, 1, true).translate(0, 0.5, 0), this.beamMat);
    this.beam.visible = false;
    this.beam.userData.noCull = true;
    world.scene.add(this.beam);
    this.tries = 0;
    this.reset();
    world.add(this);
  }

  // ------------------------------------------------------------------ construction
  build() {
    const tex = mat('metal', 'red').map; // the riveted panel texture, so each box reads as a bolted plate
    const iron = (this.ironMat = new THREE.MeshStandardMaterial({ map: tex, color: 0x5e4e48, metalness: 0.8, roughness: 0.45, emissive: 0x000000 }));
    const dark = (this.darkMat = new THREE.MeshStandardMaterial({ color: 0x1e1816, metalness: 0.6, roughness: 0.7, side: THREE.DoubleSide }));
    const seam = (this.seamMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
    const vent = (this.ventMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS[RED].hex).multiplyScalar(2.4) }));
    const molten = (this.moltenMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a2a).multiplyScalar(1.6) }));
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.grillMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS[YELLOW].hex).multiplyScalar(1.5) });
    const tag = (o, part) => {
      o.userData.hit = this;
      o.userData.part = part;
      return o;
    };
    const box = (w, h, d, m, x, y, z, parent, part) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return part ? tag(mesh, part) : mesh;
    };
    const cyl = (rt, rb, h, m, x, y, z, parent, part, seg = 14, open = false) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return part ? tag(mesh, part) : mesh;
    };
    const anchor = (x, y, z, parent) => {
      const a = new THREE.Object3D();
      a.position.set(x, y, z);
      parent.add(a);
      return a;
    };
    tag(this.root, 'armor');
    this.debrisParts = [];

    // ---- hips and legs: short, thick pillars on huge boots
    this.hips = new THREE.Group();
    this.hips.position.y = HIP_Y;
    this.root.add(this.hips);
    box(3.0, 0.9, 2.0, iron, 0, 0, 0, this.hips);
    box(3.1, 0.12, 2.1, seam, 0, -0.32, 0, this.hips);
    this.legs = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(s * 1.3, -0.1, 0);
      this.hips.add(thigh);
      box(1.25, 1.3, 1.35, iron, 0, -0.5, 0, thigh);
      const knee = new THREE.Group();
      knee.position.set(0, -1.15, 0.05);
      thigh.add(knee);
      box(1.0, 1.1, 1.1, dark, 0, -0.5, 0, knee);
      box(1.02, 0.1, 1.12, seam, 0, -0.62, 0, knee);
      box(1.2, 0.6, 0.35, iron, 0, 0.0, 0.62, knee);
      box(1.7, 0.5, 2.4, iron, 0, -1.03, 0.25, knee);
      for (const cx of [-0.55, 0, 0.55]) box(0.35, 0.3, 0.5, dark, cx, -1.13, 1.6, knee);
      this.legs.push({ thigh, knee, foot: anchor(0, -1.25, 0.3, knee) });
    }

    // ---- torso: a hunched furnace
    this.torso = new THREE.Group();
    this.torso.position.y = 0.3;
    this.hips.add(this.torso);
    box(4.4, 3.2, 3.0, iron, 0, 1.8, -0.15, this.torso);
    box(3.6, 1.0, 2.6, dark, 0, 0.05, -0.1, this.torso);
    box(4.46, 0.1, 3.06, seam, 0, 1.0, -0.15, this.torso);
    box(4.46, 0.1, 3.06, seam, 0, 2.55, -0.15, this.torso);
    box(0.12, 3.0, 3.08, seam, 0, 1.8, -0.15, this.torso);
    // furnace housing around the chest opening, the core inside, and two doors with Solar-yellow grills
    box(3.3, 0.5, 0.6, iron, 0, 3.05, 1.6, this.torso);
    box(3.3, 0.55, 0.6, iron, 0, 0.55, 1.6, this.torso);
    for (const s of [-1, 1]) box(0.45, 2.1, 0.6, iron, s * 1.42, 1.8, 1.6, this.torso);
    box(2.5, 2.1, 0.1, dark, 0, 1.8, 1.32, this.torso);
    this.core = cyl(0.78, 0.78, 0.5, this.coreMat, 0, 1.8, 1.5, this.torso, 'core', 20);
    this.core.rotation.x = Math.PI / 2;
    this.coreGlowMat = molten.clone();
    this.coreGlow = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.1, 6, 24), this.coreGlowMat);
    this.coreGlow.position.set(0, 1.8, 1.62);
    this.torso.add(this.coreGlow);
    this.doors = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 1.2, 1.8, 1.95);
      this.torso.add(pivot);
      box(1.2, 2.05, 0.2, iron, -s * 0.6, 0, 0, pivot, 'grill');
      for (let k = 0; k < 5; k++) box(0.92, 0.1, 0.06, this.grillMat, -s * 0.62, -0.72 + k * 0.36, 0.12, pivot, 'grill');
      this.doors.push({ pivot, s });
    }
    // yoke across the shoulders: the flat top is what you ride
    box(5.6, 0.75, 2.4, dark, 0, 3.4, -0.2, this.torso);
    this.backAnchor = anchor(0, 3.78, -0.3, this.torso);
    box(2.4, 0.06, 1.6, seam, 0, 3.79, -0.35, this.torso).scale.set(1, 1, 0.08);

    // ---- head: a riveted helmet sunk between the shoulders, one glowing slit
    this.head = new THREE.Group();
    this.head.position.set(0, 3.55, 1.05);
    this.torso.add(this.head);
    box(1.5, 1.05, 1.3, iron, 0, 0.4, 0, this.head);
    box(1.15, 0.16, 0.06, molten, 0, 0.45, 0.66, this.head);
    box(1.1, 0.35, 0.3, dark, 0, 0.0, 0.62, this.head);
    for (const s of [-1, 1]) box(0.28, 0.6, 0.28, dark, s * 0.62, 1.05, -0.1, this.head).rotation.z = -s * 0.35;
    this.debrisParts.push(this.head);

    // ---- smokestacks on the back, each with a vent collar at its base
    this.vents = {};
    this.stackTops = [];
    for (const s of [-1, 1]) {
      const part = s < 0 ? 'stackR' : 'stackL';
      const g = new THREE.Group();
      g.position.set(s * 1.35, 0, -1.1);
      this.torso.add(g);
      cyl(0.42, 0.48, 2.8, dark, 0, 5.0, 0, g);
      cyl(0.56, 0.5, 0.35, iron, 0, 6.3, 0, g);
      cyl(0.36, 0.36, 0.05, molten, 0, 6.48, 0, g);
      const glow = cyl(0.72, 0.72, 0.5, vent, 0, 4.05, 0, g, part);
      const cover = cyl(0.8, 0.8, 0.58, iron, 0, 4.05, 0, g);
      this.vents[part] = { part, glow, cover, closedY: 4.05, openY: 4.85, axis: 'y', open: 0, timer: 0, dmg: STACK_DMG };
      this.stackTops.push(anchor(0, 6.6, 0, g));
      this.debrisParts.push(g);
    }

    // ---- arms: pauldrons, a vent in each shoulder joint, crane-girder arms
    this.arms = {};
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'R' : 'L'; // it faces +z, so its right hand is on -x
      const pauldron = box(2.1, 1.0, 2.3, iron, s * 2.95, 3.95, -0.1, this.torso);
      box(2.14, 0.08, 2.34, seam, 0, -0.42, 0, pauldron);
      const cover = box(1.5, 1.2, 1.6, iron, s * 2.95, 3.15, -0.1, this.torso);
      const pivot = new THREE.Group();
      pivot.position.set(s * 2.95, 3.15, -0.1);
      this.torso.add(pivot);
      const glow = box(1.25, 1.0, 1.35, vent, 0, 0, 0, pivot, 'vent' + side);
      this.vents['vent' + side] = { part: 'vent' + side, glow, cover, closedY: 3.15, openY: 4.2, axis: 'y', open: 0, timer: 0, dmg: VENT_DMG };
      box(1.0, 2.1, 1.0, iron, 0, -1.45, 0, pivot);
      cyl(0.14, 0.14, 1.9, seam, s * 0.52, -1.45, 0.3, pivot, null, 6);
      const elbow = new THREE.Group();
      elbow.position.y = -2.5;
      pivot.add(elbow);
      box(0.8, 0.8, 0.8, dark, 0, 0, 0, elbow);
      box(1.25, 2.0, 1.25, iron, 0, -1.1, 0, elbow);
      box(1.3, 0.1, 1.3, seam, 0, -0.55, 0, elbow);
      const hand = new THREE.Group();
      hand.position.y = -2.15;
      elbow.add(hand);
      box(0.75, 0.6, 0.75, dark, 0, 0, 0, hand);
      const arm = { pivot, elbow, hand, pauldron };
      if (side === 'R') {
        // the forge hammer: its striking faces heat up white before a slam
        cyl(0.2, 0.2, 1.0, dark, 0, -0.6, 0, hand, null, 8);
        const headG = new THREE.Group();
        headG.position.y = -1.25;
        hand.add(headG);
        box(1.5, 1.3, 2.5, iron, 0, 0, 0, headG);
        box(1.56, 0.14, 2.54, seam, 0, 0, 0, headG);
        this.hammerFaces = [box(1.3, 1.1, 0.14, molten, 0, 0, -1.3, headG), box(1.3, 1.1, 0.14, molten, 0, 0, 1.3, headG)];
        this.hammerFaceMat = new THREE.MeshBasicMaterial({ color: 0x401008 });
        this.hammerFaces.forEach((f) => (f.material = this.hammerFaceMat));
        arm.face = anchor(0, 0, -1.35, headG);
        arm.headG = headG;
      } else {
        // the crucible ladle, brimming
        const ladle = new THREE.Group();
        ladle.position.y = -0.35;
        hand.add(ladle);
        for (const bx of [-0.95, 0.95]) box(0.14, 1.1, 0.14, dark, bx, -0.55, 0, ladle);
        cyl(1.05, 0.8, 1.3, dark, 0, -1.55, 0, ladle, null, 16, true);
        cyl(0.8, 0.8, 0.06, dark, 0, -2.2, 0, ladle, null, 16);
        cyl(1.08, 1.08, 0.12, iron, 0, -0.92, 0, ladle, null, 16, true);
        this.ladleMolten = cyl(0.98, 0.98, 0.04, molten, 0, -1.05, 0, ladle, null, 16);
        arm.ladle = ladle;
        arm.lip = anchor(0, -1.0, 0.9, ladle);
      }
      this.arms[side] = arm;
      this.debrisParts.push(pivot, pauldron, cover);
    }
    this.debrisParts.push(...this.doors.map((d) => d.pivot));
    // chest light position
    this.coreAnchor = anchor(0, 1.8, 2.6, this.torso);
    // a shaft of furnace light pouring out of the open chest (only while the core is open)
    this.shaftMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xff8a2a) }, uA: { value: 0 }, uT: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uA, uT; varying vec2 vUv;
        void main(){ float f = pow(vUv.y, 1.6); float rip = 0.8 + 0.2 * sin(vUv.x * 37.7 + uT * 9.0) * sin(vUv.y * 9.0 - uT * 6.0);
          gl_FragColor = vec4(uColor * f * rip * uA, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    });
    // (uv.y is 1 at the top: the narrow end sits in the cavity and it widens and fades outward)
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.0, 4.5, 20, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 2.25 + 1.5), this.shaftMat);
    this.shaft.position.set(0, 1.8, 0);
    this.shaft.raycast = () => {};
    this.shaft.visible = false;
    this.torso.add(this.shaft);
    this.root.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
  }

  // A lava flood: a marker that pulses on the floor first, then a pool of rolling lava (lethal) that drains.
  makePool() {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 14, 14).rotateX(-Math.PI / 2), liquidMaterial('red', true));
    mesh.visible = false;
    mesh.userData.noCull = true;
    this.world.scene.add(mesh);
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.markerMaterial());
    mark.visible = false;
    mark.renderOrder = 4;
    mark.userData.noCull = true;
    this.world.scene.add(mark);
    const solid = this.world.addSolid(new THREE.Vector3(), new THREE.Vector3(), { hazard: 'acid', noShot: true, noCollide: true });
    solid.enabled = false;
    return { mesh, mark, solid, state: 'idle', t: 0, x: 0, z: 0, w: 1, d: 1, y: 0 };
  }

  markerMaterial() {
    if (!this.markTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      g.strokeStyle = '#fff';
      g.lineWidth = 10;
      g.strokeRect(5, 5, 118, 118);
      g.globalAlpha = 0.35;
      g.lineWidth = 8;
      for (let i = -128; i < 256; i += 26) {
        g.beginPath();
        g.moveTo(i, 128);
        g.lineTo(i + 128, 0);
        g.stroke();
      }
      this.markTex = new THREE.CanvasTexture(c);
    }
    return new THREE.MeshBasicMaterial({
      map: this.markTex, color: new THREE.Color(0xff5a14).multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
  }

  // the hammer's target: a ring that tightens on where it will land
  makeMarker() {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4a10).multiplyScalar(2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    m.visible = false;
    m.renderOrder = 4;
    m.userData.noCull = true;
    this.world.scene.add(m);
    return m;
  }

  // ------------------------------------------------------------------ state
  reset() {
    const o = this.o;
    this.state = 'dormant';
    this.t = 0;
    this.hp = MAX_HP;
    this.phase = 1;
    this.heat = 0;
    this.action = null;
    this.mode = 'walk';
    this.modeT = 0;
    this.attackTimer = 1.2;
    this.history = [];
    this.pos = new THREE.Vector3(o.rise[0], this.floorY - RISE_DEPTH, o.rise[1]);
    this.yaw = o.yaw ?? 0;
    this.bounds = o.bounds;
    this.baseY = this.floorY;
    this.walkPhase = 0;
    this.stepSide = 0;
    this.flash = 0;
    this.coreFlash = 0;
    this.flinch = 0;
    this.shudder = 0;
    this.rideT = 0;
    this.droneT = 0;
    this.hints = {};
    this.color = null;
    for (const v of Object.values(this.vents)) {
      v.timer = 0;
      v.open = 0;
      v.flash = 0;
      v.heatLeft = 0;
    }
    this.doorOpen = 0;
    this.pose = this.idlePose();
    for (const r of this.rings) this.disposeRing(r);
    this.rings = [];
    for (const b of this.blobs) this.world.scene.remove(b.mesh);
    this.blobs = [];
    for (const p of this.pools) this.endPool(p);
    this.marker.visible = false;
    this.clearDrones(false);
    this.backSolid.enabled = false;
    this.backPrev = null;
    this.light.intensity = 0;
    this.beamA = 0;
    this.beam.visible = false;
    if (this.shaft) {
      this.shaft.visible = false;
      this.coreMarker.update(1, null);
      this.malfunction.update(1, false);
    }
    this.root.visible = true;
    this.root.scale.set(1, 1, 1);
    this.root.rotation.set(0, this.yaw, 0);
    this.root.position.copy(this.pos);
    this.applyPose(1);
    this.updateLooks(0);
    if (this.state !== 'dead') this.hud(false);
  }

  // Already beaten in an earlier session (its world is powered down): it's simply gone.
  vanish() {
    this.reset();
    this.state = 'dead';
    this.root.visible = false;
    this.world.removeHittable(this.root);
  }

  get active() {
    return this.state !== 'dormant' && this.state !== 'dead';
  }

  get defeated() {
    return this.state === 'dying' || this.state === 'dead';
  }

  // The fight begins: it rises out of the lava.
  start() {
    if (this.state !== 'dormant') return;
    this.state = 'intro';
    this.t = 0;
    this.tries++;
    audio.prefetch(FORGE_TITAN_SOUNDS);
    prefetchFeel();
    this.pos.set(this.o.rise[0], this.floorY - RISE_DEPTH, this.o.rise[1]);
    this.hud(true);
    this.game.hud.bossBar(1);
    this.game.player.shake = Math.max(this.game.player.shake, 0.4);
    sfx('titan_steam', { gain: 0.9 }, () => audio.sample('lava_sizzle', { gain: 1 }));
  }

  hud(on) {
    const h = this.game.hud;
    h.bossShow(on);
    const el = h.bossEl?.querySelector('.boss-name');
    if (!el) return;
    if (on && el.textContent !== NAME) {
      this.prevName = el.textContent;
      el.textContent = NAME;
    } else if (!on && this.prevName && el.textContent === NAME) el.textContent = this.prevName;
  }

  hint(key, text, urgent = false) {
    if (key && this.hints[key]) return;
    if (key) this.hints[key] = true;
    this.game.hud.bossHint(text, urgent);
  }

  // ------------------------------------------------------------------ damage
  onHit(color, hit) {
    this.color = null;
    if (this.state !== 'fight' || this.mode === 'stagger' || this.mode === 'collapse') return 'immune';
    const part = hit.part;
    if (part === 'grill') {
      this.color = YELLOW; // the shot rings off in Solar yellow
      if (this.doorOpen < 0.5) {
        // (not while they're swinging open: "blast the core" is the line that matters then)
        if (this.mode !== 'overheat') this.hint('grill', 'The furnace doors glow SOLAR yellow — red bounces off. Overheat it to open them!');
        return 'immune';
      }
    }
    if (!this.colors.includes(color)) return 'immune';
    if (part === 'core') {
      if (this.mode !== 'overheat' || this.doorOpen < 0.6) return 'immune';
      this.coreHit(hit);
      this.damage(CORE_DMG[this.phase]);
      return 'hit';
    }
    const v = this.vents[part];
    if (v) {
      if (v.open < 0.6 || v.heatLeft <= 0) return 'immune';
      v.flash = 1;
      this.burstAt(hit.point, 0xff6a2a, 10);
      audio.bossCoreHit();
      this.damage(v.dmg);
      if (this.state === 'fight' && this.mode !== 'overheat' && this.mode !== 'stagger' && this.mode !== 'collapse') {
        this.heat++;
        // each opened vent takes so much heat, then blows its steam and shuts: wait for the next attack
        if (--v.heatLeft <= 0) this.ventSpent(v);
        if (this.heat >= HEAT_MAX[this.phase]) this.overheat();
      }
      return 'hit';
    }
    this.hint('armor', 'Its iron hide turns your shots aside. Wait for the vents to glow RED-HOT after it attacks!');
    return 'immune';
  }

  // THE hit: the core flares white, molten sparks and embers spray out of the cavity, it groans and flinches
  coreHit(hit) {
    this.coreFlash = 1;
    this.flinch = 1;
    this.shudder = Math.max(this.shudder, 0.32);
    critHit(this.game, hit, { color: 0xff7a1a, spark: 0xffd080, scale: 1.5, gain: 1.1 });
    audio.bossCoreHit();
    const fx = this.world.fx;
    this.root.updateMatrixWorld(true);
    const c = this.core.getWorldPosition(_v);
    const fwd = _u.set(0, 0, 1).transformDirection(this.torso.matrixWorld);
    fx.sparks(c, fwd, 0xffb040, { count: 14, speed: 12, spread: 0.7, life: 0.6, size: 0.03, k: 2.4, gravity: 12 });
    for (let i = 0; i < 6; i++) fx.ember(c, fwd.x * rnd(3, 8) + rnd(-2.5, 2.5), fwd.y * 4 + rnd(1, 5), fwd.z * rnd(3, 8) + rnd(-2.5, 2.5), 0xff7a1a, rnd(0.7, 1.3), rnd(0.1, 0.2));
    if (Math.random() < 0.35) fx.puff(c, fwd.x * 2, 2.5, fwd.z * 2, STEAM, 0.35, 1, 0.9, 3);
    this.pain.hurt();
  }

  burstAt(p, color, n) {
    if (!p) return;
    this.world.fx.burst(p, color, { count: n, speed: 7, life: 0.45, size: 0.22, gravity: 9 });
  }

  damage(n) {
    if (this.defeated) return;
    const floor = this.phase < 3 ? PHASE_HP[this.phase + 1] : 0;
    this.hp = Math.max(floor, this.hp - n);
    this.flash = 1;
    this.game.hud.bossBar(this.hp / MAX_HP);
    if (this.hp > floor) return;
    if (this.phase < 3) this.nextPhase();
    else this.die();
  }

  overheat() {
    this.cancelAction();
    this.mode = 'overheat';
    this.modeT = OVERHEAT_T[this.phase];
    for (const v of Object.values(this.vents)) v.timer = 0;
    this.heat = HEAT_MAX[this.phase];
    this.game.player.shake = Math.max(this.game.player.shake, 0.4);
    sfx('titan_steam', { gain: 1 }, () => audio.sample('lava_sizzle', { gain: 1 }));
    audio.bossPhase();
    // its joints blow out as it drops
    for (const j of this.joints) this.malfunction.sputter(j, 1.6);
    play('joint_sparks', 'energy_crackle', { gain: 0.9, rate: 0.8, vary: 0 });
    this.hint(null, 'OVERHEATED — BLAST THE CORE!', true);
  }

  nextPhase() {
    this.cancelAction();
    this.phase++;
    this.heat = 0;
    for (const v of Object.values(this.vents)) v.timer = 0;
    this.game.player.shake = 0.8;
    // a deep, pained groan as the chunk breaks
    this.pain.roar();
    for (const j of this.joints) this.malfunction.sputter(j, 1.3);
    if (this.phase === 2) {
      this.mode = 'stagger';
      this.modeT = 2.4;
      this.hint(null, 'It howls for backup — drones inbound! Its attacks come faster now.', true);
      this.callDrones(2);
    } else {
      this.mode = 'collapse';
      this.modeT = 0;
      this.leapFrom = this.pos.clone();
      const pb = this.o.pitBounds;
      this.leapTo = new THREE.Vector3((pb.minX + pb.maxX) / 2, this.floorY, (pb.minZ + pb.maxZ) / 2);
      this.throwRider(true);
      this.hint(null, 'THE FLOOR IS GIVING WAY — get to the walkways!', true);
    }
    this.o.onPhase?.(this.phase);
  }

  cancelAction() {
    director.release(this);
    const a = this.action;
    if (a?.pool && a.pool.state === 'mark') this.endPool(a.pool);
    if (a?.pool2 && a.pool2.state === 'mark') this.endPool(a.pool2);
    this.action = null;
    this.marker.visible = false;
    this.attackTimer = 1.4;
    if (this.mode === 'attack') this.mode = 'walk';
  }

  die() {
    this.state = 'dying';
    this.deathT = 0;
    this.cancelAction();
    this.mode = 'dying';
    this.throwRider(true);
    this.backSolid.enabled = false;
    this.world.removeHittable(this.root);
    this.clearDrones(true);
    for (const b of this.blobs) this.world.scene.remove(b.mesh);
    this.blobs = [];
    for (const p of this.pools) {
      if (p.state === 'rise' || p.state === 'hold') {
        p.state = 'sink';
        p.t = 0;
      } else if (p.state !== 'sink') this.endPool(p);
    }
    sfx('titan_roar', { gain: 1, rate: 0.8, vary: 0 }, () => audio.bossRoar());
    this.game.player.shake = 1;
    this.hint(null, 'The Titan is cooling — it\'s coming apart!', true);
    this.o.onDying?.();
  }

  // ------------------------------------------------------------------ update
  update(dt, player) {
    if (this.state === 'dormant') {
      // fetch its sounds while you walk up to the arena
      if (!this.fetched && player.pos.distanceToSquared(this.pos) < 70 * 70) {
        this.fetched = true;
        audio.prefetch(FORGE_TITAN_SOUNDS);
      }
      return;
    }
    if (this.state === 'dead') {
      if (this.debris) this.updateDebris(dt);
      return;
    }
    this.t += dt;
    if (this.state === 'intro') this.updateIntro(dt, player);
    else if (this.state === 'dying') this.updateDeath(dt);
    else this.updateFight(dt, player);
    this.updateVents(dt);
    this.updateRings(dt, player);
    this.updatePools(dt, player);
    this.updateBlobs(dt);
    if (this.state !== 'dying') this.updateDrones(dt);
    this.applyPose(dt);
    this.updateBack(player);
    this.updateLooks(dt);
    this.updateBeam(dt);
    this.updateFeel(dt);
    this.ambient(dt);
    // a Bonus Round hides the bar; bring it back
    if ((this.state === 'fight' || this.state === 'intro') && this.game.hud.bossEl?.classList.contains('hidden') && !this.game.rulesPaused) this.hud(true);
  }

  updateIntro(dt, player) {
    const fast = this.tries > 1 ? 1.7 : 1; // retries skip the slow reveal
    const T = this.t * fast;
    const pose = this.idlePose();
    const channelY = this.floorY - 1.6;
    if (T < 2.6) {
      // rising out of the lava channel: splashes, steam, embers, the ground shaking
      const k = T / 2.6;
      this.pos.y = channelY - RISE_DEPTH * (1 - k) * (1 - k);
      player.shake = Math.max(player.shake, 0.25);
      const fx = this.world.fx;
      _v.set(this.pos.x + rnd(-3, 3), this.floorY - 1, this.pos.z + rnd(-2.2, 2.2));
      fx.ember(_v, rnd(-3, 3), rnd(4, 9), rnd(-3, 3), 0xff7a2a, rnd(0.6, 1.2), 0.18);
      if (Math.random() < 0.5) fx.puff(_v, 0, 2.5, 0, STEAM, 0.35, 1.4, 1.2, 3);
      pose.armRX = -0.6 + k * 0.3;
      pose.armLX = -0.6 + k * 0.3;
      pose.lean = 0.35 - k * 0.3;
      pose.headX = 0.4 * (1 - k);
    } else if (T < 3.6) {
      this.pos.y = channelY;
      if (!this.roared) {
        this.roared = true;
        sfx('titan_roar', { gain: 1, vary: 0 }, () => audio.bossRoar());
        player.shake = 0.7;
        this.flash = 1;
        for (const top of this.stackTops) {
          top.getWorldPosition(_v);
          for (let i = 0; i < 6; i++) this.world.fx.puff(_v, rnd(-1, 1), rnd(3, 6), rnd(-1, 1), STEAM, 0.4, 1.6, 1.0, 3);
        }
      }
      pose.lean = -0.25;
      pose.headX = -0.4;
      pose.armRX = -0.9;
      pose.armLX = -0.9;
      pose.armRZ = -0.5;
      pose.armLZ = 0.5;
    } else {
      // stride out of the channel onto the arena floor
      const k = Math.min(1, (T - 3.6) / 1.8);
      const e = k * k * (3 - 2 * k);
      this.pos.x = this.o.rise[0] + (this.o.home[0] - this.o.rise[0]) * e;
      this.pos.z = this.o.rise[1] + (this.o.home[1] - this.o.rise[1]) * e;
      this.pos.y = channelY + (this.floorY - channelY) * Math.min(1, k * 2.5);
      this.walk(dt, fast);
      if (k >= 1) {
        this.state = 'fight';
        this.mode = 'walk';
        this.attackTimer = 1.0;
        this.roared = false;
        this.hint(null, 'Its iron hide deflects shots — after each attack, shoot the vents that glow RED-HOT.', false);
      }
    }
    this.target = pose;
    this.root.position.copy(this.pos);
  }

  updateFight(dt, player) {
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    const pose = this.idlePose();
    this.target = pose;
    const riding = player.ground === this.backSolid && !player.dead;
    this.rideT = riding ? this.rideT + dt : 0;

    if (this.mode === 'collapse') return this.updateCollapse(dt, player, pose);
    if (this.mode === 'stagger') {
      this.modeT -= dt;
      pose.lean = -0.3;
      pose.headX = -0.5;
      pose.armRX = -1.2;
      pose.armLX = -1.2;
      pose.armRZ = -0.6;
      pose.armLZ = 0.6;
      this.shudder = 0.3;
      if (this.modeT <= 0) {
        this.mode = 'walk';
        this.attackTimer = 0.8;
      }
      return this.finishMove();
    }
    if (this.mode === 'overheat') {
      this.modeT -= dt;
      this.kneelPose(pose);
      this.doorTarget = 1;
      // steam whistles out of every seam
      if (Math.random() < dt * 14) {
        const v = Object.values(this.vents)[rand(4)];
        v.glow.getWorldPosition(_v);
        this.world.fx.puff(_v, rnd(-1, 1), rnd(2, 4), rnd(-1, 1), STEAM, 0.3, 1.2, 0.8, 3);
      }
      if (riding && this.rideT > 1.2) this.throwRider(false);
      if (this.modeT <= 0) {
        this.mode = 'walk';
        this.heat = 0;
        this.attackTimer = 1.0;
        sfx('titan_roar', { gain: 0.9 }, () => audio.bossRoar());
        this.hint(null, 'The doors slam shut. Back to the vents!');
      }
      return this.finishMove();
    }
    // ridden: it panics, its stacks vent point-blank, then a steam blast throws you off
    if (riding && this.action?.type !== 'buck' && !(this.action && this.action.committed)) {
      this.cancelAction();
      this.action = { type: 'buck', t: 0, step: 0 };
      this.mode = 'attack';
      this.vents.stackL.timer = this.vents.stackR.timer = 2.6;
      this.vents.stackL.heatLeft = this.vents.stackR.heatLeft = VENT_HEAT;
      sfx('titan_steam', { gain: 1 }, () => audio.sample('lava_sizzle', { gain: 1 }));
      this.hint('ride', 'You\'re riding it! Shoot the stack vents before it blasts you off!', true);
    }
    if (this.action) {
      this.updateAction(dt, player, dist, want, pose);
      return this.finishMove();
    }
    // ---- walk toward the player, keep turning to face them
    const turn = [0, 1.3, 1.6, 1.9][this.phase] * dt;
    this.yaw += clamp(wrap(want - this.yaw), -turn, turn);
    const venting = Object.values(this.vents).some((v) => v.timer > 0);
    const elevated = player.pos.y > this.floorY + 2.5;
    const prefer = elevated ? 5 : 7.5;
    const speed = [0, 2.4, 2.9, 2.2][this.phase] * (venting ? 0.5 : 1);
    if (dist > prefer && Math.abs(wrap(want - this.yaw)) < 1.2) {
      this.pos.x += Math.sin(this.yaw) * speed * dt;
      this.pos.z += Math.cos(this.yaw) * speed * dt;
      this.walk(dt, speed / 2.4);
    } else this.walk(dt, 0);
    this.attackTimer -= dt;
    if (this.attackTimer <= 0) this.chooseAttack(player, dist);
    this.finishMove();
  }

  finishMove() {
    const b = this.bounds;
    this.pos.x = clamp(this.pos.x, b.minX, b.maxX);
    this.pos.z = clamp(this.pos.z, b.minZ, b.maxZ);
    this.pushPlayer(this.game.player);
    this.root.position.copy(this.pos);
    if (this.shudder > 0) {
      this.root.position.x += rnd(-1, 1) * this.shudder * 0.12;
      this.root.position.z += rnd(-1, 1) * this.shudder * 0.12;
      this.shudder = Math.max(0, this.shudder - 0.02);
    }
    this.root.rotation.y = this.yaw;
  }

  // walk cycle bookkeeping: a heavy footfall each half stride
  walk(dt, rate) {
    if (rate <= 0) {
      this.walkPhase *= 0.9;
      return;
    }
    const prev = this.walkPhase;
    this.walkPhase += dt * 3.4 * rate;
    if (Math.floor(prev / Math.PI) !== Math.floor(this.walkPhase / Math.PI)) {
      const leg = this.legs[this.stepSide];
      this.stepSide ^= 1;
      leg.foot.getWorldPosition(_v);
      _v.y = this.baseY + 0.1;
      const d = _v.distanceTo(this.game.player.pos);
      sfx('titan_step', { gain: 0.9 * Math.max(0.25, 1 - d / 40) }, () => audio.bossStep());
      this.game.player.shake = Math.max(this.game.player.shake, 0.22 * Math.max(0, 1 - d / 30));
      for (let i = 0; i < 4; i++) this.world.fx.puff(_v, rnd(-2, 2), rnd(0.3, 1), rnd(-2, 2), SMOKE, 0.5, 1.2, 1.0, 2.5);
    }
  }

  chooseAttack(player, dist) {
    const elevated = player.pos.y > this.floorY + 2.5;
    let opts;
    if (elevated) opts = ['volley', 'volley', 'pour'];
    else {
      opts = ['slam', 'pour', 'volley'];
      if (dist < 11) opts.push('slam');
      if (this.phase < 3 && dist > 8) opts.push('charge', 'charge');
      if (this.phase === 3) opts.push('slam', 'pour');
    }
    // never the same attack three times running
    const [a, b] = this.history;
    if (a && a === b && opts.some((x) => x !== a)) opts = opts.filter((x) => x !== a);
    // the first attack it shows you is the slam (it teaches jumping the wave)
    const type = this.hints.slamSeen || elevated ? opts[rand(opts.length)] : 'slam';
    this.history.unshift(type);
    this.history.length = 2;
    this.mode = 'attack';
    this.action = { type, t: 0, step: 0, n: 0 };
    if (type === 'slam') this.hints.slamSeen = true;
  }

  endAction() {
    this.action = null;
    this.mode = 'walk';
    this.marker.visible = false;
    this.attackTimer = [0, 2.2, 1.7, 1.4][this.phase] + Math.random() * 0.6;
  }

  // ------------------------------------------------------------------ attacks
  updateAction(dt, player, dist, want, pose) {
    const a = this.action;
    a.t += dt;
    const p = this.phase;
    const face = (rate) => (this.yaw += wrap(want - this.yaw) * Math.min(1, dt * rate));

    if (a.type === 'slam') {
      const wind = a.n === 0 ? [0, 1.0, 0.85, 0.75][p] : 0.7;
      const slams = p === 1 ? 1 : 2;
      if (a.step === 0) {
        // raise the hammer overhead; it heats up white; a ring closes on where it will land
        if (a.t < wind * 0.7) face(3.5);
        const k = Math.min(1, a.t / wind);
        pose.armRX = -2.9;
        pose.elbowR = -0.7;
        pose.armRZ = -0.15;
        pose.lean = -0.2;
        pose.twist = 0.25;
        pose.armLX = -0.4;
        this.hammerHeat = k;
        this.showMarker(this.slamPoint(_v), 1 - k * 0.6, k);
        if (a.t > wind) {
          a.step = 1;
          a.t = 0;
          a.committed = true;
        }
      } else if (a.step === 1) {
        // the strike
        pose.armRX = -1.3;
        pose.elbowR = -0.05;
        pose.lean = 0.48;
        pose.dip = -1.0;
        pose.twist = -0.15;
        this.poseRate = 22;
        if (a.t > 0.13) {
          this.impact(player);
          a.step = 2;
          a.t = 0;
          a.n++;
        }
      } else {
        // the hammer is stuck in the floor; it wrenches it out
        pose.armRX = -1.3;
        pose.elbowR = -0.05;
        pose.lean = 0.46;
        pose.dip = -0.95;
        pose.twist = -0.15;
        this.hammerHeat = Math.max(0, (this.hammerHeat || 0) - dt);
        if (a.n < slams && a.t > 0.35) {
          a.step = 0;
          a.t = 0;
        } else if (a.n >= slams && a.t > [0, 1.6, 1.3, 1.1][p]) this.endAction();
        if (a.n >= slams && !a.vented) {
          a.vented = true;
          this.openVent('ventR');
        }
      }
    } else if (a.type === 'pour') {
      const wind = [0, 0.9, 0.85, 0.75][p];
      if (a.step === 0) {
        if (a.t === dt) {
          // mark where it lands (where you're heading), plus a second patch in phase 3
          a.pool = this.markPool(player, 0.55);
          if (p === 3) a.pool2 = this.markPool(player, 1.4, a.pool);
        }
        face(3);
        pose.armLX = -2.5;
        pose.elbowL = -0.9;
        pose.armLZ = 0.25;
        pose.ladle = 0.6;
        pose.lean = -0.15;
        pose.twist = -0.3;
        if (a.t > wind) {
          a.step = 1;
          a.t = 0;
          a.committed = true;
        }
      } else if (a.step === 1) {
        // fling: the molten load arcs out of the ladle onto the marked patch
        pose.armLX = -1.2;
        pose.elbowL = -0.2;
        pose.ladle = -1.9;
        pose.lean = 0.25;
        pose.twist = 0.2;
        this.poseRate = 16;
        if (a.t > 0.2 && !a.flung) {
          a.flung = true;
          this.arms.L.lip.getWorldPosition(_v);
          for (const pool of [a.pool, a.pool2]) if (pool) this.fling(_v, pool);
          sfx('titan_pour', { gain: 1 }, () => audio.sample('lava_sizzle', { gain: 1 }));
        }
        if (a.t > 0.45) {
          a.step = 2;
          a.t = 0;
          this.openVent('ventL');
        }
      } else {
        pose.armLX = -0.8;
        pose.ladle = -0.6;
        if (a.t > [0, 1.1, 0.9, 0.8][p]) this.endAction();
      }
    } else if (a.type === 'volley') {
      const count = [0, 4, 5, 7][p];
      const wind = 0.75;
      face(3);
      pose.dip = -0.35;
      pose.lean = -0.12;
      pose.armRZ = -0.5;
      pose.armLZ = 0.5;
      pose.headX = -0.3;
      if (a.step === 0) {
        // the stacks stoke up: belching embers and smoke
        for (const top of this.stackTops) {
          top.getWorldPosition(_v);
          if (Math.random() < dt * 30) this.world.fx.ember(_v, rnd(-1.5, 1.5), rnd(4, 8), rnd(-1.5, 1.5), 0xff7a2a, 0.8, 0.18);
          if (Math.random() < dt * 8) this.world.fx.puff(_v, 0, 3, 0, SMOKE, 0.6, 1.5, 1.0, 3);
        }
        this.stackHeat = Math.min(1, a.t / wind);
        if (a.t > wind) {
          a.step = 1;
          a.t = 0;
          a.committed = true;
          audio.bossOrbs();
        }
      } else if (a.step === 1) {
        if (a.n < count && a.t > a.n * 0.22) {
          this.lob(player, a.n);
          a.n++;
        }
        if (a.n >= count && a.t > count * 0.22 + 0.2) {
          a.step = 2;
          a.t = 0;
          this.openVent('stackL');
          this.openVent('stackR');
        }
      } else {
        this.stackHeat = Math.max(0, this.stackHeat - dt * 2);
        if (a.t > 0.8) this.endAction();
      }
    } else if (a.type === 'charge') {
      const b = this.o.chargeBounds;
      if (a.step === 0) {
        // brace: lowers its head, steam roars from the stacks, its feet grind sparks
        if (a.t < 0.75) face(5);
        pose.dip = -0.7;
        pose.lean = 0.5;
        pose.headX = 0.25;
        pose.armRX = 0.5;
        pose.armLX = 0.5;
        this.eyeFlare = 1;
        for (const top of this.stackTops) {
          top.getWorldPosition(_v);
          if (Math.random() < dt * 20) this.world.fx.puff(_v, rnd(-0.5, 0.5), rnd(4, 7), rnd(-0.5, 0.5), STEAM, 0.45, 1.0, 0.9, 3);
        }
        if (Math.random() < dt * 20) {
          this.legs[rand(2)].foot.getWorldPosition(_v);
          _v.y = this.baseY + 0.1;
          this.world.fx.sparks(_v, UP, 0xffb050, { count: 6, speed: 7, spread: 0.9 });
        }
        if (a.t === dt) sfx('titan_charge', { gain: 1 }, () => audio.bossCharge());
        if (a.t > 0.95) {
          a.step = 1;
          a.t = 0;
          a.committed = true;
          a.dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          audio.sweep();
        }
      } else if (a.step === 1) {
        pose.dip = -0.4;
        pose.lean = 0.55;
        pose.armRX = 0.7;
        pose.armLX = 0.7;
        const sp = [0, 15, 17, 17][p];
        this.pos.addScaledVector(a.dir, sp * dt);
        this.walk(dt, 2.6);
        // anything in its path dies
        const top = this.backTop();
        if (!player.dead && Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < 3.0 && player.pos.y < top - 0.6 && player.pos.y > this.baseY - 1) {
          player.damage(1, 'impact');
        }
        const wall = this.pos.x <= b.minX || this.pos.x >= b.maxX || this.pos.z <= b.minZ || this.pos.z >= b.maxZ;
        this.pos.x = clamp(this.pos.x, b.minX, b.maxX);
        this.pos.z = clamp(this.pos.z, b.minZ, b.maxZ);
        if (wall) {
          // smashes into the wall and staggers: every vent bursts open
          a.step = 2;
          a.t = 0;
          a.crashed = true;
          player.shake = Math.max(player.shake, 0.8);
          sfx('titan_slam', { gain: 1 }, () => audio.slam());
          this.head.getWorldPosition(_v).addScaledVector(a.dir, 1.5);
          this.world.fx.sparks(_v, _u.copy(a.dir).negate(), 0xffc060, { count: 40, speed: 12, spread: 1.0, life: 0.6 });
          this.world.fx.burst(_v, 0x8a7a70, { count: 40, speed: 6, life: 1.2, size: 0.6, gravity: 6 });
          for (const k of Object.keys(this.vents)) this.openVent(k);
          this.hint('crash', 'It slammed into the wall — every vent is open!', true);
        } else if (a.t > 1.8) {
          a.step = 2;
          a.t = 0;
        }
      } else {
        if (a.crashed) {
          // dazed against the wall
          pose.lean = -0.25;
          pose.headX = -0.4;
          pose.armRX = -0.3;
          pose.armLX = -0.3;
          pose.armRZ = -0.5;
          pose.armLZ = 0.5;
          this.shudder = Math.max(this.shudder, 0.2);
        }
        if (a.t > (a.crashed ? 2.6 : 0.6)) this.endAction();
      }
    } else if (a.type === 'buck') {
      // a rider on its back: it thrashes and builds steam, then blasts them clear
      pose.lean = -0.1 + Math.sin(a.t * 18) * 0.12;
      pose.twist = Math.sin(a.t * 11) * 0.3;
      pose.armRX = -1.6;
      pose.armLX = -1.6;
      pose.armRZ = -0.7;
      pose.armLZ = 0.7;
      this.shudder = 0.35;
      const riding = player.ground === this.backSolid;
      for (const top of this.stackTops) {
        top.getWorldPosition(_v);
        if (Math.random() < dt * (10 + a.t * 20)) this.world.fx.puff(_v, rnd(-1, 1), rnd(2, 5), rnd(-1, 1), STEAM, 0.35, 0.9, 0.8, 3);
      }
      if (a.step === 0 && a.t > 1.7) {
        a.step = 1;
        a.t = 0;
        if (riding) this.throwRider(false);
      } else if (a.step === 0 && !riding && a.t > 0.6) {
        a.step = 1;
        a.t = 0;
      } else if (a.step === 1 && a.t > 0.7) this.endAction();
    }
  }

  // where the hammer will land (fixed relative to the titan, so the marker is exact)
  slamPoint(out) {
    out.set(-4.2, 0, 4.7).applyAxisAngle(UP, this.yaw).add(this.pos);
    out.y = this.baseY;
    return out;
  }

  showMarker(p, scale, k) {
    const m = this.marker;
    m.visible = true;
    m.position.set(p.x, this.floorY + 0.06, p.z);
    m.scale.setScalar(2.6 + scale * 3);
    m.material.opacity = 0.35 + 0.65 * k * (0.6 + 0.4 * Math.sin(this.world.time * 30));
  }

  impact(player) {
    this.marker.visible = false;
    const at = this.arms.R.face.getWorldPosition(new THREE.Vector3());
    const planned = this.slamPoint(_w);
    at.x = (at.x + planned.x) / 2;
    at.z = (at.z + planned.z) / 2;
    // the hammer lands on whatever is under it: floor, a catwalk, or lava
    const top = this.surfaceAt(at.x, at.z);
    at.y = top;
    const d = at.distanceTo(player.pos);
    if (!player.dead && Math.hypot(player.pos.x - at.x, player.pos.z - at.z) < 2.8 && player.pos.y > top - 0.5 && player.pos.y < top + 2.6) player.damage(1, 'impact');
    player.shake = Math.max(player.shake, 0.9 * Math.max(0.25, 1 - d / 30));
    sfx('titan_slam', { gain: 1 }, () => audio.slam());
    const fx = this.world.fx;
    fx.burst(at.clone().setY(top + 0.3), 0xff6a1a, { count: 70, speed: 11, life: 0.8, size: 0.4, gravity: 10 });
    fx.burst(at.clone().setY(top + 0.3), 0x6a5a50, { count: 26, speed: 4, life: 1.4, size: 0.9, gravity: -0.5, drag: 2 });
    fx.flash(at.clone().setY(top + 0.1), 0xffa040, { size: 4, life: 0.25, n: UP });
    fx.ring(at.clone().setY(top + 0.1), UP, 0xffa040, { size: 1, end: 6, life: 0.4, k: 1.6 });
    // the molten shockwave rolls out along the floor (not along catwalks)
    if (Math.abs(top - this.floorY) < 0.5 || top < this.floorY) this.spawnRing(at);
    this.hint('jump', 'Molten shockwave — JUMP over it!', true);
  }

  // top of whatever is under (x, z): a solid, or the floor height if nothing
  surfaceAt(x, z) {
    _u.set(x, this.floorY + 9, z);
    const hit = this.world.raycast(_u, _w.set(0, -1, 0), 20, { meshes: false });
    return hit ? hit.point.y : this.floorY;
  }

  spawnRing(at) {
    const color = new THREE.Color(0xff5a14).multiplyScalar(2.4);
    const wallMat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, RING_H, 96, 1, true).translate(0, RING_H / 2, 0), wallMat);
    const crest = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 4, 96).rotateX(Math.PI / 2).translate(0, RING_H, 0), wallMat);
    const ground = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 96).rotateX(-Math.PI / 2), wallMat);
    const mesh = new THREE.Group();
    mesh.add(wall, crest, ground);
    mesh.position.set(at.x, this.floorY + 0.02, at.z);
    mesh.userData.noCull = true;
    this.world.scene.add(mesh);
    this.rings.push({ mesh, mat: wallMat, r: 1.5, hit: false, x: at.x, z: at.z, speed: RING_SPEED[this.phase] });
    audio.ringWave();
  }

  disposeRing(r) {
    this.world.scene.remove(r.mesh);
    r.mesh.children.forEach((c) => c.geometry.dispose());
    r.mat.dispose();
  }

  updateRings(dt, player) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.r += dt * ring.speed;
      ring.mesh.scale.set(ring.r, 1, ring.r);
      ring.mat.opacity = Math.max(0, 1 - ring.r / RING_MAX) * (0.8 + 0.2 * Math.sin(this.world.time * 40));
      // embers thrown off the crest
      if (Math.random() < dt * 40) {
        const a = Math.random() * Math.PI * 2;
        _v.set(ring.x + Math.cos(a) * ring.r, this.floorY + RING_H, ring.z + Math.sin(a) * ring.r);
        this.world.fx.ember(_v, Math.cos(a) * 2, rnd(1, 3), Math.sin(a) * 2, 0xff7a2a, 0.5, 0.12);
      }
      if (!ring.hit && !player.dead) {
        const d = Math.hypot(player.pos.x - ring.x, player.pos.z - ring.z);
        // feet below the top of the wave as it passes = burned; any jump clears it
        if (Math.abs(d - ring.r) < 0.5 && player.pos.y < this.floorY + RING_H && player.pos.y > this.floorY - 0.4) {
          ring.hit = true;
          player.damage(1, 'burn');
        }
      }
      if (ring.r > RING_MAX) {
        this.disposeRing(ring);
        this.rings.splice(i, 1);
      }
    }
  }

  // ---- ladle: lava floods
  // Pick a patch to flood: where the player will be in `lead` s, on the floor or along their catwalk.
  markPool(player, lead, avoid = null) {
    const pool = this.pools.find((p) => p.state === 'idle' && p !== avoid);
    if (!pool) return null;
    const size = [0, 8, 9, 9][this.phase];
    let x = player.pos.x + player.vel.x * lead, z = player.pos.z + player.vel.z * lead;
    let w = size, d = size, y = this.floorY;
    const cw = player.pos.y > this.floorY + 2.5 && (this.o.catwalks || []).find((c) => player.pos.x > c.minX - 0.5 && player.pos.x < c.maxX + 0.5 && player.pos.z > c.minZ - 0.5 && player.pos.z < c.maxZ + 0.5);
    if (cw) {
      // flood their catwalk: the patch is clipped to it
      x = (cw.minX + cw.maxX) / 2;
      w = cw.maxX - cw.minX;
      z = clamp(z, cw.minZ + d / 2, cw.maxZ - d / 2);
      y = cw.y;
    } else {
      const b = this.o.poolBounds;
      x = clamp(x, b.minX + w / 2, b.maxX - w / 2);
      z = clamp(z, b.minZ + d / 2, b.maxZ - d / 2);
    }
    Object.assign(pool, { state: 'mark', t: 0, x, z, w, d, y });
    pool.mark.visible = true;
    pool.mark.position.set(x, y + 0.05, z);
    pool.mark.scale.set(w, 1, d);
    return pool;
  }

  // a molten load flung from the ladle toward a marked patch
  fling(from, pool) {
    if (!pool) return;
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), this.moltenMat);
    mesh.position.copy(from);
    mesh.userData.noCull = true;
    this.world.scene.add(mesh);
    this.blobs.push({ mesh, from: from.clone(), to: new THREE.Vector3(pool.x, pool.y, pool.z), t: 0, dur: 0.6, pool });
    pool.state = 'flight';
  }

  updateBlobs(dt) {
    for (let i = this.blobs.length - 1; i >= 0; i--) {
      const b = this.blobs[i];
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.mesh.position.lerpVectors(b.from, b.to, k);
      b.mesh.position.y += Math.sin(k * Math.PI) * 4.5;
      b.mesh.scale.set(1 + Math.sin(b.t * 20) * 0.15, 1 - Math.sin(b.t * 20) * 0.15, 1);
      this.world.fx.ember(b.mesh.position, rnd(-2, 2), rnd(-1, 2), rnd(-2, 2), 0xff7a2a, 0.6, 0.2);
      if (k >= 1) {
        this.world.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        this.blobs.splice(i, 1);
        this.splash(b.pool);
      }
    }
  }

  splash(pool) {
    if (!pool || pool.state === 'idle') return;
    pool.state = 'rise';
    pool.t = 0;
    const fx = this.world.fx;
    _v.set(pool.x, pool.y + 0.3, pool.z);
    fx.burst(_v, 0xff7a2a, { count: 60, speed: 9, life: 0.9, size: 0.4, gravity: 12 });
    fx.ring(_v, UP, 0xff6a1a, { size: 1, end: Math.max(pool.w, pool.d) * 0.7, life: 0.45, k: 1.5 });
    for (let i = 0; i < 6; i++) fx.puff(_v, rnd(-2, 2), rnd(1, 3), rnd(-2, 2), STEAM, 0.3, 1.4, 1.4, 3);
    const d = _v.distanceTo(this.game.player.pos);
    audio.sample('lava_sizzle', { gain: Math.max(0.3, 1 - d / 30) });
  }

  updatePools(dt, player) {
    for (const p of this.pools) {
      if (p.state === 'idle') continue;
      p.t += dt;
      const fx = this.world.fx;
      if (p.state === 'mark' || p.state === 'flight') {
        p.mark.material.opacity = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(this.world.time * 18));
      } else if (p.state === 'rise') {
        const k = Math.min(1, p.t / 0.3);
        p.mark.material.opacity *= 0.85;
        this.placePool(p, -0.15 + 0.27 * k);
        if (k > 0.4) p.solid.enabled = true;
        if (k >= 1) {
          p.state = 'hold';
          p.t = 0;
          p.mark.visible = false;
        }
      } else if (p.state === 'hold') {
        if (Math.random() < dt * 14) {
          _v.set(p.x + rnd(-0.5, 0.5) * p.w, p.y + 0.15, p.z + rnd(-0.5, 0.5) * p.d);
          fx.ember(_v, rnd(-1, 1), rnd(2, 4), rnd(-1, 1), 0xff8a2a, 0.8, 0.14);
          if (Math.random() < 0.3) fx.puff(_v, 0, 1.5, 0, STEAM, 0.25, 1.2, 0.8, 3);
        }
        if (p.t > [0, 3.4, 3.6, 3.8][this.phase]) {
          p.state = 'sink';
          p.t = 0;
        }
      } else if (p.state === 'sink') {
        p.solid.enabled = false;
        const k = Math.min(1, p.t / 0.6);
        this.placePool(p, 0.12 - 0.3 * k);
        if (k >= 1) this.endPool(p);
      }
    }
  }

  placePool(p, dy) {
    p.mesh.visible = true;
    p.mesh.position.set(p.x, p.y + dy, p.z);
    p.mesh.scale.set(p.w, 1, p.d);
    p.solid.min.set(p.x - p.w / 2, p.y - 0.3, p.z - p.d / 2);
    p.solid.max.set(p.x + p.w / 2, p.y + 0.12, p.z + p.d / 2);
  }

  endPool(p) {
    p.state = 'idle';
    p.mesh.visible = false;
    p.mark.visible = false;
    p.solid.enabled = false;
  }

  // ---- smokestacks: slag mortar
  lob(player, n) {
    const top = this.stackTops[n % 2].getWorldPosition(new THREE.Vector3());
    const g = 15;
    // the first shot goes where you're heading; the rest scatter around you to box you in
    const lead = n === 0 ? 0.8 : 0.4;
    const T = new THREE.Vector3(player.pos.x + player.vel.x * lead, player.pos.y - 0.3, player.pos.z + player.vel.z * lead);
    if (n > 0) {
      const a = Math.random() * Math.PI * 2, r = rnd(2, 4.5);
      T.x += Math.cos(a) * r;
      T.z += Math.sin(a) * r;
    }
    // (the combat director pulls a first shot fired from off screen wide, as a warning)
    T.copy(director.aim(this, top, T));
    const flat = Math.hypot(T.x - top.x, T.z - top.z);
    const tf = 1.15 + flat * 0.022 - (this.phase - 1) * 0.08;
    const vel = new THREE.Vector3((T.x - top.x) / tf, (T.y - top.y) / tf + 0.5 * g * tf, (T.z - top.z) / tf);
    new SlagBall(this.world, top, vel, g);
    const fx = this.world.fx;
    fx.burst(top, 0xff7a2a, { count: 20, speed: 6, life: 0.5, size: 0.3, gravity: 4 });
    fx.puff(top, 0, 4, 0, SMOKE, 0.7, 1.4, 1.2, 3);
    audio.enemyShoot();
    this.hint('slag', 'Slag mortar! Dodge it — or shoot the red-hot balls out of the air.');
  }

  ventSpent(v) {
    v.timer = Math.min(v.timer, 0.15);
    v.glow.getWorldPosition(_v);
    this.world.fx.puff(_v, 0, 4, 0, STEAM, 0.55, 1.0, 1.4, 3);
    this.world.fx.sparks(_v, UP, 0xffa040, { count: 10, speed: 8, spread: 0.9 });
    sfx('titan_steam', { gain: 0.5, rate: 1.3, vary: 0.1 }, () => audio.sample('lava_sizzle', { gain: 0.5 }));
  }

  openVent(k) {
    const v = this.vents[k];
    v.heatLeft = VENT_HEAT;
    if (v.timer <= 0) {
      v.glow.getWorldPosition(_v);
      this.world.fx.puff(_v, 0, 3, 0, STEAM, 0.45, 1.2, 1.2, 3);
      sfx('titan_steam', { gain: 0.6, vary: 0.1 }, () => audio.sample('lava_sizzle', { gain: 0.6 }));
    }
    v.timer = VENT_T;
    this.hint('vent', 'A vent is open — shoot the glowing RED joint!', true);
  }

  updateVents(dt) {
    for (const v of Object.values(this.vents)) {
      v.timer = Math.max(0, v.timer - dt);
      const want = v.timer > 0 && this.state === 'fight' ? 1 : 0;
      v.open += clamp(want - v.open, -dt * 5, dt * 7);
      v.cover.position.y = v.closedY + (v.openY - v.closedY) * v.open;
      v.glow.visible = v.open > 0.05;
      v.flash = Math.max(0, (v.flash || 0) - dt * 6);
      if (v.open > 0.6 && Math.random() < dt * 6) {
        v.glow.getWorldPosition(_v);
        this.world.fx.puff(_v, rnd(-0.5, 0.5), rnd(1.5, 3), rnd(-0.5, 0.5), STEAM, 0.25, 0.9, 0.6, 3);
      }
    }
  }

  // ---- drones: red hunters that drop in from the ceiling hatches
  // (reinforcements wait for an attack token from the combat director; the phase-change call skips it)
  callDrones(n, force = true) {
    const hatches = this.o.hatches || [];
    const spots = this.o.droneSpots || [];
    if (!hatches.length || !spots.length) return;
    if (!force && !director.request(this, 0.5)) {
      this.droneT -= 0.4; // ask again shortly
      return;
    }
    director.release(this);
    for (let i = 0; i < n; i++) {
      if (this.drones.filter((d) => !d.dead).length >= 2) break;
      const h = hatches[(this.droneN = (this.droneN || 0) + 1) % hatches.length];
      const s = spots[rand(spots.length)];
      const d = new Drone(this.world, { pos: s, color: RED, hp: 2, range: 40, fireInterval: 2.6, orbit: 2 });
      d.pos.set(...h);
      d.group.position.copy(d.pos);
      d.aggro = true;
      this.world.fx.burst(d.pos, 0xff6a2a, { count: 40, speed: 8, life: 0.6, size: 0.3, gravity: 6 });
      this.drones.push(d);
    }
    audio.droneAlert();
    this.droneT = 0;
  }

  updateDrones(dt) {
    if (this.phase < 2 || this.state !== 'fight') return;
    this.drones = this.drones.filter((d) => this.world.entities.includes(d));
    const alive = this.drones.filter((d) => !d.dead).length;
    this.droneT += dt;
    // reinforcements once the last pair is down
    if (alive === 0 && this.droneT > (this.phase === 2 ? 12 : 14) && this.mode !== 'collapse') this.callDrones(this.phase === 2 ? 2 : 1, false);
    if (alive) this.droneT = 0;
  }

  clearDrones(explode) {
    for (const d of this.drones) {
      if (!this.world.entities.includes(d)) continue;
      if (explode && !d.dead) {
        d.die();
        d.explode();
      } else d.dispose();
    }
    this.drones = [];
  }

  // ---- riding
  backTop() {
    this.root.updateMatrixWorld(true);
    return this.backAnchor.getWorldPosition(_u).y;
  }

  updateBack(player) {
    const s = this.backSolid;
    const on = this.state === 'fight' && this.mode !== 'collapse';
    if (!on) {
      s.enabled = false;
      s.delta.set(0, 0, 0);
      this.backPrev = null;
      return;
    }
    this.root.updateMatrixWorld(true);
    const c = this.backAnchor.getWorldPosition(_v);
    s.min.set(c.x - BACK_R, c.y - 0.5, c.z - BACK_R);
    s.max.set(c.x + BACK_R, c.y, c.z + BACK_R);
    if (this.backPrev) s.delta.subVectors(s.min, this.backPrev);
    else s.delta.set(0, 0, 0);
    this.backPrev = (this.backPrev || new THREE.Vector3()).copy(s.min);
    s.enabled = true;
  }

  // steam blast: throw a rider clear onto the nearest safe spot (never into the lava)
  throwRider(force) {
    const player = this.game.player;
    if (player.ground !== this.backSolid && !(force && this.ridingNear(player))) return;
    const spots = this.o.safeSpots || [];
    if (!spots.length) return;
    let best = spots[0], bd = Infinity;
    for (const s of spots) {
      const d = Math.hypot(s[0] - player.pos.x, s[2] - player.pos.z);
      if (d > 5 && d < bd) {
        bd = d;
        best = s;
      }
    }
    const vy = 9;
    const dy = player.pos.y - best[1];
    const tf = (vy + Math.sqrt(vy * vy + 2 * 24 * Math.max(0, dy))) / 24;
    player.launch(vy, new THREE.Vector3((best[0] - player.pos.x) / tf, 0, (best[2] - player.pos.z) / tf));
    this.backSolid.enabled = false;
    this.backPrev = null;
    const fx = this.world.fx;
    for (const top of this.stackTops) {
      top.getWorldPosition(_v);
      for (let i = 0; i < 10; i++) fx.puff(_v, rnd(-3, 3), rnd(3, 8), rnd(-3, 3), STEAM, 0.5, 1.2, 1.4, 3);
    }
    sfx('titan_steam', { gain: 1, rate: 0.8 }, () => audio.sample('lava_sizzle', { gain: 1 }));
    player.shake = Math.max(player.shake, 0.5);
  }

  ridingNear(player) {
    const s = this.backSolid;
    return s.enabled && player.pos.x > s.min.x - 0.4 && player.pos.x < s.max.x + 0.4 && player.pos.z > s.min.z - 0.4 && player.pos.z < s.max.z + 0.4 && player.pos.y > s.max.y - 0.3 && player.pos.y < s.max.y + 2;
  }

  pushPlayer(player) {
    if (player.dead) return;
    const top = this.backSolid.enabled ? this.backSolid.max.y : this.pos.y + 6.5;
    if (player.pos.y > top - 0.4 || player.pos.y < this.pos.y - 1.5) return;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < BODY_R && d > 0.001) {
      const nx = this.pos.x + (dx / d) * BODY_R, nz = this.pos.z + (dz / d) * BODY_R;
      // never shove the player into a wall
      if (!this.world.pointInSolid(_v.set(nx, player.pos.y + 0.9, nz), 0.3)) {
        player.pos.x = nx;
        player.pos.z = nz;
      }
    }
  }

  // ---- phase 3: it leaps into the middle and the floor drops away into lava around it
  updateCollapse(dt, player, pose) {
    this.modeT += dt;
    const T = this.modeT;
    if (T < 0.9) {
      // crouch to leap
      pose.dip = -1.0;
      pose.lean = 0.3;
      pose.armRX = 0.6;
      pose.armLX = 0.6;
      this.yaw += wrap(Math.atan2(this.leapTo.x - this.pos.x, this.leapTo.z - this.pos.z) - this.yaw) * Math.min(1, dt * 4);
    } else if (T < 2.1) {
      const k = (T - 0.9) / 1.2;
      this.pos.lerpVectors(this.leapFrom, this.leapTo, k);
      this.pos.y = this.floorY + Math.sin(k * Math.PI) * 3.5;
      pose.armRX = -2.6;
      pose.armLX = -2.6;
      pose.lean = -0.2;
    } else {
      if (!this.landed) {
        this.landed = true;
        this.pos.copy(this.leapTo);
        player.shake = 1;
        sfx('titan_slam', { gain: 1 }, () => audio.bossLand());
        _v.copy(this.pos).setY(this.floorY + 0.2);
        this.world.fx.burst(_v, 0xff6a1a, { count: 120, speed: 14, life: 1, size: 0.5, gravity: 8 });
        this.world.fx.ring(_v, UP, 0xffa040, { size: 1, end: 14, life: 0.7, k: 1.6 });
        this.o.onCollapse?.();
      }
      // sinking into the lava as the floor goes
      const k = Math.min(1, (T - 2.1) / 3.2);
      this.baseY = this.floorY + ((this.o.pitY ?? this.floorY) - this.floorY) * k * k;
      this.pos.y = this.baseY;
      pose.dip = -0.9 * (1 - k);
      pose.lean = 0.2 - k * 0.4;
      pose.headX = -0.4 * k;
      pose.armRX = -1.4 * k;
      pose.armLX = -1.4 * k;
      pose.armRZ = -0.6 * k;
      pose.armLZ = 0.6 * k;
      if (Math.random() < dt * 20) {
        _v.set(this.pos.x + rnd(-3, 3), this.baseY + 0.4, this.pos.z + rnd(-3, 3));
        this.world.fx.ember(_v, rnd(-2, 2), rnd(3, 7), rnd(-2, 2), 0xff7a2a, 1, 0.18);
      }
      if (T > 5.6) {
        this.landed = false;
        this.mode = 'walk';
        this.bounds = this.o.pitBounds;
        this.attackTimer = 1.0;
        sfx('titan_roar', { gain: 1, vary: 0 }, () => audio.bossRoar());
        this.callDrones(1);
        this.hint(null, 'FINAL PHASE — jump between the islands, keep off the lava!', true);
      }
    }
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }

  // ------------------------------------------------------------------ death
  updateDeath(dt) {
    this.deathT += dt;
    const T = this.deathT;
    const pose = this.idlePose();
    this.target = pose;
    this.kneelPose(pose);
    pose.lean = Math.min(0.9, 0.2 + T * 0.2);
    pose.headX = 0.6;
    pose.armRX = 0.2;
    pose.armLX = 0.2;
    this.doorTarget = 1;
    this.shudder = T < 3.6 ? 0.25 : 0;
    const fx = this.world.fx;
    // eruptions of sparks and fire along its body
    if (T < 4 && Math.random() < dt * 9) {
      const parts = [...Object.values(this.vents).map((v) => v.glow), this.core, this.head];
      parts[rand(parts.length)].getWorldPosition(_v);
      fx.burst(_v, 0xff8a2a, { count: 40, speed: 9, life: 0.7, size: 0.4, gravity: 8 });
      fx.sparks(_v, UP, 0xffc070, { count: 14, speed: 10, spread: 1.2 });
      fx.puff(_v, 0, 2, 0, STEAM, 0.4, 1.4, 1.2, 3);
      audio.explode();
      this.game.player.shake = Math.max(this.game.player.shake, 0.25);
    }
    // cools from orange to black
    this.cool = clamp((T - 0.6) / 3.2, 0, 1);
    if (T > 3.8 && !this.debris) this.collapseIntoSlag();
    if (this.debris) this.updateDebris(dt);
    if (this.debris) {
      // the hulk sags into a slag heap
      const k = clamp((T - 3.8) / 1.6, 0, 1);
      this.root.scale.set(1 + k * 0.35, 1 - k * 0.62, 1 + k * 0.25);
      if (this.slag) this.slag.scale.setScalar(0.2 + k * 1.1);
    }
    if (T > 5.4 && this.state === 'dying') {
      this.state = 'dead';
      _v.copy(this.pos).setY(this.baseY + 2);
      fx.burst(_v, 0xff7a2a, { count: 200, speed: 16, life: 1.6, size: 0.6, gravity: 5 });
      fx.burst(_v, 0xffffff, { count: 50, speed: 7, life: 0.4, size: 1.0, gravity: 0 });
      fx.burst(_v, 0x2a2420, { count: 60, speed: 4, life: 2.6, size: 1.4, gravity: -1, drag: 1.4 });
      fx.ring(_v.setY(this.baseY + 0.3), UP, 0xffa040, { size: 1, end: 16, life: 0.8, k: 1.6 });
      fx.flash(_v, 0xffc080, { size: 8, life: 0.3 });
      sfx('titan_death', { gain: 1, vary: 0 }, () => audio.explode(true));
      this.game.player.shake = 1;
      this.light.intensity = 0;
      this.hud(false);
      this.o.onDefeated?.();
    }
    this.root.position.copy(this.pos);
    if (this.shudder) {
      this.root.position.x += rnd(-1, 1) * this.shudder * 0.1;
      this.root.position.z += rnd(-1, 1) * this.shudder * 0.1;
    }
  }

  // the arms, head, stacks and doors break off and tumble; a slag mound spreads where it stood
  collapseIntoSlag() {
    this.root.updateMatrixWorld(true);
    this.debris = [];
    for (const part of this.debrisParts) {
      this.world.scene.attach(part);
      part.userData.noCull = true;
      const out = _v.copy(part.position).sub(this.pos).setY(0).normalize();
      const vel = new THREE.Vector3(out.x * rnd(2, 5), rnd(2, 5), out.z * rnd(2, 5));
      this.debris.push({ obj: part, vel, spin: new THREE.Vector3(rnd(-3, 3), rnd(-2, 2), rnd(-3, 3)), rest: false });
    }
    this.slag = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1), this.darkMat);
    this.slag.scale.setScalar(0.2);
    this.slag.position.copy(this.pos).setY(this.baseY - 0.3);
    this.slag.rotation.set(0.3, 1, 0.2);
    this.slag.userData.noCull = true;
    this.world.scene.add(this.slag);
    sfx('titan_death', { gain: 0.6, rate: 1.2 }, () => audio.bossLimbBreak());
  }

  updateDebris(dt) {
    const sink = this.baseY < this.floorY - 0.5; // it died in the lava pit: the wreck goes under
    for (const d of this.debris) {
      const o = d.obj;
      if (d.rest) {
        if (sink) {
          o.position.y -= dt * 0.5;
          if (o.position.y < this.baseY - 4) o.visible = false;
        }
        continue;
      }
      d.vel.y -= 22 * dt;
      o.position.addScaledVector(d.vel, dt);
      o.rotation.x += d.spin.x * dt;
      o.rotation.y += d.spin.y * dt;
      o.rotation.z += d.spin.z * dt;
      const ground = sink ? (this.o.lavaY ?? this.baseY) : this.floorY + 0.4;
      if (o.position.y < ground) {
        o.position.y = ground;
        if (Math.abs(d.vel.y) < 3) d.rest = true;
        d.vel.y *= -0.3;
        d.vel.x *= 0.5;
        d.vel.z *= 0.5;
        d.spin.multiplyScalar(0.4);
        _v.copy(o.position);
        this.world.fx.burst(_v, sink ? 0xff7a2a : 0x6a5a50, { count: 14, speed: 4, life: 0.8, size: 0.5, gravity: 6 });
      }
    }
    if (sink && this.slag && this.slag.visible) {
      this.slag.position.y -= dt * 0.4;
      this.root.position.y -= dt * 0.4;
      // gone under for good
      if (this.root.position.y < this.baseY - 8) this.slag.visible = this.root.visible = false;
    }
  }

  // ------------------------------------------------------------------ animation
  idlePose() {
    return { dip: 0, lean: 0.12, twist: 0, headX: 0, armRX: -0.25, armRZ: -0.1, elbowR: -0.5, armLX: -0.25, armLZ: 0.1, elbowL: -0.5, ladle: 0.25, kneel: 0 };
  }

  kneelPose(p) {
    p.kneel = 1;
    p.dip = -1.45;
    p.lean = 0.12;
    p.headX = -0.35;
    p.armRX = -0.1;
    p.armLX = -0.1;
    p.armRZ = -0.55;
    p.armLZ = 0.55;
    p.elbowR = -0.2;
    p.elbowL = -0.2;
  }

  applyPose(dt) {
    const T = this.target || this.idlePose();
    const P = this.pose;
    const k = Math.min(1, dt * (this.poseRate || 7));
    this.poseRate = 7;
    for (const key in T) P[key] += (T[key] - P[key]) * k;
    const sw = Math.sin(this.walkPhase);
    const L = this.legs, A = this.arms;
    // legs: a stomping stride, or one knee down
    if (P.kneel > 0.5) {
      L[0].thigh.rotation.x = -1.35 * P.kneel;
      L[0].knee.rotation.x = 1.5 * P.kneel;
      L[1].thigh.rotation.x = 0.35 * P.kneel;
      L[1].knee.rotation.x = 1.25 * P.kneel;
    } else {
      L[0].thigh.rotation.x = sw * 0.42 - P.dip * 0.35;
      L[1].thigh.rotation.x = -sw * 0.42 - P.dip * 0.35;
      L[0].knee.rotation.x = Math.max(0, -sw) * 0.55 - P.dip * 0.5;
      L[1].knee.rotation.x = Math.max(0, sw) * 0.55 - P.dip * 0.5;
    }
    this.hips.position.y = HIP_Y + P.dip + Math.abs(Math.cos(this.walkPhase)) * 0.12 * Math.min(1, Math.abs(sw) * 3);
    this.torso.rotation.x = P.lean;
    this.torso.rotation.y = P.twist + sw * 0.05;
    // a core hit makes it flinch: the torso jerks back, the head snaps up
    this.flinch = Math.max(0, (this.flinch || 0) - dt * 6);
    this.torso.rotation.x -= this.flinch * 0.1;
    this.head.rotation.x = P.headX - this.flinch * 0.35;
    A.R.pivot.rotation.x = P.armRX - sw * 0.18;
    A.R.pivot.rotation.z = P.armRZ;
    A.R.elbow.rotation.x = P.elbowR;
    A.L.pivot.rotation.x = P.armLX + sw * 0.18;
    A.L.pivot.rotation.z = P.armLZ;
    A.L.elbow.rotation.x = P.elbowL;
    A.L.ladle.rotation.x = P.ladle;
    // furnace doors
    this.doorOpen += clamp((this.doorTarget || 0) - this.doorOpen, -dt * 2.5, dt * 2.5);
    this.doorTarget = 0;
    this.doors[0].pivot.rotation.y = 1.9 * this.doorOpen;
    this.doors[1].pivot.rotation.y = -1.9 * this.doorOpen;
  }

  // glows: seams with heat, the core, the hammer's face, the eye slit; the chest light
  updateLooks(dt) {
    const t = this.world.time;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.coreFlash = Math.max(0, this.coreFlash - dt * 6);
    this.eyeFlare = Math.max(0, (this.eyeFlare || 0) - dt * 2);
    const cool = this.cool || 0;
    const live = 1 - cool;
    const heat = this.mode === 'overheat' ? 1 : this.heat / HEAT_MAX[this.phase];
    const seam = (0.7 + heat * 1.2 + this.flash * 0.8 + Math.sin(t * 3) * 0.1) * live;
    this.seamMat.color.setRGB(1.0 * seam + 0.04, 0.35 * seam * (0.6 + heat * 0.5) + 0.02, 0.06 * seam + 0.01);
    this.ironMat.emissive.setRGB((0.12 * heat + this.flash * 0.15) * live + 0.25 * cool * (1 - cool) * 2, 0.03 * heat * live, 0);
    const pulse = 1.8 + Math.sin(t * 12) * 0.6;
    const vc = new THREE.Color(COLORS[RED].hex);
    this.ventMat.color.copy(vc).multiplyScalar(pulse * live + 0.05);
    for (const v of Object.values(this.vents)) if (v.flash > 0) v.glow.scale.setScalar(1 + v.flash * 0.12);
    else v.glow.scale.setScalar(1);
    // the core ramps up white-hot as the doors swing open (and flares on every hit)
    const coreHot = this.mode === 'overheat' ? 1.1 + this.doorOpen * (0.9 + Math.sin(t * 16) * 0.4) : 1.0;
    this.coreMat.color.setRGB(1, 0.62 + this.coreFlash * 0.25, 0.25 + this.coreFlash * 0.35).multiplyScalar((coreHot + this.coreFlash * 1.6) * live + 0.03);
    this.coreGlowMat.color.setRGB(1, 0.5, 0.15).multiplyScalar((1.4 + (this.mode === 'overheat' ? this.doorOpen * (0.9 + Math.sin(t * 10) * 0.6) : 0) + this.coreFlash * 1.5) * live + 0.03);
    this.coreGlow.scale.setScalar(1 + this.coreFlash * 0.18);
    this.moltenMat.color.setRGB(1, 0.5, 0.15).multiplyScalar((1.4 + this.eyeFlare * 1.5 + (this.stackHeat || 0)) * live + 0.03);
    const hh = this.hammerHeat || 0;
    this.hammerFaceMat.color.setRGB(0.25 + hh * 2.4, 0.06 + hh * 1.3, 0.03 + hh * 0.6).multiplyScalar(live + 0.1);
    this.grillMat.color.copy(new THREE.Color(COLORS[YELLOW].hex)).multiplyScalar(1.1 * live + 0.05);
    this.coreGlow.visible = cool < 1;
    if (this.state === 'dormant' || this.state === 'dead') this.light.intensity = 0;
    else {
      this.root.updateMatrixWorld(true);
      this.coreAnchor.getWorldPosition(this.light.position);
      this.light.intensity = (this.mode === 'overheat' ? 14 + this.coreFlash * 10 : 5 + heat * 6 + this.flash * 6) * live;
    }
  }

  // Stuck (kneeling overheated, howling in a stagger, dazed against the wall): its joints spark and arc,
  // servos stutter. While the core is open: the target marker and the furnace light shaft.
  updateFeel(dt) {
    const a = this.action;
    const fight = this.state === 'fight';
    const stuck = fight && (this.mode === 'overheat' ? 1 : this.mode === 'stagger' ? 0.6 : a?.type === 'charge' && a.crashed && a.step === 2 ? 0.55 : 0);
    this.malfunction.update(dt, stuck > 0, stuck);
    const open = fight && this.mode === 'overheat' && this.doorOpen > 0.6;
    // (only while the open chest faces you: it's no use pointing at it through its back)
    let facing = false;
    if (open) {
      this.core.getWorldPosition(_w);
      _v.set(0, 0, 1).transformDirection(this.torso.matrixWorld);
      facing = _v.dot(_u.subVectors(this.game.camera.position, _w).normalize()) > 0.25;
    }
    this.coreMarker.update(dt, facing ? _w : null, 1 + this.coreFlash);
    const sa = this.state === 'fight' || this.state === 'dying' ? this.doorOpen * (1 - (this.cool || 0)) : 0;
    this.shaft.visible = sa > 0.02;
    if (this.shaft.visible) {
      this.shaftMat.uniforms.uA.value = sa * (0.11 + 0.04 * Math.sin(this.world.time * 13) + this.coreFlash * 0.12);
      this.shaftMat.uniforms.uT.value = this.world.time;
    }
  }

  // smoke curling from the stacks, molten drips from the ladle, sparks from the seams
  ambient(dt) {
    if (this.state !== 'fight' && this.state !== 'intro') return;
    const fx = this.world.fx;
    if (Math.random() < dt * 5) {
      this.stackTops[rand(2)].getWorldPosition(_v);
      fx.puff(_v, rnd(-0.3, 0.3), rnd(1.5, 2.5), rnd(-0.3, 0.3), SMOKE, 0.7, 2.2, 0.8, 3.5);
    }
    if (Math.random() < dt * 3) {
      this.arms.L.lip.getWorldPosition(_v);
      fx.ember(_v, rnd(-0.3, 0.3), rnd(-1, 0), rnd(-0.3, 0.3), 0xff8a2a, 1.0, 0.16);
    }
    if (Math.random() < dt * 2) {
      this.head.getWorldPosition(_v);
      _v.y += rnd(-2, 0.5);
      fx.sparks(_v, UP, 0xffa040, { count: 3, speed: 4, spread: 1.2 });
    }
  }

  // Drawing on the geothermal core: while it roars for backup and while it sinks into the pit.
  updateBeam(dt) {
    const from = this.o.powerFrom;
    const on = !!from && this.state === 'fight' && (this.mode === 'stagger' || (this.mode === 'collapse' && this.modeT > 0.9));
    this.beamA = clamp((this.beamA || 0) + (on ? dt * 3 : -dt * 2), 0, 1);
    this.beam.visible = this.beamA > 0.01;
    if (!this.beam.visible) return;
    this.root.updateMatrixWorld(true);
    const to = this.backAnchor.getWorldPosition(_w);
    to.y += 1.2;
    _v.copy(from).sub(to);
    const len = _v.length();
    this.beam.position.copy(to);
    this.beam.quaternion.setFromUnitVectors(UP, _v.normalize());
    const flick = 0.75 + Math.sin(this.world.time * 37) * 0.15 + Math.random() * 0.1;
    this.beam.scale.set(flick, len, flick);
    this.beamMat.opacity = this.beamA * 0.85;
    if (Math.random() < dt * 30) {
      _u.copy(to).addScaledVector(_v, Math.random() * len);
      this.world.fx.ember(_u, rnd(-1, 1), rnd(-1, 1), rnd(-1, 1), 0xff8a2a, 0.5, 0.16);
    }
  }

  // for tests and debugging: the weak points open right now
  weakPoints() {
    const out = [];
    if (this.state !== 'fight') return out;
    for (const v of Object.values(this.vents)) if (v.open > 0.7 && v.heatLeft > 0) out.push({ part: v.part, pos: v.glow.getWorldPosition(new THREE.Vector3()) });
    if (this.mode === 'overheat' && this.doorOpen > 0.7) out.push({ part: 'core', pos: this.core.getWorldPosition(new THREE.Vector3()) });
    return out;
  }
}
