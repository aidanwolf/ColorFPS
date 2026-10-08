// Ricochet puzzle pieces: mirror panels (reflect any shot), glass (stops players and shots),
// color targets (only their color activates them; anything else bounces off) and sliding doors.
import * as THREE from 'three';
import { COLORS } from '../colors.js';
import { boxGeo, mat, glyphTex } from '../materials.js';
import { audio } from '../audio.js';

const v3 = (a) => new THREE.Vector3(...a);

function edgeLines(geo, color, opacity = 1) {
  return new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
  );
}

export class Mirror {
  constructor(world, { min, max }) {
    const a = v3(min), b = v3(max);
    const size = b.clone().sub(a), center = a.clone().add(b).multiplyScalar(0.5);
    const geo = boxGeo(size.x, size.y, size.z);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xe6f1ff, metalness: 1, roughness: 0.04, envMapIntensity: 1.6 }));
    mesh.position.copy(center);
    mesh.add(edgeLines(geo, new THREE.Color(0x9bf6ff).multiplyScalar(2)));
    world.scene.add(mesh);
    world.addSolid(a, b, { static: true, mirror: true, kind: 'metal' });
  }
}

export class Glass {
  constructor(world, { min, max }) {
    const a = v3(min), b = v3(max);
    const size = b.clone().sub(a), center = a.clone().add(b).multiplyScalar(0.5);
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: 0xa8dcff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2, depthWrite: false }),
    );
    mesh.position.copy(center);
    mesh.renderOrder = 2;
    mesh.add(edgeLines(geo, 0xcfeeff, 0.7));
    world.scene.add(mesh);
    world.addSolid(a, b, { static: true, glass: true });
  }
}

export class ColorTarget {
  // A floor plate facing up. Hit it with its color to activate; other colors ricochet off.
  constructor(world, { pos, color, onActivate }) {
    this.world = world;
    this.color = color;
    this.onActivate = onActivate;
    this.active = false;
    this.flash = 0;
    this.t = 0;
    const p = v3(pos);
    this.pos = p;
    const c = new THREE.Color(COLORS[color].hex);
    this.group = new THREE.Group();
    this.group.position.copy(p);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.14, 32), new THREE.MeshStandardMaterial({ color: 0x23252e, metalness: 0.8, roughness: 0.35 }));
    base.position.y = 0.07;
    this.glow = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2.2) });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 8, 32), this.glow);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.16;
    const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 24), this.glow);
    eye.position.y = 0.16;
    this.group.add(base, this.ring, eye);
    world.scene.add(this.group);
    this.solid = world.addSolid(new THREE.Vector3(p.x - 0.8, p.y, p.z - 0.8), new THREE.Vector3(p.x + 0.8, p.y + 0.18, p.z + 0.8), { static: true, entity: this });
    world.add(this);
  }

  onHit(color) {
    if (this.active) return 'hit';
    if (color !== this.color) {
      this.flash = 1;
      return 'immune';
    }
    this.active = true;
    this.glow.color.setRGB(2.5, 2.5, 2.5);
    this.world.fx.burst(this.pos.clone().setY(this.pos.y + 0.3), COLORS[this.color].hex, { count: 60, speed: 6, life: 0.9, size: 0.3, gravity: -2 });
    audio.target();
    this.onActivate?.();
    return 'kill';
  }

  update(dt) {
    this.t += dt;
    this.ring.rotation.z += dt * (this.active ? 0.5 : 2);
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 4);
      if (!this.active) this.glow.color.set(COLORS[this.color].hex).multiplyScalar(2.2 + this.flash * 2);
    }
  }
}

export class SlidingDoor {
  // Fills a doorway and slides up into the wall when opened. Marked with the color that opens it.
  constructor(world, { min, max, color, zone = 'red' }) {
    this.world = world;
    this.a = v3(min);
    this.b = v3(max);
    this.size = this.b.clone().sub(this.a);
    this.openT = -1;
    const geo = boxGeo(this.size.x, this.size.y, this.size.z);
    this.mesh = new THREE.Mesh(geo, mat('metal', zone));
    this.mesh.position.copy(this.a.clone().add(this.b).multiplyScalar(0.5));
    const c = new THREE.Color(COLORS[color].hex);
    const glyph = new THREE.MeshBasicMaterial({ map: glyphTex, color: c.clone().multiplyScalar(1.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const alongX = this.size.x >= this.size.z;
    const gs = Math.min(this.size.y, alongX ? this.size.x : this.size.z) * 0.6;
    for (const s of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(gs, gs), glyph);
      if (alongX) {
        g.position.z = (s * this.size.z) / 2 + s * 0.01;
        if (s < 0) g.rotation.y = Math.PI;
      } else {
        g.position.x = (s * this.size.x) / 2 + s * 0.01;
        g.rotation.y = (s * Math.PI) / 2;
      }
      this.mesh.add(g);
    }
    world.scene.add(this.mesh);
    this.solid = world.addSolid(this.a.clone(), this.b.clone(), { static: true });
    world.add(this);
  }

  open() {
    if (this.openT >= 0) return;
    this.openT = 0;
    audio.doorOpen();
  }

  update(dt) {
    if (this.openT < 0 || this.openT >= 1) return;
    this.openT = Math.min(1, this.openT + dt / 1.1);
    const e = this.openT * this.openT * (3 - 2 * this.openT);
    this.mesh.position.y = (this.a.y + this.b.y) / 2 + this.size.y * e;
    if (this.openT > 0.45) this.solid.enabled = false;
    if (this.openT >= 1) this.mesh.visible = false;
  }
}
