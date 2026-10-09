// SWINGING VINES and the ZIP LINE (Verdant's god tree, levels/verdantGodTree.js).
//
// VineSwing { anchor: [x, y, z], length, sway: [dx, dz] (idle sway direction), swayAmp: 0.08 (rad), grab: 3.2 }
//   A long vine hanging from a bough, a glowing grip bulb near its end. Jump into its lower part and you grab
//   it (no button): from then on Player.update hands its frame to vine.carry() (the player.mount hook the
//   hover-sled uses). You hang as the bob of a pendulum: your run carries into the swing, W pumps it toward
//   where you look (S brakes), A/D lean it sideways, and JUMP lets go with the swing's velocity plus a kick
//   (the launch keeps its arc: player.launched). C drops you. While you hang, a faint dotted arc shows where
//   letting go now would carry you, a ring where it lands. The view sways and rolls with the swing; the vine
//   creaks at the end of each arc and whooshes through the bottom. Let go and it swings on, empty, then
//   settles back to its idle sway. A vine you just left can't be re-grabbed for a moment (others can).
//
// ZipLine { points: [[x, y, z], ...], speed: [min, max], hang: 1.8, onEnd }
//   A cable down a curve with a trolley handle at its top end: touch the handle and you ride it, hanging
//   under, gravity pulling you along the slope (between min and max m/s), the view swaying; at the far end
//   it lets you go with a little of its speed. (The god tree's harvest conduit trolley home.)
//
// Both reset() on a checkpoint respawn (and let the player go).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { audio } from '../audio.js';

const GRAV = 22; // (a touch lighter than the player's 24: long, readable arcs)
const PUMP = 10; // m/s² W adds along the look direction (tangent to the swing)
const LEAN = 3.5; // m/s² A/D sideways
const STEER = 5; // m/s² the look direction turns the swing's plane toward itself (while pumping)
const DAMP = 0.08; // per second
const MAX_V = 19;
const MAX_ANGLE = 1.35; // rad from straight down
const KICK_UP = 4.2; // m/s added upward on letting go
const KICK_ALONG = 1.08; // the swing's velocity is scaled by this on letting go
const BODY = 1.75; // feet below the hands, along the vine
const EYE_BELOW = 0.32; // the eye this far below the hands
const REGRAB = 0.7; // s before the vine you left can be grabbed again
const ARC_DOTS = 26;
const SOUNDS = ['vine_creak', 'vine_whoosh', 'vine_whip', 'branch_groan', 'leaves_rustle', 'fall_wind'];
audio.manifest?.then(() => audio.prefetch(SOUNDS));

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _down = new THREE.Vector3(0, -1, 0);

// shared look (made once)
let K = null;
function kit() {
  if (K) return K;
  const dotTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();
  K = {
    rope: new THREE.MeshStandardMaterial({ color: 0x3d5a26, roughness: 1, flatShading: true }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x3f7a2c, roughness: 0.9, flatShading: true, side: THREE.DoubleSide }),
    bulb: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8dff6a).multiplyScalar(1.5) }),
    halo: new THREE.MeshBasicMaterial({ color: 0x9dff7a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }),
    dot: new THREE.PointsMaterial({ map: dotTex, color: new THREE.Color(0xc8ffb0).multiplyScalar(1.4), size: 0.32, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }),
    ring: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc8ffb0).multiplyScalar(1.3), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    cable: new THREE.MeshStandardMaterial({ color: 0x2a302c, roughness: 0.5, metalness: 0.8 }),
    trolley: new THREE.MeshStandardMaterial({ color: 0x4f6a52, roughness: 0.5, metalness: 0.7, flatShading: true }),
  };
  return K;
}

// the vine's mesh, hanging along -y from its anchor (length L): a twisted stem, knots, leaves, a glowing
// grip bulb, and a short frayed tail below it
function vineMesh(L, seed) {
  const k = kit();
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const group = new THREE.Group();
  const stem = [];
  const n = Math.max(3, Math.round(L / 1.6));
  for (let i = 0; i < n; i++) {
    const y0 = -(i / n) * L, y1 = -((i + 1) / n) * L;
    const g = new THREE.CylinderGeometry(0.075, 0.085, y0 - y1, 5);
    g.translate((rnd() - 0.5) * 0.06, (y0 + y1) / 2, (rnd() - 0.5) * 0.06);
    stem.push(g);
    stem.push(new THREE.IcosahedronGeometry(0.12, 0).translate(0, y1, 0));
  }
  // a second strand twisting round the first
  for (let i = 0; i < n * 3; i++) {
    const a = i * 1.3, y = -(i / (n * 3)) * L;
    stem.push(new THREE.CylinderGeometry(0.035, 0.035, L / (n * 3) + 0.05, 4).translate(Math.cos(a) * 0.1, y - L / (n * 6), Math.sin(a) * 0.1));
  }
  const leaves = [];
  for (let i = 0; i < n * 2; i++) {
    const y = -rnd() * L * 0.92;
    const g = new THREE.PlaneGeometry(0.34, 0.5);
    g.translate(0, -0.25, 0).rotateX(0.6).rotateY(rnd() * Math.PI * 2).translate(0, y, 0);
    leaves.push(g);
  }
  const merge = (geos) => mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  group.add(new THREE.Mesh(merge(stem), k.rope), new THREE.Mesh(merge(leaves), k.leaf));
  const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), k.bulb);
  bulb.position.y = -L + 0.35;
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), k.halo);
  halo.position.y = -L + 0.35;
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.02, 0.9, 4).translate(0, -0.45, 0), k.rope);
  tail.position.y = -L;
  group.add(bulb, halo, tail);
  return { group, bulb, halo };
}

// ================================================================ VINE SWING
export class VineSwing {
  constructor(world, game, { anchor, length, sway = [1, 0], swayAmp = 0.035, grab = 3.4, seed = 7 }) {
    this.world = world;
    this.game = game;
    this.anchor = new THREE.Vector3(...anchor);
    this.L = length;
    this.rp = length - 0.35; // hands at the grip bulb
    this.swayDir = new THREE.Vector3(sway[0], 0, sway[1]).normalize();
    this.swayAmp = swayAmp;
    this.grabSpan = grab; // m of vine above its end you can catch
    this.t = seed * 1.37;
    this.bob = this.anchor.clone().addScaledVector(_down, this.rp);
    this.vel = new THREE.Vector3();
    this.free = false; // swinging on its own after a release
    this.rider = null;
    this.cool = 0;
    this.lastSide = 0;
    this.creakT = 0;
    this.whooshT = 0;
    this.stress = 0;
    const m = vineMesh(length, seed * 977 + 13);
    this.mesh = m.group;
    this.bulb = m.bulb;
    this.halo = m.halo;
    this.mesh.position.copy(this.anchor);
    world.scene.add(this.mesh);
    // the release arc (dots) and where it lands (a ring)
    const k = kit();
    this.arcGeo = new THREE.BufferGeometry();
    this.arcPos = new Float32Array(ARC_DOTS * 3);
    this.arcGeo.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3));
    this.arc = new THREE.Points(this.arcGeo, k.dot);
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    this.arc.userData.noCull = true;
    world.scene.add(this.arc);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 24).rotateX(-Math.PI / 2), k.ring);
    this.ring.visible = false;
    this.ring.userData.noCull = true;
    world.scene.add(this.ring);
    world.add(this);
  }

  // the point on the vine nearest p (for the grab test): distance along it and sideways
  nearest(p) {
    _u.subVectors(this.bob, this.anchor).normalize();
    _v.subVectors(p, this.anchor);
    const along = THREE.MathUtils.clamp(_v.dot(_u), 0, this.L + 0.9);
    _w.copy(this.anchor).addScaledVector(_u, along);
    return { along, off: _w.distanceTo(p) };
  }

  update(dt, player) {
    this.t += dt;
    this.cool = Math.max(0, this.cool - dt);
    if (this.rider) return; // (carry() moves it)
    if (this.free) {
      this.integrate(dt, null);
      // settle back into the idle sway once it's swung itself out
      if (this.vel.lengthSq() < 0.5 && Math.abs(_u.subVectors(this.bob, this.anchor).normalize().y + 1) < 0.02) this.free = false;
    } else {
      const a = Math.sin(this.t * 0.9) * this.swayAmp;
      this.bob.copy(this.anchor).add(_v.copy(this.swayDir).multiplyScalar(Math.sin(a) * this.rp)).add(_w.set(0, -Math.cos(a) * this.rp, 0));
      this.vel.set(0, 0, 0);
    }
    this.pose();
    this.bulb.scale.setScalar(1 + Math.sin(this.t * 4) * 0.12);
    this.halo.material.opacity = 0.14 + Math.sin(this.t * 4) * 0.05;
    // grab: in the air, touching the vine's lower stretch
    if (!player || player.dead || player.mount || this.cool > 0 || player.grounded || this.game.state !== 'playing') return;
    if (Math.abs(player.pos.x - this.bob.x) > 5 || Math.abs(player.pos.z - this.bob.z) > 5) return;
    // any part of you (shins to head) touching the vine's lower stretch or its dangling tail
    for (const h of [0.5, 1.1, 1.7]) {
      _f.set(player.pos.x, player.pos.y + h, player.pos.z);
      const { along, off } = this.nearest(_f);
      if (off < 1.3 && along > this.L - this.grabSpan) return this.board(player);
    }
  }

  // point the mesh down at the bob
  pose() {
    _u.subVectors(this.bob, this.anchor).normalize();
    this.mesh.quaternion.setFromUnitVectors(_down, _u);
  }

  board(p) {
    this.rider = p;
    this.free = false;
    p.mount = this;
    // you slide down to the grip: hands at rp along the vine, toward where you caught it
    _u.set(p.pos.x, p.pos.y + BODY, p.pos.z).sub(this.anchor);
    if (_u.y > -0.3 * _u.length()) _u.y = -0.3 * _u.length();
    _u.normalize();
    this.bob.copy(this.anchor).addScaledVector(_u, this.rp);
    // your run carries into the swing (the radial part is lost)
    this.vel.copy(p.vel).addScaledVector(_u, -p.vel.dot(_u));
    if (this.vel.length() > MAX_V) this.vel.setLength(MAX_V);
    p.vel.set(0, 0, 0);
    p.crouching = false;
    p.height = 1.75;
    p.launched = false;
    this.lastSide = 0;
    this.stress = 1;
    audio.sample(audio.sfxOr('vine_creak', 'mummy_creak'), { gain: 0.7, rate: 1.1, vary: 0.1 });
    audio.sample(audio.sfxOr('leaves_rustle', 'vine_whip'), { gain: 0.5, vary: 0.1 });
    this.world.fx.burst(this.bob.clone(), 0x7dbf4a, { count: 10, speed: 2.5, life: 0.8, size: 0.12, gravity: 4 });
  }

  // let go (jump: with a kick; drop: as you are)
  release(kick = true) {
    const p = this.rider;
    if (!p) return;
    this.rider = null;
    if (p.mount === this) p.mount = null;
    p.vel.copy(this.vel).multiplyScalar(kick ? KICK_ALONG : 1);
    if (kick) p.vel.y += KICK_UP;
    p.launched = kick;
    p.grounded = false;
    p.ground = null;
    p.coyote = 0;
    p.buffer = 0;
    p.carry?.set(0, 0, 0);
    p.fallTop = p.pos.y;
    this.free = true;
    this.cool = REGRAB;
    this.arc.visible = this.ring.visible = false;
    // the vine kicks back the other way, lighter now
    this.vel.multiplyScalar(-0.35);
    if (kick) {
      audio.jump();
      audio.sample(audio.sfxOr('vine_whoosh', 'fall_wind'), { gain: 0.55, rate: 1.15, vary: 0.08 });
    }
  }

  // pendulum step (input: the rider's, or null for an empty swing)
  integrate(dt, p, input = null) {
    _u.subVectors(this.bob, this.anchor).normalize();
    // gravity, tangential part
    _v.set(0, -GRAV, 0);
    _v.addScaledVector(_u, -_v.dot(_u));
    this.vel.addScaledVector(_v, dt);
    if (p && input) {
      let f = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
      let r = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
      if (input.stick) {
        f += input.stick.f;
        r += input.stick.r;
      }
      _f.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      _r.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      // W pumps: it drives the swing along the way it's already going (so it grows), and from rest it
      // starts one toward where you look; S brakes. The look direction steers the swing's plane round
      // toward itself, A/D lean it sideways.
      const sp = this.vel.length();
      if (sp < 1.2) _w.copy(_f).multiplyScalar(f * PUMP);
      else {
        _w.copy(this.vel).multiplyScalar((f * PUMP) / sp);
        if (f > 0) {
          // steer: the part of the look direction across the swing
          _v.copy(this.vel).setY(0).normalize();
          const across = _f.x * -_v.z + _f.z * _v.x; // (+: look is to the swing's left)
          const ahead = _f.dot(_v);
          _w.addScaledVector(_v.set(-_v.z, 0, _v.x), across * STEER * (ahead < 0 ? 0.5 : 1));
        }
      }
      _w.addScaledVector(_r, r * LEAN);
      _w.addScaledVector(_u, -_w.dot(_u));
      this.vel.addScaledVector(_w, dt);
    }
    this.vel.multiplyScalar(1 - DAMP * dt);
    if (this.vel.length() > MAX_V) this.vel.setLength(MAX_V);
    _w.copy(this.bob).addScaledVector(this.vel, dt).sub(this.anchor).normalize();
    // no swinging up past MAX_ANGLE: the vine goes slack and you fall back
    const lim = -Math.cos(MAX_ANGLE);
    if (_w.y > lim) {
      const h = Math.hypot(_w.x, _w.z);
      const s = Math.sqrt(1 - lim * lim) / h;
      _w.set(_w.x * s, lim, _w.z * s);
      this.vel.y = Math.min(this.vel.y, 0);
      this.vel.multiplyScalar(0.92);
    }
    this.bob.copy(this.anchor).addScaledVector(_w, this.rp);
    // keep the velocity tangent
    this.vel.addScaledVector(_w, -this.vel.dot(_w));
  }

  // Player.update's mount hook: the rest of the rider's frame
  carry(p, dt, input) {
    if (input.hit('Space')) return this.release(true), p.updateCamera();
    if (input.down('KeyC') || input.down('ControlLeft') || input.down('TouchCrouch')) return this.release(false), p.updateCamera();
    const prevBob = this.bob.clone(), prevVel = this.vel.clone();
    this.integrate(dt, p, input);
    _u.subVectors(this.bob, this.anchor).normalize();
    // the body hangs below the hands along the vine; don't swing it into the bark
    const feet = _f.copy(this.bob).addScaledVector(_u, BODY - 0.05).setY(this.bob.y - BODY);
    if (!p.fits(feet.x, feet.y, feet.z, BODY - 0.05)) {
      this.bob.copy(prevBob);
      this.vel.copy(prevVel).multiplyScalar(-0.3);
      _u.subVectors(this.bob, this.anchor).normalize();
      feet.copy(this.bob).setY(this.bob.y - BODY);
      if (this.vel.length() > 2.5) {
        p.shake = Math.max(p.shake, 0.25);
        audio.sample(audio.sfxOr('branch_groan', 'land'), { gain: 0.35, rate: 1.4, vary: 0.1 });
      }
    }
    p.pos.copy(feet);
    p.vel.copy(this.vel);
    p.grounded = false;
    p.ground = null;
    p.fallTop = p.pos.y;
    p.fallSpeed = 0;
    p.launched = false;
    p.sprinting = false;
    p.safeTimer = 0;
    p.speed2d = Math.hypot(this.vel.x, this.vel.z);
    p.invuln = Math.max(0, p.invuln - dt);
    p.shieldFx?.update(dt);
    p.landKick = Math.max(0, p.landKick - dt * 1.4);
    p.shake = Math.max(0, p.shake - dt * 2.5);
    p.eye += (1.6 - p.eye) * Math.min(1, dt * 14);
    p.updateAir?.(dt);
    this.pose();
    this.sounds(dt, p);
    this.showArc(p);
    this.placeCamera(p, dt);
    // the hazards still apply (spikes, acid) through the player's own checks next frame on landing
  }

  // creak at each end of the arc, whoosh through the bottom (louder the faster)
  sounds(dt, p) {
    const sp = this.vel.length();
    _r.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    _f.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const along = this.vel.dot(_f);
    const side = Math.abs(along) < 0.6 ? this.lastSide : Math.sign(along);
    this.creakT -= dt;
    this.whooshT -= dt;
    if (side !== this.lastSide && this.lastSide !== 0 && this.creakT <= 0) {
      audio.sample(audio.sfxOr('vine_creak', 'mummy_creak'), { gain: 0.35 + Math.min(0.4, this.stress * 0.3), rate: 0.9 + Math.random() * 0.25, vary: 0.05 });
      this.creakT = 0.5;
    }
    this.lastSide = side;
    _u.subVectors(this.bob, this.anchor).normalize();
    if (sp > 6 && _u.y < -0.93 && this.whooshT <= 0) {
      audio.sample(audio.sfxOr('vine_whoosh', 'fall_wind'), { gain: Math.min(0.75, (sp - 5) * 0.07), rate: 0.9 + sp * 0.015, vary: 0.06 });
      this.whooshT = 0.7;
    }
    this.stress = Math.min(1.5, sp / 10);
  }

  // where letting go now would carry you: a dotted arc, a ring where it lands
  showArc(p) {
    const sp = this.vel.length();
    if (sp < 2.5) {
      this.arc.visible = this.ring.visible = false;
      return;
    }
    const v = _v.copy(this.vel).multiplyScalar(KICK_ALONG);
    v.y += KICK_UP;
    const o = _w.copy(p.pos).setY(p.pos.y + 0.1);
    const dtA = 0.075;
    let hit = null, n = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
    a.copy(o);
    for (let i = 0; i < ARC_DOTS; i++) {
      const t = (i + 1) * dtA;
      b.set(o.x + v.x * t, o.y + v.y * t - 0.5 * 24 * t * t, o.z + v.z * t);
      d.subVectors(b, a);
      const len = d.length();
      if (i > 1 && len > 1e-4) {
        const h = this.world.raycast(a, d.normalize(), len, { meshes: false });
        if (h) {
          hit = h;
          this.arcPos.set([h.point.x, h.point.y + 0.05, h.point.z], n * 3);
          n++;
          break;
        }
      }
      this.arcPos.set([b.x, b.y, b.z], n * 3);
      n++;
      a.copy(b);
    }
    this.arcGeo.setDrawRange(1, n - 1);
    this.arcGeo.attributes.position.needsUpdate = true;
    this.arc.visible = true;
    this.ring.visible = !!(hit && hit.normal && hit.normal.y > 0.6);
    if (this.ring.visible) this.ring.position.copy(hit.point).setY(hit.point.y + 0.04);
  }

  // the view: your own look, rolled and dipped with the swing
  placeCamera(p, dt) {
    _r.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    _u.subVectors(this.bob, this.anchor).normalize();
    const lateral = this.vel.dot(_r);
    const lean = Math.atan2(_u.dot(_r), -_u.y); // how far the vine leans to your right
    const roll = THREE.MathUtils.clamp(-lean * 0.35 - lateral * 0.012, -0.32, 0.32);
    this.roll = (this.roll ?? 0) + (roll - (this.roll ?? 0)) * Math.min(1, dt * 8);
    const cam = p.camera;
    cam.position.copy(this.bob).addScaledVector(_u, EYE_BELOW);
    const sh = p.shake * p.shake * 0.4;
    if (sh) cam.position.add(_w.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    cam.quaternion.setFromEuler(_e.set(p.pitch - p.landKick * 0.15, p.yaw, this.roll, 'YXZ'));
  }

  reset() {
    if (this.rider) {
      const p = this.rider;
      this.rider = null;
      if (p.mount === this) p.mount = null;
    }
    this.free = false;
    this.cool = 0.5;
    this.vel.set(0, 0, 0);
    this.arc.visible = this.ring.visible = false;
  }
}

// ================================================================ ZIP LINE
export class ZipLine {
  constructor(world, game, { points, speed = [6, 22], hang = 1.85, onEnd = null, onBoard = null, start = 0.0, cableR = 0.06, enabled = true }) {
    this.world = world;
    this.game = game;
    this.curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    this.len = this.curve.getLength();
    this.vmin = speed[0];
    this.vmax = speed[1];
    this.hang = hang;
    this.onEnd = onEnd;
    this.onBoard = onBoard;
    this.s = start;
    this.v = 0;
    this.rider = null;
    this.enabled = enabled;
    this.cool = 0;
    this.sway = 0;
    this.swayV = 0;
    const k = kit();
    const n = Math.ceil(this.len / 2);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(this.curve, n, cableR, 5, false), k.cable);
    world.scene.add(cable);
    // the trolley: a wheeled carriage on the cable and a T-handle hanging under it
    this.trolley = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.7), k.trolley);
    body.position.y = 0.05;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.2, 5), k.trolley);
    bar.position.y = -0.6;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6).rotateZ(Math.PI / 2), k.bulb);
    grip.position.y = -1.2;
    this.halo = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), k.halo);
    this.halo.position.y = -1.2;
    this.trolley.add(body, bar, grip, this.halo);
    world.scene.add(this.trolley);
    this.home = this.s;
    this.place();
    world.add(this);
  }

  place() {
    const u = THREE.MathUtils.clamp(this.s / this.len, 0, 1);
    this.curve.getPointAt(u, this.trolley.position);
    this.curve.getTangentAt(u, _f);
    _f.y = 0;
    if (_f.lengthSq() > 1e-6) this.trolley.rotation.set(0, Math.atan2(_f.x, _f.z), 0);
    this.trolley.rotateZ(this.sway * 0.4);
  }

  update(dt, player) {
    this.cool = Math.max(0, this.cool - dt);
    this.halo.material.opacity = 0.14 + Math.sin(this.world.time * 4) * 0.05;
    if (this.rider) return;
    // an empty trolley rolls home to the top
    if (this.s > this.home) {
      this.s = Math.max(this.home, this.s - dt * 14);
      this.place();
    }
    if (!this.enabled || !player || player.dead || player.mount || this.cool > 0 || this.s > this.home + 0.01 || this.game.state !== 'playing') return;
    const h = this.trolley.position;
    const dx = player.pos.x - h.x, dz = player.pos.z - h.z, dy = player.pos.y + 1.6 - (h.y - 1.2);
    if (dx * dx + dz * dz < 1.3 && Math.abs(dy) < 1.4) this.board(player);
  }

  board(p) {
    this.rider = p;
    p.mount = this;
    this.v = Math.max(this.vmin, 3);
    p.vel.set(0, 0, 0);
    p.crouching = false;
    p.height = 1.75;
    this.whooshT = 0;
    this.loop ??= audio.createLoop(audio.sfxOr('zip_run', 'elevator_loop'), { gain: 0 });
    audio.sample(audio.sfxOr('vine_creak', 'mummy_creak'), { gain: 0.6, rate: 0.7 });
    audio.sample('door_slam', { gain: 0.3, rate: 1.6 });
    this.onBoard?.(this);
  }

  release(end = false) {
    const p = this.rider;
    if (!p) return;
    this.rider = null;
    if (p.mount === this) p.mount = null;
    this.curve.getTangentAt(Math.min(1, this.s / this.len), _f);
    p.vel.copy(_f).multiplyScalar(this.v * (end ? 0.35 : 0.8));
    p.vel.y = end ? 2 : Math.max(p.vel.y, 1);
    p.grounded = false;
    p.ground = null;
    p.fallTop = p.pos.y;
    p.launched = false;
    this.loop?.setGain(0);
    this.cool = 1.5;
    if (end) {
      audio.land(1);
      this.onEnd?.(this);
    }
  }

  carry(p, dt, input) {
    // (no letting go mid-cable: it's a long way down)
    this.curve.getTangentAt(Math.min(1, this.s / this.len), _f);
    const slope = -_f.y;
    this.v = THREE.MathUtils.clamp(this.v + GRAV * slope * dt - this.v * 0.05 * dt, this.vmin, this.vmax);
    this.s += this.v * dt;
    // sway: swings back as it speeds up, forward as the slope eases
    this.swayV += (-this.sway * 10 - (slope * this.v * 0.02) - this.swayV * 2.2) * dt;
    this.sway += this.swayV * dt;
    this.place();
    const top = this.trolley.position;
    _r.set(_f.z, 0, -_f.x).normalize();
    p.pos.copy(top).setY(top.y - 1.2 - this.hang + 0.1);
    p.pos.addScaledVector(_f.set(_f.x, 0, _f.z).normalize(), -Math.sin(this.sway) * 0.6);
    p.vel.copy(_f).multiplyScalar(this.v);
    p.grounded = false;
    p.ground = null;
    p.fallTop = p.pos.y;
    p.fallSpeed = 0;
    p.launched = false;
    p.safeTimer = 0;
    p.speed2d = this.v;
    p.invuln = Math.max(0, p.invuln - dt);
    p.eye += (1.6 - p.eye) * Math.min(1, dt * 14);
    p.shake = Math.max(p.shake * (1 - dt * 2.5), Math.min(0.12, this.v * 0.004));
    this.loop?.setGain(Math.min(0.5, this.v * 0.025));
    this.loop?.setRate(0.8 + this.v * 0.02);
    this.whooshT -= dt;
    if (this.whooshT <= 0 && this.v > 12) {
      audio.sample(audio.sfxOr('vine_whoosh', 'fall_wind'), { gain: 0.4, rate: 0.8, vary: 0.1 });
      this.whooshT = 1.6;
    }
    const cam = p.camera;
    cam.position.set(p.pos.x, p.pos.y + p.eye, p.pos.z);
    const sh = p.shake * p.shake * 0.4;
    cam.position.x += (Math.random() - 0.5) * sh;
    cam.position.y += (Math.random() - 0.5) * sh;
    cam.quaternion.setFromEuler(_e.set(p.pitch + this.sway * 0.15, p.yaw, -this.swayV * 0.05, 'YXZ'));
    if (this.s >= this.len - 0.05) this.release(true);
  }

  reset() {
    if (this.rider) {
      const p = this.rider;
      this.rider = null;
      if (p.mount === this) p.mount = null;
    }
    this.loop?.setGain(0);
    this.s = this.home;
    this.place();
  }
}
