// SOLAR — SUNSCORCH MESA, the yellow world: an outdoor solar-temple run under a hot, captive sun.
// See LAYOUT.md for its region and Hub ports. The loop, in order (devStarts in brackets):
//  [solar]   Hub west port (z -112, y 4) → SUNWARD OVERLOOK (calm vista; the Sun Gate straight ahead)
//  [solar1]  THE SCORCH DESCENT  platforming: pillars over the quicksand basin, a red phase bridge on a
//            timed orb, crumbling stones (the last one only LOOKS solid), a sun lance to time
//  [solar2]  COLLECTOR YARD      combat: a two-wave ambush round the old collector tower
//  [solar3]  THE SUNDIAL COURT   puzzle: two great sun-disc rotors to turn (red) before the bridge opens,
//            then a riser + sinker race up to the exit ledge (green stairs bypass it later)
//  [solar4]  THE SHADE SLOT      platforming: lances pour through the roof in waves; one patch of shade
//            is a trapdoor (the Sunken Cache crawl hole is in the east wall)
//  [solar5]  THE SUN WELL        ledges down the east wall to the YELLOW core on its dais; taking it
//  [solar6]  wakes the SUN WELL AMBUSH (the arena: three waves, red then yellow)
//  [solar7]  HELIOSTAT HALL      puzzle: two yellow receivers (one over the glass via the mirrors, one by a
//            bank shot off a wall mirror) wake a jump pad that throws you up onto the terrace
//  [solar8]  THE GLASS TERRACE + MIRROR MESA  platforming: a platform rack (red/yellow) up the mesa face,
//            then red/yellow chroma platforms over the chasm with surprise spikes on the landing
//  [solar9]  GNOMON SUMMIT       combat: the summit guard (the hop pad is sealed until it's clear)
//  [solar10] jump-pad hops over the quicksand flats to the Sun Court
//  [solar11] THE SUN COURT       the Sphinx (sphinxArena.js) and the sun-lens it guards: the world's POWER
//            SOURCE. The collector array focuses the captive sun on the lens and the lens beams it to the
//            Atrium's west wall. Shoot it YELLOW → game.shutDownWorld('solar'): the sun is eclipsed, dusk
//            falls, the lances die, the haze stops, the quicksand stills, the mirrors stow.
//  [solar12] SUNSET CAUSEWAY (y 12) → Hub west balcony port (z -136, y 12); one-way (a 4 m drop).
// Color locks: GREEN grotto (overlook, secret), GREEN stairs (Sundial bypass), BLUE Eclipse Vault (causeway,
// secret); the Sunken Cache (secret) needs no color.
// Sun lances (focused sunlight) incinerate on touch; quicksand swallows you.
import * as THREE from 'three';
import { RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { Barrier } from '../entities/barrier.js';
import { Drone } from '../entities/drone.js';
import { JumpPad, Checkpoint } from '../entities/misc.js';
import { Mirror, Glass, TargetPanel } from '../entities/puzzle.js';
import { boxOverlap } from '../world.js';
import { liquidMaterial } from '../liquid.js';
import { mat } from '../materials.js';
import { audio } from '../audio.js';
import { buildSphinxArena } from './sphinxArena.js';
import { regionOf } from './regions.js';

// where the sunlight comes from: west, a little north, 30° up (also the atmosphere's sunDir)
const SUN_DIR = [-0.85, 0.5, -0.12];
// the region (plus the Hub, whose west windows look out over it) — the sun only shows from here
const inSolar = (p) => (p.x < -31.5 && p.x > -201 && p.z < -38 && p.z > -232 && p.y > -32) || (p.x < 25 && p.z < -99.5 && p.z > -148.5 && p.y > 2);
// the glowing trims that run on sunlight (lance housings, collector rims): they go dark at the shutdown
const POWER_ZONE = 'sunpower';

// ------------------------------------------------------------------ the sun
const NOISE = `
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
class Sun {
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
    const want = inSolar(player.pos) ? 1 : 0;
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

class SunLance {
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
const hazeMat = new THREE.ShaderMaterial({
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
const hazeMeshes = [];
function heatHaze(W, x1, z1, x2, z2, y) {
  for (const dy of [0.7, 2.0, 3.8]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1, z2 - z1), hazeMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x1 + x2) / 2, y + dy, (z1 + z2) / 2);
    W.scene.add(m);
    hazeMeshes.push(m);
  }
}

// Quicksand swallows you (it's a solid box you'd stand on: this checks for touching its surface), sun
// lances hum, and dust motes drift up in the heat. down: the engine is off (no hum, cold dust).
class SolarDirector {
  constructor(W, game) {
    this.world = W;
    this.game = game;
    this.slag = [];
    this.lances = [];
    this.moteT = 0;
    this.down = false;
    this.hum = audio.createLoop('sun_hum', { gain: 0 });
    W.add(this);
  }

  update(dt, player) {
    const p = player.pos;
    if (!inSolar(p) || p.x > -25) {
      this.hum.setGain(0);
      return;
    }
    const b = player.bounds();
    if (!player.dead && player.invuln <= 0 && !this.game.godMode) {
      for (const s of this.slag) {
        if (b.min.x < s.max.x + 0.04 && b.max.x > s.min.x - 0.04 && b.min.y < s.max.y + 0.06 && b.max.y > s.min.y && b.min.z < s.max.z + 0.04 && b.max.z > s.min.z - 0.04) {
          player.touchLava(); // (quicksand drags you down rather than kills on touch: player.js sinkIn)
          break;
        }
      }
    }
    // the oppressive hum swells near lances that are burning
    let g = 0;
    for (const l of this.lances) {
      const dx = Math.max(l.min.x - p.x, 0, p.x - l.max.x), dy = Math.max(l.min.y - p.y, 0, p.y - l.max.y), dz = Math.max(l.min.z - p.z, 0, p.z - l.max.z);
      g = Math.max(g, l.I * Math.max(0, 1 - Math.hypot(dx, dy, dz) / 18));
    }
    this.hum.setGain(g * 0.55);
    hazeMat.uniforms.uTime.value += dt;
    this.moteT += dt;
    if (this.moteT > (this.down ? 0.25 : 0.07)) {
      this.moteT = 0;
      const m = new THREE.Vector3(p.x + (Math.random() - 0.5) * 36, p.y - 1 + Math.random() * 9, p.z + (Math.random() - 0.5) * 36);
      if (this.down) this.world.fx.burst(m, 0x9a8aa0, { count: 1, speed: 0.3, life: 3.2, size: 0.08, gravity: 0.15, drag: 0.4, spread: 1 });
      else this.world.fx.burst(m, Math.random() < 0.3 ? 0xff9a3a : 0xffd890, { count: 1, speed: 0.4, life: 3.2, size: 0.11, gravity: -0.35, drag: 0.4, spread: 1 });
    }
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

class CollectorArray {
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
class PowerBeam {
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
const DUSK = {
  fog: 0x4a2c3c, fogNear: 70, fogFar: 430,
  skyTop: [0.05, 0.035, 0.11], skyMid: [0.3, 0.12, 0.2], skyHorizon: [0.7, 0.3, 0.2], aurora: 0, stars: 0.5,
  hemiSky: 0xb08aa8, hemiGround: 0x2a1a22, hemiIntensity: 0.62,
  sunColor: 0xff9a6a, sunIntensity: 0.9, sunDir: SUN_DIR,
  exposure: 0.98, bloom: 0.42,
};

export function buildSolar(B) {
  const { W, game, level, CH, GLOW, room, corridor, corridorX, plat, pedestal, secretRoom, trophy, hint, hintEvery, zoneTitle, area, light, barrierWallX, blocker, killZone, devStart, guideStrip, glowEdge, onRespawn } = B;
  const zone = 'yellow';
  const glow = GLOW[zone];
  const R = (x1, y1, z1, x2, y2, z2) => W.box(x1, y1, z1, x2, y2, z2, 'rock', zone);
  const M = (x1, y1, z1, x2, y2, z2) => W.box(x1, y1, z1, x2, y2, z2, 'metal', zone);
  const G = (x1, y1, z1, x2, y2, z2) => W.deco(x1, y1, z1, x2, y2, z2, glow, zone); // wayfinding glow (stays lit)
  const PG = (x1, y1, z1, x2, y2, z2) => W.deco(x1, y1, z1, x2, y2, z2, 'glow1', POWER_ZONE); // sun-powered glow (dies)
  const SKY = 60;
  const amber = 0xffc23a, red = 0xff4433;
  const director = new SolarDirector(W, game);
  const lances = director.lances;
  const has = (c) => game.blaster.has && game.blaster.unlocked[c];
  const mood = { music: 'music_solar', ambient: 'amb_solar', atmosphere: 'solar' };
  const ck = (pos, yaw, size = [4, 3, 4]) => new Checkpoint(W, game, { pos, yaw, size });
  // quicksand: a pool whose surface (top at y) swallows you, with heat haze over it
  const quick = (x1, z1, x2, z2, y, base = y - 6) => {
    R(x1, base, z1, x2, y - 0.4, z2);
    director.slag.push(W.box(x1, y - 0.4, z1, x2, y, z2, 'acid', zone));
    heatHaze(W, Math.min(x1, x2), Math.min(z1, z2), Math.max(x1, x2), Math.max(z1, z2), y);
  };
  // a sandstone pillar standing out of the quicksand with a trimmed slab on top
  const pillar = (x1, z1, x2, z2, top, base = -14) => {
    R(x1, base, z1, x2, top - 0.6, z2);
    plat(x1, z1, x2, z2, top, zone, 0.6);
  };
  // sandstone strata: thin bands standing proud of a cliff face (decor, not ledges)
  const strata = (x1, z1, x2, z2, ys) => ys.forEach((y) => W.deco(x1, y, z1, x2, y + 0.5, z2, 'rock', zone));
  const lance = (o) => {
    const l = new SunLance(W, o);
    lances.push(l);
    return l;
  };
  // a collector lens housing over a lance: a metal block with a sun-powered rim round its aperture
  const housing = (x1, z1, x2, z2, y) => {
    M(x1 - 0.3, y, z1 - 0.3, x2 + 0.3, y + 0.8, z2 + 0.3);
    const t = 0.12, b = y - 0.05;
    PG(x1, b, z1, x2, y, z1 + t);
    PG(x1, b, z2 - t, x2, y, z2);
    PG(x1, b, z1, x1 + t, y, z2);
    PG(x2 - t, b, z1, x2, y, z2);
  };
  // a lance with its housing on a mast (out in the open, where there's no roof to hang it from)
  const lanceRig = (x1, z1, x2, z2, y0, y1, o = {}, mastBase = -14) => {
    housing(x1, z1, x2, z2, y1);
    M(x2 + 0.3, mastBase, (z1 + z2) / 2 - 0.35, x2 + 1.0, y1 + 0.8, (z1 + z2) / 2 + 0.35);
    return lance({ min: [x1, y0, z1], max: [x2, y1, z2], ...o });
  };
  // a heliostat: a post holding a mirror panel that faces the sun (it really reflects shots)
  const heliostat = (x, y, z, alongZ = true) => {
    M(x - 0.18, y, z - 0.18, x + 0.18, y + 2.2, z + 0.18);
    if (alongZ) new Mirror(W, { min: [x - 0.06, y + 2.2, z - 1.4], max: [x + 0.06, y + 4.0, z + 1.4] });
    else new Mirror(W, { min: [x - 1.4, y + 2.2, z - 0.06], max: [x + 1.4, y + 4.0, z + 0.06] });
    // out here a polished mirror catches the full sun and blows the bloom out across the screen: brush it
    // (the Mirror keeps its own material; it's the last thing it added to the scene)
    const m = W.scene.children[W.scene.children.length - 1]?.material;
    if (m && m.metalness === 1) {
      m.metalness = 0.6;
      m.roughness = 0.55;
      m.color.set(0xb0a07a);
      m.emissive?.set(0x1a1206);
    }
    // a bronze frame round the panel
    if (alongZ) {
      W.deco(x - 0.1, y + 2.1, z - 1.5, x + 0.1, y + 2.2, z + 1.5, 'metal', zone);
      W.deco(x - 0.1, y + 4.0, z - 1.5, x + 0.1, y + 4.1, z + 1.5, 'metal', zone);
    } else {
      W.deco(x - 1.5, y + 2.1, z - 0.1, x + 1.5, y + 2.2, z + 0.1, 'metal', zone);
      W.deco(x - 1.5, y + 4.0, z - 0.1, x + 1.5, y + 4.1, z + 0.1, 'metal', zone);
    }
  };
  // a gatehouse frame over a deck (for barrier walls across a 3 m path along x)
  // ---- temple dressing (all static boxes, merged per material; the banners share one mesh)
  // a broken pillar: drum courses, a glowing glyph band, sometimes its capital still on
  const brokenPillar = (x, y, z, h, cap = false) => {
    R(x - 0.75, y, z - 0.75, x + 0.75, y + 0.5, z + 0.75); // plinth
    R(x - 0.6, y + 0.5, z - 0.6, x + 0.6, y + h, z + 0.6);
    for (let k = 1.6; k < h - 0.3; k += 1.4) W.deco(x - 0.63, y + k, z - 0.63, x + 0.63, y + k + 0.08, z + 0.63, 'metal', zone);
    if (h > 2.2) G(x - 0.62, y + h - 0.9, z - 0.62, x + 0.62, y + h - 0.8, z + 0.62);
    if (cap) R(x - 0.95, y + h, z - 0.95, x + 0.95, y + h + 0.5, z + 0.95);
  };
  // a fallen drum lying on the sand
  const drum = (x, y, z, alongX = true, len = 2.8) => (alongX ? R(x - len / 2, y, z - 0.6, x + len / 2, y + 1.2, z + 0.6) : R(x - 0.6, y, z - len / 2, x + 0.6, y + 1.2, z + len / 2));
  // a sand drift: three soft steps, low enough to wade through (decor, not solid)
  const drift = (x, y, z, w, d) => {
    for (let k = 0; k < 3; k++) W.deco(x - w / 2 + k * w * 0.15, y, z - d / 2 + k * d * 0.15, x + w / 2 - k * w * 0.12, y + 0.1 * (k + 1), z + d / 2 - k * d * 0.12, 'plat', zone);
  };
  // carvings on a wall face: n = the way the face looks ('+x' '-x' '+z' '-z'), at = the face's coordinate
  const onWall = (n, at, u1, y1, u2, y2, depth, kind) => {
    const sg = n[0] === '+' ? 1 : -1, a = at, b = at + sg * depth;
    if (n[1] === 'x') W.deco(Math.min(a, b), y1, Math.min(u1, u2), Math.max(a, b), y2, Math.max(u1, u2), kind, zone);
    else W.deco(Math.min(u1, u2), y1, Math.min(a, b), Math.max(u1, u2), y2, Math.max(a, b), kind, zone);
  };
  // a sun disc relief: a ring of rays round a glowing boss, cut in the wall
  const sunRelief = (n, at, u, yc, r = 1.6) => {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, cu = u + Math.cos(a) * r, cy = yc + Math.sin(a) * r;
      onWall(n, at, cu - 0.18, cy - 0.18, cu + 0.18, cy + 0.18, 0.18, 'rock');
    }
    onWall(n, at, u - r * 0.55, yc - r * 0.55, u + r * 0.55, yc + r * 0.55, 0.12, 'rock');
    onWall(n, at, u - r * 0.3, yc - r * 0.3, u + r * 0.3, yc + r * 0.3, 0.16, 'glow1');
  };
  // a strip of glyphs: dashes and blocks of glow in a band along a wall
  const glyphStrip = (n, at, u1, u2, y) => {
    const end = Math.max(u1, u2);
    let u = Math.min(u1, u2), k = 0;
    while (u < end - 0.4) {
      const w = [0.3, 0.7, 0.2, 0.5, 1.1, 0.25][k % 6], h = [0.3, 0.12, 0.45, 0.12, 0.12, 0.3][k % 6];
      onWall(n, at, u, y - h / 2, Math.min(u + w, end), y + h / 2, 0.06, 'glow1');
      u += w + 0.35;
      k++;
    }
    onWall(n, at, Math.min(u1, u2), y - 0.42, end, y - 0.36, 0.08, 'metal');
    onWall(n, at, Math.min(u1, u2), y + 0.36, end, y + 0.42, 0.08, 'metal');
  };
  // banners: sun-cloth hung from the wall tops (one shared texture and mesh for the whole world)
  const bannerGeos = [];
  const banner = (n, at, u, yTop, w = 1.8, h = 5) => {
    const pg = new THREE.PlaneGeometry(w, h);
    const sg = n[0] === '+' ? 1 : -1;
    if (n[1] === 'x') pg.rotateY(sg > 0 ? Math.PI / 2 : -Math.PI / 2).translate(at + sg * 0.12, yTop - h / 2, u);
    else pg.rotateY(sg > 0 ? 0 : Math.PI).translate(u, yTop - h / 2, at + sg * 0.12);
    bannerGeos.push(pg);
    if (n[1] === 'x') M(Math.min(at, at + sg * 0.5), yTop - 0.15, u - w / 2 - 0.2, Math.max(at, at + sg * 0.5), yTop + 0.1, u + w / 2 + 0.2);
    else M(u - w / 2 - 0.2, yTop - 0.15, Math.min(at, at + sg * 0.5), u + w / 2 + 0.2, yTop + 0.1, Math.max(at, at + sg * 0.5));
  };
  const gateX = (x, y, cz, w = 3, h = 4.7) => {
    M(x - 0.4, y - 3, cz - w / 2 - 1, x + 0.4, y + h + 0.8, cz - w / 2);
    M(x - 0.4, y - 3, cz + w / 2, x + 0.4, y + h + 0.8, cz + w / 2 + 1);
    M(x - 0.4, y + h, cz - w / 2, x + 0.4, y + h + 0.8, cz + w / 2);
    G(x - 0.45, y + h + 0.4, cz - w / 2 - 1, x + 0.45, y + h + 0.55, cz + w / 2 + 1);
  };

  const sun = new Sun(W, game);
  level.atmospheres.solar = {
    fog: 0xc8884a, fogNear: 80, fogFar: 460,
    skyTop: [0.3, 0.19, 0.1], skyMid: [0.72, 0.4, 0.15], skyHorizon: [0.92, 0.6, 0.3], aurora: 0, stars: 0,
    hemiSky: 0xffd9a8, hemiGround: 0x5a3420, hemiIntensity: 0.8,
    sunColor: 0xffd29a, sunIntensity: 2.7, sunDir: SUN_DIR,
    exposure: 0.95, bloom: 0.35,
  };

  // ================================================================ S0 ENTRY + SUNWARD OVERLOOK (y 4)
  // A sandstone shelf high over the Scorch Basin. Walls on both long sides, so the only way on is straight
  // ahead: west through the Sun Gate, whose lintel glows and whose beacon lights the first pillar.
  corridorX({ xStart: -25, xEnd: -38, y: 4, zone, cz: -112 });
  R(-38, -24.4, -124, -32, 3, -100); // bedrock under the port, with boulders either side of the corridor
  R(-38, 3, -110, -32, 8, -100);
  R(-38, 3, -124, -32, 8, -114);
  M(-31, -6, -113, -28, 3, -111); // a strut under the corridor in the gap
  area([-30, 4, -113.5], [-27, 7.2, -110.5], mood);
  devStart('solar', [-27, 4, -112], Math.PI / 2, [RED]);
  R(-58, -14, -119, -38, 4, -105); // the deck
  R(-58, -14, -105, -38, 6.5, -72); // the cliff on its south side (the yard and the basin lie below it)
  zoneTitle([-40, 4, -114], [-38, 8, -110], 'SOLAR', 'SUNSCORCH MESA', '#ffd23a', 'music_solar');
  area([-44, 4, -117], [-38, 8, -107], mood);
  ck([-44, 4, -112], Math.PI / 2, [6, 3, 10]);
  // the Sun Gate: two obelisks and a glowing lintel framing the way down
  for (const [z1, z2] of [[-107.2, -104.8], [-119.2, -116.8]]) {
    R(-59.2, 4, z1, -56.8, 13, z2);
    W.deco(-59.3, 13, z1 - 0.1, -56.7, 13.6, z2 + 0.1, 'metal', zone);
    G(-59.25, 12.2, z1 - 0.05, -56.75, 12.4, z2 + 0.05);
    G(-59.25, 8, z1 - 0.05, -56.75, 8.15, z2 + 0.05);
  }
  M(-59, 12.4, -116.8, -57, 13.4, -107.2);
  G(-59.05, 12.3, -116.8, -56.95, 12.4, -107.2);
  W.deco(-58.4, 13.4, -113, -57.6, 15.4, -111, 'glow1', zone); // the sun mark on the lintel
  light(-58, 9.5, -112, 0xffb860, 22, 24); // (light 1/4) the gate beacon
  guideStrip([[-38.5, 4, -112], [-57.6, 4, -112]], amber, { spacing: 1.6, scale: 1.2 });
  G(-58, 3.9, -116.8, -57.9, 4.04, -107.2); // the deck's lip at the gate
  heliostat(-50, 4, -107.4, false);
  heliostat(-50, 4, -116.6, false);
  hint([-50, 4, -117], [-44, 7, -107], 'Through the <b>Sun Gate</b> and down: hop the <b>sandstone pillars</b>. The basin floor is <b>quicksand</b>.', 5);
  // the lookout (NW corner, off the path): the best seat for the captive sun — LOG NOOK 04
  R(-63, -14, -124, -55, 4, -119);
  R(-63, 4, -124, -62.4, 5, -119);
  R(-63, 4, -124, -55, 5, -123.4);
  G(-62.45, 4.95, -123.4, -62.35, 5.05, -119);
  W.deco(-61.6, 4, -121.9, -60.4, 4.6, -120.7, 'metal', zone); // a little brass sighting post
  // the north wall, with the GREEN Sunshade Grotto in it (come back after Verdant)
  R(-55, -14, -132, -38, 4, -119);
  R(-55, 4, -132, -50.5, 9, -119);
  R(-43.5, 4, -132, -38, 9, -119);
  R(-50.5, 4, -132, -43.5, 9, -126);
  R(-50.5, 7.5, -126, -43.5, 9, -119.5);
  R(-50.5, 4, -119.5, -48.2, 7.5, -119);
  R(-45.8, 4, -119.5, -43.5, 7.5, -119);
  R(-48.2, 7, -119.5, -45.8, 7.5, -119);
  new Barrier(W, { min: [-48.2, 4, -119.5], max: [-45.8, 7, -119], color: GREEN, kind: 'door', zone });
  trophy(-47, 5, -123.5);
  G(-50.4, 7.35, -125.9, -43.6, 7.45, -119.6);
  secretRoom([-50.5, 4, -126], [-43.5, 7.5, -119.5], 'Sunshade Grotto');
  hintEvery([-50.5, 4, -120.5], [-43.5, 7, -119], 'Sealed with <b style="color:#46ff7a">GREEN</b> energy — come back later. The way on is <b>west</b>, through the Sun Gate.', 25, 5, () => !has(GREEN));
  blocker([-58, 6.5, -105], [-38, SKY, -72]);
  blocker([-55, 9, -132], [-38, SKY, -119]);
  blocker([-63.6, 4, -124], [-62.4, SKY, -119]); // the lookout's parapets
  blocker([-63.6, 4, -124.6], [-55, SKY, -123.4]);
  blocker([-38, 8, -132], [-25, SKY, -100]); // the bedrock either side of the entry corridor, and its roof

  // ================================================================ S1 THE SCORCH DESCENT (platforming)
  // Pillars over the quicksand basin: shoot the red spikes, ride the phase bridge (a timed red orb), then
  // south over crumbling stones (the third one only looks solid) and a sun lance to time.
  quick(-58, -72, -104, -119, -12, -18);
  quick(-63, -119, -104, -124, -12, -18);
  R(-104, -14, -130, -63, 8, -124); // north cliff
  R(-110, -14, -124, -104, 7, -72); // west cliff
  pillar(-65.5, -114, -61.5, -110, 3.4);
  pillar(-72.5, -114.5, -68.5, -109.5, 2.8);
  new Barrier(W, { min: [-72.5, 2.8, -114.5], max: [-68.5, 3.4, -109.5], color: RED, kind: 'spike', regen: 5, zone });
  const bridge = B.phasePlatform({ min: [-82.5, 2.4, -113], max: [-72.5, 2.8, -111], color: RED, zone });
  B.colorSwitch({ pos: [-76, 6.6, -108.2], style: 'orb', color: RED, mode: 'timed', time: 6, links: [bridge], zone, light: false });
  pillar(-89, -116.5, -82.5, -107.5, 2.8);
  ck([-86, 2.8, -113.5], Math.PI, [6, 3, 5]);
  devStart('solar1', [-86, 2.8, -113.5], Math.PI, [RED]);
  new Barrier(W, { min: [-89, 2.8, -107.9], max: [-82.5, 6, -107.5], color: RED, kind: 'wall', regen: 6, zone });
  B.crumble({ min: [-87.5, 1.9, -104.5], max: [-84, 2.4, -101], delay: 0.6, respawn: 3, zone });
  B.crumble({ min: [-87.5, 1.5, -98], max: [-84, 2.0, -94.5], delay: 0.6, respawn: 3, zone });
  B.crumble({ min: [-87.5, 1.1, -91.5], max: [-84, 1.6, -88], delay: 0.12, respawn: 3, disguise: true, zone }); // RAGE: looks solid
  pillar(-88, -85, -83.5, -81.5, 1.2);
  // a sun lance across the last jump, on a gantry
  M(-90.8, -14, -79.1, -90.2, 9.8, -78.4);
  M(-81.8, -14, -79.1, -81.2, 9.8, -78.4);
  M(-90.8, 9.8, -79.1, -81.2, 10.4, -78.4);
  housing(-89, -80.5, -83, -77, 9);
  lance({ min: [-89, -12, -80.5], max: [-83, 9, -77], period: 3.2, on: 1.4, warn: 0.7 });
  // two more out in the basin (show, not path)
  lanceRig(-69, -91, -66, -88, -12, 10, { period: 4.2, on: 1.8, phase: 1.1 });
  lanceRig(-100, -107, -97, -104, -12, 10, { period: 3.8, on: 1.6, phase: 2.3 });
  new Drone(W, { pos: [-76, 9, -100], color: RED, range: 24 });
  new Drone(W, { pos: [-96, 6, -90], color: RED, range: 22 });
  B.scarab([-87, 2.8, -114.5], { color: RED, range: 9 }); // dug in on the landing
  guideStrip([[-83, 2.8, -112], [-86, 2.8, -112], [-86, 2.8, -108.4]], red, { spacing: 1.1 });
  hint([-89, 2.8, -116.5], [-82.5, 6, -107.5], 'Shoot the <b style="color:#ff3344">red</b> wall, then <b>keep moving</b> over the cracked stones. Watch the <b>lance</b> at the end.', 5);

  // ================================================================ S2 COLLECTOR YARD (combat)
  R(-104, -14, -72, -74, -1, -42);
  R(-90, -14, -76.5, -82, -1, -72); // the jetty you land on
  glowEdge(-90, -76.5, -82, -72, -1, glow, zone);
  R(-104, -14, -42, -74, 8, -40); // south wall
  R(-74, -14, -72, -38, 8, -40); // east cliff
  R(-106, -14, -72, -104, 8, -58.5); // west wall with the door in it
  R(-106, -14, -55.5, -104, 8, -42);
  R(-106, 2.2, -58.5, -104, 8, -55.5);
  R(-104, -1, -72.6, -90, 0.2, -72); // parapet over the basin
  R(-82, -1, -72.6, -74, 0.2, -72);
  area([-90, -1, -76.5], [-82, 3, -70], mood);
  // the collector tower: it used to drink the sun
  M(-91, -1, -59, -87, 10, -55);
  M(-92.5, 10, -60.5, -85.5, 12, -53.5);
  PG(-92.6, 11.2, -60.6, -85.4, 11.5, -53.4);
  PG(-91.05, -1, -59.05, -90.9, 10, -58.9);
  PG(-87.1, -1, -55.1, -86.95, 10, -54.95);
  // cover: tumbled blocks and two heliostats you can bank shots off
  R(-99, -1, -51, -95, 0.8, -48);
  R(-81, -1, -50, -78, 1.4, -46);
  R(-100, -1, -67, -97, 1.2, -63);
  R(-80, -1, -66, -77, 0.8, -62);
  heliostat(-96, -1, -58);
  heliostat(-82, -1, -56);
  // dressing: the yard was a sun temple's forecourt
  for (const [x, z, h, cap] of [[-101, -45, 5.5, true], [-101, -69, 2.4], [-77, -45, 3.6], [-95, -54, 1.6], [-77, -69, 6.2, true]]) brokenPillar(x, -1, z, h, cap);
  drum(-93, -1, -66, true);
  drum(-84, -1, -45.5, false, 2.4);
  for (const [x, z, w, d] of [[-99, -60, 6, 4], [-79, -52, 5, 6], [-88, -44, 9, 2.6], [-96, -70, 7, 3]]) drift(x, -1, z, w, d);
  sunRelief('-z', -42, -95, 4, 1.6);
  sunRelief('-z', -42, -83, 4, 1.6);
  sunRelief('-x', -74, -63, 4, 1.4);
  glyphStrip('-z', -42, -103, -75, 6.6);
  glyphStrip('-x', -74, -71, -43, 6.6);
  glyphStrip('+x', -104, -71, -59.5, 4.8);
  glyphStrip('+x', -104, -54.5, -43, 4.8);
  banner('-z', -42, -89, 7.6);
  banner('-x', -74, -55, 7.6);
  banner('+x', -104, -48, 7.6, 1.6, 4.4);
  // ARMOR: up on the north-west block (hop the drum beside it), on the broken pillar by the tower in the
  // turret's sights, and on the low east block (a jump up, where the scarabs come in).
  B.armor([-98.5, 1.2, -65]);
  B.armor([-95, 0.6, -54]);
  B.armor([-78.5, 0.8, -64]);
  B.encounter({
    trigger: [[-104, -1, -69], [-74, 6, -42]],
    seals: [
      { min: [-90, -1, -72.6], max: [-82, 3.4, -72] },
      { min: [-104.6, -1, -58.5], max: [-104, 2.2, -55.5], closed: true },
    ],
    title: 'COLLECTOR YARD', sub: 'AMBUSH', color: '#ff5a3a', music: 'music_combat', zone,
    checkpoint: { pos: [-108, -1, -57], yaw: Math.PI / 2 },
    waves: [
      [
        { type: 'drone', pos: [-80, 4, -50], color: RED },
        { type: 'drone', pos: [-98, 5, -66], color: RED },
        { type: 'mummy', pos: [-96, -1, -46], color: RED, shieldColor: RED, delay: 2 },
        { type: 'turret', pos: [-89, 6, -54.95], color: RED, mount: [0, 0, 1], delay: 1.2 },
      ],
      [
        { type: 'scarab', pos: [-84, -1, -47], color: RED, burrow: false },
        { type: 'scarab', pos: [-94, -1, -46], color: RED, burrow: false, delay: 0.4 },
        { type: 'scarab', pos: [-80, -1, -60], color: RED, burrow: false, delay: 0.8 },
        { type: 'brute', pos: [-97, -1, -48], color: RED, delay: 1.0 },
        { type: 'drone', pos: [-78, 5, -64], color: RED, delay: 2.2 },
      ],
    ],
  });
  ck([-86, -1, -74.5], Math.PI, [8, 3, 4]);
  devStart('solar2', [-86, -1, -74.5], Math.PI, [RED]);
  blocker([-104, 8, -42], [-74, SKY, -40]);
  blocker([-74, 8, -72], [-58, SKY, -40]);
  blocker([-106, 8, -72], [-104, SKY, -42]);

  // ================================================================ S3 THE SUNDIAL COURT (puzzle)
  // A bridge over quicksand, blocked by two great sun discs. Each red hit turns a disc a quarter turn:
  // turn each one's notch down to the bridge. Beyond, the exit is up on a ledge behind a sinker door: shoot
  // the door down, then ride the red riser up (it only climbs while you shoot it) before the door rises.
  corridorX({ xStart: -104, xEnd: -110, y: -1, zone, cz: -57 });
  R(-114, -14, -70, -110, -1, -49); // entry ledge
  R(-136, -14, -70, -128, -1, -49); // west floor
  quick(-114, -70, -128, -49, -3, -14);
  R(-128, -14, -58.5, -114, -1, -55.5); // the bridge
  glowEdge(-128, -58.5, -114, -55.5, -1, glow, zone);
  R(-138, -14, -72, -106, 9, -70); // north wall
  R(-138, -14, -49, -106, 9, -47); // south wall
  R(-110, -1, -70, -106, 9, -59); // east wall round the corridor
  R(-110, -1, -55, -106, 9, -49);
  R(-110, 2.7, -59, -106, 9, -55);
  R(-138, -14, -70, -136, 9, -58.5); // west wall, round the doorway out
  R(-138, -14, -55.5, -136, 9, -49);
  R(-138, -14, -58.5, -136, 3.5, -55.5);
  R(-138, 6.7, -58.5, -136, 9, -55.5);
  R(-136, -1, -58.5, -132, 3.5, -51); // the exit ledge: a porch behind the sinker door, and the stairs' landing
  R(-136, 3.5, -59, -132, 7.2, -58.5); // the porch's walls
  R(-133.6, 3.5, -55.5, -132, 7.2, -51);
  R(-136, 7.2, -59, -132, 7.6, -51);
  G(-132.05, 3.4, -58.5, -131.95, 3.52, -55.5);
  area([-114, -1, -59], [-110, 3, -55], mood);
  ck([-112, -1, -57], Math.PI / 2, [4, 3, 6]);
  devStart('solar3', [-112, -1, -57], Math.PI / 2, [RED]);
  const disc = [[-0.3, -4.2, -4.2, 0.3, 4.2, -1.5], [-0.3, -4.2, 1.5, 0.3, 4.2, 4.2], [-0.3, -1.0, -1.5, 0.3, 4.2, 1.5]];
  const dialA = B.shotRotor({ pivot: [-117.5, 3.2, -57], parts: disc, axis: 'x', color: RED, start: 2, correct: 0, zone });
  const dialB = B.shotRotor({ pivot: [-124.5, 3.2, -57], parts: disc, axis: 'x', color: RED, start: 1, correct: 0, zone });
  // the discs are heavy: it takes two red hits to shift one a quarter turn (the first one only rocks it),
  // so the first needs 4 hits and the second 6
  for (const d of [dialA, dialB]) {
    const hitTurn = d.onHit.bind(d);
    let charge = 0;
    d.onHit = (color, hit) => {
      if (color !== d.color || d.turning) return hitTurn(color, hit);
      if (++charge < 2) {
        d.flash = 1;
        d.world.fx.sparks(hit?.point || d.pivot, hit?.normal || new THREE.Vector3(0, 1, 0), d.hex, { count: 6, speed: 6, spread: 0.8, life: 0.25 });
        d.jam = 0.5; // it rocks on its axle (the rotor's own wobble)
        return 'hit';
      }
      charge = 0;
      return hitTurn(color, hit);
    };
    onRespawn(() => (charge = 0));
  }
  B.riser({ min: [-131.8, -1, -58.5], max: [-128.8, 0, -55.5], rise: 4, color: RED, zone });
  const sinker = B.sinker({ min: [-133.6, 3.5, -58.5], max: [-132, 6.7, -55.5], depth: 5, color: RED, back: 0.9, zone });
  new Drone(W, { pos: [-121, 8, -51], color: RED, range: 20 });
  hint([-114, -1, -59], [-110, 3, -55], 'The sun discs are heavy: every <b>two</b> <b style="color:#ff3344">red</b> hits turn one a quarter turn. Turn each <b>notch down</b> onto the bridge.', 6);
  hint([-128, -1, -60], [-126, 3, -54], 'Shoot the <b>door</b> on the ledge down into the rock, then stand on the <b>riser</b> and keep shooting it to climb. Quick — the door comes back up.', 7);
  // GREEN stairs up to the ledge along the south wall: a shortcut for later (it skips the race)
  R(-130, -1, -51, -128, -0.59, -49); // (the bottom step is the width of the barrier)
  for (let i = 1; i <= 10; i++) R(-130 - 0.6 * i, -1, -51, -130 - 0.6 * (i - 1), -1 + 0.41 * (i + 1), -49);
  R(-132, -1, -51.4, -130, 4.4, -51); // a wall between the stairs and the floor, the barrier at its foot
  new Barrier(W, { min: [-130, -1, -51.3], max: [-128, 2.6, -50.9], color: GREEN, kind: 'wall', zone });
  blocker([-128, -1, -51], [-127.8, SKY, -49]); // no jumping onto the stairs from over the pool
  blocker([-138, 9, -72], [-106, SKY, -47]);

  // ================================================================ S4 THE SHADE SLOT (platforming)
  // A slot canyon roofed by an old lens array. Sunlight lances down through the gaps in waves; the roofed
  // stretches are shade — all but one, which is a trapdoor.
  R(-140, -14, -124, -138, 12, -105); // east wall (the cache crawl hole and the court door cut in it)
  R(-140, -14, -103, -138, 12, -59);
  R(-140, -14, -105, -138, 2, -103);
  R(-140, 3, -105, -138, 12, -103);
  R(-140, -14, -55, -138, 12, -46);
  R(-140, -14, -59, -138, 3.5, -55);
  R(-140, 6.7, -59, -138, 12, -55);
  R(-150, -14, -112, -147, 12, -46); // west wall (the Sun Well's east wall), the well door cut in it
  R(-150, 1.2, -118, -147, 12, -112);
  R(-150, -14, -118, -147, -2, -112); // the doorway's sill
  R(-150, -14, -124, -147, 12, -118);
  R(-150, -14, -50, -138, 12, -46); // south end
  R(-150, -14, -124, -138, 12, -120); // north end
  R(-147, -14, -74, -140, 3.5, -50); // A
  R(-147, -14, -88, -140, 2, -74); // B
  quick(-147, -94, -140, -88, -6, -14); // the pit under the trapdoor
  B.trapdoor({ min: [-147, 1.6, -94], max: [-140, 2, -88], delay: 0.5, respawn: 2.5, zone });
  R(-147, -14, -106, -140, 2, -94); // C
  R(-147, -14, -120, -140, -2, -106); // D
  for (const [a, b] of [[-50, -62], [-68, -78], [-84, -96], [-102, -108], [-111, -120]]) {
    R(-147, 9, b, -140, 9.8, a);
    PG(-147, 8.94, a - 0.2, -140, 9, a);
    PG(-147, 8.94, b, -140, 9, b + 0.2);
  }
  [[-62, -68, 3.5], [-78, -84, 2], [-96, -102, 2], [-108, -111, -2]].forEach(([a, b, y], i) => {
    housing(-147, b, -140, a, 12);
    lance({ min: [-147, y, b], max: [-140, 12, a], period: 3.4, on: 1.6, warn: 0.6, phase: -0.85 * i });
  });
  new Barrier(W, { min: [-147, 2, -78], max: [-140, 2.6, -74], color: RED, kind: 'spike', regen: 4, zone });
  new Drone(W, { pos: [-143.5, 6, -104], color: RED, orbit: 0.8, range: 20 });
  B.scarab([-143.5, 2, -100], { color: RED, range: 10 }); // in the sand of the slot floor
  area([-144.5, 3.5, -59], [-140, 7, -55], mood);
  ck([-143.5, 3.5, -57], 0, [6, 3, 4]);
  devStart('solar4', [-143.5, 3.5, -57], 0, [RED]);
  ck([-143.5, 3.5, -71], 0, [6, 3, 3]);
  hint([-147, 3.5, -62], [-140, 7, -58], 'Keep to the <b>shade</b>: the lances pour through the roof in waves. <b>Not all shade is safe.</b>', 6);
  guideStrip([[-139.2, 3.5, -57], [-143.5, 3.5, -57], [-143.5, 3.5, -61]], amber, { spacing: 1.2 });
  blocker([-150, 12, -124], [-138, SKY, -46]);

  // the Slot Mesa (between the basin and the slot), with the Sunken Cache in it: SECRET (crawl in at z -104)
  R(-138, -14, -124, -110, 2, -72);
  R(-138, 2, -100, -110, 7, -72);
  R(-138, 2, -124, -110, 7, -108);
  R(-124, 2, -108, -110, 7, -100);
  R(-138, 2, -108, -132, 7, -105);
  R(-138, 2, -103, -132, 7, -100);
  R(-138, 3, -105, -132, 7, -103);
  R(-132, 5, -108, -124, 7, -100);
  W.deco(-140.05, 3, -105.2, -139.95, 3.15, -102.8, 'hazard', zone);
  trophy(-128, 3, -104);
  light(-128, 4.4, -104, 0xffcc55, 7, 8); // (light 2/4)
  secretRoom([-132, 2, -108], [-124, 5, -100], 'Sunken Cache');
  blocker([-138, 7, -124], [-110, SKY, -72]);

  // ================================================================ S5 THE SUN WELL (descent, the core, the ambush)
  // A deep, sun-flooded pit. Ledges step down its east wall to a sandstone plaza ringed by quicksand; the
  // YELLOW core blazes on a dais in the middle. Taking it wakes the well's guardians.
  R(-196, -30, -46, -147, 6, -42); // south wall
  R(-200, -30, -122, -194, -10, -42); // west rim, low: the sun hangs right over it
  R(-196, -30, -124, -173.5, -4, -122); // north wall, the exit door in it
  R(-170.5, -30, -124, -147, -4, -122);
  R(-173.5, -16.8, -124, -170.5, -4, -122);
  quick(-194, -122, -150, -46, -21, -30);
  R(-189, -30, -62, -155, -20, -50); // the plaza, round two sinkholes
  R(-189, -30, -70, -170, -20, -62);
  R(-164, -30, -70, -155, -20, -62);
  R(-189, -30, -98, -155, -20, -70);
  R(-189, -30, -106, -180, -20, -98);
  R(-174, -30, -106, -155, -20, -98);
  R(-189, -30, -118, -155, -20, -106);
  R(-174, -30, -122, -170, -20, -118); // the walk to the door
  glowEdge(-189, -118, -155, -50, -20, glow, zone);
  for (const [x, z] of [[-162, -56], [-182, -56], [-162, -112], [-182, -112]]) {
    R(x - 1, -20, z - 1, x + 1, -9, z + 1);
    W.deco(x - 1.1, -9, z - 1.1, x + 1.1, -8.6, z + 1.1, 'metal', zone);
    PG(x - 1.05, -12, z - 1.05, x + 1.05, -11.8, z + 1.05);
  }
  R(-176, -20, -88, -168, -19.6, -80); // the dais
  G(-176.05, -19.7, -88.05, -167.95, -19.55, -79.95);
  pedestal(-172, -19.6, -84, YELLOW, zone);
  light(-172, -14, -84, 0xffd060, 26, 28); // (light 3/4)
  // dressing: the plaza of a sunken temple
  for (const [x, z, h, cap] of [[-158, -84, 3.2], [-186, -84, 5.4, true], [-172, -53, 2.2], [-158, -98, 1.4], [-186, -66, 2.8], [-176, -116, 4.2, true]]) brokenPillar(x, -20, z, h, cap);
  drum(-180, -20, -92, true);
  drum(-164, -20, -76, false);
  drum(-170, -20, -108, true, 2.2);
  for (const [x, z, w, d] of [[-160, -58, 6, 5], [-184, -102, 6, 6], [-178, -60, 5, 4], [-163, -114, 6, 3]]) drift(x, -20, z, w, d);
  // a sun-ray inlay round the dais
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, x = -172 + Math.cos(a) * 7.5, z = -84 + Math.sin(a) * 7.5;
    W.deco(x - 0.25, -20, z - 0.25, x + 0.25, -19.96, z + 0.25, 'glow1', zone);
  }
  sunRelief('-z', -46, -165, -12, 2.2);
  sunRelief('-z', -46, -179, -12, 2.2);
  sunRelief('+z', -122, -184, -11, 1.8);
  glyphStrip('-z', -46, -193, -151, -7.5);
  glyphStrip('+z', -122, -193, -175.5, -8);
  glyphStrip('+z', -122, -168.5, -151, -8);
  banner('-z', -46, -172, -4, 2.2, 7);
  banner('+z', -122, -160, -5, 1.8, 6);
  banner('+z', -122, -184, -5, 1.8, 6);
  // the rim and the ledges down the east wall
  R(-158, -30, -120, -150, -2, -110);
  R(-158.5, -2, -120, -158, -1, -110);
  G(-158.55, -1.05, -120, -157.95, -0.95, -110);
  area([-150, -2, -118], [-147, 1.2, -112], mood);
  ck([-154, -2, -115], (3 * Math.PI) / 4, [6, 3, 8]);
  devStart('solar5', [-154, -2, -115], (3 * Math.PI) / 4, [RED]);
  hint([-158, -2, -120], [-150, 1, -110], 'The <b style="color:#ffd23a">YELLOW core</b> blazes at the bottom of the Sun Well. Hop down the ledges along the wall.', 5);
  const ledges = [[-106, -102, -4.5], [-98, -94, -7], [-90, -86, -9.5], [-82, -78, -12], [-74, -70, -14.5], [-66, -62, -17]];
  for (const [z1, z2, top] of ledges) pillar(-155, z1, -150, z2, top, -30);
  new Barrier(W, { min: [-155, -7, -98], max: [-150, -6.4, -94], color: RED, kind: 'spike', regen: 4, zone });
  new Drone(W, { pos: [-162, -6, -88], color: RED, range: 24 });
  guideStrip([[-154, -2, -111], [-152.5, -2, -110.4]], red, { spacing: 0.8 });
  blocker([-158.6, -2, -120], [-158, SKY, -110]);
  blocker([-196, 6, -46], [-147, SKY, -42]);
  blocker([-200, -10, -122], [-194, SKY, -42]);
  // ARMOR: over the north sinkhole's lip (lean out), up on the broken pillar by the south wall, and on the
  // short pillar on the east side under the drones.
  B.armor([-167, -20, -62.7], { base: false });
  B.armor([-172, -17.8, -53]);
  B.armor([-158, -18.6, -98]);
  // the ambush: it wakes once you're holding yellow and step down off the dais
  const ambush = B.encounter({
    trigger: [[0, -500, 0], [1, -499, 1]], // started by hand (below)
    seals: [{ min: [-173.5, -20, -122.6], max: [-170.5, -16.8, -122.1], closed: true }],
    title: 'THE SUN WELL', sub: 'GUARDIANS AWAKE', color: '#ffd23a', music: 'music_combat', zone, resume: true,
    checkpoint: { pos: [-172, -20, -127.5], yaw: 0 },
    waves: [
      [
        { type: 'scarab', pos: [-166, -20, -74], color: RED, burrow: false },
        { type: 'scarab', pos: [-178, -20, -74], color: RED, burrow: false, delay: 0.3 },
        { type: 'scarab', pos: [-172, -20, -66], color: RED, burrow: false, delay: 0.6 },
        { type: 'drone', pos: [-162, -14, -102], color: RED, delay: 0.8 },
        { type: 'drone', pos: [-182, -14, -100], color: RED, delay: 1.4 },
      ],
      { title: 'YELLOW HOSTILES — SWITCH WITH 2', enemies: [
        { type: 'drone', pos: [-160, -14, -76], color: YELLOW },
        { type: 'drone', pos: [-184, -14, -92], color: YELLOW, delay: 0.6 },
        { type: 'turret', pos: [-172, -13, -121.9], color: YELLOW, mount: [0, 0, 1], delay: 1.2 },
        { type: 'mummy', pos: [-180, -20, -110], color: YELLOW, shieldColor: RED, delay: 2.0 },
        { type: 'scarab', pos: [-164, -20, -104], color: [YELLOW, RED], burrow: false, delay: 3.0 },
        { type: 'scarab', pos: [-180, -20, -60], color: [YELLOW, RED], burrow: false, delay: 3.4 },
      ] },
      [
        { type: 'warden', pos: [-172, -13, -98], shield: YELLOW, core: RED },
        { type: 'brute', pos: [-165, -20, -64], color: YELLOW, delay: 1.0 },
        { type: 'mortar', pos: [-186, -20, -114], color: RED, delay: 1.8 },
        { type: 'mummy', pos: [-160, -20, -110], color: RED, shieldColor: YELLOW, delay: 2.4 },
      ],
    ],
    onClear: () => game.hud.message('The north door is open. <b style="color:#ffd23a">Yellow</b> is yours — use it.', 5),
  });
  ck([-172, -19.6, -86.5], 0, [6, 3, 3]);
  devStart('solar6', [-172, -19.6, -86.5], 0, [RED, YELLOW]);
  {
    let wait = 0;
    W.add({
      update(dt, player) {
        if (ambush.state !== 'armed' || game.state !== 'playing' || !has(YELLOW)) return (wait = 0);
        const p = player.pos;
        if (p.x < -189 || p.x > -155 || p.z < -118 || p.z > -50 || p.y > -17) return (wait = 0);
        if ((wait += dt) > 1.2) ambush.start();
      },
    });
  }

  // ================================================================ S6 HELIOSTAT HALL (puzzle)
  // The jump pad up to the terrace is dead. Two yellow receivers wake it: one behind glass in the north
  // wall (fire over the glass and the mirrors carry the shot down), one on the back of the pillar in the
  // mirror bay (bank a shot off the wall mirror behind it).
  corridor({ zStart: -124, zEnd: -130, y: -20, zone, cx: -172 });
  room({ x1: -190, x2: -154, zS: -130, zN: -158, y: -20, h: 16, zone, ceiling: false, s: [{ c: -172, w: 3, h: CH }], n: [{ c: -172, w: 3.2, h: 4 }], e: [{ c: -153, w: 5, y0: 11, h: 5 }], wallKind: 'rock' }); // (the east notch: the pad's way out)
  area([-173.5, -20, -133], [-170.5, -16.8, -130], mood);
  ck([-172, -20, -133], 0, [6, 3, 3]);
  devStart('solar7', [-172, -20, -133], 0, [RED, YELLOW]);
  light(-172, -10, -146, 0xffc070, 8, 22); // (light 4/4)
  const receivers = { glass: false, bank: false };
  let pad = null;
  const deadPad = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.2, 24), new THREE.MeshStandardMaterial({ color: 0x2a2620, metalness: 0.8, roughness: 0.4 }));
  deadPad.position.set(-158, -19.9, -153);
  W.scene.add(deadPad);
  const powerPad = () => {
    if (pad) return;
    pad = new JumpPad(W, { pos: [-158, -20, -153], power: 29, push: [5, 0, 0], color: 0xffd23a });
    deadPad.visible = false;
    audio.sample('elevator_start', { gain: 0.7 });
    game.hud.message('Jump pad online! It throws you <b>east</b>, up onto the terrace.', 4);
  };
  const receiverOn = (which) => {
    if (receivers[which]) return;
    receivers[which] = true;
    if (receivers.glass && receivers.bank) powerPad();
    else game.hud.message('Receiver online: <b>1 / 2</b>.', 2.5);
  };
  {
    // receiver 1: the glass alcove in the north wall
    const x1 = -173.6, x2 = -170.4, zf = -158, zb = -162.5, y = -20, top = -16, gt = -17.4;
    M(x1 - 0.2, y, zb - 0.2, x1, top + 0.2, zf);
    M(x2, y, zb - 0.2, x2 + 0.2, top + 0.2, zf);
    M(x1 - 0.2, y, zb - 0.2, x2 + 0.2, top + 0.2, zb);
    M(x1 - 0.2, top, zb - 0.2, x2 + 0.2, top + 0.2, zf);
    new Glass(W, { min: [x1, y, zf - 0.1], max: [x2, gt, zf] });
    G(x1, gt, zf - 0.15, x2, gt + 0.06, zf + 0.05);
    new Mirror(W, { min: [x1, top - 0.15, zb], max: [x2, top, zf - 0.1] });
    new Mirror(W, { min: [x1, y, zb + 0.2], max: [x1 + 0.1, top - 0.15, zf - 0.1] });
    new Mirror(W, { min: [x2 - 0.1, y, zb + 0.2], max: [x2, top - 0.15, zf - 0.1] });
    const panels = [
      new TargetPanel(W, { min: [x1 + 0.1, y, zb + 0.2], max: [x2 - 0.1, y + 0.12, zf - 0.1], color: YELLOW, face: 'up', onActivate: () => receiverOn('glass') }),
      new TargetPanel(W, { min: [x1 + 0.1, y + 0.12, zb], max: [x2 - 0.1, top - 0.15, zb + 0.2], color: YELLOW, face: '+z', onActivate: () => receiverOn('glass') }),
    ];
    panels.forEach((p) => (p.group = panels));
  }
  {
    // receiver 2: the mirror bay on the east wall. Rock walls close its ends, the pillar stands in its
    // mouth with the receiver on its back, and only a shot banked off the wall mirror can reach it.
    R(-160.6, -20, -136.6, -154, -12, -136); // south end wall
    R(-160.6, -20, -148.6, -154, -12, -148); // north end wall
    R(-160.6, -20, -144.5, -160, -12, -141.5); // the pillar
    G(-160.65, -12.1, -144.55, -159.95, -11.95, -141.45);
    new Mirror(W, { min: [-154.25, -19.5, -147.6], max: [-154, -12.5, -137] });
    new TargetPanel(W, { min: [-160, -17.6, -144], max: [-159.85, -15.4, -142], color: YELLOW, face: '+x', onActivate: () => receiverOn('bank') });
    R(-160.8, -20, -141.5, -160.6, -19, -136.6); // low rails across the gaps either side of the pillar
    R(-160.8, -20, -148, -160.6, -19, -144.5);
    G(-160.85, -19.05, -148, -160.55, -18.95, -136.6);
    blocker([-160.8, -20, -148], [-160.6, -4, -136.6]);
  }
  heliostat(-182, -20, -136, false);
  heliostat(-182, -20, -152, false);
  new Drone(W, { pos: [-178, -12, -146], color: YELLOW, range: 24 });
  new Drone(W, { pos: [-165, -12, -137], color: RED, range: 22 });
  hint([-176, -20, -136], [-168, -16, -130], 'The pad is dead. Wake both <b style="color:#ffd23a">yellow receivers</b>: one behind the <b>glass</b> (fire over it, the mirrors do the rest), one on the back of the <b>pillar</b> in the mirror bay (bank a shot off the wall mirror).', 8);
  guideStrip([[-166, -20, -150], [-160, -20, -153]], amber, { spacing: 1.3 });
  G(-154.05, -9.1, -155.5, -153.45, -8.95, -150.5); // the notch's sill

  // ================================================================ S7 THE GLASS TERRACE + MIRROR MESA (platforming)
  // The pad drops you on the terrace. Shoot the rack's ledges into a staircase up the mesa face (each
  // arrow target moves its ledge a notch: red or yellow), then cross the chasm on chroma platforms (solid
  // only while you hold their color): red, yellow, red, yellow. The landing's spikes are a surprise.
  R(-153.5, -30, -162, -134, -4, -124); // the terrace
  R(-153.5, -4, -166, -134, 8, -162); // its north wall
  R(-153.5, -4, -124, -134, 9, -120); // its south wall: fused sand-glass strata in the cut
  {
    // the glass rings: thousands of summers of burned sand, fused in bands — LOG NOOK 05
    const gm = new THREE.MeshStandardMaterial({ color: 0x9fd6c2, emissive: 0x2f5a4a, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.06, transparent: true, opacity: 0.82 });
    const geos = [];
    let y = -3.2, k = 0;
    while (y < 8.4) {
      const h = 0.06 + ((k * 37) % 7) * 0.035;
      for (let x = -153.4; x < -134.2; x += 2.4) {
        const wob = Math.sin(k * 1.7 + x * 0.6) * 0.12;
        geos.push(new THREE.BoxGeometry(2.4, h, 0.1).translate(x + 1.2, y + wob, -124.04));
      }
      y += 0.35 + ((k * 53) % 5) * 0.14;
      k++;
    }
    W.scene.add(new THREE.Mesh(mergeBoxes(geos), gm));
  }
  area([-153.5, -4, -162], [-147, 2, -124], mood);
  ck([-147, -4, -148], -Math.PI / 2, [8, 3, 8]);
  devStart('solar8', [-147, -4, -148], -Math.PI / 2, [RED, YELLOW]);
  // the mesa: summit block (y 12), the shelf and the chasm, the landing
  R(-134, -30, -170, -104, 12, -134);
  R(-136, -30, -132.6, -130, 3.1, -124.6); // the shelf
  glowEdge(-136, -132.6, -130, -124.6, 3.1, glow, zone);
  quick(-130, -134, -110.5, -124, -10, -30);
  R(-110.5, -30, -134, -104, 4, -124); // the landing
  glowEdge(-110.5, -134, -104, -124, 4, glow, zone);
  R(-104, 4, -134, -103.2, 8, -124); // its far wall (the collector field is below)
  B.platformRack({ pos: [-134, -2.4, -147.2], face: '-x', along: [0, 0, 1], columns: 5, notches: 7, step: 1.1, targetGap: 0.7, start: [3, 0, 6, 1, 6], colors: [RED, YELLOW], zone });
  R(-136.5, -4, -150.5, -134, -3.2, -148.6); // a step up to the first ledge
  glowEdge(-136.5, -150.5, -134, -148.6, -3.2, glow, zone);
  hint([-153.5, -4, -152], [-140, 0, -140], 'Shoot the arrows above and below each rail: <b style="color:#ff3344">red</b> or <b style="color:#ffd23a">yellow</b> moves that ledge a notch. Build a <b>staircase</b> south to the shelf.', 7);
  ck([-133, 3.1, -128.6], -Math.PI / 2, [4, 3, 6]);
  const chroma = [[-128.5, -126, 3.2, RED], [-124, -121.5, 3.4, YELLOW], [-119.5, -117, 3.6, RED], [-115, -112.5, 3.8, YELLOW]];
  for (const [x1, x2, top, c] of chroma) B.chromaPlatform({ min: [x1, top - 0.4, -131.5], max: [x2, top, -128.5], color: c, zone });
  hint([-136, 3.1, -132.6], [-130, 6.5, -124.6], 'These stones are solid only while your blaster is <b>their color</b>. Switch (<b>1</b>/<b>2</b>) as you jump.', 6);
  // the surprise: spikes grow on the landing's edge as you reach the third stone (red: shoot them from it)
  const surprise = new Barrier(W, { min: [-110.5, 4, -133.5], max: [-108.5, 4.6, -124.5], color: RED, kind: 'spike', zone });
  const hideSurprise = () => {
    surprise.broken = true;
    surprise.solid.enabled = false;
    surprise.group.visible = false;
    surprise.regen = 0;
    surprise.armed = true;
  };
  hideSurprise();
  onRespawn(hideSurprise);
  // the area restock (restock.js) rebuilds broken barriers when you leave Solar: hide the trap again while
  // you're away so it's a surprise every time, never a plain spike layer
  W.add({ update: (dt, player) => regionOf(player.pos) !== 'solar' && !(surprise.broken && surprise.armed) && hideSurprise() });
  W.trigger([-119.6, 3.5, -131.6], [-116.9, 6.5, -128.4], () => {
    if (!surprise.armed || !surprise.broken) return;
    surprise.armed = false;
    surprise.regen = 0.8;
    surprise.timer = 0.8;
    surprise.onBreak = () => (surprise.regen = 0);
  }, { once: false });
  new JumpPad(W, { pos: [-106, 4, -129], power: 21, push: [0, 0, -7], color: 0xffd23a });
  new Drone(W, { pos: [-120, 9, -127], color: YELLOW, range: 20 });
  blocker([-134, 7, -124], [-104, SKY, -123.4]); // the chasm's south rim
  blocker([-104, 8, -134], [-103.2, SKY, -124]);
  blocker([-153.5, 9, -124], [-134, SKY, -120]);
  blocker([-153.5, 8, -166], [-134, SKY, -162]);
  blocker([-153.5, -4, -124.2], [-134, SKY, -124]); // no walking off the terrace onto the well's wall

  // ================================================================ S8 GNOMON SUMMIT (combat)
  // The great sundial's gnomon, heliostats and a ring of standing stones with burned shadows (LOG NOOK 06).
  M(-121, 12, -154, -117, 32, -150);
  M(-121.6, 32, -154.6, -116.4, 34, -149.4);
  for (const y of [18, 24, 30]) PG(-121.05, y, -154.05, -116.95, y + 0.3, -149.95);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2, cx = -119 + Math.cos(a) * 8, cz = -152 + Math.sin(a) * 8;
    G(cx - 0.35, 12, cz - 0.35, cx + 0.35, 12.06, cz + 0.35);
  }
  heliostat(-110, 12, -140, false);
  heliostat(-128, 12, -142);
  {
    // standing stones and the shadows burned into the rock beside them: people who stood here once
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, x = -128 + Math.cos(a) * 3.6, z = -164 + Math.sin(a) * 3.6;
      R(x - 0.4, 12, z - 0.4, x + 0.4, 13.4 + (k % 3) * 0.5, z + 0.4);
    }
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x0c0806, transparent: true, opacity: 0.72, depthWrite: false });
    const shapes = [];
    const person = (x, z, rot, s = 1) => {
      // a body and a head, stretched long the way a low sun throws them (away from the sun, east)
      const body = new THREE.CircleGeometry(0.32 * s, 12).scale(1, 3.2, 1).translate(0, -1.1 * s, 0);
      const head = new THREE.CircleGeometry(0.22 * s, 12).translate(0, 0.2 * s, 0);
      for (const g of [body, head]) shapes.push(g.rotateZ(rot).rotateX(-Math.PI / 2).translate(x, 12.02, z));
    };
    person(-126.5, -162.5, -1.4);
    person(-125.6, -164.8, -1.5, 0.8);
    person(-129.6, -166.8, -1.3, 1.1);
    W.scene.add(new THREE.Mesh(mergeBoxes(shapes), shadowMat));
  }
  // ARMOR: on a standing stone in the ring (where the mummy rises), and over the west cliff edge (lean out).
  B.armor([-129.8, 13.9, -167.12]);
  B.armor([-134.7, 12, -146], { base: false });
  const hopSeal = B.seal([-113.5, 12, -168.5], [-110.5, 14.5, -165.5], { color: YELLOW, zone, closed: true });
  B.encounter({
    trigger: [[-134, 12, -152], [-104, 17, -137.5]],
    seals: [hopSeal],
    title: 'GNOMON SUMMIT', sub: 'THE SUMMIT GUARD', color: '#ffd23a', music: 'music_combat', zone,
    checkpoint: { pos: [-112, 12, -162], yaw: 0 },
    waves: [
      [
        { type: 'drone', pos: [-110, 17, -150], color: YELLOW },
        { type: 'drone', pos: [-128, 17, -158], color: YELLOW, delay: 0.5 },
        { type: 'turret', pos: [-116.95, 16, -152], colors: [RED, YELLOW], mount: [1, 0, 0], delay: 1.0 },
      ],
      [
        { type: 'mortar', pos: [-130, 12, -140], color: YELLOW },
        { type: 'scarab', pos: [-124, 12, -144], color: [RED, YELLOW], burrow: false, delay: 0.8 },
        { type: 'scarab', pos: [-114, 12, -146], color: [YELLOW, RED], burrow: false, delay: 1.1 },
        { type: 'mummy', pos: [-128, 12, -164], color: YELLOW, shieldColor: RED, delay: 2.2 },
        { type: 'warden', pos: [-112, 16, -160], shield: RED, core: YELLOW, delay: 1.6 },
      ],
    ],
    onClear: () => game.hud.message('The <b>hop pad</b> at the north edge is open.', 4),
  });
  area([-112, 12, -140], [-104, 16, -134], mood);
  ck([-108, 12, -138], 0, [6, 3, 4]);
  devStart('solar9', [-108, 12, -138], 0, [RED, YELLOW]);
  R(-104, 12, -170, -103.4, 13, -134); // a parapet over the collector field
  blocker([-104, 12, -170], [-103.4, SKY, -134]);
  hint([-112, 12, -140], [-104, 16, -134], 'The Gnomon Summit. Clear the guard; the <b>hop pad</b> at the north edge opens when it\'s done.', 5);

  // ================================================================ S9 HOPS TO THE SUN COURT
  quick(-134, -205, -104, -170, -10, -30);
  new JumpPad(W, { pos: [-112, 12, -167], power: 15, push: [0, 0, -8], color: 0xffd23a });
  pillar(-115, -180, -109, -175, 13);
  new JumpPad(W, { pos: [-112, 13, -177.5], power: 16, push: [0, 0, -7.5], color: 0xffd23a });
  pillar(-115, -190, -109, -185, 15.5);
  R(-117, -14, -199, -109.5, 15.4, -191); // the arrival, joining the court's west stub
  plat(-117, -199, -109.5, -191, 16, zone, 0.6);
  new Drone(W, { pos: [-121, 19, -183], color: YELLOW, range: 22 });
  barrierWallX(-110, 16, YELLOW, zone, -195, 3.2);
  ck([-113, 16, -195], -Math.PI / 2, [4, 3, 6]);
  devStart('solar10', [-112, 12, -164], 0, [RED, YELLOW]);
  guideStrip([[-112, 12, -158], [-112, 12, -165.6]], amber, { spacing: 1.2 });
  blocker([-117.6, 16, -199.6], [-109.5, SKY, -199]);
  blocker([-117.6, 16, -199.6], [-117, SKY, -190.4]);
  blocker([-109.5, 16, -193.5], [-109.2, SKY, -191]); // either side of the stub
  blocker([-109.5, 16, -199], [-109.2, SKY, -196.5]);

  // ================================================================ S10 THE SUN COURT — the guardian and the power source
  // The Sphinx's sandstone court (sphinxArena.js) on a mesa, entered from the west, left by the south door
  // once the sun-lens over it is shot dark. The lens is the world's power source: the collector array
  // focuses the captive sun on it and it beams the light into the Atrium's west wall.
  const COURT = [-80, 16, -195];
  R(-104, -14, -219, -56, 13.6, -171); // the mesa under the court
  R(-110, -14, -197, -103.5, 15, -193); // under the stubs
  R(-82, -14, -171.5, -78, 15, -165.5);
  const court = buildSphinxArena(B, { center: COURT, size: 44, entry: 'w', exit: 's', stub: 6, powerSource: true, world: 'solar', sunDir: SUN_DIR });
  level.solarCourt = court;
  // ARMOR: on the two sun-altar ledges (ride their jump pads up): a breather off the court floor.
  B.armor([-80, 20.6, -215.5]);
  B.armor([-59.5, 20.6, -195]);
  area([-109.5, 16, -196.5], [-103.5, 19.2, -193.5], mood);
  area([-81.5, 16, -171.5], [-78.5, 19.2, -165.5], mood);
  devStart('solar11', court.checkpoint, court.checkpointYaw, [RED, YELLOW]);
  const lensPos = [COURT[0], COURT[1] + 15, COURT[2]];
  const beam = new PowerBeam(W, lensPos, [-25.15, 27.6, -117]);
  // the collector array: one field below the causeway, one on the north-west flats
  const sitesA = [], sitesB = [];
  for (const x of [-42, -50, -58, -66, -74, -88, -96]) for (const z of [-142, -150, -158, -166]) sitesA.push([x, 0, z + (Math.abs(x / 8) % 2) * 1.5]);
  for (const x of [-142, -152, -162, -172, -182, -192]) for (const z of [-172, -184, -196, -208, -220]) sitesB.push([x, -4, z]);
  R(-104, -14, -171, -36, 0, -130); // the collector flat
  R(-200, -30, -230, -134, -4, -164); // the north-west flats
  R(-196, -30, -164, -173.8, -4, -158.5); // the rock behind the Heliostat Hall, round its receiver alcove
  R(-170.2, -30, -164, -154, -4, -158.5);
  R(-173.8, -30, -164, -170.2, -20, -158.5);
  R(-173.8, -15.8, -164, -170.2, -4, -158.5);
  R(-173.8, -20, -164, -170.2, -15.8, -162.7);
  for (const [x, y, z] of [...sitesA, ...sitesB]) {
    M(x - 0.18, y, z - 0.18, x + 0.18, y + 3.4, z + 0.18);
    W.deco(x - 0.6, y, z - 0.6, x + 0.6, y + 0.3, z + 0.6, 'metal', zone);
  }
  const array = new CollectorArray(W, { target: lensPos, sites: [...sitesA, ...sitesB] });

  // ================================================================ S11 SUNSET CAUSEWAY (y 12) → Hub
  // Out of the court's south door you drop onto the causeway (no way back up: the return is one-way),
  // walk it home over the collector field and in through the Hub's west balcony port.
  plat(-81.5, -165.5, -78.5, -137.5, 12, zone, 1.0);
  plat(-81.5, -137.5, -38, -134.5, 12, zone, 1.0);
  for (const z of [-160, -150, -142]) M(-80.6, 0, z - 0.6, -79.4, 11, z + 0.6);
  for (const x of [-72, -62, -52, -44]) M(x - 0.6, 0, -136.6, x + 0.6, 11, -135.4);
  M(-81.7, 12, -165.5, -81.5, 13, -134.3); // rails
  M(-78.5, 12, -165.5, -78.3, 13, -137.5);
  M(-78.5, 12, -137.7, -38, 13, -137.5);
  M(-78.3, 12, -134.5, -64.2, 13, -134.3); // (a gap for the Eclipse Vault's door)
  M(-61.8, 12, -134.5, -38, 13, -134.3);
  M(-81.7, 12, -134.5, -78.5, 13, -134.3);
  blocker([-81.9, 12, -165.5], [-81.5, SKY, -134.3]);
  blocker([-78.5, 12, -165.5], [-78.1, SKY, -137.5]);
  blocker([-78.5, 12, -137.9], [-38, SKY, -137.5]);
  blocker([-81.9, 12, -134.5], [-64.2, SKY, -134.1]);
  blocker([-61.8, 12, -134.5], [-38, SKY, -134.1]);
  area([-81.5, 12, -165.5], [-78.5, 15, -160], mood);
  ck([-80, 12, -160], Math.PI, [3, 3, 4]);
  devStart('solar12', [-80, 12, -160], Math.PI, [RED, YELLOW]);
  gateX(-66, 12, -136);
  barrierWallX(-66, 12, YELLOW, zone, -136, 4.7);
  gateX(-48, 12, -136);
  barrierWallX(-48, 12, RED, zone, -136, 4.7);
  new Drone(W, { pos: [-72, 16.5, -131], color: [RED, YELLOW], range: 22, cycle: 2.2 });
  new Drone(W, { pos: [-56, 16.5, -141], color: YELLOW, range: 22 });
  guideStrip([[-80, 12, -139], [-80, 12, -136], [-76, 12, -136]], amber, { spacing: 1.2 });
  // the Eclipse Vault: SECRET behind a BLUE door on the causeway's south side (come back after Azure)
  R(-67, -14, -134.3, -59, 12, -127.5);
  R(-67, 12, -134.3, -66, 16, -127.5);
  R(-60, 12, -134.3, -59, 16, -127.5);
  R(-67, 12, -128.5, -59, 16, -127.5);
  R(-67, 15.5, -134.3, -59, 16.4, -127.5);
  R(-66, 12, -134.3, -64.2, 15.5, -133.8);
  R(-61.8, 12, -134.3, -60, 15.5, -133.8);
  R(-64.2, 15, -134.3, -61.8, 15.5, -133.8);
  new Barrier(W, { min: [-64.2, 12, -134.3], max: [-61.8, 15, -133.8], color: BLUE, kind: 'door', zone });
  trophy(-63, 13, -130.8);
  G(-65.9, 15.35, -133.7, -60.1, 15.45, -128.6);
  secretRoom([-66, 12, -133.8], [-60, 15.5, -128.5], 'Eclipse Vault');
  // the return port: a short hall onto the Hub's west balcony
  corridorX({ xStart: -25, xEnd: -38, y: 12, zone, cz: -136 });
  M(-37, -24, -137, -33, 11, -135);
  M(-31, 2, -137, -28, 11, -135);
  area([-38, 12, -137.5], [-30, 15.2, -134.5], mood);

  // ================================================================ SCENERY
  // distant mesas on the north and west horizons (the west stays low where the sun hangs over the Well)
  for (const [xa, xb, top] of [[-104, -124, 34], [-124, -152, 27], [-152, -178, 46], [-178, -199.5, 36]]) {
    R(xb, -24.4, -229.5, xa, top, -224);
    if (top > 20) R(xb + 4, top, -228, xa - 4, top + 6, -225);
  }
  for (const [xa, xb, top] of [[-36, -56, 10], [-56, -104, 30]]) R(xb, -24.4, -229.5, xa, top, -222);
  for (const [za, zb, top] of [[-124, -160, 30], [-160, -224, 42]]) {
    R(-199.5, -30, zb, -196, top, za);
    R(-199.5, top, zb + 5, -197, top + 5, za - 5);
  }
  strata(-38.3, -100, -38, -72, [-6, 0]);
  strata(-104, -124, -103.7, -72, [-8, -2, 3]);
  strata(-150.3, -122, -150, -46, [-14, -8]);
  strata(-194, -46.3, -150, -46, [-14, -8, -2]);
  strata(-134.3, -170, -134, -147.5, [6, 9]);
  strata(-196.3, -224, -196, -124, [-2, 10, 22]);
  strata(-199.5, -222.3, -36, -222, [2, 14]);
  killZone([-201, -40, -232], [-31.5, -30.5, -38]);

  if (bannerGeos.length) {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 160;
    const cx2 = cv.getContext('2d');
    cx2.fillStyle = '#b8862a';
    cx2.fillRect(0, 0, 64, 160);
    cx2.fillStyle = '#7a2a18';
    cx2.fillRect(0, 0, 64, 12);
    cx2.fillRect(0, 134, 64, 10);
    cx2.fillStyle = '#ffd86a';
    cx2.beginPath();
    cx2.arc(32, 52, 15, 0, Math.PI * 2);
    cx2.fill();
    cx2.strokeStyle = '#ffd86a';
    cx2.lineWidth = 3;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      cx2.beginPath();
      cx2.moveTo(32 + Math.cos(a) * 19, 52 + Math.sin(a) * 19);
      cx2.lineTo(32 + Math.cos(a) * 26, 52 + Math.sin(a) * 26);
      cx2.stroke();
    }
    cx2.fillStyle = '#2a3f8a';
    for (let y = 84; y < 128; y += 12) cx2.fillRect(14, y, 36, 5);
    // a swallowtail hem
    cx2.globalCompositeOperation = 'destination-out';
    cx2.beginPath();
    cx2.moveTo(16, 160);
    cx2.lineTo(32, 146);
    cx2.lineTo(48, 160);
    cx2.fill();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const bm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide, alphaTest: 0.5 });
    W.scene.add(new THREE.Mesh(mergeBoxes(bannerGeos), bm));
  }

  // ================================================================ THE SHUTDOWN: what changes
  // The sun is eclipsed and dusk falls, every lance dies, the haze and the hum stop, the quicksand goes
  // still, the sun-powered trims go dark, the mirrors stow and the beam to the Atrium flickers out.
  let down = false;
  const powerDown = (instant) => {
    if (down) return;
    down = true;
    director.down = true;
    for (const l of lances) l.enabled = false;
    hazeMat.uniforms.uK.value = 0;
    for (const m of hazeMeshes) m.visible = false;
    for (const surface of [true, false]) {
      const m = liquidMaterial(zone, surface);
      m.uniforms.uTime = { value: m.uniforms.uTime.value };
      if (m.uniforms.uAmp) m.uniforms.uAmp.value = 0;
    }
    mat('glow1', POWER_ZONE).color.setRGB(0.12, 0.07, 0.03);
    sun.eclipse(instant);
    array.stow(instant);
    beam.kill(instant);
    Object.assign(level.atmospheres.solar, DUSK);
    if (game.atmo?.name === 'solar') game.setAtmosphere('solar', instant);
    if (!instant) setTimeout(() => game.hud.message('The captive sun goes dark. Leave by the <b>south door</b> and take the causeway home.', 6), 4500);
  };
  game.onPowerDown?.((name, info) => name === 'solar' && powerDown(!!info?.restored));
  W.add({ update: () => !down && game.isWorldDown?.('solar') && powerDown(true) });

  // ================================================================ the HUD objective (guide.js asks this)
  const inBox = (p, x1, x2, z1, z2, y1 = -99, y2 = 99) => p.x >= Math.min(x1, x2) && p.x <= Math.max(x1, x2) && p.z >= Math.min(z1, z2) && p.z <= Math.max(z1, z2) && p.y >= y1 && p.y <= y2;
  const Y = '<b style="color:#ffd23a">', Rd = '<b style="color:#ff3344">', E = '</b>';
  level.solar = {
    sinker,
    receivers,
    get pad() {
      return pad;
    },
    ambush,
    objective(p) {
      if (game.isWorldDown?.('solar')) {
        if (inBox(p, -56, -110, -165, -219, 10)) return 'The engine is dark. Leave by the <b>south door</b> and take the causeway home.';
        return 'Solar is shut down. Follow the <b>Sunset Causeway</b> east to the Nexus balcony.';
      }
      if (!has(YELLOW)) {
        if (inBox(p, -38, -25, -114, -110)) return 'Head through to the <b>Sunward Overlook</b>.';
        if (inBox(p, -63, -38, -124, -105, 3.5)) return `Walk west through the ${Y}Sun Gate${E} and hop down the pillars.`;
        if (inBox(p, -58, -104, -72, -124, -14, 12) && p.z < -107.5) return `Shoot the ${Rd}red spikes${E}, then the ${Rd}red orb${E} to raise the bridge — cross before it fades.`;
        if (inBox(p, -58, -104, -72, -124, -14, 12)) return 'Hop south over the cracked stones — keep moving — and time the jump past the <b>sun lance</b>.';
        if (inBox(p, -74, -104, -42, -76.5)) return 'Clear the <b>Collector Yard</b>; the west door opens when it\'s quiet.';
        if (inBox(p, -104, -138, -47, -72)) {
          if (dialA.orientation !== 0 || dialB.orientation !== 0) return `Turn both ${Rd}sun discs${E} (shoot them) until their notches sit on the bridge.`;
          return `Shoot the ${Rd}door${E} on the ledge down, then ride the ${Rd}riser${E} up (keep shooting it) and get through.`;
        }
        if (inBox(p, -138, -150, -46, -124)) return 'Run north through the <b>Shade Slot</b> between the waves of sunlight.';
        if (inBox(p, -147, -196, -42, -124)) return `Hop down the ledges to the ${Y}YELLOW core${E} on the dais.`;
        return `Find the ${Y}SOLAR core${E}: west, down in the Sun Well.`;
      }
      if (inBox(p, -147, -196, -42, -124)) return ambush.state === 'cleared' ? 'Take the <b>north door</b> out of the well.' : `Survive the guardians — ${Y}yellow${E} breaks yellow (press <b>2</b>).`;
      if (inBox(p, -150, -194, -124, -162, -21, -5)) return pad ? 'Ride the <b>jump pad</b> in the east corner up to the terrace.' : `Wake both ${Y}receivers${E}: over the glass (north wall) and the bank shot off the mirror (east bay).`;
      if (inBox(p, -134, -154, -124, -166, -5, 2.6)) return `Shoot the rack's arrows (${Rd}red${E} / ${Y}yellow${E}) into a staircase up to the shelf.`;
      if (inBox(p, -104, -136, -124, -134, 2.6, 11)) return `Cross the chroma stones, switching ${Rd}red${E} / ${Y}yellow${E} as you jump; the pad on the landing throws you up.`;
      if (inBox(p, -104, -134, -134, -170, 11)) return 'Clear the <b>summit guard</b>, then take the hop pad at the north edge.';
      if (inBox(p, -104, -134, -170, -200, 5)) return 'Ride the pads north to the <b>Sun Court</b>.';
      if (inBox(p, -56, -110, -165, -219, 10)) return court.defeated ? `Shoot the ${Y}sun-lens${E} over the court with yellow to shut the engine down.` : 'Defeat <b>the Sphinx</b>: dodge its pounces from the pads, ride its back, blast its gems.';
      return `${Y}Yellow${E} in hand: follow the way north to the Sun Court.`;
    },
  };
}

// merge plain geometries (position/normal/uv, non-indexed or indexed) into one
function mergeBoxes(geos) {
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
