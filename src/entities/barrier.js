// Color-locked obstacles: energy walls that fill corridors, secret doors that look like wall
// panels with a color glyph, and spike layers that must be shattered before you land on them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from '../colors.js';
import { boxGeo, mat, glyphTex } from '../materials.js';
import { audio } from '../audio.js';
import { boxOverlap } from '../world.js';

const barrierShader = {
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vPos;
    void main() {
      vUv = uv;
      vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uFlash;
    uniform float uAlpha;
    varying vec2 vUv;
    void main() {
      vec2 g = abs(fract(vUv * 1.5) - 0.5);
      float hex = smoothstep(0.42, 0.5, max(g.x, g.y));
      float scan = 0.5 + 0.5 * sin(vUv.y * 18.0 - uTime * 5.0);
      float sweep = smoothstep(0.96, 1.0, sin(vUv.y * 1.3 - uTime * 1.7));
      float a = 0.42 + 0.18 * scan + hex * 0.5 + sweep * 0.3;
      vec3 col = uColor * (0.8 + 0.5 * scan + hex * 1.8 + sweep) + vec3(uFlash);
      gl_FragColor = vec4(col, clamp(a * uAlpha, 0.0, 1.0));
    }`,
};

export class Barrier {
  // kind: 'wall' (energy wall), 'door' (disguised secret wall), 'spike' (hazard layer)
  constructor(world, { min, max, color, kind = 'wall', regen = 0, zone = 'red', onBreak = null, label = null }) {
    this.world = world;
    this.color = color;
    this.kind = kind;
    this.regen = regen;
    this.onBreak = onBreak;
    this.label = label;
    this.min = new THREE.Vector3(...min);
    this.max = new THREE.Vector3(...max);
    this.broken = false;
    this.timer = 0;
    this.flash = 0;
    this.reform = 1;
    const size = new THREE.Vector3().subVectors(this.max, this.min);
    const center = new THREE.Vector3().addVectors(this.min, this.max).multiplyScalar(0.5);
    const c = new THREE.Color(COLORS[color].hex);

    this.group = new THREE.Group();
    this.group.position.copy(center);
    world.scene.add(this.group);

    if (kind === 'wall') {
      this.mat = new THREE.ShaderMaterial({
        ...barrierShader,
        transparent: true,
        depthWrite: false,
        uniforms: { uColor: { value: c.clone() }, uTime: { value: Math.random() * 10 }, uFlash: { value: 0 }, uAlpha: { value: 1 } },
      });
      this.mesh = new THREE.Mesh(boxGeo(size.x, size.y, size.z, 1), this.mat);
      this.group.add(this.mesh);
      // emitter frame on the sides so walls read as installed tech
      const frame = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2) });
      const thin = Math.min(size.x, size.z) < 0.8;
      if (thin) {
        const alongX = size.x > size.z;
        const fw = 0.12;
        for (const s of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(alongX ? fw : size.x + 0.1, size.y, alongX ? size.z + 0.1 : fw), frame);
          post.position.set(alongX ? (s * size.x) / 2 : 0, 0, alongX ? 0 : (s * size.z) / 2);
          this.group.add(post);
        }
      }
    } else if (kind === 'door') {
      this.mesh = new THREE.Mesh(boxGeo(size.x, size.y, size.z), mat('wall', zone));
      this.group.add(this.mesh);
      // a faint glyph on both broad faces hints at which color opens it
      this.glyphMat = new THREE.MeshBasicMaterial({ map: glyphTex, color: c.clone().multiplyScalar(0.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const alongX = size.x > size.z;
      const gs = Math.min(size.y, alongX ? size.x : size.z) * 0.7;
      for (const s of [-1, 1]) {
        const g = new THREE.Mesh(new THREE.PlaneGeometry(gs, gs), this.glyphMat);
        if (alongX) {
          g.position.z = (s * size.z) / 2 + s * 0.01;
          if (s < 0) g.rotation.y = Math.PI;
        } else {
          g.position.x = (s * size.x) / 2 + s * 0.01;
          g.rotation.y = (s * Math.PI) / 2;
        }
        this.group.add(g);
      }
    } else if (kind === 'spike') {
      const slabH = 0.25;
      const slab = new THREE.Mesh(boxGeo(size.x, slabH, size.z), new THREE.MeshStandardMaterial({ color: 0x22242c, metalness: 0.8, roughness: 0.4, emissive: c, emissiveIntensity: 0.35 }));
      slab.position.y = -size.y / 2 + slabH / 2;
      this.group.add(slab);
      const cones = [];
      const step = 0.5;
      const spikeH = size.y - slabH;
      for (let x = -size.x / 2 + step / 2; x < size.x / 2; x += step) {
        for (let z = -size.z / 2 + step / 2; z < size.z / 2; z += step) {
          const cg = new THREE.ConeGeometry(0.17, spikeH, 6);
          cg.translate(x, -size.y / 2 + slabH + spikeH / 2, z);
          cones.push(cg);
        }
      }
      this.spikeMat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.3 });
      const spikes = new THREE.Mesh(mergeGeometries(cones), this.spikeMat);
      cones.forEach((g) => g.dispose());
      this.group.add(spikes);
      // glowing rim under the slab so you can read the layer color from below too
      const rim = new THREE.Mesh(new THREE.BoxGeometry(size.x + 0.08, 0.06, size.z + 0.08), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2.4) }));
      rim.position.y = -size.y / 2;
      this.group.add(rim);
    }

    this.solid = world.addSolid(this.min.clone(), this.max.clone(), {
      entity: this,
      hazard: kind === 'spike' ? 'spike' : undefined,
      damage: 30,
    });
    world.add(this);
  }

  onHit(color) {
    if (this.broken) return undefined;
    if (color === this.color) {
      this.shatter();
      return 'kill';
    }
    this.flash = 1;
    return 'immune';
  }

  shatter() {
    this.broken = true;
    this.solid.enabled = false;
    this.group.visible = false;
    this.world.fx.shatterBox(this.min, this.max, COLORS[this.color].hex, this.kind === 'spike' ? 14 : 5);
    audio.shatter();
    if (this.kind === 'door') audio.door();
    this.timer = this.regen;
    this.onBreak?.(this);
  }

  restore() {
    this.broken = false;
    this.solid.enabled = true;
    this.group.visible = true;
    this.reform = 0;
  }

  update(dt, player) {
    if (this.mat) {
      this.mat.uniforms.uTime.value += dt;
      this.mat.uniforms.uFlash.value = this.flash * 0.8;
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 5);
      if (this.glyphMat) this.glyphMat.color.set(COLORS[this.color].hex).multiplyScalar(0.9 + this.flash * 2);
      if (this.spikeMat) this.spikeMat.emissiveIntensity = 0.9 + this.flash * 2;
    }
    if (this.reform < 1) {
      this.reform = Math.min(1, this.reform + dt * 5);
      this.group.scale.setScalar(0.6 + 0.4 * this.reform);
    }
    if (this.broken && this.regen > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        const b = player.bounds();
        if (!boxOverlap(b.min, b.max, this.min, this.max)) this.restore();
      }
    }
  }
}
