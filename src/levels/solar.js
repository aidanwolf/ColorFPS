// SOLAR — SUNSCORCH MESA, the yellow world: a looping canyon run outdoors under a huge, hot sun.
// See LAYOUT.md for its region and Hub ports. The loop, in order:
//  Hub west port (z -112, y 4) → Sunward Overlook (y 4, view over the canyon) → down the Scorch Canyon
//  over molten slag → Collector Yard (y -8, the first sun lances) → the Shade Slot (lances pour through
//  roof gaps in waves) → the Sun Well (spiral down to y -20: the YELLOW core)
//  → yellow door → Heliostat Hall (mirror puzzle powers a lift) → Solar Array Terrace (y -4)
//  → solar-panel lift and ledges up the Gnomon Mesa → jump pad to the summit (y 20.8)
//  → shielded red-over-yellow spike drop to y 12 → Sunset Causeway → Hub west balcony port (z -136, y 12).
// Sun lances (focused sunlight) incinerate on touch; molten slag does too.
import * as THREE from 'three';
import { RED, YELLOW, GREEN } from '../colors.js';
import { Barrier } from '../entities/barrier.js';
import { Drone } from '../entities/drone.js';
import { MovingPlatform, JumpPad, Checkpoint } from '../entities/misc.js';
import { Mirror, Glass, TargetPanel } from '../entities/puzzle.js';
import { boxOverlap } from '../world.js';
import { audio } from '../audio.js';

// where the sunlight comes from: west, a little north, 30° up (also the atmosphere's sunDir)
const SUN_DIR = [-0.85, 0.5, -0.12];
// the region (plus the Hub, whose west windows look out over it) — the sun only shows from here
const inSolar = (p) => (p.x < -31.5 && p.x > -201 && p.z < -38 && p.z > -232 && p.y > -32) || (p.x < 25 && p.z < -99.5 && p.z > -148.5 && p.y > 2);

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
class Sun {
  constructor(W, game) {
    this.game = game;
    this.dir = new THREE.Vector3(...SUN_DIR).normalize();
    this.fade = 1;
    this.dist = 470;
    const R = 66, S = 360;
    this.discMat = new THREE.ShaderMaterial({
      fog: false, transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uFade: { value: 1 } },
      vertexShader: `
        varying vec3 vN; varying float vMu;
        void main(){
          vN = normal;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vMu = clamp(dot(normalize(mat3(modelMatrix) * normal), normalize(cameraPosition - wp.xyz)), 0.0, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform float uTime, uFade; varying vec3 vN; varying float vMu;
        ${NOISE}
        void main(){
          vec3 n = normalize(vN);
          float churn = fbm(n * 3.5 + vec3(uTime * 0.03, -uTime * 0.025, uTime * 0.02));
          float cells = fbm(n * 11.0 - vec3(0.0, uTime * 0.07, uTime * 0.03));
          float t = churn * 0.6 + cells * 0.4;
          vec3 c = mix(vec3(1.5, 0.62, 0.12), vec3(1.75, 1.35, 0.72), smoothstep(0.38, 0.72, t));
          c = mix(vec3(1.1, 0.28, 0.03), c, pow(max(vMu, 1e-4), 0.4)); // the limb burns deeper orange
          gl_FragColor = vec4(c, uFade);
        }`,
    });
    this.disc = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 24), this.discMat);
    this.disc.renderOrder = 1;
    this.coronaMat = new THREE.ShaderMaterial({
      fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uSize: { value: (2 * S) / R } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uTime, uFade, uSize; varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * uSize; // in sun radii
          float r = length(p), ang = atan(p.y, p.x + 1e-5); // (atan(0, 0) is undefined: NaN would black out the bloom)
          float glow = exp(-max(r - 1.0, 0.0) * 2.0) * 0.8 + exp(-r * 0.45) * 0.22;
          float rays = pow(max(0.5 + 0.5 * sin(ang * 11.0 + sin(ang * 3.0 + uTime * 0.12) * 2.5), 0.0), 8.0)
                     + 0.6 * pow(max(0.5 + 0.5 * sin(ang * 23.0 - uTime * 0.05 + 1.3), 0.0), 14.0);
          float down = 0.25 + 0.75 * smoothstep(0.3, -0.9, sin(ang)); // the beams irradiate downward
          rays *= down * exp(-r * 0.2) * smoothstep(0.9, 1.7, r);
          vec3 col = vec3(1.0, 0.6, 0.24) * glow + vec3(1.0, 0.78, 0.42) * rays * 0.4;
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
    this.discMat.uniforms.uTime.value += dt;
    this.coronaMat.uniforms.uTime.value += dt;
    this.discMat.uniforms.uFade.value = this.fade;
    this.coronaMat.uniforms.uFade.value = this.fade;
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
    this.plateMat.color.setRGB(1, 0.36, 0.08).multiplyScalar(this.enabled ? 0.12 + 0.75 * heat : 0.04);
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

// Heat haze: faint, slowly boiling sheets of glow over the molten slag (one shared material).
const hazeMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uTime: { value: 0 } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }',
  fragmentShader: `
    uniform float uTime; varying vec3 vW;
    ${NOISE}
    void main(){
      float n = noise(vec3(vW.xz * 0.12, uTime * 0.2 + vW.y * 0.7));
      float m = noise(vec3(vW.xz * 0.45 + vec2(uTime * 0.25, -uTime * 0.18), vW.y * 2.0));
      float a = smoothstep(0.42, 0.9, n * 0.65 + m * 0.35) * 0.09;
      gl_FragColor = vec4(vec3(1.0, 0.42, 0.08) * a, 1.0);
    }`,
});
function heatHaze(W, x1, z1, x2, z2, y) {
  for (const dy of [0.7, 2.0, 3.8]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1, z2 - z1), hazeMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x1 + x2) / 2, y + dy, (z1 + z2) / 2);
    W.scene.add(m);
  }
}

// Molten slag kills (incinerates) on touch, sun lances hum, and dust motes drift up in the heat.
class SolarDirector {
  constructor(W, game) {
    this.world = W;
    this.game = game;
    this.slag = [];
    this.lances = [];
    this.moteT = 0;
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
          audio.acid();
          player.damage(1, 'quicksand');
          return;
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
    if (this.moteT > 0.07) {
      this.moteT = 0;
      const m = new THREE.Vector3(p.x + (Math.random() - 0.5) * 36, p.y - 1 + Math.random() * 9, p.z + (Math.random() - 0.5) * 36);
      this.world.fx.burst(m, Math.random() < 0.3 ? 0xff9a3a : 0xffd890, { count: 1, speed: 0.4, life: 3.2, size: 0.11, gravity: -0.35, drag: 0.4, spread: 1 });
    }
  }
}

export function buildSolar(B) {
  const { W, game, level, CH, GLOW, wallX, room, corridor, corridorX, plat, pedestal, secretRoom, trophy, shieldedShaft, hint, zoneTitle, area, light, barrierWall, barrierWallX, blocker, killZone, devStart } = B;
  const zone = 'yellow';
  const glow = GLOW[zone];
  const R = (x1, y1, z1, x2, y2, z2) => W.box(x1, y1, z1, x2, y2, z2, 'rock', zone);
  const M = (x1, y1, z1, x2, y2, z2) => W.box(x1, y1, z1, x2, y2, z2, 'metal', zone);
  const director = new SolarDirector(W, game);
  // molten slag: a glowing pool whose surface (top at y) incinerates on touch, with heat haze over it
  const slag = (x1, z1, x2, z2, y) => {
    R(x1, -30, z1, x2, y - 0.4, z2);
    director.slag.push(W.box(x1, y - 0.4, z1, x2, y, z2, 'acid', zone));
    heatHaze(W, x1, z1, x2, z2, y);
  };
  // sandstone strata: thin bands standing proud of a cliff face (decor, not ledges)
  const strata = (x1, z1, x2, z2, ys) => ys.forEach((y) => W.deco(x1, y, z1, x2, y + 0.5, z2, 'rock', zone));
  const lance = (o) => {
    const l = new SunLance(W, o);
    director.lances.push(l);
    return l;
  };
  // a collector lens housing over a lance: a metal block with a glowing rim round its aperture
  const housing = (x1, z1, x2, z2, y) => {
    M(x1 - 0.3, y, z1 - 0.3, x2 + 0.3, y + 0.8, z2 + 0.3);
    const t = 0.12, b = y - 0.05;
    W.deco(x1, b, z1, x2, y, z1 + t, glow, zone);
    W.deco(x1, b, z2 - t, x2, y, z2, glow, zone);
    W.deco(x1, b, z1, x1 + t, y, z2, glow, zone);
    W.deco(x2 - t, b, z1, x2, y, z2, glow, zone);
  };
  // a heliostat: a post holding a mirror panel that faces the sun (it really reflects shots)
  const heliostat = (x, y, z, alongZ = true) => {
    M(x - 0.18, y, z - 0.18, x + 0.18, y + 2.2, z + 0.18);
    if (alongZ) new Mirror(W, { min: [x - 0.06, y + 2.2, z - 1.4], max: [x + 0.06, y + 4.0, z + 1.4] });
    else new Mirror(W, { min: [x - 1.4, y + 2.2, z - 0.06], max: [x + 1.4, y + 4.0, z + 0.06] });
  };
  const mood = { music: 'music_solar', ambient: 'amb_solar', atmosphere: 'solar' };
  const ck = (pos, yaw, size) => new Checkpoint(W, game, { pos, yaw, size });

  new Sun(W, game);
  level.atmospheres.solar = {
    fog: 0xc8884a, fogNear: 80, fogFar: 460,
    skyTop: [0.3, 0.19, 0.1], skyMid: [0.72, 0.4, 0.15], skyHorizon: [0.92, 0.6, 0.3], aurora: 0, stars: 0,
    hemiSky: 0xffd9a8, hemiGround: 0x5a3420, hemiIntensity: 0.8,
    sunColor: 0xffd29a, sunIntensity: 2.7, sunDir: SUN_DIR,
    exposure: 0.95, bloom: 0.35,
  };

  // ================================================================ ENTRY — from the Hub's west port
  corridorX({ xStart: -25, xEnd: -38, y: 4, zone, cz: -112 });
  R(-38, -24.4, -124, -32, 3, -100); // bedrock under the port, with boulders either side of the corridor
  R(-38, 3, -110, -32, 8, -100);
  R(-38, 3, -124, -32, 8, -114);
  M(-31, -6, -113, -28, 3, -111); // a strut under the corridor in the gap
  area([-30, 4, -113.5], [-27, 7.2, -110.5], mood);
  devStart('solar', [-27, 4, -112], Math.PI / 2, [RED]);

  // ================================================================ SUNWARD OVERLOOK (y 4)
  // A sandstone shelf high over the Scorch Canyon. The canyon floor is molten slag.
  slag(-86, -124, -38, -40, -14);
  R(-56, -14, -124, -38, 4, -100);
  R(-56, 4, -124, -55.4, 4.9, -100); // low lip along the drop
  R(-56, 4, -100.6, -46, 4.9, -100);
  zoneTitle([-40, 4, -114], [-38, 8, -110], 'SOLAR', 'SUNSCORCH MESA', '#ffd23a', 'music_solar');
  area([-44, 4, -116], [-38, 8, -108], mood);
  ck([-44, 4, -112], Math.PI / 2, [6, 3, 8]);
  heliostat(-51, 4, -106);
  heliostat(-51, 4, -118);
  M(-49, 4, -114, -45.6, 4.25, -111.6); // a toppled panel
  hint([-56, 4, -104], [-46, 7, -100], 'The canyon floor is <b>quicksand</b>. One wrong step and it swallows you.', 4);

  // SECRET 1 — the Sunshade Grotto, behind a green door in the mesa wall (come back after Verdant)
  R(-62, -24.4, -132, -38, 4, -124);
  R(-62, 4, -132, -50.5, 9, -124);
  R(-43.5, 4, -132, -38, 9, -124);
  R(-50.5, 4, -132, -43.5, 9, -131);
  R(-50.5, 7.5, -131, -43.5, 9, -124.5);
  R(-50.5, 4, -124.5, -48.2, 7.5, -124);
  R(-45.8, 4, -124.5, -43.5, 7.5, -124);
  R(-48.2, 7, -124.5, -45.8, 7.5, -124);
  new Barrier(W, { min: [-48.2, 4, -124.5], max: [-45.8, 7, -124], color: GREEN, kind: 'door', zone });
  trophy(-47, 5, -128.5);
  light(-47, 6.8, -128.5, 0x9dffb8, 8, 9);
  secretRoom([-50.5, 4, -131], [-43.5, 7.5, -124.5], 'Sunshade Grotto');

  // ================================================================ SCORCH CANYON — the way down
  // rubble steps back up to the overlook, then a ledge along the east wall behind a red gate
  R(-45, -14, -100, -38, 0, -86);
  R(-45, 0, -98, -43, 1.1, -96);
  R(-42.5, 0, -99.5, -40.5, 2.3, -97.5);
  R(-40, 0, -100, -38, 3.3, -98);
  R(-38, -14.4, -100, -34, 6, -40); // canyon east wall (low: the Hub's windows look over it)
  R(-90, -14.4, -44, -34, 8, -40); // south wall
  R(-90, -14.4, -124, -86, 8, -55); // west wall, split by the Shade Slot
  R(-90, -14.4, -49, -86, 10, -40);
  R(-90, -24.4, -126, -62, -14, -124); // where the canyon spills into the Rift
  // a ruined gate across the ledge
  R(-47, 0, -90.6, -45, 6, -89.4);
  M(-47, 5, -90.6, -38, 6, -89.4);
  W.deco(-45, 4.9, -90.65, -38, 5, -89.35, glow, zone);
  new Barrier(W, { min: [-45, 0, -90.2], max: [-38, 5, -89.8], color: RED, kind: 'wall', zone });
  // hoodoo pillar, then a fallen collector panel bristling with red spikes, then the yard
  R(-43.5, -14, -82, -39, -1.5, -78);
  R(-49, -14, -74, -47, -3.6, -72);
  plat(-50, -75, -46, -71, -3, zone);
  new Barrier(W, { min: [-50, -3, -75], max: [-46, -2.4, -71], color: RED, kind: 'spike', regen: 4, zone });
  new Drone(W, { pos: [-60, 3, -92], color: RED, range: 24 });

  // ================================================================ COLLECTOR YARD (y -8)
  R(-56, -14, -66, -38, -8, -44); // east yard
  R(-86, -14, -58, -56, -8, -44); // south strip: the gauntlet and the west yard
  R(-86, -14, -66, -78, -8, -58);
  area([-56, -8, -66], [-38, -4, -56], mood);
  ck([-48, -8, -61], Math.PI / 2, [8, 3, 6]);
  hint([-56, -8, -66], [-38, -4, -58], 'Focused <b>sun lances</b> incinerate on contact. Wait in the gaps while they <b>cool</b>.', 6);
  // the collector tower: it used to drink the sun
  M(-46, -8, -52, -42, 10, -48);
  M(-47.5, 10, -53.5, -40.5, 13, -46.5);
  W.deco(-47.6, 11.2, -53.6, -40.4, 11.5, -46.4, glow, zone);
  W.deco(-46.05, -8, -52.05, -45.9, 10, -51.9, glow, zone);
  W.deco(-42.1, -8, -48.1, -41.95, 10, -47.95, glow, zone);
  heliostat(-40, -8, -58);
  heliostat(-40, -8, -64);
  // the gauntlet: rubble walls and three lances firing in a westward wave
  R(-78, -8, -48, -58, -4, -44);
  R(-78, -8, -58, -58, -4, -56);
  for (const [i, x] of [-62, -68, -74].entries()) {
    M(x - 0.3, -4, -48, x + 0.3, 1, -47.4);
    M(x - 0.3, -4, -56.6, x + 0.3, 1, -56);
    housing(x - 1.2, -56, x + 1.2, -48, 1);
    lance({ min: [x - 1.2, -8, -56], max: [x + 1.2, 1, -48], period: 3.6, on: 1.5, warn: 0.6, phase: -1.2 * i });
  }
  // west yard: a red gate into the Shade Slot
  new Barrier(W, { min: [-88.2, -8, -55], max: [-87.8, -3, -49], color: RED, kind: 'wall', zone });
  new Drone(W, { pos: [-50, -2, -54], color: RED, range: 22 });
  new Drone(W, { pos: [-82, -3, -61], color: RED, range: 22 });

  // ================================================================ THE SHADE SLOT (y -8)
  // A slot canyon roofed by an old lens array. Sunlight lances down through the gaps in waves; the
  // roofed stretches between them are safe shade.
  R(-146, -14.4, -55, -86, -8, -49);
  R(-146, -8, -49, -90, 10, -45);
  R(-146, -8, -59, -112.6, 10, -55);
  R(-111.4, -8, -59, -90, 10, -55);
  R(-112.6, -7, -59, -111.4, 10, -55); // a crawl hole under here (secret)
  R(-112.6, -14.4, -59, -111.4, -8, -55);
  area([-94, -8, -55], [-90, -4, -49], mood);
  ck([-93, -8, -52], Math.PI / 2, [4, 3, 6]);
  hint([-96, -8, -55], [-90, -4, -49], 'Keep to the <b>shade</b>: the lances pour through the roof in waves.', 5);
  const roofs = [[-90, -96], [-99, -105], [-108, -114], [-117, -123], [-126, -132]];
  for (const [a, b] of roofs) {
    R(b, -3, -55, a, -2.2, -49);
    W.deco(b, -3.06, -55, a, -3, -54.8, glow, zone);
    W.deco(b, -3.06, -49.2, a, -3, -49, glow, zone);
  }
  [-97.5, -106.5, -115.5, -124.5].forEach((x, i) => lance({ min: [x - 1.5, -8, -55], max: [x + 1.5, 10, -49], period: 3.2, on: 1.7, warn: 0.6, phase: -0.8 * i }));
  // red spikes carpet the slot's end: shoot them, then run
  new Barrier(W, { min: [-140, -8, -55], max: [-134, -7.4, -49], color: RED, kind: 'spike', regen: 4, zone });
  new Drone(W, { pos: [-141, -3, -52], color: RED, orbit: 0.8, range: 20 });

  // SECRET 2 — the Sunken Cache, through a crawl hole in the slot's north wall (under a roof)
  W.deco(-112.8, -7, -55.05, -111.2, -6.8, -55, 'hazard', zone);
  W.deco(-112.75, -8, -55.05, -112.6, -7, -55, 'hazard', zone);
  W.deco(-111.4, -8, -55.05, -111.25, -7, -55, 'hazard', zone);
  R(-117, -14.4, -65, -107, -8, -59);
  R(-117, -8, -65, -116, -5, -59);
  R(-108, -8, -65, -107, -5, -59);
  R(-117, -8, -65, -107, -5, -64);
  R(-117, -5, -65, -107, -4, -59);
  trophy(-112, -7, -61.5);
  light(-112, -5.6, -61.5, 0xffcc55, 8, 8);
  secretRoom([-116, -8, -64], [-108, -5, -59], 'Sunken Cache');
  // the mesa shelf around it (y 2), between the canyon and the Sun Well
  R(-146, -14.4, -124, -90, 2, -65);
  R(-146, -14.4, -65, -117, 2, -59);
  R(-107, -14.4, -65, -90, 2, -59);
  R(-117, -4, -65, -107, 2, -59);

  // ================================================================ THE SUN WELL (down to y -20)
  // A deep, sun-flooded pit: ledges spiral down to a pillar where the yellow core blazes. Its west rim
  // is low, so the sun hangs right over it.
  R(-154, -26, -58, -146, -8, -47); // entry ledge
  R(-150, -26, -100, -146, 6, -58);
  R(-150, -8, -58, -146, 6, -55);
  R(-150, -8, -49, -146, 6, -46);
  R(-194, -26, -46, -146, 6, -42);
  wallX(-104, -100, -194, -146, -26, 6, [{ c: -166, w: 3, y0: -20, h: CH }], zone, 'rock');
  R(-194, -26, -100, -190, -10, -46);
  slag(-190, -100, -150, -46, -24);
  area([-154, -8, -58], [-146, -4, -47], mood);
  ck([-151, -8, -52], Math.PI / 2, [6, 3, 8]);
  hint([-154, -8, -58], [-150, -4, -47], 'A <b>chroma core</b> blazes at the bottom of the Sun Well.', 4);
  R(-162, -26, -52, -157, -10, -47);
  R(-170, -26, -52, -165, -12, -47);
  new Barrier(W, { min: [-170, -12, -52], max: [-165, -11.4, -47], color: RED, kind: 'spike', regen: 4, zone });
  R(-180, -26, -54, -174, -14, -48);
  R(-186, -26, -62, -181, -15.5, -57);
  R(-184, -26, -71, -179, -17, -66);
  R(-176.5, -26, -74, -173.5, -18.5, -71);
  R(-170, -26, -84, -162, -20, -74); // the pillar
  R(-167.5, -26, -100, -164.5, -20, -84); // causeway to the (yellow) north door
  W.deco(-170.05, -20.3, -84.05, -161.95, -20.2, -73.95, glow, zone);
  new Drone(W, { pos: [-172, -6, -66], color: RED, range: 24 });
  pedestal(-166, -20, -78, YELLOW, zone);
  ck([-166, -20, -82.5], 0, [6, 3, 3]);
  devStart('solar2', [-166, -20, -82.5], 0, [RED, YELLOW]);

  // ================================================================ SECOND HALF — yellow + red
  // the north door, then a tunnel of alternating barriers
  barrierWall(-102, -20, YELLOW, zone, CH, -166);
  corridor({ zStart: -104, zEnd: -124, y: -20, zone, cx: -166 });
  hint([-167.5, -20, -107], [-164.5, -17, -104], 'Switch colors with <b>1</b>/<b>2</b>, <b>Q</b>/<b>E</b> or the <b>mouse wheel</b>. <b>F</b> swaps back.', 5);
  [[-107, RED], [-110, YELLOW], [-113, YELLOW], [-116, RED], [-119, YELLOW]].forEach(([z, c]) => barrierWall(z, -20, c, zone, CH, -166));
  // the mesa shelf (y -4) the Heliostat Hall is sunk into
  R(-194, -30, -123.5, -168, -4, -104);
  R(-164, -30, -123.5, -146, -4, -104);
  R(-168, -16.3, -123.5, -164, -4, -104);
  R(-168, -30, -123.5, -164, -21, -104);
  R(-194, -30, -150.5, -184.5, -4, -123.5);
  R(-184.5, -30, -150.5, -147.5, -21, -123.5);
  R(-184.5, -30, -155, -168, -4, -150.5);
  R(-164, -30, -155, -147.5, -4, -150.5);
  R(-168, -15.8, -155, -164, -4, -150.5);
  R(-168, -30, -155, -164, -21, -150.5);
  R(-194, -30, -170, -147.5, -4, -155);
  // broken solar panel rows on the shelf
  for (let k = 0; k < 4; k++) {
    const x = -186 + k * 9;
    M(x, -4, -166, x + 6, -3.2, -158);
    W.deco(x - 0.02, -3.3, -166.02, x + 6.02, -3.22, -157.98, glow, zone);
  }

  // ================================================================ HELIOSTAT HALL (y -20)
  // PUZZLE: the lift is dead. Its receiver sits behind glass in the north wall, open above; the mirror
  // ceiling and sides carry a yellow shot fired over the glass down onto the target.
  room({ x1: -184, x2: -148, zS: -124, zN: -150, y: -20, h: 16, zone, ceiling: false, s: [{ c: -166, w: 3, h: CH }], n: [{ c: -166, w: 3.2, h: 4 }] });
  area([-168, -20, -128], [-164, -16, -124], mood);
  ck([-166, -20, -127.5], 0, [6, 3, 3]);
  hint([-172, -20, -132], [-160, -16, -124], 'The lift is dead. Its receiver sits behind glass: <b>fire yellow over the glass</b> and let the mirrors carry it down.', 7);
  const lift1 = new MovingPlatform(W, { min: [-151.4, -20.6, -139], max: [-148.4, -20, -136], offset: [0, 16, 0], speed: 4, pause: 1.6, active: false, zone });
  W.deco(-148.06, -20, -137.9, -148, -4, -137.1, 'hazard', zone); // the lift's rail
  {
    const x1 = -167.6, x2 = -164.4, zf = -150, zb = -154.5, y = -20, top = -16, gt = -17.4;
    M(x1 - 0.2, y, zb - 0.2, x1, top + 0.2, zf);
    M(x2, y, zb - 0.2, x2 + 0.2, top + 0.2, zf);
    M(x1 - 0.2, y, zb - 0.2, x2 + 0.2, top + 0.2, zb);
    M(x1 - 0.2, top, zb - 0.2, x2 + 0.2, top + 0.2, zf);
    new Glass(W, { min: [x1, y, zf - 0.1], max: [x2, gt, zf] });
    W.deco(x1, gt, zf - 0.15, x2, gt + 0.06, zf + 0.05, glow, zone);
    new Mirror(W, { min: [x1, top - 0.15, zb], max: [x2, top, zf - 0.1] });
    new Mirror(W, { min: [x1, y, zb + 0.2], max: [x1 + 0.1, top - 0.15, zf - 0.1] });
    new Mirror(W, { min: [x2 - 0.1, y, zb + 0.2], max: [x2, top - 0.15, zf - 0.1] });
    let on = false;
    const power = () => {
      if (on) return;
      on = true;
      lift1.active = true;
      audio.sample('elevator_start', { gain: 0.7 });
      game.hud.message('Lift online!', 2.5);
    };
    const panels = [
      new TargetPanel(W, { min: [x1 + 0.1, y, zb + 0.2], max: [x2 - 0.1, y + 0.12, zf - 0.1], color: YELLOW, face: 'up', onActivate: power }),
      new TargetPanel(W, { min: [x1 + 0.1, y + 0.12, zb], max: [x2 - 0.1, top - 0.15, zb + 0.2], color: YELLOW, face: '+z', onActivate: power }),
    ];
    panels.forEach((p) => (p.group = panels));
  }
  heliostat(-178, -20, -131, false);
  heliostat(-178, -20, -143);
  heliostat(-156, -20, -130, false);
  new Drone(W, { pos: [-176, -12, -140], color: [RED, YELLOW], range: 24, cycle: 2.4 });
  new Drone(W, { pos: [-157, -12, -145], color: YELLOW, range: 24 });

  // ================================================================ SOLAR ARRAY TERRACE (y -4 … -3)
  // Over the Rift: a rock shelf, a spiked panel, then a long ledge at the foot of the Gnomon Mesa.
  slag(-147.5, -205, -36, -124, -24);
  slag(-194, -205, -147.5, -170, -24);
  R(-147.5, -24, -150, -138, -4, -128);
  area([-147.5, -4, -146], [-142, 0, -130], mood);
  ck([-143, -4, -137.5], -Math.PI / 2, [6, 3, 6]);
  R(-135, -24, -141, -131, -3.5, -136);
  new Barrier(W, { min: [-135, -3.5, -141], max: [-131, -2.9, -136], color: YELLOW, kind: 'spike', regen: 3, zone });
  R(-128, -24, -170, -118, -3, -128);
  hint([-128, -3, -136], [-118, 1, -128], '<b>Solar panels</b> still wake the old machinery. Feed them <b style="color:#ffd23a">YELLOW</b>.', 6);
  housing(-128, -151.2, -118, -148.8, 7);
  lance({ min: [-128, -3, -151.2], max: [-118, 7, -148.8], period: 3.4, on: 1.5, warn: 0.6 });
  const lift2 = new MovingPlatform(W, { min: [-121.5, -3.6, -168.5], max: [-118.5, -3, -165.5], offset: [0, 11, 0], speed: 3.2, pause: 1.6, active: false, zone });
  new TargetPanel(W, {
    min: [-118.25, -0.5, -161.5], max: [-118, 3.5, -157.5], color: YELLOW, face: '-x',
    onActivate: () => {
      lift2.active = true;
      audio.sample('elevator_start', { gain: 0.7 });
      game.hud.message('Lift online!', 2.5);
    },
  });
  new Drone(W, { pos: [-134, 2, -147], color: YELLOW, range: 24 });

  // ================================================================ GNOMON MESA
  // ledges up its north face (yellow spikes, a lance), a jump pad to the summit and its great sundial
  R(-118, -24.4, -162, -98, 20.8, -132);
  R(-118, 3, -167, -112, 8, -162);
  ck([-115, 8, -164.5], -Math.PI / 2, [5, 3, 4]);
  R(-109, 4, -166.5, -105, 9.2, -162);
  new Barrier(W, { min: [-109, 9.2, -166.5], max: [-105, 9.8, -162], color: YELLOW, kind: 'spike', regen: 3, zone });
  R(-102, 5, -166.5, -98, 10.4, -162);
  housing(-102, -166.5, -98, -162, 16);
  lance({ min: [-102, 10.4, -166.5], max: [-98, 16, -162], period: 3.0, on: 1.2, warn: 0.6 });
  R(-95, -24.4, -166, -88, 11.6, -154);
  new JumpPad(W, { pos: [-91.5, 11.6, -158], power: 24, push: [-7, 0, 0], color: 0xffd23a });
  hint([-95, 11.6, -166], [-88, 15, -154], 'Jump pad: ride it up to the <b>summit</b>.', 3);
  new Drone(W, { pos: [-108, 15, -173], color: [RED, YELLOW], range: 22, cycle: 2.6 });
  // the summit (y 20.8): the gnomon obelisk and its dial
  M(-110, 20.8, -152, -106, 50, -148);
  M(-109.4, 50, -151.4, -106.6, 54, -148.6);
  for (const y of [28, 36, 44]) W.deco(-110.05, y, -152.05, -105.95, y + 0.3, -147.95, glow, zone);
  W.deco(-109.45, 53.6, -151.45, -106.55, 54.05, -148.55, glow, zone);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2, cx = -108 + Math.cos(a) * 7.5, cz = -150 + Math.sin(a) * 7.5;
    W.deco(cx - 0.35, 20.8, cz - 0.35, cx + 0.35, 20.86, cz + 0.35, glow, zone);
  }
  heliostat(-114, 20.8, -140);
  heliostat(-114, 20.8, -158);
  heliostat(-102, 20.8, -147, false);
  R(-98.6, 20.8, -162, -98, 21.4, -138.6); // lips either side of the drop
  R(-98.6, 20.8, -133.4, -98, 21.4, -132);
  area([-104, 20.8, -162], [-98, 25, -152], mood);
  ck([-101, 20.8, -141], -Math.PI / 2, [6, 3, 6]);
  hint([-100, 20.8, -140], [-98, 24, -132], 'Shields stop your shots, not you. Drop through each one, then fire: <b style="color:#ff3344">RED</b> · <b style="color:#ffd23a">YELLOW</b>', 7);
  new Drone(W, { pos: [-113, 25, -140], color: YELLOW, range: 22 });

  // the drop: red over yellow spikes, down to the causeway level (y 12)
  plat(-97, -138, -93, -134, 12, zone);
  shieldedShaft({
    x1: -97, x2: -93, z1: -138, z2: -134, floor: 12, capY: 20.3, zone,
    cap: { x1: -98.2, x2: -92, z1: -139, z2: -133 },
    layers: [{ y: 17.0, color: RED }, { y: 13.5, color: YELLOW, shieldY: 16.8 }],
  });
  corridorX({ xStart: -93, xEnd: -86, y: 12, zone, cz: -136 });
  ck([-90, 12, -136], -Math.PI / 2, [3, 3, 3]); // in the hall, clear of the spikes regrowing overhead
  W.box(-87, 15.7, -140, -86, 26, -132, 'wall', zone); // a gatehouse: no leaping from the summit to the causeway
  W.deco(-87.05, 25.6, -140, -87, 25.8, -132, glow, zone);

  // ================================================================ SUNSET CAUSEWAY (y 12) → Hub
  plat(-86, -137.5, -38, -134.5, 12, zone, 1.0);
  M(-86, 12, -137.5, -38, 13, -137.3);
  M(-86, 12, -134.7, -38, 13, -134.5);
  for (const x of [-80, -68, -56, -44]) M(x - 0.6, -24, -137, x + 0.6, 11, -135);
  area([-86, 12, -137.5], [-82, 15, -134.5], mood);
  const gate = (x) => {
    M(x - 0.4, 9, -140.5, x + 0.4, 17.5, -137.5);
    M(x - 0.4, 9, -134.5, x + 0.4, 17.5, -131.5);
    M(x - 0.4, 16.7, -137.5, x + 0.4, 17.5, -134.5);
    W.deco(x - 0.45, 17.1, -140.5, x + 0.45, 17.25, -131.5, glow, zone);
  };
  gate(-78);
  barrierWallX(-78, 12, YELLOW, zone, -136, 4.7);
  gate(-66);
  barrierWallX(-66, 12, RED, zone, -136, 4.7);
  // a lance across the deck, fed through a yellow lens on its housing: shoot the lens to shut it off
  gate(-54);
  M(-55.5, 16.7, -138, -52.5, 18, -134);
  const deckLance = lance({ min: [-55.2, 12, -137.5], max: [-52.8, 16.7, -134.5] });
  new TargetPanel(W, {
    min: [-55.7, 16.8, -137.2], max: [-55.5, 17.9, -134.8], color: YELLOW, face: '-x',
    onActivate: () => {
      deckLance.enabled = false;
      game.hud.message('Lance offline.', 2);
    },
  });
  hint([-62, 12, -137.5], [-59, 15, -134.5], 'That lance is fed through a <b>yellow lens</b> above it. Shoot the lens out.', 5);
  gate(-44);
  barrierWallX(-44, 12, YELLOW, zone, -136, 4.7);
  new Drone(W, { pos: [-72, 16.5, -131], color: [RED, YELLOW], range: 22, cycle: 2.2 });
  new Drone(W, { pos: [-50, 16.5, -141], color: YELLOW, range: 22 });
  // the return port: a short hall onto the Hub's west balcony
  corridorX({ xStart: -25, xEnd: -38, y: 12, zone, cz: -136 });
  M(-37, -24, -137, -33, 11, -135);
  M(-31, 2, -137, -28, 11, -135);
  area([-38, 12, -137.5], [-30, 15.2, -134.5], mood);

  // ================================================================ SCENERY
  // the Rift's east rim, closing the world off beside the Hub
  R(-36, -24.4, -205, -32, 10, -140);
  // distant mesas on the north and west horizons (the west side stays low where the sun sets over the Well)
  for (const [xa, xb, top] of [[-36, -62, 9], [-62, -92, 30], [-92, -124, 44], [-124, -152, 27], [-152, -178, 52], [-178, -199.5, 36]]) {
    R(xb, -24.4, -228, xa, top, -206);
    if (top > 20) R(xb + 4, top, -224, xa - 4, top + 6, -210);
  }
  for (const [za, zb, top] of [[-104, -130, 34], [-130, -160, 48], [-160, -206, 40]]) {
    R(-199.5, -30, zb, -196, top, za);
    R(-199.5, top, zb + 5, -197, top + 5, za - 5);
  }
  R(-199.5, -30, -104, -196, -6, -40);
  // strata on the big cliff faces
  strata(-86, -124, -85.7, -55, [-4, 2.5]); // canyon west wall
  strata(-38.3, -86, -38, -44, [-3, 2]); // canyon east wall
  strata(-118.3, -162, -118, -132, [6, 14]); // Gnomon Mesa
  strata(-98, -162, -97.7, -140, [4, 15]);
  strata(-118, -132, -98, -131.7, [5, 14]);
  strata(-118, -162.3, -98, -162, [14.5, 18]);
  strata(-150.3, -100, -150, -58, [-14, -2]); // Sun Well
  strata(-190, -100, -150, -99.7, [-14, -2]);
  strata(-190, -46.3, -150, -46, [-14, -2]);
  strata(-196.3, -206, -196, -104, [-2, 10, 22]); // horizon mesas
  strata(-199.5, -206.3, -36, -206, [-4, 6, 18]);

  // ================================================================ SEALS (invisible)
  // The canyon is open to the sky: invisible walls stand on the rims and wall tops you could otherwise
  // jump onto (from the overlook, a heliostat or the causeway) and walk off along into the scenery.
  const SKY = 40;
  blocker([-38, 7.5, -132], [-25, SKY, -100]); // the bedrock either side of the entry corridor, and its roof
  blocker([-62, 7.5, -132], [-38, SKY, -124]); // the grotto's rock
  blocker([-38, 6, -100], [-34, SKY, -40]); // canyon east wall
  // the Sunset Causeway: over the railings on both sides
  blocker([-86, 12, -137.6], [-38, SKY, -137.3]);
  blocker([-86, 12, -134.7], [-38, SKY, -134.4]);
  // the summit's south edge (a leap off it carries you over to the canyon's west wall; the east edge stays
  // open: the jump pad lands you over it)
  blocker([-118.5, 20.8, -132], [-98, SKY, -131.4]);
  // the summit drop: its landing is open on three sides
  blocker([-98, 12, -140.5], [-86, SKY, -138.6]);
  blocker([-98, 12, -133.4], [-86, SKY, -131.5]);
  blocker([-93, 15.7, -138.6], [-87, SKY, -133.4]);
  // the Solar Array Terrace: off its sides lies the shelf the Heliostat Hall is sunk into (open only
  // where the lift tops out)
  blocker([-148, -4, -150.5], [-147.5, SKY, -139.5]);
  blocker([-148, -4, -135.5], [-147.5, SKY, -123.5]);
  blocker([-147.5, -4, -150.5], [-138, SKY, -150]);
  blocker([-147.5, -4, -128], [-138, SKY, -127.5]);
  // anything that still falls out of the world dies before it lands on the scenery's footings
  killZone([-201, -40, -232], [-31.5, -30.5, -38]);
}
