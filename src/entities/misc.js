// Pickups, moving platforms, jump pads and checkpoints.
import * as THREE from 'three';
import { COLORS } from '../colors.js';
import { boxGeo, mat } from '../materials.js';
import { audio } from '../audio.js';

export class Pickup {
  // type: 'color' (unlocks a blaster color), 'health', 'maxhp' (a secret's prize: a collectible prism)
  constructor(world, { pos, type, color = 0, amount = 30, respawn = 0, onCollect = null }) {
    this.world = world;
    this.type = type;
    this.color = color;
    this.amount = amount;
    this.respawn = respawn;
    this.onCollect = onCollect;
    this.pos = new THREE.Vector3(...pos);
    this.t = Math.random() * 10;
    this.active = true;
    this.timer = 0;
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    if (type === 'color') {
      const c = new THREE.Color(COLORS[color].hex);
      const glow = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2.5) });
      this.spin = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), glow);
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 6, 32), glow);
      const r2 = r1.clone();
      r2.rotation.x = Math.PI / 2;
      this.rings = new THREE.Group();
      this.rings.add(r1, r2);
      this.group.add(this.spin, this.rings);
      this.light = world.addLight(c, 6, 9, 1.6);
    } else if (type === 'health') {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6dffb0).multiplyScalar(1.8) });
      this.spin = new THREE.Group();
      this.spin.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.16), m), new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), m));
      const cage = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), new THREE.MeshBasicMaterial({ color: 0x6dffb0, wireframe: true, transparent: true, opacity: 0.4 }));
      this.spin.add(cage);
      this.group.add(this.spin);
    } else {
      // secret prize: a prism trophy (a tall crystal cycling through the spectrum on a small pedestal,
      // with a shard of each blaster color orbiting it) so it can't be mistaken for an enemy
      this.prismMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.05, flatShading: true });
      this.spin = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), this.prismMat);
      this.spin.scale.set(0.8, 1.6, 0.8);
      const base = new THREE.Group();
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0x2a2c36, metalness: 0.8, roughness: 0.3 }));
      plinth.position.y = -0.75;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.025, 6, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.6) }));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = -0.63;
      base.add(plinth, rim);
      this.rings = new THREE.Group();
      COLORS.forEach((col, i) => {
        const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(col.hex).multiplyScalar(2.2) }));
        const a = (i / 4) * Math.PI * 2;
        shard.position.set(Math.cos(a) * 0.55, Math.sin(a * 2) * 0.12, Math.sin(a) * 0.55);
        this.rings.add(shard);
      });
      this.group.add(this.spin, base, this.rings);
      this.light = world.addLight(0xffffff, 3, 6, 1.6);
    }
    world.scene.add(this.group);
    // the glow is a pooled world light (World.addLight), dimmed to 0 once collected
    if (this.light) {
      this.light.position.copy(this.pos);
      this.lightIntensity = this.light.intensity;
    }
    world.add(this);
  }

  update(dt, player) {
    this.t += dt;
    if (!this.active) {
      if (this.respawn > 0) {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.active = true;
          this.group.visible = true;
          if (this.light) this.light.intensity = this.lightIntensity;
        }
      }
      return;
    }
    this.group.position.y = this.pos.y + Math.sin(this.t * 2) * 0.12;
    this.spin.rotation.y += dt * 2;
    if (this.prismMat) {
      this.prismMat.emissive.setHSL((this.t * 0.15) % 1, 1, 0.55);
      if (this.light) this.light.color.copy(this.prismMat.emissive);
    }
    if (this.rings) {
      this.rings.rotation.y += dt * 0.7;
      this.rings.rotation.z += dt * 0.4;
    }
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dy = player.pos.y + 0.8 - this.pos.y;
    const r2 = this.type === 'color' ? 2.4 : 1.3;
    if (dx * dx + dz * dz < r2 && Math.abs(dy) < 1.6) this.collect(player);
  }

  collect(player) {
    if (this.type === 'health') {
      if (player.health >= player.maxHealth) return;
      player.heal(this.amount);
      audio.pickup();
    } else if (this.type === 'maxhp') {
      audio.maxhp();
    }
    this.active = false;
    this.group.visible = false;
    if (this.light) this.light.intensity = 0;
    this.timer = this.respawn;
    this.world.fx.burst(this.pos, this.type === 'color' ? COLORS[this.color].hex : this.type === 'health' ? 0x6dffb0 : 0xffcc55, { count: 40, speed: 6, life: 0.8, size: 0.3, gravity: 2 });
    this.onCollect?.(this, player);
    if (!this.respawn) this.world.remove(this);
  }
}

export class MovingPlatform {
  constructor(world, { min, max, offset, speed = 2, pause = 0.6, active = true, zone = 'red', kind = 'plat' }) {
    this.world = world;
    this.base = new THREE.Vector3(...min);
    this.size = new THREE.Vector3(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    this.offset = new THREE.Vector3(...offset);
    this.len = this.offset.length();
    this.speed = speed;
    this.pause = pause;
    this.active = active;
    this.u = 0;
    this.dir = 1;
    this.wait = 0;
    this.cur = this.base.clone();
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(boxGeo(this.size.x, this.size.y, this.size.z), mat(kind, zone));
    body.position.copy(this.size).multiplyScalar(0.5);
    this.mesh.add(body);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(this.size.x + 0.04, 0.08, this.size.z + 0.04), mat('trimWhite'));
    glow.position.set(this.size.x / 2, 0.04, this.size.z / 2);
    this.mesh.add(glow);
    this.mesh.position.copy(this.base);
    world.scene.add(this.mesh);
    this.solid = world.addSolid(this.base.clone(), this.base.clone().add(this.size), { delta: new THREE.Vector3(), moving: true });
    world.add(this);
  }

  update(dt) {
    const delta = this.solid.delta.set(0, 0, 0);
    if (!this.active) return;
    if (this.wait > 0) {
      this.wait -= dt;
      return;
    }
    this.u += (this.dir * this.speed * dt) / this.len;
    if (this.u >= 1 || this.u <= 0) {
      this.u = Math.max(0, Math.min(1, this.u));
      this.dir *= -1;
      this.wait = this.pause;
    }
    // ease in/out so riders aren't jolted
    const e = this.u * this.u * (3 - 2 * this.u);
    const next = this.base.clone().addScaledVector(this.offset, e);
    delta.subVectors(next, this.cur);
    this.cur.copy(next);
    this.solid.min.copy(next);
    this.solid.max.copy(next).add(this.size);
    this.mesh.position.copy(next);
  }
}

export class JumpPad {
  constructor(world, { pos, power = 16, push = [0, 0, 0], color = 0x9bf6ff }) {
    this.world = world;
    this.pos = new THREE.Vector3(...pos);
    this.power = power;
    this.push = new THREE.Vector3(...push);
    this.cool = 0;
    this.t = 0;
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.2, 24), new THREE.MeshStandardMaterial({ color: 0x23252e, metalness: 0.8, roughness: 0.3 }));
    base.position.y = 0.1;
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2) });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.22, 24), glowMat);
    disc.position.y = 0.11;
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.03, 6, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, depthWrite: false }));
      r.rotation.x = Math.PI / 2;
      this.rings.push(r);
      this.group.add(r);
    }
    this.group.add(base, disc);
    world.scene.add(this.group);
    world.addSolid(new THREE.Vector3(this.pos.x - 1, this.pos.y, this.pos.z - 1), new THREE.Vector3(this.pos.x + 1, this.pos.y + 0.2, this.pos.z + 1), { static: true });
    world.add(this);
  }

  update(dt, player) {
    this.t += dt;
    this.cool -= dt;
    this.rings.forEach((r, i) => {
      const k = (this.t * 0.8 + i / 3) % 1;
      r.position.y = 0.2 + k * 2.2;
      r.scale.setScalar(1 - k * 0.4);
      r.material.opacity = 1 - k;
    });
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    if (this.cool <= 0 && dx * dx + dz * dz < 1.1 && Math.abs(player.pos.y - (this.pos.y + 0.2)) < 0.3) {
      player.launch(this.power, this.push.lengthSq() ? this.push : null);
      this.cool = 0.5;
      audio.pad();
      this.world.fx.burst(this.pos.clone().setY(this.pos.y + 0.3), 0x9bf6ff, { count: 30, speed: 5, life: 0.5, size: 0.25, gravity: -2 });
    }
  }
}

export class Checkpoint {
  // A light beacon you run through. It turns bright cyan when it becomes your respawn point.
  constructor(world, game, { pos, yaw = 0, size = [3, 3, 2] }) {
    this.world = world;
    this.pos = new THREE.Vector3(...pos);
    this.t = Math.random() * 10;
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x4a5070 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.07, 6, 32), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.04;
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0x6a7090, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 3.2, 24, 1, true), this.beamMat);
    beam.position.y = 1.6;
    this.gemMat = new THREE.MeshBasicMaterial({ color: 0x6a7090 });
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), this.gemMat);
    this.gem.position.y = 2.3;
    this.group.add(ring, beam, this.gem);
    world.scene.add(this.group);
    world.add(this);
    const [w, h, d] = size;
    world.trigger([this.pos.x - w / 2, this.pos.y, this.pos.z - d / 2], [this.pos.x + w / 2, this.pos.y + h, this.pos.z + d / 2], () => {
      if (game.checkpoint?.ref === this) return;
      game.checkpoint?.ref?.setActive(false);
      this.setActive(true);
      this.world.fx.burst(this.pos.clone().setY(this.pos.y + 1.2), 0x9bf6ff, { count: 40, speed: 4, life: 0.8, size: 0.25, gravity: -3 });
      game.setCheckpoint(this.pos, yaw, this);
    }, { once: false });
  }

  setActive(on) {
    this.active = on;
    this.used = true;
    const c = on ? new THREE.Color(0x9bf6ff).multiplyScalar(2) : new THREE.Color(0x5fd3a0);
    this.ringMat.color.copy(c);
    this.gemMat.color.copy(c);
    this.beamMat.color.set(on ? 0x9bf6ff : 0x5fd3a0);
    this.beamMat.opacity = on ? 0.28 : 0.08;
  }

  update(dt, player) {
    this.t += dt;
    this.gem.rotation.y += dt * (this.active ? 3 : 1);
    this.gem.position.y = 2.3 + Math.sin(this.t * 2) * 0.1;
    // the beam fades while you stand in it, so it doesn't wash out your view
    const near = player ? Math.min(1, Math.max(0, (Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) - 1.2) / 2.3)) : 1;
    this.beamMat.opacity = (this.active ? 0.22 + Math.sin(this.t * 4) * 0.06 : 0.08) * near;
  }
}
