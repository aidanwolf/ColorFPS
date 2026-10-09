// The hover-sled of Solar's Dune Sea run (levels/solarDunes.js): a low open-cockpit sled on a cushion of
// air, two ducted turbines at the back, hover pads glowing under its pontoons. It has no brain of its own:
// the run steers it along its rails (setPose each frame) and it carries whoever rides it.
//
// Riding: the run sets player.mount = craft, and Player.update hands the rest of its frame (after mouse
// look) to craft.carry(player, dt, input): the rider is pinned to the deck (WASD shuffles about a small
// standing area, no jumping, no falling off), keeps the craft's velocity, turns with it, and the view
// banks and rumbles with the hull. The weapon works as usual (it fires from the camera).
import * as THREE from 'three';
import { audio } from '../audio.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// the standing area on the deck, craft-local metres: x right, z forward (the windshield is ahead of it)
export const DECK = { x: 0.95, zMin: -2.5, zMax: 1.25, stand: -0.4 };
const DECK_SPEED = 3; // m/s you shuffle about the deck
const EYE = 1.61; // (player STAND_H - EYE_DROP)
const TILT_VIEW = 0.65; // how much of the hull's bank/pitch the view takes
const TRIM = 0x9bf6ff; // the sled's own trim (cyan-white: not an enemy's color)
const DUST = 0xc9a26a;
const WAKE = 0xf0dcb8; // (the wake astern: paler than the sand so it reads against it)

const rnd = (a, b) => a + Math.random() * (b - a);

let sledParts = null;
// Shared materials (one sled exists, but keep them out of the per-frame path).
function parts() {
  if (sledParts) return sledParts;
  sledParts = {
    hull: new THREE.MeshStandardMaterial({ color: 0xd9d2c2, metalness: 0.45, roughness: 0.42 }),
    duct: new THREE.MeshStandardMaterial({ color: 0xd9d2c2, metalness: 0.45, roughness: 0.42, side: THREE.DoubleSide }),
    plate: new THREE.MeshStandardMaterial({ color: 0x8c8676, metalness: 0.5, roughness: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1c1f26, metalness: 0.7, roughness: 0.45 }),
    deck: new THREE.MeshStandardMaterial({ color: 0x34373e, metalness: 0.3, roughness: 0.92 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xe8661a, metalness: 0.3, roughness: 0.5, emissive: 0x401202 }),
    trim: new THREE.MeshBasicMaterial({ color: new THREE.Color(TRIM).multiplyScalar(2.2) }),
    screen: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7ff0ff).multiplyScalar(1.4) }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fc8d8, metalness: 0.9, roughness: 0.08, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(TRIM).multiplyScalar(0.9), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    pad: new THREE.MeshBasicMaterial({ color: new THREE.Color(TRIM).multiplyScalar(1.2), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  };
  return sledParts;
}

// A top-view outline (x right, y forward) extruded `depth` up from y0, as a mesh facing -z.
function slab(points, y0, depth, material, bevel = 0.06) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(-Math.PI / 2); // shape y -> -z (forward), extrusion -> up
  g.translate(0, y0, 0);
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}
const mirror = (half) => [...half, ...half.slice().reverse().map(([x, y]) => [-x, y])];

export class Hovercraft {
  constructor(world, game, { pos, yaw = 0 }) {
    this.world = world;
    this.game = game;
    this.pos = new THREE.Vector3(...pos); // the deck's floor, at the middle of the craft
    this.yaw = yaw;
    this.pitch = 0;
    this.bank = 0;
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.rider = null;
    this.local = new THREE.Vector2(0, DECK.stand); // the rider's spot on the deck
    this.walk = new THREE.Vector2();
    this.followYaw = true; // the rider turns with the craft (off for the arrival spin)
    this.throttle = 0; // 0 parked idle .. 1 flat out (fans, glow, sound)
    this.rumble = 0; // extra view shake (landings, near misses)
    this.t = Math.random() * 10;
    this.dustT = 0;
    this.overSand = false; // skimming quicksand: a rooster tail of sand instead of dust
    this.surfaceY = pos[1] - 1.3; // the ground under it (for the dust)
    this.build();
    this.engine = audio.createLoop('engine_hum', { gain: 0, rate: 0.8 });
    this.wind = audio.createLoop('amb_wind', { gain: 0 });
    audio.manifest?.then(() => audio.prefetch(['engine_hum', 'amb_wind', 'fall_wind', 'warp_whoosh', 'land_sand', 'hydraulic_land', 'jump_pad', 'engine_shutdown', 'servo_heavy']));
    this.setPose(this.pos, yaw, 0, 0);
  }

  // ---------------------------------------------------------------- the model
  build() {
    const P = parts();
    const g = (this.group = new THREE.Group());
    this.body = new THREE.Group(); // everything that banks and bobs
    g.add(this.body);
    const add = (m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      this.body.add(m);
      return m;
    };
    // hull: a long wedge, pointed nose ahead (-z), wide flat stern; a darker keel under it
    const hullHalf = [[0, 4.1], [0.55, 3.6], [1.25, 2.2], [1.62, 0.6], [1.72, -1.6], [1.62, -2.9], [1.3, -3.25]];
    add(slab(mirror(hullHalf), -0.62, 0.42, P.hull, 0.12));
    add(slab(mirror([[0, 3.7], [0.45, 3.2], [1.05, 1.9], [1.4, 0.5], [1.48, -1.6], [1.38, -2.8], [1.1, -3.05]]), -0.86, 0.22, P.dark, 0.08));
    // deck plate (where you stand) and a raised nose cowl ahead of the windshield
    add(slab(mirror([[0, 1.75], [0.9, 1.6], [1.28, 0.6], [1.36, -1.4], [1.26, -2.85], [1.0, -3.0]]), -0.12, 0.06, P.deck, 0.03));
    add(slab(mirror([[0, 3.95], [0.5, 3.45], [1.08, 2.15], [1.18, 1.9], [0.0, 1.95]]), -0.12, 0.22, P.plate, 0.06));
    // orange stripes down the nose and a cyan trim line round the deck's edge
    for (const s of [-1, 1]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 1.9), P.accent), s * 0.42, 0.12, -2.85, 0, s * 0.42, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 4.7), P.trim), s * 1.5, -0.06, 0.55);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 2.6), P.trim), s * 1.18, -0.06, -2.55, 0, s * -0.38, 0);
    }
    add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 0.05), P.trim), 0, -0.06, 2.95);
    // pontoons: long rounded pods under each side with hover pads glowing beneath
    this.pads = [];
    for (const s of [-1, 1]) {
      const pod = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 5.4, 6, 12), P.dark), s * 1.52, -0.78, -0.1, Math.PI / 2, 0, 0);
      pod.scale.set(1, 1, 0.75);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 5.2), P.trim), s * 1.86, -0.72, -0.1);
      for (const z of [-2.2, 0, 2.2]) {
        const pad = add(new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), P.pad), s * 1.52, -1.06, z, Math.PI / 2, 0, 0);
        this.pads.push(pad);
      }
    }
    // railings round the standing area (a grab rail each side, posts, and a bar across the stern)
    const rail = (x1, z1, x2, z2, y) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const m = add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), P.plate), (x1 + x2) / 2, y, (z1 + z2) / 2);
      m.rotation.set(Math.PI / 2, 0, 0);
      m.rotation.y = Math.atan2(x2 - x1, z2 - z1);
      m.rotation.order = 'YXZ';
    };
    for (const s of [-1, 1]) {
      rail(s * 1.42, -2.9, s * 1.42, 1.3, 0.92);
      rail(s * 1.42, -2.9, s * 1.42, 1.3, 0.5);
      for (const z of [-2.9, -1.0, 1.3]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.95, 6), P.plate), s * 1.42, 0.46, z);
    }
    // the windshield: a curved sheet of tinted glass over the nose cowl, with a dark frame
    // (an arc of a cylinder, its middle at the pivot and its sides curving back round the console, leaning back)
    const arc = (h, r, y) => new THREE.CylinderGeometry(r, r, h, 20, 1, true, -Math.PI * 0.36, Math.PI * 0.72).rotateY(Math.PI).translate(0, y, r);
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.12, -2.25);
    pivot.rotation.x = 0.42;
    const glass = new THREE.Mesh(arc(0.95, 1.5, 0.47), P.glass);
    glass.renderOrder = 2;
    pivot.add(glass, new THREE.Mesh(arc(0.07, 1.51, 0.95), P.dark), new THREE.Mesh(arc(0.05, 1.51, 0.02), P.trim));
    this.body.add(pivot);
    // the console you stand behind: a pedestal with a glowing screen and two grips
    add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.32), P.dark), 0, 0.42, -1.75, 0.12, 0, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.32, 0.03), P.screen), 0, 0.78, -1.57, -0.55, 0, 0);
    for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 6), P.plate), s * 0.42, 0.9, -1.7, 0, 0, Math.PI / 2);
    // twin ducted turbines outboard of the stern on stub wings (the stern between them stays open: you
    // walk aboard there): duct ring, spinning fan, glowing core and exhaust, a fin on top
    this.fans = [];
    this.exhaust = [];
    for (const s of [-1, 1]) {
      const x = s * 2.15, y = 0.35, z = 2.75;
      add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 1.1), P.plate), s * 1.65, -0.08, 2.7, 0, 0, s * -0.12);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.8), P.hull), x, y + 0.95, z + 0.05, 0.3, 0, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.6), P.trim), x, y + 1.2, z + 0.1, 0.3, 0, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.7, 0.75, 20, 1, true), P.duct), x, y, z, Math.PI / 2, 0, 0);
      add(new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.07, 6, 24), P.dark), x, y, z - 0.38);
      add(new THREE.Mesh(new THREE.TorusGeometry(0.71, 0.04, 6, 24), P.trim), x, y, z + 0.38);
      const fan = new THREE.Group();
      fan.position.set(x, y, z);
      for (let i = 0; i < 7; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.64, 0.03), P.plate);
        b.position.y = 0.34;
        const arm = new THREE.Group();
        arm.rotation.z = (i / 7) * Math.PI * 2;
        b.rotation.y = 0.5;
        arm.add(b);
        fan.add(arm);
      }
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), P.dark);
      fan.add(hub);
      this.body.add(fan);
      this.fans.push(fan);
      const ex = add(new THREE.Mesh(new THREE.CircleGeometry(0.66, 24), P.glow), x, y, z + 0.2);
      this.exhaust.push(ex);
    }
    this.world.scene.add(g);
  }

  // ---------------------------------------------------------------- pose
  // Called by whatever steers it: deck position, heading, bank (roll, + leans right), pitch (+ nose up).
  setPose(pos, yaw, bank, pitch, vel = null) {
    const dYaw = wrapAngle(yaw - this.yaw);
    this.pos.copy(pos);
    this.yaw = yaw;
    this.bank = bank;
    this.pitch = pitch;
    if (vel) this.vel.copy(vel);
    this.quat.setFromEuler(_e.set(pitch, yaw, -bank, 'YXZ'));
    if (this.rider && this.followYaw) this.rider.yaw += dYaw;
  }

  // a point on the deck (craft-local x right, z forward, y up) in the world
  toWorld(x, y, z, out) {
    return out.set(x, y, -z).applyQuaternion(this.quat).add(this.pos);
  }

  forward(out) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  right(out) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  // ---------------------------------------------------------------- riding
  board(player) {
    this.rider = player;
    player.mount = this;
    // keep where you stepped on (inside the standing area)
    _v.subVectors(player.pos, this.pos);
    const r = this.right(_w);
    const lx = _v.dot(r);
    const lz = -_v.dot(this.forward(_w));
    this.local.set(THREE.MathUtils.clamp(lx, -DECK.x, DECK.x), THREE.MathUtils.clamp(-lz, DECK.zMin, DECK.zMax));
    this.walk.set(0, 0);
    player.vel.set(0, 0, 0);
    player.crouching = false;
  }

  // Step off: the player is left standing where they were, back on their own physics.
  unboard() {
    const p = this.rider;
    if (!p) return;
    this.rider = null;
    if (p.mount === this) p.mount = null;
    p.vel.set(0, 0, 0);
    p.carry?.set(0, 0, 0);
    p.fallTop = p.pos.y;
    p.grounded = false;
    p.ground = null;
    p.updateCamera();
  }

  // Player.update's mount hook: the rest of the rider's frame.
  carry(p, dt, input) {
    // shuffle about the standing area (in the view's directions, turned into the deck's)
    let f = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    let r = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
    if (input.stick) {
      f += input.stick.f;
      r += input.stick.r;
    }
    const wx = -Math.sin(p.yaw) * f + Math.cos(p.yaw) * r, wz = -Math.cos(p.yaw) * f - Math.sin(p.yaw) * r;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    let lx = wx * cy - wz * sy, lz = -wx * sy - wz * cy;
    const l = Math.hypot(lx, lz);
    if (l > 1) (lx /= l), (lz /= l);
    const k = Math.min(1, dt * 12);
    this.walk.x += (lx * DECK_SPEED - this.walk.x) * k;
    this.walk.y += (lz * DECK_SPEED - this.walk.y) * k;
    this.local.x = THREE.MathUtils.clamp(this.local.x + this.walk.x * dt, -DECK.x, DECK.x);
    this.local.y = THREE.MathUtils.clamp(this.local.y + this.walk.y * dt, DECK.zMin, DECK.zMax);
    // pinned to the deck, moving with it
    this.toWorld(this.local.x, 0, this.local.y, p.pos);
    p.vel.copy(this.vel);
    p.grounded = true;
    p.ground = null;
    p.crouching = false;
    p.height = 1.75;
    p.eye += (EYE - p.eye) * Math.min(1, dt * 14);
    p.fallTop = p.pos.y;
    p.fallSpeed = 0;
    p.sinkDepth = 0;
    p.inSand = false;
    p.burn = 0;
    p.launched = false;
    p.sprinting = false;
    p.safeTimer = 0;
    p.speed2d = Math.hypot(this.walk.x, this.walk.y);
    p.bob += dt * p.speed2d * 1.25;
    p.invuln = Math.max(0, p.invuln - dt);
    p.shieldFx?.update(dt);
    p.landKick = Math.max(0, p.landKick - dt * 1.4);
    p.shake = Math.max(0, p.shake - dt * 2.5);
    this.placeCamera(p);
  }

  // the view: the hull's tilt (part of it) on top of your own look, lifted to eye height, with a rumble
  placeCamera(p) {
    const cam = p.camera;
    _qy.setFromAxisAngle(UP, this.yaw);
    _qt.setFromEuler(_e.set(this.pitch * TILT_VIEW, this.yaw, -this.bank * TILT_VIEW, 'YXZ')).multiply(_qy.invert());
    _v.set(0, p.eye - p.landKick * 0.6, 0).applyQuaternion(_qt).add(p.pos);
    const sh = Math.max(p.shake, this.rumble);
    const s2 = sh * sh * 0.4;
    cam.position.set(_v.x + (Math.random() - 0.5) * s2, _v.y + (Math.random() - 0.5) * s2, _v.z + (Math.random() - 0.5) * s2);
    _q.setFromEuler(_e.set(p.pitch - p.landKick * 0.15, p.yaw, 0, 'YXZ'));
    cam.quaternion.copy(_qt).multiply(_q);
  }

  // ---------------------------------------------------------------- per frame (called by the run)
  update(dt) {
    this.t += dt;
    const speed = this.vel.length();
    const thr = this.throttle;
    // bob on the air cushion (less at speed, where the rails' own motion takes over) and a fine buzz
    const bob = Math.sin(this.t * 2.1) * 0.06 * (1 - thr * 0.6) + Math.sin(this.t * 31) * 0.008 * thr;
    this.group.position.copy(this.pos);
    this.group.quaternion.copy(this.quat);
    this.body.position.y = bob;
    this.body.rotation.z = Math.sin(this.t * 1.3) * 0.015 * (1 - thr);
    for (const fan of this.fans) fan.rotation.z += dt * (6 + thr * 40);
    const P = parts();
    const pulse = 0.75 + 0.25 * Math.sin(this.t * 9);
    P.glow.opacity = (0.18 + thr * 0.42) * (0.85 + Math.random() * 0.15);
    P.pad.opacity = (0.35 + 0.3 * thr) * pulse;
    for (const ex of this.exhaust) ex.scale.setScalar(0.9 + thr * 0.15 + Math.random() * 0.05);
    this.rumble = Math.max(0, this.rumble - dt * 1.5);
    // dust (or a sand rooster tail over quicksand) blown out from under it, a trail behind at speed
    this.dustT -= dt;
    if (this.dustT <= 0) {
      this.dustT = speed > 4 ? 0.03 : 0.12;
      const fx = this.world.fx;
      const gy = this.surfaceY + 0.15;
      const below = this.pos.y - this.surfaceY;
      if (below < 4.5) {
        const near = 1 - below / 4.5;
        for (const s of [-1, 1]) {
          this.toWorld(s * rnd(1.3, 2.0), 0, rnd(-3, 2.5), _v);
          _v.y = gy;
          const out = rnd(2, 4) * near;
          this.right(_w).multiplyScalar(s * out);
          fx.puff(_v, _w.x - this.vel.x * 0.25, rnd(0.3, 1.2) * near, _w.z - this.vel.z * 0.25, _c.set(DUST), 0.22 * near, rnd(0.8, 1.4), rnd(0.35, 0.6), 3.2);
        }
        if (speed > 4) {
          // the wake: a long trail of dust astern, and a spray of sand if it's skimming quicksand
          this.toWorld(rnd(-1, 1), 0, -3.6, _v);
          _v.y = gy;
          for (const sx of [-1.4, 1.4]) {
            this.toWorld(sx + rnd(-0.4, 0.4), 0, -4.6, _v);
            _v.y = gy;
            fx.puff(_v, -this.vel.x * 0.12 + rnd(-1.5, 1.5), rnd(0.8, 2.2), -this.vel.z * 0.12 + rnd(-1.5, 1.5), _c.set(WAKE), 0.2 * near, rnd(1.4, 2.2), rnd(0.6, 1.0), 3.4);
          }
          if (this.overSand) {
            for (let i = 0; i < 3; i++) {
              this.toWorld(rnd(-1.5, 1.5), 0, rnd(-3.4, -2.6), _v);
              _v.y = gy;
              fx.burst(_v, 0xd9b46a, { count: 2, speed: 3, life: 0.8, size: 0.22, gravity: 9, mode: 'puff', dir: _w.set(-this.vel.x * 0.04, 0.8, -this.vel.z * 0.04) });
            }
          }
        }
      }
    }
    // sound: the engine climbs with the throttle, the wind with the speed (silent once nobody rides it)
    const near = Math.max(0, 1 - this.pos.distanceTo(this.game.camera.position) / 40);
    this.engine.setGain((0.12 + thr * 0.33) * near);
    this.engine.setRate(0.75 + thr * 0.55 + Math.min(speed, 22) * 0.008);
    this.wind.setGain(this.rider ? Math.min(0.55, speed * 0.03) : 0);
    this.wind.setRate(0.9 + Math.min(speed, 22) * 0.015);
  }
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
