// Particle bursts (one additive Points draw call) and pooled shot tracers.
import * as THREE from 'three';

const MAX = 2500;

export class Fx {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (420.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * a * 1.6, a);
        }`,
    });
    this.points = new THREE.Points(geo, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.parts = [];
    for (let i = 0; i < MAX; i++) this.parts.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, s: 0, drag: 0 });
    this.cursor = 0;

    this.tracers = [];
    const tGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      m.userData.life = 0;
      scene.add(m);
      this.tracers.push(m);
    }
    this.tracerCursor = 0;
    this._c = new THREE.Color();
  }

  burst(p, color, { count = 20, speed = 6, life = 0.6, size = 0.25, gravity = 9, drag = 1.5, spread = 1, dir = null } = {}) {
    const c = this._c.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const q = this.parts[i];
      let vx = Math.random() * 2 - 1, vy = Math.random() * 2 - 1, vz = Math.random() * 2 - 1;
      const l = Math.hypot(vx, vy, vz) || 1;
      const sp = speed * (0.3 + Math.random() * 0.7);
      vx = (vx / l) * sp * spread;
      vy = (vy / l) * sp * spread;
      vz = (vz / l) * sp * spread;
      if (dir) {
        vx += dir.x * speed;
        vy += dir.y * speed;
        vz += dir.z * speed;
      }
      q.vx = vx;
      q.vy = vy;
      q.vz = vz;
      q.life = q.max = life * (0.6 + Math.random() * 0.6);
      q.g = gravity;
      q.s = size * (0.6 + Math.random() * 0.8);
      q.drag = drag;
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      const tint = 0.75 + Math.random() * 0.5;
      this.col[i * 3] = Math.min(c.r * tint, 1);
      this.col[i * 3 + 1] = Math.min(c.g * tint, 1);
      this.col[i * 3 + 2] = Math.min(c.b * tint, 1);
    }
  }

  // Box-shaped shatter, used for walls and spike layers breaking.
  shatterBox(min, max, color, density = 6) {
    const vol = (max.x - min.x) * (max.y - min.y) * (max.z - min.z);
    const count = Math.min(220, Math.max(30, Math.floor(vol * density)));
    const p = new THREE.Vector3();
    for (let n = 0; n < count; n++) {
      p.set(
        min.x + Math.random() * (max.x - min.x),
        min.y + Math.random() * (max.y - min.y),
        min.z + Math.random() * (max.z - min.z),
      );
      this.burst(p, color, { count: 1, speed: 5, life: 0.9, size: 0.35, gravity: 14 });
    }
  }

  tracer(from, to, color, width = 0.06) {
    const m = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % this.tracers.length;
    const len = from.distanceTo(to);
    m.position.copy(from);
    m.lookAt(to);
    m.scale.set(width, width, len);
    m.material.color.set(color).multiplyScalar(2);
    m.material.opacity = 1;
    m.userData.life = 0.09;
    m.visible = true;
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      const q = this.parts[i];
      if (q.life <= 0) {
        this.size[i] = 0;
        continue;
      }
      q.life -= dt;
      const k = Math.max(0, 1 - q.drag * dt);
      q.vx *= k;
      q.vz *= k;
      q.vy = q.vy * k - q.g * dt;
      this.pos[i * 3] += q.vx * dt;
      this.pos[i * 3 + 1] += q.vy * dt;
      this.pos[i * 3 + 2] += q.vz * dt;
      this.size[i] = q.life > 0 ? q.s * Math.min(1, (q.life / q.max) * 1.5) : 0;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    for (const m of this.tracers) {
      if (!m.visible) continue;
      m.userData.life -= dt;
      m.material.opacity = Math.max(0, m.userData.life / 0.09);
      if (m.userData.life <= 0) m.visible = false;
    }
  }
}
