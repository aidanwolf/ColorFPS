// MECHANICS TOOLKIT — shootable switches and the platforms, walls and traps they drive. Everything here
// (and in traps.js / shotmech.js, re-exported below) follows the same rules:
//  - Positions are world space: `min`/`max` boxes ([x, y, z] arrays) or a `pos`. `color` is a blaster color
//    index (RED 0, YELLOW 1, GREEN 2, BLUE 3); only that color affects a shootable piece, any other
//    ricochets off it. `zone` picks the zone-tinted materials (mat(kind, zone)).
//  - Every entity has reset() (back to its built state, silently). The B.* wrappers in levels/builders.js
//    place each in one line and register that reset for checkpoint respawns.
//  - Switch → thing wiring: a switch calls activate(sw) / deactivate(sw) on everything in its `links` (and
//    timer(left, total) every frame while a timed switch runs). Every driven piece below implements them.
//  - Nothing re-solidifies or swings shut inside the player: it waits, shimmering, until you're clear.
//  - Sizing: a jump clears ~1.5 m up, but a mid-air crouch tuck plus step-up climbs ~2.8 m; gaps of ~5 m
//    can be jumped running, ~7 m sprinting; a ~18 m fall kills. AABB players can stand on any thin edge.
//  - B one-liners: B.colorSwitch(o) B.phasePlatform(o) B.chromaPlatform(o) B.timedGate({ ...o, switch })
//    B.crumble(o) B.trapdoor(o) B.spikes(min, max, o) B.shotMover(o) B.riser(o) B.sinker(o) B.shotRotor(o)
//    B.platformRack(o). levels/testRange.js (?dev&start=range) places every one of them.
//
// ColorSwitch    { pos, color, style:'panel'|'orb', face:'+z'|'-z'|'+x'|'-x'|'up'|'down', size:1.2,
//                  mode:'toggle'|'once'|'timed'|'pulse', time:5, links:[], onOn, onOff, on:false, light:true }
//    A panel stuck on a wall/floor (pos = the point on the surface its back touches, face = the way it
//    faces) or a floating orb (pos = center). toggle flips per hit; once latches on; timed stays on for
//    `time` s with a draining ring and ticks (re-hitting refills it), then reverts; pulse just fires
//    activate() on its links per hit (a timed gate keeps its own clock and the ring shows it).
//    turnOn() / turnOff() / on / left.
// PhasePlatform  { min, max, color:null, on:false, invert:false, warn:1.2, time:0.35, kind:'plat' }
//    Materializes (shimmer in, then solid) or dematerializes on command. A faint hologram shows where it
//    will be while off. invert: activate() makes it vanish. Flickers during the last `warn` s of a timed
//    switch that's about to remove it. set(on) / toggle() / activate() / deactivate().
// ChromaPlatform { min, max, color }
//    Solid only while the blaster is set to its color (a ghost you fall through otherwise).
// TimedGate      { min, max, color, time:4, openTime:0.25, closeTime:0.7, barOut:0.3, kind:'metal', onOpen,
//                  onClose }
//    A door that slides up when activated and closes after `time` s; a segment bar over the doorway (barOut
//    m proud of the door's faces, clear of a thicker wall) drains and ticks. It stops closing while you're
//    under it. B.timedGate({ ..., switch: { pos, face } }) adds a pulse switch of the gate's color whose
//    ring mirrors the gate's clock. activate() opens / refills, deactivate() closes now.
//
// traps.js
// CrumblePlatform { min, max, delay:0.6, respawn:4, disguise:false, kind:'plat' }
//    Stand on it: it shakes and cracks for `delay` s (0 = drops the instant you land), then breaks into
//    tumbling chunks. Reforms after `respawn` s (0 = only on player respawn). disguise: looks like an
//    ordinary platform (zone trim, no crack hints). activate() starts it.
// Trapdoor       { min, max, delay:0.35, respawn:3, trigger:'step'|'link'|{min,max}, split:true,
//                  spikes:null|y, kind:'floor' }
//    A floor whose panels swing down after `delay` s of shuddering, when stood on ('step'), when the player
//    enters a box, or when activated by a switch ('link'). spikes: the y of a pit floor to line with spikes.
// SpikeBed       { min, max, color:null }  Steel spikes (instant death), optionally glowing in a color.
//
// shotmech.js
// ShotMover      { min, max, path:[dx,dy,dz], color, mode:'step'|'push', step:2, speed, back:0, hold, kick:1.1,
//                  drag:2.5, bounce:false, twoWay:false, track:true, kind:'plat', onEnd(which, mover) }
//    A platform that only moves when shot (min/max = its box at the start, path = offset to the far end).
//    step: each hit moves it `step` m along the path at `speed` (5) m/s, easing into each notch; bounce
//    reverses at the ends; back > 0 slides it home at `back` m/s after `hold` (1.5) s without hits.
//    push: each hit adds `kick` m/s (top `speed` 7, `drag` slows it), so faster fire = faster travel; after
//    `hold` (0.25) s without hits it drifts home at `back` m/s; twoWay: pushed along the shot's direction
//    instead of always forward. A glowing rail with a notch per step shows the path. Riders are carried;
//    it holds still rather than move into the player or shove a rider into a ceiling.
//    Linked to a switch (step mode): activate() runs it to the end, deactivate() home.
// RiserBlock     { min, max, rise:4, color, kick:1.3, back:1.6, hold:0.2, speed:6, kind:'metal' }
//    A push-mode preset: spam-shoot it up (riding it is the point), it sinks at a steady `back` m/s the
//    moment you stop; charge gauges on its sides fill with the fire rate and blink while it sinks.
// SinkerBlock    { min, max, depth (default its height), color, kick:1.2, back:1.2, hold:0.5, kind:'metal' }
//    Blocks a doorway (put it in a slot it can sink into): shooting drives it down, it rises back with a
//    warning flash + sound once you stop, and halts rather than rise into you.
// ShotRotor      { pivot, parts:[[x1,y1,z1,x2,y2,z2], ...] (relative to pivot), axis:'y'|'x'|'z', dir:1,
//                  color, time:0.45, start:0, correct:null|k|[k...], onTurn, onCorrect, kind:'metal' }
//    A chunk that turns a quarter turn per hit, animating, with its collision boxes recomputed for each
//    orientation (old boxes stay until the turn lands). Refuses to turn (jams) if the new orientation
//    would overlap you. orientation (0..3) / turn() / activate().
// PlatformRack   { pos, face:'+z', along, columns, notches:6, step:1, start:[...], colors:[...] | color:0,
//                  width:2.4, depth:1.6, thick:0.4, spacing:3.2, targetGap:1.2, drift:0, home:null }
//    A wall of ledges. pos = the wall point of column 0 at notch 0's top height; columns run along `along`
//    (default +x on a ±z wall, -z on a ±x wall) every `spacing` m and stick out `depth` m toward `face`.
//    Each column has a rail with a tick per notch and a marker riding with its ledge, an UP arrow target
//    `targetGap` m above the rail and a DOWN one below it (colors per column, repeating); each correct
//    hit moves that ledge one notch (riders carried, never crushed). Shoot them into a staircase.
//    drift > 0: a ledge left alone for `drift` s creeps one notch back toward home[i] (default its start),
//    its marker blinking first. notchesNow lists the current notches.
import * as THREE from 'three';
import { COLORS } from '../colors.js';
import { boxGeo, mat } from '../materials.js';
import {
  v3, hexOf, glowMat, edgeGeo, faceDecal, faceNormal, faceEuler, glyphMat, holoMat, ringMesh, barMesh,
  overlapsPlayer, nearGain, tickDue, sfx,
} from './mechkit.js';

export { CrumblePlatform, Trapdoor, SpikeBed } from './traps.js';
export { ShotMover, RiserBlock, SinkerBlock, ShotRotor, PlatformRack } from './shotmech.js';

const UP = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

// Call activate/deactivate/timer on a switch's links (entities or plain { activate() } objects).
function drive(links, fn, ...args) {
  for (const l of links) l?.[fn]?.(...args);
}

export class ColorSwitch {
  constructor(world, { pos, color, style = 'panel', face, size, mode = 'toggle', time = 5, links = [], onOn = null, onOff = null, on = false, zone = 'red', light = true, timerSource = null }) {
    this.world = world;
    this.color = color;
    this.hex = COLORS[color].hex;
    this.mode = mode;
    this.time = time;
    this.links = links;
    this.onOn = onOn;
    this.onOff = onOff;
    this.startOn = on;
    this.timerSource = timerSource; // anything with { left, time } (a TimedGate): the ring shows its clock
    this.orb = style === 'orb';
    if (style === 'floor') face = face || 'up';
    this.face = face || '+z';
    this.pos = v3(pos);
    this.on = on;
    this.left = 0;
    this.cool = 0;
    this.flash = 0;
    this.pop = 0;
    this.t = Math.random() * 10;
    const c = new THREE.Color(this.hex);

    this.group = new THREE.Group();
    world.scene.add(this.group);
    if (this.orb) {
      // a glowing core in a glass shell, two orbiting rings; it bobs in place
      const r = (size || 1) * 0.42;
      this.group.position.copy(this.pos);
      this.hitGroup = new THREE.Group();
      this.coreMat = glowMat(this.hex, 1);
      this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.55, 0), this.coreMat);
      this.shellMat = new THREE.MeshStandardMaterial({ color: 0x20242e, emissive: c, emissiveIntensity: 0.25, metalness: 0.3, roughness: 0.15, transparent: true, opacity: 0.45, depthWrite: false });
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), this.shellMat);
      this.hitGroup.add(this.core, shell);
      this.hitGroup.userData.hit = this;
      this.ringsMat = glowMat(this.hex, 1.6);
      this.rings = new THREE.Group();
      for (let i = 0; i < 2; i++) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(r * 1.45, 0.025, 6, 32), this.ringsMat);
        t.rotation.set(i ? Math.PI / 2 : 0.4, i ? 0.5 : 0, 0);
        this.rings.add(t);
      }
      this.ring = ringMesh(this.hex, r * 2.3);
      this.group.add(this.hitGroup, this.rings, this.ring);
      world.addHittable(this.hitGroup);
      this.center = this.pos.clone();
    } else {
      // a dark plate with a glowing rim and the color glyph, stuck on a surface
      const s = size || 1.2, d = 0.22;
      const n = faceNormal(this.face);
      this.center = this.pos.clone().addScaledVector(n, d / 2);
      this.group.position.copy(this.center);
      this.group.rotation.copy(faceEuler(this.face)); // local +z faces out
      this.plateMat = new THREE.MeshStandardMaterial({ color: 0x1b1d24, emissive: c, emissiveIntensity: 0.12, metalness: 0.7, roughness: 0.4 });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(s, s, d), this.plateMat);
      this.rimMat = glowMat(this.hex, 1.4);
      const rim = new THREE.Mesh(edgeGeo(s, s, d, 0.06), this.rimMat);
      this.glyph = glyphMat(this.hex, 0.7);
      const decal = faceDecal(new THREE.Vector3(s, s, d), '+z', this.glyph, 0.62);
      this.ring = ringMesh(this.hex, s * 0.47);
      this.ring.position.z = d / 2 + 0.02;
      this.group.add(plate, rim, decal, this.ring);
      // collision + shots: the plate's box in world space
      const half = new THREE.Vector3(s / 2, s / 2, d / 2).applyEuler(faceEuler(this.face));
      half.set(Math.abs(half.x), Math.abs(half.y), Math.abs(half.z));
      this.min = this.center.clone().sub(half);
      this.max = this.center.clone().add(half);
      this.solid = world.addSolid(this.min.clone(), this.max.clone(), { static: true, entity: this, kind: 'metal' });
      this.normal = n.clone();
    }
    this.ring.visible = false;
    this.light = light ? world.addLight(this.hex, 2, 6, 1.6) : null;
    if (this.light) this.light.position.copy(this.center).addScaledVector(this.normal || UP, 0.5);
    world.add(this);
    this.refresh();
  }

  onHit(color, hit) {
    if (color !== this.color) {
      this.flash = 1;
      return 'immune';
    }
    const p = hit?.point || this.center;
    const n = hit?.normal || this.normal || UP;
    this.world.fx.sparks(p, n, this.hex, { count: 10, speed: 9, spread: 0.8, life: 0.3 });
    if (this.cool > 0 && this.mode !== 'timed') return 'hit';
    this.cool = 0.25;
    if (this.mode === 'toggle') this.on ? this.turnOff() : this.turnOn();
    else if (this.mode === 'once') !this.on && this.turnOn();
    else if (this.mode === 'pulse') {
      this.burst(p, n);
      sfx.switchOn();
      drive(this.links, 'activate', this);
      this.onOn?.(this);
    } else if (this.mode === 'timed') {
      if (!this.on) this.turnOn();
      else {
        this.left = this.time; // refill
        this.world.fx.ring(this.center, this.orb ? null : this.normal, this.hex, { size: 0.3, end: 1, life: 0.25, k: 1.4 });
      }
    }
    return 'hit';
  }

  burst(p, n) {
    this.pop = 1;
    const fx = this.world.fx;
    fx.flash(this.center, this.hex, { size: 1.4, life: 0.2, k: 1.6, hot: 0.5 });
    fx.ring(this.center, this.orb ? null : n, this.hex, { size: 0.3, end: 2.2, life: 0.45, thick: 0.1, k: 1.6 });
    fx.ring(this.center, this.orb ? null : n, 0xffffff, { size: 0.2, end: 1.3, life: 0.3, thick: 0.1, k: 1 });
    fx.sparks(p, n, this.hex, { count: 24, speed: 12, spread: 1, life: 0.45, gravity: 6 });
  }

  turnOn(silent = false) {
    if (this.on && this.mode !== 'timed') return;
    this.on = true;
    this.left = this.time;
    if (!silent) {
      this.burst(this.center, this.normal || UP);
      sfx.switchOn();
    }
    this.refresh();
    drive(this.links, 'activate', this);
    this.onOn?.(this);
  }

  turnOff(silent = false) {
    if (!this.on) return;
    this.on = false;
    this.left = 0;
    if (!silent) {
      sfx.switchOff(nearGain(this.world, this.center));
      this.world.fx.ring(this.center, this.orb ? null : this.normal, this.hex, { size: 1.2, end: 0.2, life: 0.3, thick: 0.12, k: 1 });
    }
    this.refresh();
    drive(this.links, 'deactivate', this);
    this.onOff?.(this);
  }

  refresh() {
    const on = this.on;
    if (this.orb) {
      this.coreMat.color.set(this.hex).multiplyScalar(on ? 3 : 0.8);
      this.ringsMat.color.set(this.hex).multiplyScalar(on ? 2.4 : 0.9);
      this.shellMat.emissiveIntensity = on ? 0.6 : 0.25;
    } else {
      this.plateMat.emissiveIntensity = on ? 0.5 : 0.12;
      this.glyph.color.set(on ? 0xffffff : this.hex).multiplyScalar(on ? 1.3 : 0.7);
      this.rimMat.color.set(this.hex).multiplyScalar(on ? 2.6 : 1.4);
    }
    if (this.light) this.light.intensity = on ? 7 : 2;
  }

  reset() {
    this.on = this.startOn;
    this.left = this.on ? this.time : 0;
    this.cool = 0;
    this.refresh();
  }

  update(dt) {
    this.t += dt;
    this.cool -= dt;
    // timed: drain, tick, warn the links, revert
    let frac = null, blink = 0;
    if (this.mode === 'timed' && this.on) {
      const prev = this.left;
      this.left -= dt;
      if (tickDue(prev, this.left)) sfx.tick(this.left < 1.5, nearGain(this.world, this.center, 30));
      drive(this.links, 'timer', Math.max(0, this.left), this.time);
      if (this.left <= 0) this.turnOff();
      frac = this.left / this.time;
    } else if (this.timerSource && this.timerSource.left > 0) {
      frac = this.timerSource.left / this.timerSource.time;
    }
    if (frac !== null && frac > 0) {
      const left = frac * (this.timerSource ? this.timerSource.time : this.time);
      blink = left < 1.5 && (this.t * 8) % 1 < 0.5 ? 1 : 0;
      this.ring.visible = true;
      this.ring.material.uniforms.uFrac.value = frac;
      this.ring.material.uniforms.uBlink.value = blink;
    } else this.ring.visible = false;
    const k = this.flash;
    if (k > 0) this.flash = Math.max(0, this.flash - dt * 5);
    this.pop = Math.max(0, this.pop - dt * 4);
    const s = 1 + this.pop * 0.25;
    if (this.orb) {
      this.group.position.y = this.pos.y + Math.sin(this.t * 2) * 0.1;
      this.core.rotation.y += dt * (this.on ? 6 : 1.2);
      this.core.rotation.x += dt * (this.on ? 3 : 0.5);
      this.rings.rotation.y += dt * (this.on ? 3 : 0.6);
      this.hitGroup.scale.setScalar(s);
      this.shellMat.emissiveIntensity = (this.on ? 0.6 : 0.25) + k * 0.8;
      // the ring faces the camera
      const cam = this.world.game?.camera;
      if (cam && this.ring.visible) this.ring.quaternion.copy(cam.quaternion);
    } else {
      this.plateMat.emissiveIntensity = (this.on ? 0.5 : 0.12 + 0.06 * Math.sin(this.t * 3)) + k * 0.6;
      this.group.scale.set(s, s, 1);
    }
  }
}

export class PhasePlatform {
  constructor(world, { min, max, color = null, on = false, invert = false, warn = 1.2, time = 0.35, zone = 'red', kind = 'plat' }) {
    this.world = world;
    this.min = v3(min);
    this.max = v3(max);
    this.color = color;
    this.hex = hexOf(color);
    this.startOn = on;
    this.invert = invert;
    this.warnTime = warn;
    this.time = time;
    this.on = on;
    this.k = on ? 1 : 0; // materialized amount
    this.warnLeft = Infinity;
    this.blocked = false;
    this.t = 0;
    this.pop = 0;
    const size = this.max.clone().sub(this.min);
    this.size = size;
    this.center = this.min.clone().add(this.max).multiplyScalar(0.5);
    this.group = new THREE.Group();
    this.group.position.copy(this.center);
    this.body = new THREE.Mesh(boxGeo(size.x, size.y, size.z), mat(kind, zone));
    this.holo = new THREE.Mesh(boxGeo(size.x, size.y, size.z, 1), holoMat(this.hex));
    this.holo.renderOrder = 2;
    this.edgeMat = glowMat(this.hex, 2.2);
    this.edges = new THREE.Mesh(edgeGeo(size.x, size.y, size.z, 0.06), this.edgeMat);
    this.glyph = glyphMat(this.hex, 0.8, 0.6);
    this.group.add(this.body, this.holo, this.edges, faceDecal(size, 'up', this.glyph, 0.6), faceDecal(size, 'down', this.glyph, 0.6));
    world.scene.add(this.group);
    this.solid = world.addSolid(this.min.clone(), this.max.clone(), { kind: 'metal' });
    world.add(this);
    this.apply();
  }

  activate() {
    this.set(!this.invert);
  }

  deactivate() {
    this.set(this.invert);
  }

  toggle() {
    this.set(!this.on);
  }

  // a timed switch is counting down (left s of total): flicker if its end will take this away
  timer(left) {
    this.warnLeft = left;
  }

  set(on, silent = false) {
    if (on === this.on) return;
    this.on = on;
    this.warnLeft = Infinity;
    const fx = this.world.fx, g = silent ? 0 : nearGain(this.world, this.center);
    if (on) {
      if (g > 0) {
        fx.reform(this.min, this.max, this.hex, this.time, 3);
        sfx.phaseIn(g);
      }
    } else {
      this.solid.enabled = false;
      this.body.visible = false;
      if (g > 0) {
        // the slab comes apart into motes
        fx.burst(this.center, this.hex, { count: 40, speed: 3, life: 0.7, size: 0.3, gravity: -1, drag: 2, spread: 1 });
        fx.reformFlash(this.min, this.max, this.hex, 'spike');
        sfx.phaseOut(g);
      }
      this.holo.material.uniforms.uFlash.value = 1;
    }
  }

  reset() {
    this.on = this.startOn;
    this.k = this.on ? 1 : 0;
    this.warnLeft = Infinity;
    this.apply();
  }

  // show the current state (k and solidity) without fx
  apply() {
    const solid = this.on && this.k >= 1 && !this.blocked;
    this.solid.enabled = solid;
    this.body.visible = solid;
  }

  update(dt, player) {
    this.t += dt;
    const u = this.holo.material.uniforms;
    u.uTime.value += dt;
    u.uFlash.value = Math.max(0, u.uFlash.value - dt * 3);
    if (this.on && this.k < 1) this.k = Math.min(1, this.k + dt / this.time);
    else if (!this.on) this.k = Math.max(0, this.k - dt / 0.25);
    if (this.on && this.k >= 1 && !this.solid.enabled) {
      // never solidify inside the player: shimmer until clear
      this.blocked = overlapsPlayer(player, this.min, this.max, 0.01);
      if (!this.blocked) {
        this.solid.enabled = true;
        this.body.visible = true;
        this.pop = 1;
        if (nearGain(this.world, this.center) > 0) this.world.fx.reformFlash(this.min, this.max, this.hex, 'wall');
      }
    }
    this.pop = Math.max(0, this.pop - dt * 5);
    this.body.scale.setScalar(1 - this.pop * 0.06);
    // hologram: a faint ghost while off, bright while building in / blocked, gone while solid
    const solid = this.solid.enabled;
    let a = solid ? 0 : this.on ? 0.4 + this.k * 0.6 : 0.12 + this.k * 0.5;
    if (this.blocked && !solid) a = 0.5 + 0.3 * Math.sin(this.t * 20);
    let edge = solid ? 2.2 : this.on ? 1 + this.k * 1.2 : 0.45 + 0.15 * Math.sin(this.t * 2.5);
    // warning flicker: the bridge is about to go (or, inverted, about to appear)
    if (this.warnLeft < this.warnTime && this.on !== this.invert) {
      const rate = 6 + (1 - this.warnLeft / this.warnTime) * 14;
      const off = (this.t * rate) % 1 < 0.4;
      edge = off ? 0.3 : 3;
      a = Math.max(a, off ? 0 : 0.5);
    }
    u.uAlpha.value = a;
    this.holo.visible = a > 0.01 || u.uFlash.value > 0.01;
    this.edgeMat.color.set(this.hex).multiplyScalar(edge);
    this.glyph.opacity = solid ? 0.6 : 0.25;
  }
}

// one tinted, glowing material per color for every chroma platform
const chromaMats = new Map();
function chromaMat(color) {
  if (!chromaMats.has(color)) {
    const c = new THREE.Color(COLORS[color].hex);
    chromaMats.set(color, new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.25), emissive: c, emissiveIntensity: 0.7, metalness: 0.4, roughness: 0.35 }));
  }
  return chromaMats.get(color);
}

export class ChromaPlatform {
  constructor(world, { min, max, color, zone = 'red' }) {
    this.world = world;
    this.min = v3(min);
    this.max = v3(max);
    this.color = color;
    this.hex = COLORS[color].hex;
    this.zone = zone;
    this.t = Math.random() * 10;
    this.pop = 0;
    this.blocked = false;
    const size = this.max.clone().sub(this.min);
    this.center = this.min.clone().add(this.max).multiplyScalar(0.5);
    this.group = new THREE.Group();
    this.group.position.copy(this.center);
    this.body = new THREE.Mesh(boxGeo(size.x, size.y, size.z), chromaMat(color));
    this.holo = new THREE.Mesh(boxGeo(size.x, size.y, size.z, 1), holoMat(this.hex));
    this.holo.renderOrder = 2;
    this.edgeMat = glowMat(this.hex, 2.4);
    this.glyph = glyphMat(this.hex, 1.2);
    this.group.add(this.body, this.holo, new THREE.Mesh(edgeGeo(size.x, size.y, size.z, 0.07), this.edgeMat));
    this.group.add(faceDecal(size, 'up', this.glyph, 0.75), faceDecal(size, 'down', this.glyph, 0.75));
    world.scene.add(this.group);
    this.solid = world.addSolid(this.min.clone(), this.max.clone(), { kind: 'metal' });
    this.solid.enabled = false;
    this.body.visible = false;
    world.add(this);
  }

  wanted() {
    const b = this.world.game?.blaster;
    return !!b && b.has && b.unlocked[this.color] && b.color === this.color;
  }

  reset() {}

  update(dt, player) {
    this.t += dt;
    const u = this.holo.material.uniforms;
    u.uTime.value += dt;
    const want = this.wanted();
    if (want && !this.solid.enabled) {
      // never become solid around the player: stay a ghost until they're clear of it
      this.blocked = overlapsPlayer(player, this.min, this.max, 0.01);
      if (!this.blocked) {
        this.solid.enabled = true;
        this.body.visible = true;
        this.pop = 1;
        const g = nearGain(this.world, this.center, 30);
        if (g > 0) {
          _p.set(this.center.x, this.max.y + 0.03, this.center.z);
          this.world.fx.ring(_p, UP, this.hex, { size: 0.3, end: Math.max(this.max.x - this.min.x, this.max.z - this.min.z) * 0.8, life: 0.3, thick: 0.1, k: 1.4 });
          sfx.chroma(g * 0.6);
        }
      }
    } else if (!want) {
      this.blocked = false;
      if (this.solid.enabled) {
        this.solid.enabled = false;
        this.body.visible = false;
        u.uFlash.value = 0.8;
      }
    }
    u.uFlash.value = Math.max(0, u.uFlash.value - dt * 4);
    this.pop = Math.max(0, this.pop - dt * 6);
    this.body.scale.setScalar(1 + this.pop * 0.05);
    const solid = this.solid.enabled;
    u.uAlpha.value = solid ? 0 : this.blocked ? 0.45 + 0.3 * Math.sin(this.t * 22) : 0.07 + 0.03 * Math.sin(this.t * 3);
    this.holo.visible = !solid || u.uFlash.value > 0.01;
    this.edgeMat.color.set(this.hex).multiplyScalar(solid ? 2.4 + this.pop * 2 : 0.55);
    this.glyph.opacity = solid ? 1 : 0.3;
  }
}

export class TimedGate {
  constructor(world, { min, max, color, time = 4, openTime = 0.25, closeTime = 0.7, barOut = 0.3, zone = 'red', kind = 'metal', onOpen = null, onClose = null }) {
    this.world = world;
    this.a = v3(min);
    this.b = v3(max);
    this.size = this.b.clone().sub(this.a);
    this.color = color;
    this.hex = COLORS[color].hex;
    this.time = time;
    this.openTime = openTime;
    this.closeTime = closeTime;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.left = 0; // seconds until it starts closing
    this.lift = 0; // how far the door has risen (0 = shut)
    this.state = 'closed'; // closed | open | closing
    this.t = 0;
    const sz = this.size;
    this.alongX = sz.x >= sz.z;
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.door = new THREE.Group();
    const body = new THREE.Mesh(boxGeo(sz.x, sz.y, sz.z), mat(kind, zone));
    this.edgeMat = glowMat(this.hex, 1.8);
    const glyph = glyphMat(this.hex, 1.3);
    const broad = this.alongX ? ['+z', '-z'] : ['+x', '-x'];
    this.door.add(body, new THREE.Mesh(edgeGeo(sz.x, sz.y, sz.z, 0.06), this.edgeMat), ...broad.map((f) => faceDecal(sz, f, glyph, 0.55, 0.015)));
    // hazard stripes along the bottom edge
    const strip = new THREE.Mesh(boxGeo(sz.x + 0.02, 0.18, sz.z + 0.02, 2), mat('hazard'));
    strip.position.y = -sz.y / 2 + 0.09;
    this.door.add(strip);
    this.group.add(this.door);
    // countdown bars over the doorway on both faces
    this.bars = broad.map((f) => {
      const w = (this.alongX ? sz.x : sz.z) * 0.9;
      const bar = barMesh(this.hex, w, 0.22, 10);
      const n = faceNormal(f);
      bar.rotation.copy(faceEuler(f));
      bar.position.set((this.a.x + this.b.x) / 2 + n.x * (sz.x / 2 + barOut), this.b.y + 0.25, (this.a.z + this.b.z) / 2 + n.z * (sz.z / 2 + barOut));
      this.group.add(bar);
      return bar;
    });
    this.solid = world.addSolid(this.a.clone(), this.b.clone(), { kind: 'metal' });
    world.add(this);
    this.place();
  }

  activate() {
    const was = this.state;
    this.left = this.time;
    this.state = 'open';
    if (was !== 'open') {
      sfx.gateOpen(nearGain(this.world, this.a));
      this.world.fx.doorOpen(this.a, this.b, this.hex);
      this.onOpen?.(this);
    }
  }

  deactivate() {
    if (this.state === 'open') {
      this.left = 0;
      this.state = 'closing';
    }
  }

  toggle() {
    this.state === 'open' ? this.deactivate() : this.activate();
  }

  reset() {
    this.state = 'closed';
    this.left = 0;
    this.lift = 0;
    this.place();
  }

  place() {
    this.door.position.set((this.a.x + this.b.x) / 2, (this.a.y + this.b.y) / 2 + this.lift, (this.a.z + this.b.z) / 2);
    this.solid.min.copy(this.a).setY(this.a.y + this.lift);
    this.solid.max.copy(this.b).setY(this.b.y + this.lift);
    this.solid.enabled = this.lift < this.size.y - 0.05;
    this.door.visible = this.lift < this.size.y - 0.01;
  }

  update(dt, player) {
    this.t += dt;
    const h = this.size.y;
    if (this.state === 'open') {
      this.lift = Math.min(h, this.lift + (h / this.openTime) * dt);
      const prev = this.left;
      this.left -= dt;
      if (tickDue(prev, this.left)) sfx.tick(this.left < 1.5, nearGain(this.world, this.a, 30));
      if (this.left <= 0) {
        this.left = 0;
        this.state = 'closing';
      }
    } else if (this.state === 'closing') {
      const next = Math.max(0, this.lift - (h / this.closeTime) * dt);
      // stop above the player rather than close on them
      _p.copy(this.a).setY(this.a.y + next);
      _q.copy(this.b).setY(this.b.y + next);
      if (!overlapsPlayer(player, _p, _q, 0.02)) {
        this.lift = next;
        if (this.lift < h * 0.9) this.world.fx.edgeDust(this.a.x, this.b.x, this.a.y + this.lift, this.a.z, this.b.z);
        if (this.lift <= 0) {
          this.state = 'closed';
          const g = nearGain(this.world, this.a);
          sfx.gateSlam(g);
          _p.set((this.a.x + this.b.x) / 2, this.a.y + 0.05, (this.a.z + this.b.z) / 2);
          this.world.fx.sparks(_p, UP, this.hex, { count: 16, speed: 7, spread: 1.6, life: 0.4 });
          this.world.fx.landDust(_p, 1.2);
          if (player && g > 0.5) player.shake = Math.max(player.shake, 0.25 * g);
          this.onClose?.(this);
        }
      }
    }
    this.place();
    const frac = this.state === 'open' ? this.left / this.time : 0;
    const blink = this.state === 'open' && this.left < 1.5 && (this.t * 8) % 1 < 0.5 ? 1 : 0;
    for (const bar of this.bars) {
      bar.material.uniforms.uFrac.value = frac;
      bar.material.uniforms.uBlink.value = blink;
    }
    this.edgeMat.color.set(this.hex).multiplyScalar(this.state === 'closing' ? 1 + 2 * ((this.t * 10) % 1 < 0.5) : 1.8);
  }
}
