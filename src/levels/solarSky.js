// SOLAR's sky and its sun machinery (used by solar.js): the captive sun, sun lances (columns of focused
// sunlight that incinerate on touch), heat haze, the collector array that focuses the sun on the sun-lens,
// the power beam the lens pours into the Atrium, and the dusk that falls once the engine is shut down.
import * as THREE from 'three';
import { boxOverlap } from '../world.js';
import { audio } from '../audio.js';

// where the sunlight comes from: west, a little north, 30° up (also the atmosphere's sunDir)
export const SUN_DIR = [-0.85, 0.5, -0.12];
// the region, out to the dune field (plus the Hub, whose west windows look out over it) — the sun and the
// far scenery only show from here
export const inSolar = (p) => (p.x < -31.5 && p.x > -440 && p.z < -38 && p.z > -240 && p.y > -32) || (p.x < 25 && p.z < -99.5 && p.z > -148.5 && p.y > 2);
// the excavation under the mesa (no sun down there)
export const underground = (p) => p.y < -10.5 && p.x < -62 && p.x > -150 && p.z < -44 && p.z > -134 && !(p.x > -80 && p.z < -104 && p.z > -120);
// the glowing trims that run on sunlight (lance housings, collector rims): they go dark at the shutdown
export const POWER_ZONE = 'sunpower';

// ------------------------------------------------------------------ the sun
export const NOISE = `
  float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x){
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }`;

// A huge churning sun with a corona whose rays fan downward. It rides along with the camera (always
// the same spot in the sky, like a real sun) and fades out when you leave the Solar world and the Hub.
// eclipse(): once the world's engine is shut down a shadow covers it, leaving a burning ring.
export class Sun {
  constructor(W, game) {
    this.game = game;
    this.dir = new THREE.Vector3(...SUN_DIR).normalize();
    this.fade = 1;
    this.dist = 470;
    this.ecl = 0; // 0 = blazing, 1 = eclipsed
    this.eclTarget = 0;
    const R = 66, S = 360;
    this.discMat = new THREE.ShaderMaterial({
      fog: false, transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uEcl: { value: 0 } },
      vertexShader: `
        varying vec3 vN; varying float vMu;
        void main(){
          vN = normal;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vMu = clamp(dot(normalize(mat3(modelMatrix) * normal), normalize(cameraPosition - wp.xyz)), 0.0, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform float uTime, uFade, uEcl; varying vec3 vN; varying float vMu;
        ${NOISE}
        void main(){
          vec3 n = normalize(vN);
          float churn = fbm(n * 3.5 + vec3(uTime * 0.03, -uTime * 0.025, uTime * 0.02));
          float cells = fbm(n * 11.0 - vec3(0.0, uTime * 0.07, uTime * 0.03));
          float t = churn * 0.6 + cells * 0.4;
          vec3 c = mix(vec3(1.5, 0.62, 0.12), vec3(1.75, 1.35, 0.72), smoothstep(0.38, 0.72, t));
          c = mix(vec3(1.1, 0.28, 0.03), c, pow(max(vMu, 1e-4), 0.4)); // the limb burns deeper orange
          // eclipsed: a black disc with a thin burning ring at the limb
          vec3 dark = vec3(0.02, 0.012, 0.01) + vec3(2.2, 0.9, 0.35) * pow(1.0 - vMu, 7.0) * (0.8 + 0.4 * churn);
          c = mix(c, dark, uEcl);
          gl_FragColor = vec4(c, uFade);
        }`,
    });
    this.disc = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 24), this.discMat);
    this.disc.renderOrder = 1;
    this.coronaMat = new THREE.ShaderMaterial({
      fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uSize: { value: (2 * S) / R }, uEcl: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uTime, uFade, uSize, uEcl; varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * uSize; // in sun radii
          float r = length(p), ang = atan(p.y, p.x + 1e-5); // (atan(0, 0) is undefined: NaN would black out the bloom)
          float glow = exp(-max(r - 1.0, 0.0) * 2.0) * 0.8 + exp(-r * 0.45) * 0.22;
          float rays = pow(max(0.5 + 0.5 * sin(ang * 11.0 + sin(ang * 3.0 + uTime * 0.12) * 2.5), 0.0), 8.0)
                     + 0.6 * pow(max(0.5 + 0.5 * sin(ang * 23.0 - uTime * 0.05 + 1.3), 0.0), 14.0);
          float down = 0.25 + 0.75 * smoothstep(0.3, -0.9, sin(ang)); // the beams irradiate downward
          rays *= down * exp(-r * 0.2) * smoothstep(0.9, 1.7, r);
          vec3 col = vec3(1.0, 0.6, 0.24) * glow + vec3(1.0, 0.78, 0.42) * rays * 0.4;
          // eclipsed: only a pale, ragged corona hugging the black disc
          vec3 ecl = vec3(0.9, 0.55, 0.45) * exp(-max(r - 1.0, 0.0) * 5.0) * 0.7 * smoothstep(0.97, 1.03, r)
                   + vec3(0.7, 0.5, 0.6) * rays * 0.12;
          col = mix(col, ecl, uEcl);
          col *= smoothstep(uSize * 0.5, uSize * 0.32, r);
          gl_FragColor = vec4(col * uFade, 1.0);
        }`,
    });
    this.corona = new THREE.Mesh(new THREE.PlaneGeometry(2 * S, 2 * S), this.coronaMat);
    this.group = new THREE.Group();
    this.group.add(this.disc, this.corona);
    this.group.userData.noCull = true; // follows the camera; World culling would misplace it
    W.scene.add(this.group);
    W.add(this);
  }

  eclipse(instant = false) {
    this.eclTarget = 1;
    if (instant) this.ecl = 1;
  }

  update(dt, player) {
    const cam = this.game.camera;
    // stay inside the camera's far plane (it follows the fog), scaled so it looks the same size
    const d = Math.min(this.dist, cam.far * 0.85);
    this.group.position.copy(cam.position).addScaledVector(this.dir, d);
    this.group.scale.setScalar(d / this.dist);
    this.corona.lookAt(cam.position);
    const want = inSolar(player.pos) && !underground(player.pos) ? 1 : 0;
    this.fade += (want - this.fade) * Math.min(1, dt * 2);
    this.group.visible = this.fade > 0.01;
    this.ecl += (this.eclTarget - this.ecl) * Math.min(1, dt * 0.35);
    this.discMat.uniforms.uTime.value += dt;
    this.coronaMat.uniforms.uTime.value += dt;
    this.discMat.uniforms.uFade.value = this.fade;
    this.coronaMat.uniforms.uFade.value = this.fade;
    this.discMat.uniforms.uEcl.value = this.ecl;
    this.coronaMat.uniforms.uEcl.value = this.ecl;
  }
}

// ------------------------------------------------------------------ sun lances
// A column of focused sunlight that incinerates on contact. period 0 = always on; otherwise it fires for
// `on` seconds every `period`, after a `warn`-second flicker. `enabled = false` shuts it off for good.
const lanceGeo = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4);
const LANCE_VS = 'varying vec2 vUv; varying float vY; void main(){ vUv = uv; vY = position.y + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const LANCE_FS = `
  uniform float uI, uTime; varying vec2 vUv; varying float vY;
  void main(){
    float f = fract(vUv.x * 4.0);                 // across each face of the square column
    float core = pow(max(sin(f * 3.14159), 0.0), 12.0);     // a white-hot seam down the middle of each face
    float threads = pow(abs(sin((vUv.x * 12.0 + sin(vY * 3.0 + uTime) * 0.08 + uTime * 0.15) * 3.14159)), 30.0);
    float shimmer = 0.8 + 0.2 * sin(vY * 14.0 - uTime * 13.0 + vUv.x * 40.0);
    float fade = smoothstep(1.0, 0.7, vY) * (1.0 + smoothstep(0.1, 0.0, vY));
    vec3 col = mix(vec3(1.0, 0.36, 0.05), vec3(1.4, 1.2, 0.8), core);
    gl_FragColor = vec4(min(col * uI * (0.1 + 0.6 * core + 0.35 * threads) * shimmer * fade, vec3(2.5)), 1.0);
  }`;

const _lp = new THREE.Vector3();

export class SunLance {
  constructor(W, { min, max, period = 0, on = 1.5, warn = 0.7, phase = 0 }) {
    this.min = new THREE.Vector3(...min);
    this.max = new THREE.Vector3(...max);
    // the deadly volume is a touch smaller than the visible column, so grazing the glow is forgiven
    this.kmin = this.min.clone().add(new THREE.Vector3(0.15, 0, 0.15));
    this.kmax = this.max.clone().sub(new THREE.Vector3(0.15, 0, 0.15));
    this.period = period;
    this.on = on;
    this.warn = warn;
    this.phase = phase;
    this.t = 0;
    this.I = 0;
    this.lethal = false;
    this.enabled = true;
    const size = new THREE.Vector3().subVectors(this.max, this.min);
    const center = new THREE.Vector3().addVectors(this.min, this.max).multiplyScalar(0.5);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: LANCE_VS, fragmentShader: LANCE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uI: { value: 0 }, uTime: { value: Math.random() * 10 } },
    });
    this.mesh = new THREE.Mesh(lanceGeo, this.mat);
    this.mesh.position.copy(center);
    this.mesh.scale.copy(size);
    W.scene.add(this.mesh);
    // the scorched plate it burns into the floor glows as it heats up
    this.plateMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(size.x, size.z), this.plateMat);
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(center.x, this.min.y + 0.03, center.z);
    W.scene.add(plate);
    // a soft glow of scattered light around the column (a camera-facing sheet that fades to nothing at
    // its edges), so the rays read from across the canyon without a visible tube
    this.haloMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uI: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uI; varying vec2 vUv;
        void main(){
          float x = (vUv.x - 0.5) * 2.0;
          float g = exp(-x * x * 7.0) * smoothstep(1.0, 0.75, vUv.y) * smoothstep(0.0, 0.08, vUv.y);
          gl_FragColor = vec4(vec3(1.0, 0.55, 0.18) * g * uI * 0.55, 1.0);
        }`,
    });
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.haloMat);
    this.halo.position.copy(center);
    this.halo.scale.set(Math.min(size.x, size.z) * 2.6, size.y, 1);
    W.scene.add(this.halo);
    this.size = size;
    this.world = W;
    this.roar = audio.createLoop('incinerator_roar');
    this.fxT = 0;
    W.add(this);
  }

  update(dt, player) {
    this.t += dt;
    const wasLethal = this.lethal;
    let I = 0, heat = 0;
    this.lethal = false;
    if (!this.enabled) I = 0;
    else if (!this.period) {
      I = 0.92 + 0.08 * Math.sin(this.t * 31);
      heat = 1;
      this.lethal = true;
    } else {
      const c = (((this.t + this.phase) % this.period) + this.period) % this.period;
      if (c < this.on) {
        this.lethal = true;
        I = Math.min(1, c / 0.1) * (0.92 + 0.08 * Math.sin(this.t * 31));
        heat = 1;
      } else if (c > this.period - this.warn) {
        // warm-up: a thin flickering thread that brightens until it fires
        const k = (c - (this.period - this.warn)) / this.warn;
        I = 0.08 + 0.32 * k * (0.55 + 0.45 * Math.sin(this.t * 55));
        heat = 0.2 + 0.6 * k;
      } else {
        const k = Math.max(0, 1 - (c - this.on) / 0.3);
        I = 0.05 + 0.6 * k * k;
        heat = 0.15 + 0.6 * k;
      }
    }
    this.I = I;
    this.mat.uniforms.uI.value = I;
    this.mat.uniforms.uTime.value += dt;
    this.mesh.visible = I > 0.001;
    this.plateMat.color.setRGB(1, 0.36, 0.08).multiplyScalar(this.enabled ? 0.12 + 0.75 * heat : 0.02);
    this.haloMat.uniforms.uI.value = I;
    this.halo.visible = I > 0.01;
    if (this.halo.visible) {
      // turn the glow sheet to face the camera around the vertical axis
      const cam = this.world.game.camera.position;
      this.halo.rotation.y = Math.atan2(cam.x - this.halo.position.x, cam.z - this.halo.position.z);
    }
    // the roar of each incinerator, by distance; a blast as it ignites
    const dx = player.pos.x - (this.min.x + this.max.x) / 2, dz = player.pos.z - (this.min.z + this.max.z) / 2;
    const near = Math.max(0, 1 - Math.hypot(dx, dz) / 38);
    this.roar.setGain(near * near * (this.lethal ? 0.85 : I * 0.6));
    this.roar.setRate(0.9 + I * 0.15);
    if (this.lethal && !wasLethal && near > 0) audio.sample('incinerator_ignite', { gain: 0.9 * near, vary: 0.08 });
    // sunfire streaming down the column and splashing off the scorched plate
    if (this.lethal && near > 0) {
      this.fxT -= dt;
      const fx = this.world.fx;
      while (this.fxT <= 0) {
        this.fxT += 0.025;
        const p = _lp.set(this.min.x + Math.random() * this.size.x, this.max.y - Math.random() * this.size.y * 0.4, this.min.z + Math.random() * this.size.z);
        fx.ember(p, (Math.random() - 0.5) * 0.6, -14 - Math.random() * 8, (Math.random() - 0.5) * 0.6, 0xffb24a, 0.5 + Math.random() * 0.4, 0.1);
        if (Math.random() < 0.5) {
          p.set(this.min.x + Math.random() * this.size.x, this.min.y + 0.1, this.min.z + Math.random() * this.size.z);
          fx.ember(p, (Math.random() - 0.5) * 7, 1 + Math.random() * 4, (Math.random() - 0.5) * 7, 0xff7a1a, 0.5, 0.08);
        }
      }
    }
    if (this.lethal) {
      const b = player.bounds();
      if (boxOverlap(b.min, b.max, this.kmin, this.kmax)) player.damage(1, 'burn');
    }
  }
}

// Heat haze: faint, slowly boiling sheets of glow over the quicksand (one shared material; uK fades it
// out once the sun is gone).
export const hazeMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uTime: { value: 0 }, uK: { value: 1 } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }',
  fragmentShader: `
    uniform float uTime, uK; varying vec3 vW;
    ${NOISE}
    void main(){
      float n = noise(vec3(vW.xz * 0.12, uTime * 0.2 + vW.y * 0.7));
      float m = noise(vec3(vW.xz * 0.45 + vec2(uTime * 0.25, -uTime * 0.18), vW.y * 2.0));
      float a = smoothstep(0.42, 0.9, n * 0.65 + m * 0.35) * 0.09 * uK;
      gl_FragColor = vec4(vec3(1.0, 0.42, 0.08) * a, 1.0);
    }`,
});
export const hazeMeshes = [];
export function heatHaze(W, x1, z1, x2, z2, y) {
  for (const dy of [0.7, 2.0, 3.8]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1, z2 - z1), hazeMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x1 + x2) / 2, y + dy, (z1 + z2) / 2);
    W.scene.add(m);
    hazeMeshes.push(m);
  }
}

// ------------------------------------------------------------------ the collector array
// Fields of heliostats, each mirror turned to bounce the captive sun onto the sun-lens over the Sun Court,
// with a thread of light from every mirror to the lens. stow(): the mirrors tip flat and the threads die.
const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _n = new THREE.Vector3();
const Z_AXIS = new THREE.Vector3(0, 0, 1), Y_AXIS = new THREE.Vector3(0, 1, 0);
// the mirror face: a silvery-gold sheet in six facets with a bright streak across it (drawn once)
let mirrorTex = null;
function mirrorFace() {
  if (mirrorTex) return mirrorTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, '#fffaf0');
  grad.addColorStop(0.35, '#f2d79a');
  grad.addColorStop(0.7, '#c99a45');
  grad.addColorStop(1, '#f7e3b0');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // a glancing streak of reflected sky
  const sg = g.createLinearGradient(20, 128, 108, 0);
  sg.addColorStop(0.38, 'rgba(255,255,255,0)');
  sg.addColorStop(0.5, 'rgba(255,255,255,0.95)');
  sg.addColorStop(0.62, 'rgba(255,255,255,0)');
  g.fillStyle = sg;
  g.fillRect(0, 0, 128, 128);
  // facet seams
  g.strokeStyle = 'rgba(70,45,15,0.75)';
  g.lineWidth = 3;
  for (const x of [43, 85]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
  g.beginPath(); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
  mirrorTex = new THREE.CanvasTexture(c);
  mirrorTex.colorSpace = THREE.SRGBColorSpace;
  return mirrorTex;
}

export class CollectorArray {
  constructor(W, { target, sites }) {
    this.world = W;
    this.target = new THREE.Vector3(...target);
    const sun = new THREE.Vector3(...SUN_DIR).normalize();
    const n = sites.length;
    // the panel: a mirror face toward the lens (local +z) in a bronze frame, dark metal behind
    this.faceMat = new THREE.MeshBasicMaterial({ map: mirrorFace(), color: 0xffffff });
    this.frameMat = new THREE.MeshStandardMaterial({ color: 0xb08840, metalness: 0.6, roughness: 0.4, emissive: 0x3a2a10 });
    // (the backs are polished too, a little duller: from the causeway and the Hub you see them from behind)
    this.backMat = new THREE.MeshBasicMaterial({ map: mirrorFace(), color: 0xb0a080 });
    const F = this.frameMat;
    this.panels = new THREE.InstancedMesh(new THREE.BoxGeometry(3.4, 2.4, 0.1), [F, F, F, F, this.faceMat, F], n);
    this.frames = new THREE.InstancedMesh(new THREE.BoxGeometry(3.8, 2.8, 0.14), [F, F, F, F, F, this.backMat], n);
    // where each thread of light lands: a hot glint on the mirror
    this.spotMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.spots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.55, 16), this.spotMat, n);
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xffc060, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    this.beams = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true), this.beamMat, n);
    this.items = sites.map(([x, y, z], i) => {
      const c = new THREE.Vector3(x, y + 3.6, z);
      const to = _v.copy(this.target).sub(c).normalize();
      const live = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, _n.copy(to).add(sun).normalize());
      // stowed: face up, tipped a little toward the lens
      const stow = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, _n.set(to.x * 0.25, 1, to.z * 0.25).normalize());
      // the beam: a thin cylinder from the mirror to the lens
      const len = c.distanceTo(this.target);
      const mid = c.clone().add(this.target).multiplyScalar(0.5);
      _q.setFromUnitVectors(Y_AXIS, to);
      this.beams.setMatrixAt(i, _m4.compose(mid, _q, _s.set(0.09, len, 0.09)));
      return { c, live, stow, phase: (i * 2.399) % (Math.PI * 2) };
    });
    this.k = 1; // 1 = tracking, 0 = stowed
    this.target1 = 1;
    this.col = new THREE.Color();
    this.place();
    for (let i = 0; i < n; i++) this.panels.setColorAt(i, this.col.setRGB(1, 1, 1));
    for (const m of [this.panels, this.frames, this.spots, this.beams]) {
      m.userData.noCull = true;
      W.scene.add(m);
    }
    this.t = Math.random() * 10;
    W.add(this);
  }

  place() {
    this.items.forEach((it, i) => {
      _q.copy(it.stow).slerp(it.live, this.k);
      _n.copy(Z_AXIS).applyQuaternion(_q);
      this.panels.setMatrixAt(i, _m4.compose(it.c, _q, _s.set(1, 1, 1)));
      this.frames.setMatrixAt(i, _m4.compose(_v.copy(it.c).addScaledVector(_n, -0.07), _q, _s));
      this.spots.setMatrixAt(i, _m4.compose(_v.copy(it.c).addScaledVector(_n, 0.07), _q, _s));
    });
    for (const m of [this.panels, this.frames, this.spots]) m.instanceMatrix.needsUpdate = true;
  }

  stow(instant = false) {
    this.target1 = 0;
    if (instant) {
      this.k = 0;
      this.place();
    }
  }

  update(dt, player) {
    this.t += dt;
    if (this.k !== this.target1) {
      this.k = Math.max(0, this.k - dt * 0.25);
      this.place();
    }
    const live = this.k;
    this.beamMat.opacity = live > 0.7 ? 0.36 + 0.14 * Math.sin(this.t * 3.1) : 0;
    this.beams.visible = this.beamMat.opacity > 0;
    this.spotMat.opacity = live > 0.7 ? 0.75 + 0.2 * Math.sin(this.t * 5.3) : 0;
    this.spots.visible = this.spotMat.opacity > 0;
    // glints: now and then a mirror flares as the sun catches it (only worth doing where it can be seen)
    if (inSolar(player.pos)) {
      const base = 0.18 + 0.82 * live;
      this.items.forEach((it, i) => {
        const g = live > 0.7 ? Math.pow(Math.max(0, Math.sin(this.t * 0.8 + it.phase)), 24) * 1.6 : 0;
        this.panels.setColorAt(i, this.col.setRGB(base + g, base + g * 0.9, base + g * 0.7));
      });
      this.panels.instanceColor.needsUpdate = true;
    }
    this.backMat.color.setRGB(0.69, 0.63, 0.5).multiplyScalar(0.25 + 0.75 * live);
  }
}

// The power beam: the captive sun's light, focused by the lens, poured across the sky into the Atrium's
// west wall (behind which the Atrium's own captive-sun lens feeds the reactor heart). kill() flickers it out.
export class PowerBeam {
  constructor(W, a, b) {
    this.world = W;
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
    const len = A.distanceTo(Bv), mid = A.clone().add(Bv).multiplyScalar(0.5);
    _q.setFromUnitVectors(Y_AXIS, Bv.clone().sub(A).normalize());
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uI: { value: 1 }, uTime: { value: 0 }, uLen: { value: len } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uI, uTime, uLen; varying vec2 vUv;
        void main(){
          float across = pow(max(sin(fract(vUv.x * 3.0) * 3.14159), 0.0), 3.0);
          float pulse = 0.6 + 0.4 * pow(0.5 + 0.5 * sin(vUv.y * uLen * 0.35 - uTime * 9.0), 4.0);
          vec3 c = mix(vec3(1.0, 0.45, 0.1), vec3(1.4, 1.15, 0.7), across) * (0.25 + 0.75 * across) * pulse;
          gl_FragColor = vec4(c * uI, 1.0);
        }`,
    });
    this.core = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, len, 8, 1, true), this.mat);
    this.haloMat = new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.halo = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, len, 10, 1, true), this.haloMat);
    for (const m of [this.core, this.halo]) {
      m.position.copy(mid);
      m.quaternion.copy(_q);
      m.userData.noCull = true;
      W.scene.add(m);
    }
    // a splash of light where it strikes the Atrium wall
    this.splashMat = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    this.splash = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 8), this.splashMat);
    this.splash.position.copy(Bv);
    this.splash.userData.noCull = true;
    W.scene.add(this.splash);
    this.I = 1;
    this.dying = -1;
    W.add(this);
  }

  kill(instant = false) {
    if (instant) this.dying = 99;
    else if (this.dying < 0) this.dying = 0;
  }

  update(dt) {
    this.mat.uniforms.uTime.value += dt;
    if (this.dying >= 0) {
      this.dying += dt;
      const k = Math.max(0, 1 - this.dying / 2.5);
      this.I = k * (Math.random() < 0.35 ? 0.2 : 1);
    }
    this.mat.uniforms.uI.value = this.I;
    this.haloMat.opacity = 0.12 * this.I;
    this.splashMat.opacity = 0.8 * this.I * (0.85 + 0.15 * Math.sin(this.mat.uniforms.uTime.value * 7));
    const on = this.I > 0.002;
    this.core.visible = this.halo.visible = this.splash.visible = on;
  }
}

// the look of the world after the shutdown: the eclipse's long dusk
export const DUSK = {
  fog: 0x4a2c3c, fogNear: 70, fogFar: 430,
  skyTop: [0.05, 0.035, 0.11], skyMid: [0.3, 0.12, 0.2], skyHorizon: [0.7, 0.3, 0.2], aurora: 0, stars: 0.5,
  hemiSky: 0xb08aa8, hemiGround: 0x2a1a22, hemiIntensity: 0.62,
  sunColor: 0xff9a6a, sunIntensity: 0.9, sunDir: SUN_DIR,
  exposure: 0.98, bloom: 0.42,
};

// merge plain geometries (position/normal/uv, non-indexed or indexed) into one
export function mergeBoxes(geos) {
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = list.reduce((n, g) => n + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]]) {
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of list) {
      const a = g.attributes[name];
      if (a) arr.set(a.array, o);
      o += g.attributes.position.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}
