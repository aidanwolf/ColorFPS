// The Chroma Blaster: hitscan color shots, fast color switching and an animated view model
// rendered in its own scene on top of the world (so it never clips into walls).
import * as THREE from 'three';
import { COLORS } from './colors.js';
import { audio } from './audio.js';

const FIRE_INTERVAL = 0.13;
const MAX_BOUNCES = 6;
const _dir = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

export class Blaster {
  constructor(game) {
    this.game = game;
    this.unlocked = [false, false, false, false];
    this.has = false;
    this.color = 0;
    this.cooldown = 0;
    this.switchAnim = 0;
    this.recoil = 0;
    this.lastColor = 0;

    // ---- view model ----
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.vmScene.add(new THREE.HemisphereLight(0xc8d4ff, 0x302830, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1, 2, 1);
    this.vmScene.add(key);
    this.muzzleLight = new THREE.PointLight(0xffffff, 0, 3);
    this.vmScene.add(this.muzzleLight);

    this.gun = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0x555b70, metalness: 0.6, roughness: 0.4 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xb4bacd, metalness: 0.7, roughness: 0.3 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const add = (geo, m, x, y, z, rx = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.rotation.x = rx;
      this.gun.add(mesh);
      return mesh;
    };
    add(new THREE.BoxGeometry(0.12, 0.14, 0.46), body, 0, 0, 0);
    add(new THREE.BoxGeometry(0.08, 0.2, 0.1), body, 0, -0.14, 0.1, 0.25);
    add(new THREE.CylinderGeometry(0.035, 0.045, 0.34, 12), trim, 0, 0.02, -0.36, Math.PI / 2);
    add(new THREE.BoxGeometry(0.15, 0.05, 0.3), trim, 0, 0.09, -0.02);
    // the color cell: four chambers, the active one glows
    this.cells = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.MeshBasicMaterial({ color: COLORS[i].hex });
      const c = add(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 8), m, -0.07 + 0, 0.0, -0.12 + i * 0.07, 0);
      c.rotation.z = Math.PI / 2;
      c.position.x = 0.07;
      this.cells.push(c);
    }
    this.core = add(new THREE.SphereGeometry(0.05, 16, 12), this.glowMat, 0, 0.02, -0.55);
    this.ring = add(new THREE.TorusGeometry(0.06, 0.012, 8, 20), this.glowMat, 0, 0.02, -0.5);
    this.gun.position.set(0.25, -0.25, -0.68);
    this.gun.rotation.order = 'YXZ';
    this.gun.scale.setScalar(0.85);
    this.base = this.gun.position.clone();
    this.vmCamera.add(this.gun);
    this.vmScene.add(this.vmCamera);
    this.gun.visible = false;
    this.setColor(0, true);
  }

  give(color) {
    this.has = true;
    this.unlocked[color] = true;
    this.gun.visible = true;
    this.setColor(color, true);
    this.game.hud.buildColors(this);
  }

  setColor(i, silent = false) {
    if (!this.unlocked[i] && this.has) return;
    if (i !== this.color) this.lastColor = this.color;
    this.color = i;
    const c = new THREE.Color(COLORS[i].hex).multiplyScalar(2.5);
    this.glowMat.color.copy(c);
    this.muzzleLight.color.set(COLORS[i].hex);
    this.cells.forEach((m, k) => {
      m.scale.setScalar(k === i ? 1.35 : 0.8);
      m.material.color.set(this.unlocked[k] ? COLORS[k].hex : 0x111111).multiplyScalar(k === i ? 2.5 : 0.5);
    });
    this.switchAnim = 1;
    if (!silent) audio.switchColor(i);
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
    if (this.has) {
      for (let i = 0; i < 4; i++) if (input.hit('Digit' + (i + 1)) || input.hit('Numpad' + (i + 1))) this.setColor(i);
      if (input.hit('KeyE')) this.cycle(1);
      if (input.hit('KeyQ')) this.cycle(-1);
      if (input.wheel) this.cycle(input.wheel > 0 ? 1 : -1);
      if (input.hit('KeyF') || input.hit('Tab')) this.setColor(this.lastColor);
      if (input.mouseDown && this.cooldown <= 0) this.fire();
    }
    this.animate(dt);
  }

  fire() {
    this.cooldown = FIRE_INTERVAL;
    const game = this.game;
    const cam = game.camera;
    cam.getWorldDirection(_dir);
    // the tracer starts at the on-screen muzzle, projected into the world
    _muzzle.set(0.22, -0.16, -0.9).applyQuaternion(cam.quaternion).add(cam.position);
    audio.shoot(this.color);
    this.recoil = 1;
    this.muzzleLight.intensity = 6;
    const outcome = this.trace(cam.position.clone(), _dir.clone(), _muzzle.clone(), 0);
    if (outcome.hit) {
      game.hud.hitmarker(false);
      audio.hit();
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
    if (!hit) return outcome;
    const n = hit.normal || dir.clone().negate();
    let result = 'world';
    if (hit.entity && hit.entity.onHit) result = hit.entity.onHit(this.color, hit) || 'hit';
    else if (hit.solid?.mirror) result = 'mirror';
    else if (hit.solid?.glass) result = 'glass';
    if (result === 'hit' || result === 'kill') outcome.hit = true;

    const reflects = result === 'mirror' || result === 'immune';
    const p = hit.point.clone().addScaledVector(n, 0.02);
    if (reflects && depth < MAX_BOUNCES) {
      outcome.bounced = true;
      world.fx.burst(p, 0xffffff, { count: 8, speed: 5, life: 0.25, size: 0.16, gravity: 4, dir: n });
      world.fx.burst(p, hex, { count: 10, speed: 3, life: 0.35, size: 0.2, gravity: 2, dir: n });
      if (result === 'immune') audio.ricochet();
      else audio.mirrorHit();
      const r = dir.clone().addScaledVector(n, -2 * dir.dot(n)).normalize();
      return this.trace(p, r, hit.point.clone(), depth + 1, outcome);
    }
    if (result === 'glass') audio.glassHit();
    world.fx.burst(p, result === 'glass' ? 0xbfe8ff : hex, { count: 10, speed: 4, life: 0.35, size: 0.18, gravity: 6, dir: n });
    return outcome;
  }

  animate(dt) {
    const p = this.game.player;
    this.switchAnim = Math.max(0, this.switchAnim - dt * 6);
    this.recoil = Math.max(0, this.recoil - dt * 9);
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 60);
    const s = Math.min(1, p.speed2d / 7.6) * (p.grounded ? 1 : 0.3);
    const t = p.bob;
    this.gun.position.set(
      this.base.x + Math.sin(t * 0.5) * 0.012 * s,
      this.base.y - Math.abs(Math.cos(t * 0.5)) * 0.012 * s - this.switchAnim * 0.08 - p.landKick * 0.2 + (p.crouching ? -0.02 : 0),
      this.base.z + this.recoil * 0.06,
    );
    this.gun.rotation.set(this.recoil * 0.12 + this.switchAnim * 0.5, 0.05, -this.switchAnim * 0.6);
    this.ring.rotation.z += dt * (4 + this.recoil * 20);
    this.core.scale.setScalar(1 + this.recoil * 0.6);
    this.muzzleLight.position.set(this.gun.position.x, this.gun.position.y, this.gun.position.z - 0.6);
  }
}
