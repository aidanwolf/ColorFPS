// Armor: a pickup that wraps you in a one-hit shield. While you wear it, the next enemy hit (a shot, a
// bite, a blast, a flame) shatters the shield instead of killing you, with a moment of grace after.
// Hazards still kill (lava, sludge, quicksand, spikes, drowning, falls): it's armor, not a parachute.
// Placed off the main line in arenas, so agile players who explore get a second chance.
//
// The look is one idea throughout: a sphere of glowing hexagons. The pickup is a small hex globe; wearing
// it puts a hex bubble round your head (you see its cells round the edge of the view); a hit blows the
// bubble apart into hex shards flying out past you.
import * as THREE from 'three';
import { audio } from '../audio.js';

export const ARMOR_COLOR = 0x7ff6ff;
// causes the shield doesn't stop
// (lava and the other molten/acid pools, and a boss's stomps and charges, do break a shield)
export const ARMOR_IGNORES = new Set(['spike', 'landing', 'fall', 'drown', 'sand', 'quicksand', 'crush', 'void']);

// A hexagon grid laid over a sphere (by its own direction, so it sits still on the surface as it turns).
// outside: lit at the rim (fresnel), seen from without. inside: seen from the centre, it fades out toward
// the middle of the view so only the edges of the screen carry the cells.
function hexMaterial({ inside = false, cols = 28, rows = 9 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(ARMOR_COLOR) }, uAlpha: { value: 1 }, uFlash: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir; varying vec3 vView; varying vec3 vN;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = mv.xyz;
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uAlpha, uFlash; uniform vec3 uColor;
      varying vec3 vDir; varying vec3 vView; varying vec3 vN;
      float hexD(vec2 p) { p = abs(p); return max(dot(p, vec2(0.5, 0.8660254)), p.x); }
      void main() {
        vec2 p = vec2(atan(vDir.z, vDir.x) / 6.2831853 * ${cols.toFixed(1)}, acos(clamp(vDir.y, -1.0, 1.0)) / 3.1415927 * ${rows.toFixed(1)} * 1.7320508);
        vec2 r = vec2(1.0, 1.7320508), h = r * 0.5;
        vec2 a = mod(p, r) - h, b = mod(p - h, r) - h;
        vec2 gv = dot(a, a) < dot(b, b) ? a : b;
        vec2 id = p - gv;
        float edge = 0.5 - hexD(gv);
        float line = smoothstep(0.07, 0.0, edge);
        float cellNoise = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
        float shimmer = 0.5 + 0.5 * sin(uTime * 2.4 + cellNoise * 6.2831 - vDir.y * 4.0);
        ${inside
          ? `float c = dot(normalize(vView), vec3(0.0, 0.0, -1.0));
        float vis = pow(smoothstep(0.9, 0.62, c), 1.6);`
          : `float vis = 0.35 + 0.65 * pow(1.0 - abs(dot(normalize(vN), normalize(-vView))), 1.6);`}
        float a1 = line * (0.55 + 0.45 * shimmer) + (0.03 + 0.06 * shimmer * shimmer) * (1.0 - line);
        vec3 col = uColor * (1.4 + 1.6 * line) + vec3(1.0) * uFlash;
        gl_FragColor = vec4(col * a1 * vis * uAlpha, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: !inside,
    side: inside ? THREE.BackSide : THREE.DoubleSide,
  });
}

let shared = null;
function parts() {
  if (shared) return shared;
  shared = {
    globe: new THREE.IcosahedronGeometry(0.42, 5),
    globeMat: hexMaterial({ cols: 14, rows: 5 }),
    core: new THREE.OctahedronGeometry(0.11, 0),
    coreMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(ARMOR_COLOR).multiplyScalar(2.6) }),
    halo: new THREE.MeshBasicMaterial({ color: ARMOR_COLOR, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
    metal: new THREE.MeshStandardMaterial({ color: 0x2a3140, metalness: 0.8, roughness: 0.35 }),
    base: new THREE.CylinderGeometry(0.55, 0.65, 0.12, 6),
    ring: new THREE.RingGeometry(0.62, 0.72, 6),
  };
  return shared;
}

export class ArmorPickup {
  // pos: a point on the floor (the globe floats above it). respawn: seconds until it's back after being
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
    this.globe = new THREE.Mesh(P.globe, P.globeMat);
    this.core = new THREE.Mesh(P.core, P.coreMat);
    this.emblem.add(this.globe, this.core);
    this.pad = pad;
    this.group.add(this.emblem);
    if (withBase) this.group.add(base, pad); // (no plinth when it floats over a hazard: it isn't a platform)
    world.scene.add(this.group);
    world.add(this);
  }

  update(dt, player) {
    this.t += dt;
    parts().globeMat.uniforms.uTime.value = this.t;
    if (this.taken) {
      if (this.respawn > 0 && (this.timer -= dt) <= 0) this.restore(true);
      return;
    }
    this.globe.rotation.y += dt * 0.9;
    this.core.rotation.y -= dt * 2.5;
    this.core.rotation.x += dt * 1.3;
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
    audio.sample(audio.sfxOr('armor_pickup', 'secret'), { gain: 0.9, rate: 1.1 });
    audio.sample(audio.sfxOr('armor_on', 'charge_up'), { gain: 0.85, delay: 0.12 });
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

// The shield you wear: a hex bubble centred on the camera (drawn last, over everything, fading toward the
// middle of the view), and the shards it bursts into when a hit breaks it.
const SHARDS = 48;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _sc = new THREE.Vector3();
export class ShieldFx {
  // scene: the world (for the shards); viewCam: the view-model camera, so the bubble draws over the gun
  constructor(scene, viewCam) {
    this.mat = hexMaterial({ inside: true, cols: 110, rows: 34 });
    this.bubble = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 5), this.mat);
    this.bubble.frustumCulled = false;
    this.bubble.renderOrder = 999;
    this.bubble.visible = false;
    this.bubble.userData.noBatch = this.bubble.userData.noCull = true;
    this.bubble.raycast = () => {};
    // it rides the view-model camera, drawn after (and over) the gun
    viewCam.add(this.bubble);
    this.shardMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ARMOR_COLOR).multiplyScalar(2.2), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const hex = new THREE.RingGeometry(0.035, 0.05, 6).rotateZ(Math.PI / 6);
    this.shards = new THREE.InstancedMesh(hex, this.shardMat, SHARDS);
    this.shards.frustumCulled = false;
    this.shards.visible = false;
    this.shards.renderOrder = 999;
    this.shards.userData.noBatch = this.shards.userData.noCull = true;
    this.shards.raycast = () => {};
    scene.add(this.shards);
    this.parts = Array.from({ length: SHARDS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() }));
    this.t = 0;
    this.on = false;
    this.gain = 0; // the pop when it comes up
    this.burstT = 0; // > 0 while shards fly
  }

  set(on) {
    if (on && !this.on) this.gain = 1;
    this.on = on;
    this.bubble.visible = on;
  }

  // blow it apart from the camera: shards fly out across the view and past you
  shatter(camera) {
    this.set(false);
    this.burstT = 0.75;
    this.shards.visible = true;
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    for (const s of this.parts) {
      // mostly in front of you so you see them go, some all round
      const d = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      if (Math.random() < 0.7) d.addScaledVector(fwd, 1.2).normalize();
      s.p.copy(camera.position).addScaledVector(d, 0.35 + Math.random() * 0.1);
      s.v.copy(d).multiplyScalar(2.5 + Math.random() * 4);
      s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      s.w.set(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7);
    }
  }

  update(dt) {
    this.t += dt;
    this.mat.uniforms.uTime.value = this.t;
    if (this.on) {
      this.gain = Math.max(0, this.gain - dt * 2.2);
      this.mat.uniforms.uFlash.value = this.gain * 1.5;
      this.mat.uniforms.uAlpha.value = 0.5 + 0.1 * Math.sin(this.t * 2.6) + this.gain * 0.9;
      this.bubble.scale.setScalar(1 + this.gain * 0.6);
    }
    if (this.burstT > 0) {
      this.burstT -= dt;
      const k = Math.max(0, this.burstT / 0.75);
      this.parts.forEach((s, i) => {
        s.p.addScaledVector(s.v, dt);
        s.v.multiplyScalar(1 - dt * 1.5);
        s.v.y -= dt * 3;
        s.r.x += s.w.x * dt;
        s.r.y += s.w.y * dt;
        s.r.z += s.w.z * dt;
        _sc.setScalar(0.6 + k * 1.2);
        _m.compose(s.p, _q.setFromEuler(s.r), _sc);
        this.shards.setMatrixAt(i, _m);
      });
      this.shards.instanceMatrix.needsUpdate = true;
      this.shardMat.opacity = k;
      if (this.burstT <= 0) this.shards.visible = false;
    }
  }
}
