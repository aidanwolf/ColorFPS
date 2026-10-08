// Armor: a pickup that wraps you in a one-hit shield. While you wear it, the next enemy hit (a shot, a
// bite, a blast, a flame) shatters the shield instead of killing you, with a moment of grace after.
// Hazards still kill (lava, sludge, quicksand, spikes, drowning, falls): it's armor, not a parachute.
// Placed off the main line in arenas, so agile players who explore get a second chance.
import * as THREE from 'three';
import { audio } from '../audio.js';

export const ARMOR_COLOR = 0x7ff6ff;
// causes the shield doesn't stop
export const ARMOR_IGNORES = new Set(['acid', 'spike', 'impact', 'fall', 'drown', 'lava', 'sand', 'quicksand', 'toxic', 'brine', 'crush', 'void']);

let shared = null;
function parts() {
  if (shared) return shared;
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(ARMOR_COLOR).multiplyScalar(2.2) });
  const glass = new THREE.MeshBasicMaterial({ color: new THREE.Color(ARMOR_COLOR).multiplyScalar(0.5), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const halo = new THREE.MeshBasicMaterial({ color: ARMOR_COLOR, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a3140, metalness: 0.8, roughness: 0.35 });
  shared = {
    glow, glass, halo, metal,
    rim: new THREE.TorusGeometry(0.5, 0.06, 6, 6), // a hexagonal ring
    face: new THREE.CircleGeometry(0.46, 6),
    core: new THREE.OctahedronGeometry(0.14, 0),
    base: new THREE.CylinderGeometry(0.55, 0.65, 0.12, 6),
    ring: new THREE.RingGeometry(0.62, 0.72, 6),
  };
  return shared;
}

export class ArmorPickup {
  // pos: a point on the floor (the emblem floats above it). respawn: seconds until it's back after being
  // taken (it's always back after you die and respawn). base: false over a hazard (no plinth to mislead).
  constructor(world, { pos, respawn = 30, base: withBase = true }) {
    const P = parts();
    this.world = world;
    this.pos = new THREE.Vector3(...pos);
    this.respawn = respawn;
    this.taken = false;
    this.timer = 0;
    this.t = Math.random() * 10;
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.group.userData.noBatch = true; // it spins and blinks
    const base = new THREE.Mesh(P.base, P.metal);
    base.position.y = 0.06;
    const pad = new THREE.Mesh(P.ring, P.halo);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.13;
    this.emblem = new THREE.Group();
    this.emblem.position.y = 1.15;
    const rim = new THREE.Mesh(P.rim, P.glow);
    rim.rotation.z = Math.PI / 6;
    const face = new THREE.Mesh(P.face, P.glass);
    face.rotation.z = Math.PI / 6;
    const core = new THREE.Mesh(P.core, P.glow);
    this.emblem.add(rim, face, core);
    this.pad = pad;
    this.group.add(this.emblem);
    if (withBase) this.group.add(base, pad); // (no plinth when it floats over a hazard: it isn't a platform)
    world.scene.add(this.group);
    world.add(this);
  }

  update(dt, player) {
    this.t += dt;
    if (this.taken) {
      if (this.respawn > 0 && (this.timer -= dt) <= 0) this.restore(true);
      return;
    }
    this.emblem.rotation.y += dt * 1.6;
    this.emblem.position.y = 1.15 + Math.sin(this.t * 2.2) * 0.12;
    this.pad.material.opacity = 0.18 + 0.12 * Math.sin(this.t * 3);
    if (player.dead || player.armor > 0) return;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, dy = player.pos.y - this.pos.y;
    if (dx * dx + dz * dz < 1.2 && dy > -0.6 && dy < 1.8) this.take(player);
  }

  take(player) {
    this.taken = true;
    this.timer = this.respawn;
    this.emblem.visible = false;
    this.pad.visible = false;
    player.giveArmor();
    const p = this.pos.clone();
    p.y += 1.15;
    this.world.fx.burst(p, ARMOR_COLOR, { count: 60, speed: 6, life: 0.7, size: 0.25, gravity: 0 });
    audio.sample('charge_up', { gain: 0.8, rate: 1.25 });
  }

  restore(effect = false) {
    if (!this.taken) return;
    this.taken = false;
    this.emblem.visible = true;
    this.pad.visible = true;
    if (effect) {
      const p = this.pos.clone();
      p.y += 1.15;
      this.world.fx.burst(p, ARMOR_COLOR, { count: 24, speed: 2.5, life: 0.6, size: 0.18, gravity: 0 });
    }
  }
}
