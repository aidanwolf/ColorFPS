// The Chroma Blaster: fast color switching and an animated view model rendered in its own scene on top
// of the world (so it never clips into walls). Each color has its own gun from its world (src/weapons/*),
// swapped with a quick dip-and-rise, and each fires its own way: red is rapid hitscan shots (fire/trace
// below), yellow a held sun beam that overheats (weapons/sunbeam.js), green arcing globs that burst
// (weapons/globs.js) and blue a held water stream that leaves puddles (weapons/hose.js).
import * as THREE from 'three';
import { COLORS } from './colors.js';
import { Drone, Orb } from './entities/drone.js';
import { audio } from './audio.js';
import { buildCrimson } from './weapons/crimson.js';
import { buildSolar } from './weapons/solar.js';
import { buildVerdant } from './weapons/verdant.js';
import { buildAzure } from './weapons/azure.js';
import { SunBeam } from './weapons/sunbeam.js';
import { GlobLauncher } from './weapons/globs.js';
import { WaterCannon } from './weapons/hose.js';

const FIRE_INTERVAL = 0.13;
const MAX_BOUNCES = 6;
const SWITCH_TIME = 0.18; // the whole dip-and-rise
const MUZZLE_DEPTH = 0.9; // how far in front of the eye a tracer starts
const _dir = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _v = new THREE.Vector3();

export class Blaster {
  constructor(game) {
    this.game = game;
    this.unlocked = [false, false, false, false];
    this.has = false;
    this.color = 0;
    this.cooldown = 0;
    this.lastColor = 0;
    this.time = 0;
    this.flash = 0; // muzzle light flash on top of the model's own glow
    // recoil spring (displacement / velocity); each model has its own stiffness, damping and kick
    this.recoil = 0;
    this.recoilVel = 0;
    // switching: the shown gun dips out of view, the new one rises. 1 = settled.
    this.shown = 0;
    this.switchT = 1;
    this.compiled = false;

    // ---- view model ----
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.vmScene.add(new THREE.HemisphereLight(0xc8d4ff, 0x302830, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1, 2, 1);
    this.vmScene.add(key);
    // the world's soft room reflections, so polished metal and ice read as such
    this.vmScene.environment = game.scene.environment;
    this.vmScene.environmentIntensity = 0.7;
    this.muzzleLight = new THREE.PointLight(0xffffff, 0, 3);
    this.vmScene.add(this.muzzleLight);

    // one gun per color, each from its world
    this.gun = new THREE.Group();
    this.models = [buildCrimson, buildSolar, buildVerdant, buildAzure].map((build, i) => {
      const m = build(COLORS[i].hex);
      m.root.visible = false;
      this.gun.add(m.root);
      return m;
    });
    this.gun.position.set(0.26, -0.245, -0.8);
    this.gun.rotation.order = 'YXZ';
    this.gun.scale.setScalar(0.85);
    this.base = this.gun.position.clone();
    this.vmCamera.add(this.gun);
    this.vmScene.add(this.vmCamera);
    this.gun.visible = false;
    this.setColor(0, true);
    // how yellow, green and blue fire (red is fire() / trace()); each runs every frame, held or not
    this.modes = [null, new SunBeam(this), new GlobLauncher(this), new WaterCannon(this)];
    this.heatShown = null;
  }

  give(color) {
    this.has = true;
    this.unlocked[color] = true;
    this.gun.visible = true;
    if (!this.compiled) this.compile();
    this.setColor(color, true);
    // the hand-off: the new gun rises into view from below
    this.show(color);
    this.switchT = 0.5;
    this.game.hud.buildColors(this);
  }

  // compile all four guns up front so the first switch to each doesn't hitch
  compile() {
    this.compiled = true;
    const renderer = this.game.renderer;
    if (!renderer) return;
    this.models.forEach((m) => (m.root.visible = true));
    renderer.compile(this.vmScene, this.vmCamera);
    this.models.forEach((m, i) => (m.root.visible = i === this.shown));
  }

  // put a model in hand right away (no animation)
  show(i) {
    if (this.shown === i && this.models[i].root.visible) return;
    this.models[this.shown].root.visible = false;
    this.shown = i;
    this.models[i].root.visible = true;
    this.recoil = 0;
    this.recoilVel = 0;
  }

  setColor(i, silent = false) {
    if (!this.unlocked[i] && this.has) return;
    const changed = i !== this.color;
    if (changed) this.lastColor = this.color;
    this.color = i;
    if (!this.has) this.show(i);
    else if (i !== this.shown) {
      // start dipping the shown gun; one already rising turns back down from where it is
      if (this.switchT >= 1) this.switchT = 0;
      else if (this.switchT >= 0.5) this.switchT = 1 - this.switchT;
    } else if (this.switchT < 0.5) {
      // changed your mind mid-dip: the same gun comes straight back up
      this.switchT = 1 - this.switchT;
    }
    if (!silent && changed) audio.switchColor(i);
    this.game.hud.setColor(i, this);
  }

  cycle(dir) {
    const owned = [0, 1, 2, 3].filter((k) => this.unlocked[k]);
    if (owned.length < 2) return;
    const idx = owned.indexOf(this.color);
    this.setColor(owned[(idx + dir + owned.length) % owned.length]);
  }

  update(dt, input) {
    this.cooldown -= dt;
    let held = false;
    if (this.has) {
      for (let i = 0; i < 4; i++) if (input.hit('Digit' + (i + 1)) || input.hit('Numpad' + (i + 1))) this.setColor(i);
      if (input.hit('KeyE')) this.cycle(1);
      if (input.hit('KeyQ')) this.cycle(-1);
      if (input.wheel) this.cycle(input.wheel > 0 ? 1 : -1);
      if (input.hit('KeyF') || input.hit('Tab')) this.setColor(this.lastColor);
      if (this.modes[this.color]) held = input.mouseDown;
      else if (input.mouseDown && this.cooldown <= 0) this.fire();
    }
    for (let i = 1; i < 4; i++) this.modes[i].update(dt, held && i === this.color);
    // the sun beam's heat gauge by the crosshair, while yellow is in hand
    const beam = this.modes[1];
    const heat = this.has && this.color === 1 ? Math.round(beam.heat * 100) / 100 + (beam.locked ? 2 : 0) : null;
    if (heat !== this.heatShown) {
      this.heatShown = heat;
      this.game.hud.setHeat?.(heat === null ? null : beam.heat, beam.locked);
    }
    this.animate(dt);
  }

  // Stop every held weapon and drop the globs in flight (death, respawn).
  release() {
    for (const m of this.modes) m?.release();
  }

  // firing mid-switch brings the new gun straight up, so the shot comes out of it
  bringUp() {
    if (this.switchT < 1) {
      this.show(this.color);
      this.switchT = Math.max(this.switchT, 0.8);
    }
  }

  // a recoil impulse, in units of the current gun's own kick
  kick(k) {
    this.recoilVel += this.models[this.shown].spring.omega * k;
  }

  // The on-screen emitter as a point in the world: from view-model space to the same screen point in the
  // world camera (the two cameras share an aspect but not a field of view), MUZZLE_DEPTH in front of the eye.
  muzzleWorld(out) {
    const cam = this.game.camera;
    this.models[this.shown].muzzle.getWorldPosition(_v);
    const k = Math.tan((cam.fov * Math.PI) / 360) / Math.tan((this.vmCamera.fov * Math.PI) / 360);
    const d = MUZZLE_DEPTH / Math.max(0.2, -_v.z);
    return out.set(_v.x * k * d, _v.y * k * d, _v.z * d).applyQuaternion(cam.quaternion).add(cam.position);
  }

  fire() {
    this.cooldown = FIRE_INTERVAL;
    const game = this.game;
    const cam = game.camera;
    cam.getWorldDirection(_dir);
    // firing mid-switch brings the new gun straight up, so the shot comes out of it
    if (this.switchT < 1) {
      this.show(this.color);
      this.switchT = Math.max(this.switchT, 0.8);
    }
    const model = this.models[this.shown];
    this.pose();
    // the tracer starts at the on-screen emitter: take it from view-model space to the same screen
    // point in the world camera (the two cameras share an aspect but not a field of view)
    model.muzzle.getWorldPosition(_v);
    const k = Math.tan((cam.fov * Math.PI) / 360) / Math.tan((this.vmCamera.fov * Math.PI) / 360);
    const d = MUZZLE_DEPTH / Math.max(0.2, -_v.z);
    _muzzle.set(_v.x * k * d, _v.y * k * d, _v.z * d).applyQuaternion(cam.quaternion).add(cam.position);
    audio.shoot(this.color);
    model.fire();
    const { omega } = model.spring;
    this.recoilVel += omega * 2.4;
    this.flash = 6;
    game.world.fx.muzzle(_muzzle, _dir, COLORS[this.color].hex, game.player.vel);
    const outcome = this.trace(cam.position.clone(), _dir.clone(), _muzzle.clone(), 0);
    if (outcome.hit) {
      game.hud.hitmarker(false, outcome.crit); // (a boss's weak point marks its hit as a crit)
      if (!outcome.quiet) audio.hit(); // drones play their own, heavier impact
    } else if (outcome.bounced) {
      game.hud.hitmarker(true);
    }
  }

  // Follow one shot. Wrong-color hits and mirror panels reflect the beam, which keeps going and can
  // hit something else (that's how targets behind glass are reached). Glass and plain walls stop it.
  trace(origin, dir, from, depth, outcome = { hit: false, bounced: false }) {
    const world = this.game.world;
    const hex = COLORS[this.color].hex;
    const hit = world.raycast(origin, dir, 250, { projectiles: true });
    const end = hit ? hit.point : origin.clone().addScaledVector(dir, 250);
    world.fx.tracer(from, end, hex, depth ? 0.035 : 0.05);
    world.fx.beam(from, end, hex);
    if (!hit) return outcome;
    const n = hit.normal || dir.clone().negate();
    let result = 'world';
    hit.dir = dir; // the shot's direction (after any bounces), e.g. for drone knockback
    if (hit.entity && hit.entity.onHit) result = hit.entity.onHit(this.color, hit) || 'hit';
    // (enemies with quietHits, like the combat kit's, also play their own)
    const quiet = hit.entity instanceof Drone || hit.entity?.quietHits;
    if (quiet && (result === 'hit' || result === 'kill')) outcome.quiet = true;
    else if (hit.solid?.mirror) result = 'mirror';
    else if (hit.solid?.glass) result = 'glass';
    const p = hit.point.clone().addScaledVector(n, 0.02);
    if (result === 'shield') {
      audio.glassHit();
      world.fx.impact(p, n, 0x9bf6ff, 'shield', dir);
      return outcome;
    }
    if (result === 'hit' || result === 'kill') outcome.hit = true;
    if (hit.crit && outcome.hit) outcome.crit = true;

    const reflects = result === 'mirror' || result === 'immune';
    if (reflects && depth < MAX_BOUNCES) {
      outcome.bounced = true;
      const tint = typeof hit.entity?.color === 'number' ? COLORS[hit.entity.color]?.hex : null;
      world.fx.impact(p, n, hex, result === 'immune' ? 'ricochet' : 'mirror', dir, tint);
      if (result === 'immune') audio.ricochet();
      else audio.mirrorHit();
      const r = dir.clone().addScaledVector(n, -2 * dir.dot(n)).normalize();
      return this.trace(p, r, hit.point.clone(), depth + 1, outcome);
    }
    if (result === 'glass') audio.glassHit();
    // drones play their own hit and death effects; obstacles their own shatter
    if (outcome.quiet && quiet) return outcome;
    else world.fx.impact(p, n, hex, result === 'glass' ? 'glass' : result === 'world' ? 'wall' : result === 'immune' ? 'ricochet' : 'hit', dir);
    return outcome;
  }

  animate(dt) {
    this.time += dt;
    if (!this.has || !this.gun.visible) {
      this.muzzleLight.intensity = 0;
      return;
    }
    // switch: swap guns at the bottom of the dip
    if (this.switchT < 1) {
      this.switchT = Math.min(1, this.switchT + dt / SWITCH_TIME);
      if (this.switchT >= 0.5 && this.shown !== this.color) this.show(this.color);
    }
    const model = this.models[this.shown];
    // recoil spring, sub-stepped so the stiff ones stay stable at low frame rates
    const { omega, zeta } = model.spring;
    const n = Math.min(12, Math.max(1, Math.ceil(dt * 240)));
    for (let i = 0; i < n; i++) {
      const h = dt / n;
      this.recoilVel += (-omega * omega * this.recoil - 2 * zeta * omega * this.recoilVel) * h;
      this.recoil += this.recoilVel * h;
    }
    if (!Number.isFinite(this.recoil) || !Number.isFinite(this.recoilVel)) this.recoil = this.recoilVel = 0;
    this.recoil = THREE.MathUtils.clamp(this.recoil, -1, 1.8);
    const glowLevel = model.update(dt, this.time, this.recoil);
    this.pose();
    this.flash = Math.max(0, this.flash - dt * 60);
    const out = switchDepth(this.switchT);
    model.muzzle.getWorldPosition(this.muzzleLight.position);
    this.muzzleLight.color.set(model.light);
    this.muzzleLight.intensity = (Number.isFinite(glowLevel) ? glowLevel : 0) * (1 - out) + this.flash;
  }

  // place the gun: walk bob, landing kick, crouch, recoil and the switch dip
  pose() {
    const p = this.game.player;
    const k = this.models[this.shown].kick;
    const r = this.recoil;
    const out = switchDepth(this.switchT);
    const s = Math.min(1, p.speed2d / 7.6) * (p.grounded ? 1 : 0.3);
    const t = p.bob;
    this.gun.position.set(
      this.base.x + Math.sin(t * 0.5) * 0.012 * s + out * 0.05,
      this.base.y - Math.abs(Math.cos(t * 0.5)) * 0.012 * s - out * 0.42 - p.landKick * 0.2 + (p.crouching ? -0.02 : 0),
      this.base.z + r * k.z + out * 0.04,
    );
    this.gun.rotation.set(0.035 + r * k.pitch - out * 0.55, 0.07 + r * k.yaw + out * 0.15, r * k.roll - out * 0.45);
  }
}

// how far the gun is dipped out of view (0 in hand, 1 gone): it accelerates away and decelerates
// back into place, and is symmetric so a switch can turn around mid-way without a jump
function switchDepth(t) {
  const u = t < 0.5 ? t * 2 : (1 - t) * 2;
  return u * u;
}
