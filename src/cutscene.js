// The color-unlock cutscene: the camera swings out to third person, the chroma core rises from its
// pedestal in a beam of light with particles spiralling in, then streaks into the player's suit with a
// flash, a shockwave and a title card, before the camera glides back into first person.
import * as THREE from 'three';
import { COLORS } from './colors.js';
import { audio } from './audio.js';

const DURATION = 5.6;
const ABSORB_AT = 2.8;
const BLEND_FROM = 4.9;
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

// A ~1.8 m armored suit built from primitives, holding the Chroma Blaster.
function buildSuit() {
  const g = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0x3a3f52, metalness: 0.75, roughness: 0.35 });
  const plate = new THREE.MeshStandardMaterial({ color: 0xc9cfdd, metalness: 0.5, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15161d, metalness: 0.6, roughness: 0.6 });
  const accent = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const box = (w, h, d, m, x, y, z, parent = g) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };
  for (const s of [-1, 1]) {
    box(0.2, 0.46, 0.22, armor, s * 0.13, 0.62, 0);
    box(0.18, 0.44, 0.2, dark, s * 0.13, 0.22, 0.01);
    box(0.22, 0.12, 0.32, armor, s * 0.13, 0.04, 0.05);
    box(0.21, 0.14, 0.05, plate, s * 0.13, 0.68, 0.12);
  }
  box(0.44, 0.22, 0.26, dark, 0, 0.92, 0);
  box(0.52, 0.42, 0.32, armor, 0, 1.22, 0);
  box(0.4, 0.26, 0.06, plate, 0, 1.28, 0.17);
  const chest = box(0.12, 0.12, 0.04, accent, 0, 1.26, 0.205);
  for (const s of [-1, 1]) {
    box(0.22, 0.14, 0.3, plate, s * 0.36, 1.42, 0);
    box(0.12, 0.34, 0.14, armor, s * 0.34, 1.18, 0.02);
  }
  const head = new THREE.Group();
  head.position.set(0, 1.5, 0);
  g.add(head);
  box(0.26, 0.28, 0.28, armor, 0, 0.14, 0, head);
  const visor = box(0.22, 0.08, 0.04, accent, 0, 0.16, 0.14, head);
  box(0.04, 0.12, 0.3, plate, 0, 0.3, 0, head);
  // arms forward, holding the blaster
  const arms = new THREE.Group();
  arms.position.set(0, 1.32, 0.05);
  g.add(arms);
  for (const s of [-1, 1]) box(0.11, 0.11, 0.42, armor, s * 0.18, -0.06, 0.2, arms);
  const gun = new THREE.Group();
  gun.position.set(0.08, -0.08, 0.46);
  arms.add(gun);
  box(0.1, 0.12, 0.42, dark, 0, 0, 0, gun);
  const muzzle = box(0.07, 0.07, 0.12, accent, 0, 0.01, 0.26, gun);
  g.userData = { chest, visor, muzzle, arms, accent };
  g.visible = false;
  return g;
}

export class UnlockCutscene {
  constructor(game) {
    this.game = game;
    this.suit = buildSuit();
    game.scene.add(this.suit);
    this.active = false;
    // the core that rises and flies into the suit
    this.core = new THREE.Group();
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.core.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), this.coreMat));
    this.core.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    this.coreRings = [0, 1].map((i) => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.6 + i * 0.2, 0.03, 6, 40), this.coreMat);
      r.rotation.x = i ? Math.PI / 2 : 0;
      this.core.add(r);
      return r;
    });
    this.core.visible = false;
    game.scene.add(this.core);
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 12, 32, 1, true), this.beamMat);
    this.beam.visible = false;
    game.scene.add(this.beam);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    this.shock = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 64), this.ringMat);
    this.shock.rotation.x = Math.PI / 2;
    this.shock.visible = false;
    game.scene.add(this.shock);
  }

  start(color, corePos) {
    const g = this.game;
    const p = g.player;
    this.active = true;
    this.t = 0;
    this.color = color;
    this.absorbed = false;
    this.hex = COLORS[color].hex;
    const c = new THREE.Color(this.hex);
    this.coreMat.color.copy(c).multiplyScalar(2.6);
    this.beamMat.color.copy(c);
    this.ringMat.color.copy(c).multiplyScalar(2.5);
    this.coreStart = corePos.clone();
    this.core.position.copy(corePos);
    this.core.visible = true;
    this.beam.position.set(corePos.x, corePos.y + 4, corePos.z);
    this.beam.visible = true;
    // the suit stands where the player is, facing the core
    this.suit.position.copy(p.pos);
    this.suit.rotation.y = Math.atan2(corePos.x - p.pos.x, corePos.z - p.pos.z);
    this.suit.visible = true;
    // suit lights show the current color until the new one is absorbed
    this.suit.userData.accent.color.set(g.blaster.has ? COLORS[g.blaster.color].hex : 0x8890a8).multiplyScalar(1.8);
    this.center = p.pos.clone().lerp(corePos, 0.22).setY(p.pos.y + 1.15);
    const toCore = Math.atan2(corePos.x - p.pos.x, corePos.z - p.pos.z);
    this.orbit0 = toCore + Math.PI / 2 + 0.5;
    this.fromCam = { pos: g.camera.position.clone(), quat: g.camera.quaternion.clone() };
    g.blaster.gun.visible = false;
    g.hud.cinematic(true);
    g.hud.zone.classList.remove('show');
    audio.absorb();
  }

  skip() {
    if (this.t < 1 || this.t > BLEND_FROM) return;
    if (!this.absorbed) this.absorb();
    this.t = BLEND_FROM;
  }

  absorb() {
    const g = this.game;
    this.absorbed = true;
    this.core.visible = false;
    const chest = this.suit.userData.chest.getWorldPosition(new THREE.Vector3());
    g.world.fx.burst(chest, this.hex, { count: 220, speed: 11, life: 1.4, size: 0.4, gravity: 1 });
    g.world.fx.burst(chest, 0xffffff, { count: 80, speed: 6, life: 0.7, size: 0.5, gravity: 0 });
    this.suit.userData.accent.color.set(this.hex).multiplyScalar(2.6);
    this.shock.position.set(this.suit.position.x, this.suit.position.y + 0.05, this.suit.position.z);
    this.shock.scale.setScalar(0.5);
    this.shock.visible = true;
    g.hud.whiteFlash();
    g.player.shake = 0.7;
    audio.fanfare(this.color);
    g.hud.zoneTitle('CHROMA UNLOCKED', COLORS[this.color].name, COLORS[this.color].css, 4.5);
  }

  update(dt) {
    const g = this.game;
    const cam = g.camera;
    this.t += dt;
    const t = this.t;
    // ---- core: rise, spin, then streak into the chest ----
    if (!this.absorbed) {
      const rise = Math.min(1, t / 2.0);
      const pos = this.coreStart.clone();
      pos.y += 0.9 * (1 - Math.pow(1 - rise, 3)) + Math.sin(t * 5) * 0.05;
      if (t > 2.2) {
        const k = Math.min(1, (t - 2.2) / (ABSORB_AT - 2.2));
        const chest = this.suit.userData.chest.getWorldPosition(_v);
        pos.lerp(chest, k * k);
        g.world.fx.burst(pos, this.hex, { count: 6, speed: 1, life: 0.5, size: 0.3, gravity: 0 });
      }
      this.core.position.copy(pos);
      this.core.rotation.y += dt * (3 + t * 4);
      this.coreRings[0].rotation.y += dt * 6;
      this.coreRings[1].rotation.z += dt * 4;
      this.core.scale.setScalar(1 + Math.sin(t * 12) * 0.06 + rise * 0.3);
      // particles spiral in from a wide ring
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 2.2 + Math.random() * 1.2;
        const from = new THREE.Vector3(pos.x + Math.cos(a) * r, pos.y - 1 + Math.random() * 2.4, pos.z + Math.sin(a) * r);
        const dir = pos.clone().sub(from).normalize();
        dir.add(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.6));
        g.world.fx.burst(from, i % 3 ? this.hex : 0xffffff, { count: 1, speed: 1, life: 0.55, size: 0.22, gravity: 0, drag: 0, spread: 0, dir: dir.multiplyScalar(4.2) });
      }
      if (t >= ABSORB_AT) this.absorb();
    }
    this.beamMat.opacity = this.absorbed ? Math.max(0, this.beamMat.opacity - dt * 1.5) : Math.min(0.35, t * 0.25) + Math.sin(t * 9) * 0.04;
    this.beam.rotation.y += dt;
    if (this.shock.visible) {
      const s = this.shock.scale.x + dt * 14;
      this.shock.scale.setScalar(s);
      this.ringMat.opacity = Math.max(0, 1 - s / 12);
      if (s > 12) this.shock.visible = false;
    }
    // the suit lifts its blaster after absorbing
    const arms = this.suit.userData.arms;
    arms.rotation.x = this.absorbed ? Math.max(-0.5, arms.rotation.x - dt * 2) : 0;

    // ---- camera: orbit, then blend back into the player's eyes ----
    const a = this.orbit0 + t * 0.32;
    const r = 3.5 - Math.min(1, t / DURATION) * 0.9;
    const orbitPos = new THREE.Vector3(this.center.x + Math.sin(a) * r, this.center.y + 0.35 + Math.sin(t * 0.5) * 0.15, this.center.z + Math.cos(a) * r);
    cam.position.copy(orbitPos);
    cam.lookAt(this.center);
    if (t < 0.6) {
      // swing out from first person
      const k = t / 0.6;
      const e = k * k * (3 - 2 * k);
      _q.copy(cam.quaternion);
      cam.position.lerpVectors(this.fromCam.pos, orbitPos, e);
      cam.quaternion.slerpQuaternions(this.fromCam.quat, _q, e);
    } else if (t > BLEND_FROM) {
      const k = Math.min(1, (t - BLEND_FROM) / (DURATION - BLEND_FROM));
      const e = k * k * (3 - 2 * k);
      const p = g.player;
      const eye = new THREE.Vector3(p.pos.x, p.pos.y + p.eye, p.pos.z);
      const fq = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ'));
      _q.copy(cam.quaternion);
      cam.position.lerpVectors(orbitPos, eye, e);
      cam.quaternion.slerpQuaternions(_q, fq, e);
    }
    if (t >= DURATION) this.finish();
    return this.active;
  }

  finish() {
    const g = this.game;
    this.active = false;
    this.suit.visible = false;
    this.core.visible = false;
    this.beam.visible = false;
    this.shock.visible = false;
    g.hud.cinematic(false);
    g.player.updateCamera();
    g.onCutsceneDone();
  }
}
