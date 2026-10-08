// Floors that betray you: crumbling slabs, trapdoors that swing open over spikes, and the spike beds
// themselves. Options are documented at the top of mechanics.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxGeo, mat } from '../materials.js';
import { v3, hexOf, zoneHex, AMBER, glowMat, edgeGeo, crackTex, overlapsPlayer, nearGain, sfx, clamp, rnd } from './mechkit.js';

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const DUST = new THREE.Color(0xb8b0a0);
const _p = new THREE.Vector3();
const TELEGRAPH = 0.7;

export class CrumblePlatform {
  constructor(world, { min, max, delay = 0.6, respawn = 4, disguise = false, zone = 'red', kind = 'plat' }) {
    this.world = world;
    this.min = v3(min);
    this.max = v3(max);
    this.delay = delay;
    this.respawn = respawn;
    this.disguise = disguise;
    this.state = 'idle'; // idle → shaking → broken → (telegraph) → idle
    this.timer = 0;
    this.t = 0;
    this.reform = 1;
    const size = (this.size = this.max.clone().sub(this.min));
    this.center = this.min.clone().add(this.max).multiplyScalar(0.5);
    this.hex = disguise ? zoneHex(zone) : AMBER;
    this.group = new THREE.Group();
    this.group.position.copy(this.center);
    // the slab is a grid of chunks that tumble away separately when it goes
    const nx = clamp(Math.round(size.x / 1.1), 1, 6), nz = clamp(Math.round(size.z / 1.1), 1, 6);
    const cw = size.x / nx, cd = size.z / nz;
    const m = mat(kind, zone);
    this.chunks = [];
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const c = new THREE.Mesh(boxGeo(cw - 0.03, size.y, cd - 0.03), m);
        c.userData.home = new THREE.Vector3(-size.x / 2 + cw * (i + 0.5), 0, -size.z / 2 + cd * (j + 0.5));
        c.userData.v = new THREE.Vector3();
        c.userData.w = new THREE.Vector3();
        c.position.copy(c.userData.home);
        this.chunks.push(c);
        this.group.add(c);
      }
    // while it's whole the chunks are drawn as one merged mesh (one draw call, not one per chunk); the
    // separate chunks only show once it collapses
    this.whole = new THREE.Mesh(mergeGeometries(this.chunks.map((c) => c.geometry.clone().translate(c.position.x, c.position.y, c.position.z)), false), m);
    this.group.add(this.whole);
    this.edgeMat = glowMat(this.hex, disguise ? 2.2 : 1.6);
    // a top-edge trim like B.plat()'s (amber for an honest crumbler, the zone's own trim when disguised)
    const trim = new THREE.Mesh(edgeGeo(size.x, 0.06, size.z, 0.05), this.edgeMat);
    trim.position.y = size.y / 2 - 0.08;
    this.trim = trim;
    this.crackMat = new THREE.MeshBasicMaterial({ map: crackTex(), color: new THREE.Color(this.hex), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    this.cracks = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 0.96, size.z * 0.96), this.crackMat);
    this.cracks.rotation.x = -Math.PI / 2;
    this.cracks.position.y = size.y / 2 + 0.012;
    this.group.add(trim, this.cracks);
    world.scene.add(this.group);
    this.solid = world.addSolid(this.min.clone(), this.max.clone(), { kind: 'metal' });
    world.add(this);
    this.restore(true);
  }

  // start the countdown (also how a switch or trigger drops it: link it)
  activate() {
    if (this.state !== 'idle') return;
    if (this.delay <= 0) return this.collapse();
    this.state = 'shaking';
    this.timer = this.delay;
    sfx.crack(nearGain(this.world, this.center));
    this.world.fx.sparks(_p.set(this.center.x, this.max.y, this.center.z), UP, this.hex, { count: 8, speed: 4, spread: 1.5, life: 0.3 });
  }

  deactivate() {}

  collapse() {
    this.state = 'broken';
    this.timer = this.respawn;
    this.solid.enabled = false;
    this.trim.visible = false;
    this.cracks.visible = false;
    this.whole.visible = false;
    for (const c of this.chunks) c.visible = true;
    const g = nearGain(this.world, this.center);
    sfx.crumble(g);
    for (const c of this.chunks) {
      const h = c.userData.home;
      c.userData.v.set(h.x * rnd(0.6, 1.6) + rnd(-0.6, 0.6), rnd(-1, 1.5), h.z * rnd(0.6, 1.6) + rnd(-0.6, 0.6));
      c.userData.w.set(rnd(-5, 5), rnd(-3, 3), rnd(-5, 5));
    }
    const fx = this.world.fx, s = this.size;
    // dust rolling off every edge, grit spraying down, a crack of light where it split
    for (let i = 0; i < 26; i++) {
      const e = Math.random() < 0.5;
      _p.set(e ? this.min.x + Math.random() * s.x : Math.random() < 0.5 ? this.min.x : this.max.x, this.max.y - 0.1, e ? (Math.random() < 0.5 ? this.min.z : this.max.z) : this.min.z + Math.random() * s.z);
      const k = fx.puff(_p, rnd(-1.5, 1.5), rnd(-0.5, 0.6), rnd(-1.5, 1.5), DUST, 0.22, rnd(0.9, 1.5), rnd(0.2, 0.35), 2.6);
      fx.grav[k] = 0.6;
    }
    for (let i = 0; i < 30; i++) {
      _p.set(this.min.x + Math.random() * s.x, this.min.y + Math.random() * s.y, this.min.z + Math.random() * s.z);
      const k = fx.shard(_p, rnd(-3, 3), rnd(-1, 4), rnd(-3, 3), DUST, 0.7, rnd(0.8, 1.4), rnd(0.04, 0.09), 1.5);
      fx.grav[k] = 14;
    }
    _p.set(this.center.x, this.max.y, this.center.z);
    fx.flash(_p, this.hex, { size: Math.max(s.x, s.z) * 0.6, life: 0.15, n: UP, k: 1.4 });
    fx.ring(_p, UP, this.hex, { size: 0.3, end: Math.max(s.x, s.z), life: 0.35, thick: 0.1, k: 1.3 });
    const pl = this.world.game?.player;
    if (pl && g > 0.6) pl.shake = Math.max(pl.shake, 0.3 * g);
  }

  // back in one piece (silent = respawn / build, else with the reform shimmer)
  restore(silent = false) {
    this.state = 'idle';
    this.solid.enabled = true;
    this.trim.visible = true;
    this.cracks.visible = true;
    this.crackMat.opacity = this.disguise ? 0 : 0.22;
    this.group.position.copy(this.center);
    for (const c of this.chunks) {
      c.position.copy(c.userData.home);
      c.rotation.set(0, 0, 0);
      c.visible = false;
    }
    this.whole.visible = true;
    if (!silent) {
      this.reform = 0;
      this.world.fx.reformFlash(this.min, this.max, this.hex, 'spike');
      sfx.phaseIn(nearGain(this.world, this.center) * 0.7);
    } else this.reform = 1;
  }

  reset() {
    this.restore(true);
  }

  update(dt, player) {
    this.t += dt;
    if (this.state === 'idle') {
      if (player && player.grounded && player.ground === this.solid) this.activate();
    }
    if (this.state === 'shaking') {
      this.timer -= dt;
      const k = 1 - Math.max(0, this.timer) / this.delay;
      const a = 0.015 + 0.06 * k;
      this.group.position.set(this.center.x + rnd(-a, a), this.center.y + rnd(-a, a) * 0.5, this.center.z + rnd(-a, a));
      this.crackMat.opacity = 0.3 + 0.7 * k;
      this.crackMat.color.set(this.hex).lerp(new THREE.Color(0xffffff), k * 0.5).multiplyScalar(1 + k);
      // grit trickling from the underside
      if (Math.random() < 0.5) {
        _p.set(this.min.x + Math.random() * this.size.x, this.min.y, this.min.z + Math.random() * this.size.z);
        const i = this.world.fx.puff(_p, 0, -0.6, 0, DUST, 0.15, 0.8, 0.08, 2);
        this.world.fx.grav[i] = 3;
      }
      if (this.timer <= 0) this.collapse();
    } else if (this.state === 'broken') {
      for (const c of this.chunks) {
        if (!c.visible) continue;
        const v = c.userData.v;
        v.y -= 20 * dt;
        c.position.addScaledVector(v, dt);
        c.rotation.x += c.userData.w.x * dt;
        c.rotation.y += c.userData.w.y * dt;
        c.rotation.z += c.userData.w.z * dt;
        if (c.position.y < -25) c.visible = false;
      }
      if (this.respawn > 0) {
        const prev = this.timer;
        this.timer -= dt;
        if (prev > TELEGRAPH && this.timer <= TELEGRAPH) this.world.fx.reform(this.min, this.max, this.hex, TELEGRAPH, 3);
        if (this.timer <= 0 && !overlapsPlayer(player, this.min, this.max, 0.05)) this.restore();
      }
    }
    if (this.reform < 1) {
      this.reform = Math.min(1, this.reform + dt * 5);
      this.group.scale.setScalar(0.7 + 0.3 * this.reform);
    }
  }
}

export class Trapdoor {
  constructor(world, { min, max, delay = 0.35, respawn = 3, trigger = 'step', split = true, spikes = null, zone = 'red', kind = 'floor' }) {
    this.world = world;
    this.min = v3(min);
    this.max = v3(max);
    this.delay = delay;
    this.respawn = respawn;
    this.mode = typeof trigger === 'string' ? trigger : 'box';
    this.state = 'shut'; // shut → warn → open → closing → shut
    this.timer = 0;
    this.angle = 0;
    this.av = 0;
    const size = (this.size = this.max.clone().sub(this.min));
    this.center = this.min.clone().add(this.max).multiplyScalar(0.5);
    // the panels hinge on the long sides (or one side, unsplit) and swing down
    this.alongX = size.x >= size.z; // hinges run along x: panels rotate about x
    const m = mat(kind, zone);
    this.panels = [];
    const n = split ? 2 : 1;
    const span = (this.alongX ? size.z : size.x) / n;
    for (let i = 0; i < n; i++) {
      const sign = i === 0 ? 1 : -1; // panel 0 hinges on the min side and extends toward +, panel 1 the reverse
      const pivot = new THREE.Group();
      const g = this.alongX ? boxGeo(size.x, size.y, span - 0.02) : boxGeo(span - 0.02, size.y, size.z);
      const mesh = new THREE.Mesh(g, m);
      const off = (span / 2) * sign;
      if (this.alongX) {
        pivot.position.set(this.center.x, this.max.y, i === 0 ? this.min.z : this.max.z);
        mesh.position.set(0, -size.y / 2, off);
      } else {
        pivot.position.set(i === 0 ? this.min.x : this.max.x, this.max.y, this.center.z);
        mesh.position.set(off, -size.y / 2, 0);
      }
      pivot.add(mesh);
      world.scene.add(pivot);
      const pmin = this.min.clone(), pmax = this.max.clone();
      if (this.alongX) i === 0 ? (pmax.z = this.min.z + span) : (pmin.z = this.max.z - span);
      else i === 0 ? (pmax.x = this.min.x + span) : (pmin.x = this.max.x - span);
      const solid = world.addSolid(pmin, pmax, { kind: 'metal' });
      this.panels.push({ pivot, sign, solid });
    }
    // a faint seam line down the middle (the only tell), which flares while it's about to go
    this.seamMat = glowMat(AMBER, 0.5);
    const seam = new THREE.Mesh(this.alongX ? new THREE.BoxGeometry(size.x, 0.02, 0.05) : new THREE.BoxGeometry(0.05, 0.02, size.z), this.seamMat);
    seam.position.set(this.center.x, this.max.y + 0.006, this.center.z);
    if (!split) seam.position[this.alongX ? 'z' : 'x'] = this.alongX ? this.min.z + 0.03 : this.min.x + 0.03;
    this.seam = seam;
    world.scene.add(seam);
    if (spikes !== null && spikes !== undefined) this.spikes = new SpikeBed(world, { min: [this.min.x, spikes, this.min.z], max: [this.max.x, spikes + 0.8, this.max.z] });
    if (this.mode === 'box') this.trig = world.trigger(trigger.min, trigger.max, () => this.activate(), { once: false });
    world.add(this);
  }

  activate() {
    if (this.state !== 'shut') return;
    this.state = 'warn';
    this.timer = this.delay;
    sfx.clank(nearGain(this.world, this.center));
    sfx.crack(nearGain(this.world, this.center) * 0.6);
    if (this.delay <= 0) this.drop();
  }

  deactivate() {}

  drop() {
    this.state = 'open';
    this.timer = this.respawn;
    this.av = 0;
    for (const p of this.panels) p.solid.enabled = false;
    const g = nearGain(this.world, this.center);
    sfx.trapdoor(g);
    const fx = this.world.fx;
    for (let i = 0; i < 18; i++) {
      _p.set(this.min.x + Math.random() * this.size.x, this.max.y, this.min.z + Math.random() * this.size.z);
      const k = fx.puff(_p, rnd(-0.5, 0.5), rnd(-1.5, -0.2), rnd(-0.5, 0.5), DUST, 0.2, rnd(0.8, 1.3), rnd(0.15, 0.3), 2.5);
      fx.grav[k] = 2;
    }
    _p.copy(this.center).setY(this.max.y);
    fx.sparks(_p, DOWN, AMBER, { count: 14, speed: 6, spread: 1.5, life: 0.4 });
  }

  close(instant = false) {
    if (instant) {
      this.state = 'shut';
      this.angle = 0;
      for (const p of this.panels) p.solid.enabled = true;
      this.pose();
      return;
    }
    this.state = 'closing';
  }

  reset() {
    this.close(true);
  }

  pose() {
    for (const p of this.panels) {
      // panel 0 swings down from its hinge (toward −y), panel 1 mirrors it
      if (this.alongX) p.pivot.rotation.x = this.angle * p.sign;
      else p.pivot.rotation.z = -this.angle * p.sign;
    }
  }

  update(dt, player) {
    if (this.state === 'shut') {
      if (this.mode === 'step' && player?.grounded && this.panels.some((p) => p.solid === player.ground)) this.activate();
      this.seamMat.color.set(AMBER).multiplyScalar(0.5);
    } else if (this.state === 'warn') {
      this.timer -= dt;
      this.angle = rnd(0, 0.035);
      this.seamMat.color.set(AMBER).multiplyScalar((this.timer * 20) % 1 < 0.5 ? 3 : 1);
      if (this.timer <= 0) this.drop();
    } else if (this.state === 'open') {
      // swing down under gravity, bounce off the stop at ~100°
      const stop = 1.75;
      this.av += 22 * dt;
      this.angle += this.av * dt;
      if (this.angle > stop) {
        this.angle = stop;
        this.av = -this.av * 0.3;
        if (Math.abs(this.av) < 0.5) this.av = 0;
      }
      if (this.respawn > 0) {
        this.timer -= dt;
        if (this.timer <= 0) this.close();
      }
    } else if (this.state === 'closing') {
      this.angle = Math.max(0, this.angle - dt * 3);
      if (this.angle <= 0) {
        // wait until the player is out of the way before going solid again
        if (this.panels.every((p) => !overlapsPlayer(player, p.solid.min, p.solid.max, 0.02))) {
          for (const p of this.panels) p.solid.enabled = true;
          this.state = 'shut';
          sfx.clank(nearGain(this.world, this.center) * 0.7);
        }
      }
    }
    this.seam.visible = this.state === 'shut' || this.state === 'warn';
    this.pose();
  }
}

// One shared steel material per glow color.
const spikeMats = new Map();
export class SpikeBed {
  constructor(world, { min, max, color = null }) {
    const a = v3(min), b = v3(max), size = b.clone().sub(a);
    const hex = color === null ? 0xff5533 : hexOf(color);
    if (!spikeMats.has(hex)) spikeMats.set(hex, new THREE.MeshStandardMaterial({ color: 0x8a909e, metalness: 0.85, roughness: 0.3, emissive: new THREE.Color(hex), emissiveIntensity: color === null ? 0.12 : 0.6 }));
    const step = 0.5, slabH = 0.15, h = size.y - slabH, cones = [];
    for (let x = a.x + step / 2; x < b.x; x += step)
      for (let z = a.z + step / 2; z < b.z; z += step) cones.push(new THREE.ConeGeometry(0.16, h * rnd(0.8, 1), 5).translate(x + rnd(-0.06, 0.06), a.y + slabH + h / 2, z + rnd(-0.06, 0.06)));
    cones.push(new THREE.BoxGeometry(size.x, slabH, size.z).translate((a.x + b.x) / 2, a.y + slabH / 2, (a.z + b.z) / 2));
    const geo = mergeGeometries(cones.map((g) => g.toNonIndexed()));
    cones.forEach((g) => g.dispose());
    this.mesh = new THREE.Mesh(geo, spikeMats.get(hex));
    world.scene.add(this.mesh);
    this.solid = world.addSolid(a, b, { static: true, hazard: 'spike', kind: 'metal' });
  }
}
