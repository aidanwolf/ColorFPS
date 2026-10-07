// Pickups, moving platforms, jump pads and checkpoints.
import * as THREE from 'three';
import { COLORS } from '../colors.js';
import { boxGeo, mat } from '../materials.js';
import { audio } from '../audio.js';

export class Pickup {
  // type: 'color' (unlocks a blaster color), 'health', 'maxhp' (secret upgrade)
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
      this.light = new THREE.PointLight(c, 6, 9, 1.6);
      this.group.add(this.light);
    } else if (type === 'health') {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6dffb0).multiplyScalar(1.8) });
      this.spin = new THREE.Group();
      this.spin.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.16), m), new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), m));
      const cage = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), new THREE.MeshBasicMaterial({ color: 0x6dffb0, wireframe: true, transparent: true, opacity: 0.4 }));
      this.spin.add(cage);
      this.group.add(this.spin);
    } else {
      const gold = new THREE.MeshStandardMaterial({ color: 0xffcc55, metalness: 1, roughness: 0.25, emissive: 0x664400 });
      this.spin = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), gold);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.03, 6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffdd77).multiplyScalar(2) }));
      halo.rotation.x = Math.PI / 2;
      this.rings = halo;
      this.group.add(this.spin, halo);
      this.light = new THREE.PointLight(0xffcc55, 4, 6, 1.6);
      this.group.add(this.light);
    }
    world.scene.add(this.group);
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
        }
      }
      return;
    }
    this.group.position.y = this.pos.y + Math.sin(this.t * 2) * 0.12;
    this.spin.rotation.y += dt * 2;
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
      player.maxHealth += this.amount;
      player.health = player.maxHealth;
      audio.secret();
    }
    this.active = false;
    this.group.visible = false;
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
  constructor(world, game, { pos, yaw = 0, size = [3, 3, 2] }) {
    this.world = world;
    this.pos = new THREE.Vector3(...pos);
    this.on = false;
    // a small beacon on the floor that lights up when reached
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x333a55 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 32), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.03;
    this.group.add(ring);
    this.ringMat = ringMat;
    world.scene.add(this.group);
    const [w, h, d] = size;
    world.trigger([this.pos.x - w / 2, this.pos.y, this.pos.z - d / 2], [this.pos.x + w / 2, this.pos.y + h, this.pos.z + d / 2], () => {
      if (game.checkpoint?.ref === this) return;
      this.ringMat.color.set(0x9bf6ff).multiplyScalar(2);
      game.setCheckpoint(this.pos, yaw, this);
    }, { once: false });
  }
}
