// Ricochet puzzle pieces: mirror panels (reflect any shot), glass (stops players and shots),
// target panels (only their color activates them; anything else bounces off) and sliding doors.
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

export class TargetPanel {
  // A big flat target (a floor or a wall). Panels in the same `group` light up together.
  constructor(world, { min, max, color, face = 'up', onActivate }) {
    this.world = world;
    this.color = color;
    this.onActivate = onActivate;
    this.active = false;
    this.flash = 0;
    this.group = [this];
    const a = v3(min), b = v3(max);
    const size = b.clone().sub(a), center = a.clone().add(b).multiplyScalar(0.5);
    this.center = center;
    const c = new THREE.Color(COLORS[color].hex);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x1b1d24, emissive: c, emissiveIntensity: 0.55, metalness: 0.6, roughness: 0.4 });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), this.mat);
    this.mesh.position.copy(center);
    // bullseye decal on the face players see
    this.glyph = new THREE.MeshBasicMaterial({ map: glyphTex, color: c.clone().multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const gs = face === 'up' ? Math.min(size.x, size.z) * 0.9 : face === '+z' ? Math.min(size.x, size.y) * 0.9 : Math.min(size.y, size.z) * 0.9;
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(gs, gs), this.glyph);
    if (face === 'up') {
      decal.rotation.x = -Math.PI / 2;
      decal.position.y = size.y / 2 + 0.01;
    } else if (face === '+z') {
      decal.position.z = size.z / 2 + 0.01;
    } else {
      decal.rotation.y = -Math.PI / 2;
      decal.position.x = -size.x / 2 - 0.01;
    }
    this.mesh.add(decal);
    world.scene.add(this.mesh);
    world.addSolid(a, b, { static: true, entity: this });
    world.add(this);
  }

  onHit(color, hit) {
    if (this.active) return 'hit';
    if (color !== this.color) {
      this.flash = 1;
      return 'immune';
    }
    for (const p of this.group) p.light();
    this.world.fx.burst(hit?.point || this.center, COLORS[this.color].hex, { count: 80, speed: 7, life: 1, size: 0.32, gravity: -1 });
    audio.target();
    this.onActivate?.();
    return 'kill';
  }

  light() {
    this.active = true;
    this.mat.emissive.setRGB(1, 1, 1);
    this.mat.emissiveIntensity = 1.4;
    this.glyph.color.setRGB(2.5, 2.5, 2.5);
  }

  update(dt) {
    if (this.flash > 0 && !this.active) {
      this.flash = Math.max(0, this.flash - dt * 4);
      this.mat.emissiveIntensity = 0.55 + this.flash * 1.2;
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
