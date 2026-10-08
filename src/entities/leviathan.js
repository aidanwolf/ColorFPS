// CHARYBDIS, THE DROWNED LEVIATHAN — the Azure mini-boss: a ~36 m armored, bioluminescent sea serpent
// fought in a flooded cistern (see levels/leviathanArena.js). Its body is a chain of armor segments that
// follow the path the head swims (a trail of points), so it moves like one long living thing.
//   Phase 1  it circles and attacks (bite lunge, orb spit, tail whip, breach); one glowing GILL SAC at a
//            time opens along its flank: burst the three gills with their color. A missed lunge leaves it
//            stunned with its maw hanging open: shoot the MAW CORE (its color shows while it winds up).
//   Phase 2  new gills (blue among them) and it looses swarms of PIRANHA drones (one hit of their color).
//   Phase 3  its armor cracks open on a color-cycling HEART under its chest; it spins a VORTEX that drags
//            you toward its jaws (swim against it, or shelter behind a pillar) while the heart faces out.
// Every hit on the player is fatal (the bite, the tail, orbs, piranhas); its flank only shoves you aside.
import * as THREE from 'three';
import { COLORS } from '../colors.js';
import { audio } from '../audio.js';
import { Orb } from './drone.js';
import { director } from '../combat/director.js';
import { critHit, PainVoice, Malfunction, WeakMarker, prefetchFeel } from '../bossFeel.js';

const SEGS = 24;
const SPACING = 1.3; // m between segment centers
const HEAD_BACK = 3.0; // m from the head's center to the first segment
const TRAIL = 300; // head path samples (0.2 m apart): enough for the whole body plus slack
const TRAIL_STEP = 0.2;
const MAX_HP = 1200;
const GILL_HITS = 20, GILL_DMG = 5, GILL_BURST = 25; // 3 gills = 375 (bursting all three ends the phase)
// the maw core: MAW_DMG while it's stunned after a missed lunge (the decisive window: a full unload is
// most of a phase), MAW_WIND_DMG for a quick shot down its throat as it winds up; the phase-3 heart
const MAW_DMG = 13, MAW_WIND_DMG = 4, HEART_DMG = 9;
const RAD = Array.from({ length: SEGS }, (_, i) => {
  const t = i / (SEGS - 1);
  return 0.45 + 1.85 * Math.pow(1 - t, 0.8) * Math.min(1, 0.85 + t * 2.2);
});
const GILL_SEGS = [null, [5, 10, 15], [7, 12, 17]];
// telegraphs and pacing per phase (index = phase)
const LUNGE_WIND = [0, 1.45, 1.25, 1.1]; // the last LOCK seconds of it are aimed and committed
const LOCK = 0.7;
const LUNGE_SPEED = 26;
const ATTACK_GAP = [0, 3.0, 2.5, 2.1];
const GILL_OPEN = [0, 4.6, 4.0, 0];
const SOUNDS = ['leviathan_pain', 'leviathan_roar', 'leviathan_lunge', 'leviathan_splash', 'leviathan_death', 'leviathan_groan', 'leviathan_spit', 'leviathan_hurt'];
const NAME = 'CHARYBDIS — THE DROWNED LEVIATHAN';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const noHit = (o) => {
  o.raycast = () => {};
  return o;
};

// Spiraling streaks on an open cylinder (uv.x around, uv.y along +y): the current tubes and the vortex
// funnel. The pattern flows toward +y; owners advance uniforms.uTime.
export function swirlMaterial(color, { bands = 3, twist = 0.6, speed = 1, length = 10, opacity = 0.35 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uLen: { value: length }, uSpeed: { value: speed } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uTime, uOpacity, uLen, uSpeed; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        float along = vUv.y * uLen;
        float s = fract(vUv.x * ${bands.toFixed(1)} + along * ${twist.toFixed(3)} - uTime * uSpeed);
        float streak = smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(0.12, 0.6, s));
        float pulse = 0.65 + 0.35 * sin(along * 0.9 - uTime * uSpeed * 6.0);
        float ends = smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
        gl_FragColor = vec4(uColor * streak * pulse * ends * uOpacity, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function glowSprite(color, size) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.scale.setScalar(size);
  return noHit(s);
}

// ------------------------------------------------------------------ piranha drones
// Small armored fish-drones in a blaster color: they hunt you a little faster than you swim (Shift
// outruns them) and one hit of their color kills them. Touching one is fatal.
const PIRANHA_GEO = {};
class Piranha {
  constructor(boss, pos, vel, color) {
    this.boss = boss;
    this.world = boss.world;
    this.color = color;
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.alive = true;
    this.t = Math.random() * 10;
    this.life = 32;
    this.speed = boss.phase >= 3 ? 5.3 : 4.9;
    if (!PIRANHA_GEO.body) {
      PIRANHA_GEO.body = new THREE.SphereGeometry(1, 10, 8).scale(0.3, 0.36, 0.72);
      PIRANHA_GEO.tail = new THREE.ConeGeometry(0.32, 0.55, 4).rotateX(-Math.PI / 2).scale(0.25, 1, 1).translate(0, 0, -0.9);
      PIRANHA_GEO.jaw = new THREE.BoxGeometry(0.42, 0.12, 0.34).translate(0, -0.2, 0.5);
      PIRANHA_GEO.eye = new THREE.SphereGeometry(0.075, 6, 4);
      PIRANHA_GEO.stripe = new THREE.BoxGeometry(0.05, 0.08, 0.9).translate(0, 0.05, -0.05);
      PIRANHA_GEO.hit = new THREE.SphereGeometry(0.75, 8, 6);
      PIRANHA_GEO.proxy = new THREE.MeshBasicMaterial({ visible: false });
    }
    const G = PIRANHA_GEO, glow = boss.glowMats[color];
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(G.body, boss.mats.armor);
    this.tail = new THREE.Mesh(G.tail, boss.mats.fin);
    const jaw = new THREE.Mesh(G.jaw, boss.mats.bone);
    const eyes = [-1, 1].map((s) => {
      const e = new THREE.Mesh(G.eye, glow);
      e.position.set(s * 0.22, 0.12, 0.42);
      return e;
    });
    const stripes = [-1, 1].map((s) => {
      const e = new THREE.Mesh(G.stripe, glow);
      e.position.x = s * 0.29;
      return e;
    });
    const proxy = new THREE.Mesh(G.hit, G.proxy); // a fat invisible hit sphere: they're small and quick
    this.mesh.add(body, this.tail, jaw, ...eyes, ...stripes, proxy);
    this.mesh.userData.hit = this;
    this.mesh.userData.noCull = true;
    this.mesh.position.copy(this.pos);
    this.world.scene.add(this.mesh);
    this.world.addHittable(this.mesh);
  }

  update(dt, player) {
    if (!this.alive) return;
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) return this.die(false);
    const b = this.boss;
    const target = _v.copy(player.pos);
    target.y += 0.9;
    const to = _w.subVectors(target, this.pos);
    const d = to.length();
    // a weaving hunt; the first moments carry them out of the gill burst
    if (this.t > 0.5 || this.boss.state === 'dead') {
      to.normalize();
      _u.crossVectors(to, UP);
      if (_u.lengthSq() < 0.01) _u.set(1, 0, 0);
      _u.normalize().multiplyScalar(Math.sin(this.t * 5.5) * 0.45);
      to.add(_u).normalize().multiplyScalar(d < 3 ? this.speed * 1.15 : this.speed);
      this.vel.lerp(to, Math.min(1, dt * 2.2));
    } else this.vel.multiplyScalar(1 - dt * 1.5);
    _a.copy(this.pos).addScaledVector(this.vel, dt);
    if (this.world.pointInSolid(_a, 0.3)) this.vel.multiplyScalar(-0.5);
    else this.pos.copy(_a);
    const c = b.c;
    this.pos.x = clamp(this.pos.x, c.x - b.H + 0.6, c.x + b.H - 0.6);
    this.pos.z = clamp(this.pos.z, c.z - b.H + 0.6, c.z + b.H - 0.6);
    this.pos.y = clamp(this.pos.y, c.y + 0.6, c.y + b.D - 0.5);
    this.mesh.position.copy(this.pos);
    if (this.vel.lengthSq() > 0.01) this.mesh.lookAt(_a.copy(this.pos).add(this.vel));
    this.tail.rotation.y = Math.sin(this.t * 18) * 0.5;
    if (Math.random() < dt * 2) this.world.fx.bubbles(this.pos, 1);
    if (this.pos.distanceTo(target) < 0.85) b.kill('bite', 'SHREDDED');
  }

  onHit(color) {
    if (!this.alive) return undefined;
    if (color !== this.color) return 'immune';
    audio.droneHit(0.8);
    this.die(true);
    return 'kill';
  }

  die(shot) {
    if (!this.alive) return;
    this.alive = false;
    const fx = this.world.fx, hex = COLORS[this.color].hex;
    fx.orbPop(this.pos, hex, 0.35);
    if (shot) fx.burst(this.pos, hex, { count: 26, speed: 6, life: 0.7, size: 0.3, gravity: 1, mode: 'shard' });
    fx.bubbles(this.pos, 6);
    this.dispose();
  }

  dispose() {
    this.world.scene.remove(this.mesh);
    this.world.removeHittable(this.mesh);
  }
}

// ------------------------------------------------------------------ the leviathan
export class Leviathan {
  // center: the pool's floor center [x, y, z]; half: half the pool's width; depth: water depth.
  // pillars: [[x1, z1, x2, z2], ...] (world) for the vortex shelter and steering.
  // pool: half-width of the central open shaft it breaches through. colors: the blaster colors in play.
  constructor(world, game, { center, half = 25, depth = 22, pillars = [], pool = 7, breachAt = [0, 0], breach = true, colors = [0, 1, 2, 3], onStart = null, onDefeated = null }) {
    this.isLeviathan = true;
    this.world = world;
    this.game = game;
    this.c = new THREE.Vector3(...center);
    this.H = half;
    this.D = depth;
    this.pillars = pillars.map(([x1, z1, x2, z2]) => ({ x1, z1, x2, z2 }));
    this.poolHalf = pool;
    this.bc = new THREE.Vector3(this.c.x + breachAt[0], this.c.y, this.c.z + breachAt[1]); // where it breaches (needs ~8 m of air above)
    this.canBreach = breach;
    this.patrolR = half * 0.72;
    this.palette = colors.length ? colors.slice() : [0];
    this.onStart = onStart;
    this.onDefeated = onDefeated;
    this.root = new THREE.Group();
    this.root.userData.noCull = true; // it roams the whole arena: World's static culling would misjudge it
    world.scene.add(this.root);
    this.pos = new THREE.Vector3();
    this.dir = new THREE.Vector3(1, 0, 0);
    this.speed = 0;
    this.segPos = Array.from({ length: SEGS }, () => new THREE.Vector3());
    this.segPrev = Array.from({ length: SEGS }, () => new THREE.Vector3());
    this.segFwd = Array.from({ length: SEGS }, () => new THREE.Vector3(0, 0, 1));
    this.segUp = Array.from({ length: SEGS }, () => new THREE.Vector3(0, 1, 0));
    this.segRight = Array.from({ length: SEGS }, () => new THREE.Vector3(1, 0, 0));
    this.segQuat = Array.from({ length: SEGS }, () => new THREE.Quaternion());
    this.trail = Array.from({ length: TRAIL }, () => new THREE.Vector3());
    this.piranhas = [];
    this.headRight = new THREE.Vector3(1, 0, 0);
    this.build();
    // pain, its armor seams crackling with discharge while it's stunned, targets on what's open
    this.pain = new PainVoice(world, { name: 'leviathan_pain', fallback: 'leviathan_hurt', rate: 1.1, gain: 0.75, big: 'leviathan_hurt', bigRate: 0.75, gap: 1.5 });
    const seg = (i) => ({ getWorldPosition: (out) => out.copy(this.segPos[i]).addScaledVector(this.segUp[i], RAD[i] * 0.6) });
    this.malfunction = new Malfunction(game, [this.jaw, this.lure, seg(1), seg(3), seg(5), seg(7), seg(9), seg(12), seg(15)], { scale: 1.8, spark: 0x9ff6ff, arc: 0x7fe8ff, rate: 13, bubbles: true });
    this.mawMarker = new WeakMarker(world, game, { color: 0xffffff, size: 1.3 });
    this.gillMarker = new WeakMarker(world, game, { color: 0xffffff, size: 1.4 });
    this.heartMarkers = [0, 1].map(() => new WeakMarker(world, game, { color: 0xffffff, size: 1.2 }));
    this.defeated = false;
    this.reset();
    world.add(this);
    world.addHittable(this.root);
    audio.manifest?.then(() => {
      audio.prefetch(SOUNDS);
      prefetchFeel();
    });
  }

  // ------------------------------------------------------------------ construction
  build() {
    const root = this.root;
    const armor = new THREE.MeshStandardMaterial({ color: 0x1d3046, metalness: 0.6, roughness: 0.38, flatShading: true, emissive: 0x03121f, emissiveIntensity: 1 });
    const fin = new THREE.MeshStandardMaterial({ color: 0x1b5a6e, metalness: 0.2, roughness: 0.5, transparent: true, opacity: 0.82, side: THREE.DoubleSide, emissive: 0x06303c, emissiveIntensity: 1 });
    const bone = new THREE.MeshStandardMaterial({ color: 0xd8d2bc, roughness: 0.4, metalness: 0.1, emissive: 0x1a1a14 });
    const flesh = new THREE.MeshStandardMaterial({ color: 0x3a0f1e, roughness: 0.7, emissive: 0x2a0410, side: THREE.DoubleSide });
    // bioluminescence ignores the murk (fog: false), so the creature reads as moving lines of light far
    // beyond the point where its armor fades out
    this.glowBase = new THREE.Color(0x48e8ff);
    const glow = new THREE.MeshBasicMaterial({ color: this.glowBase.clone().multiplyScalar(1.6), fog: false });
    const tendril = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2fb8ff).multiplyScalar(1.1), fog: false, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbff8ff).multiplyScalar(2.5), fog: false });
    this.mawMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    this.throatMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.heartMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    this.flukeMat = new THREE.MeshStandardMaterial({ color: 0x1b5a6e, metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x0a6a88, emissiveIntensity: 1 });
    this.glowMats = COLORS.map((c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c.hex).multiplyScalar(2), fog: false }));
    this.mats = { armor, fin, bone, flesh, glow, tendril, eye };
    const tag = (m, part = 'armor') => {
      m.userData.hit = this;
      m.userData.part = part;
      return m;
    };
    tag(root);

    // ---- head (local: +z forward, origin at the head's center) ----
    const head = (this.head = new THREE.Group());
    root.add(head);
    const skullGeo = new THREE.CylinderGeometry(0.5, 2.0, 5.4, 6, 1).rotateX(Math.PI / 2).scale(1.25, 0.62, 1).translate(0, 0.42, 0.55);
    head.add(tag(new THREE.Mesh(skullGeo, armor)));
    // brow plates over the eyes, a crest of back-swept horns, a collar hiding the neck joint
    for (const s of [-1, 1]) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 2.6), armor);
      brow.position.set(s * 1.05, 1.05, 0.2);
      brow.rotation.set(0.12, s * 0.22, s * -0.35);
      head.add(tag(brow));
    }
    const hornGeo = new THREE.ConeGeometry(0.22, 1.7, 4).rotateX(-1.25);
    for (let k = 0; k < 4; k++) {
      const h = new THREE.Mesh(hornGeo, bone);
      h.position.set(0, 1.0 - k * 0.08, -0.5 - k * 0.75);
      h.scale.setScalar(1.15 - k * 0.15);
      head.add(noHit(h));
    }
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(hornGeo, bone);
      h.position.set(s * 1.7, 0.55, -1.6);
      h.rotation.y = s * 0.5;
      h.scale.setScalar(1.3);
      head.add(noHit(h));
    }
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.45, 1.4, 8, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 8).scale(1.05, 0.9, 1), armor);
    collar.position.z = -2.1;
    head.add(tag(collar));
    // mouth: dark flesh lining, the glowing maw core deep in the throat
    const lining = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.5, 4.2, 8, 1, true).rotateX(Math.PI / 2).scale(1.05, 0.55, 1), flesh);
    lining.position.set(0, -0.05, 0.9);
    head.add(noHit(lining));
    this.maw = tag(new THREE.Mesh(new THREE.SphereGeometry(0.72, 18, 12), this.mawMat), 'maw');
    this.maw.position.set(0, -0.05, -0.2);
    head.add(this.maw);
    this.throat = noHit(new THREE.Mesh(new THREE.SphereGeometry(1.35, 16, 10), this.throatMat));
    this.throat.position.copy(this.maw.position);
    head.add(this.throat);
    // upper teeth along the jaw rim
    const toothGeo = new THREE.ConeGeometry(0.11, 0.7, 4).rotateX(Math.PI); // points down
    const upper = new THREE.InstancedMesh(toothGeo, bone, 16);
    for (let k = 0; k < 16; k++) {
      const s = k % 2 ? 1 : -1, j = k >> 1, z = 2.9 - j * 0.48, w = 0.42 + (2.9 - z) * 0.3;
      _m.compose(_v.set(s * w, -0.2 + (2.9 - z) * 0.02, z), _q.identity(), _s.setScalar(1 - j * 0.04 + (j === 1 ? 0.5 : 0)));
      upper.setMatrixAt(k, _m);
    }
    head.add(noHit(upper));
    // eyes: a row of three per side, like a deep-sea fish
    this.eyes = [];
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.24 - k * 0.05, 10, 8), eye);
        e.position.set(s * (1.08 + k * 0.22), 0.62, 0.95 - k * 0.62);
        head.add(noHit(e));
        this.eyes.push(e);
      }
    }
    // lower jaw, hinged at the back
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -0.15, -1.3);
    head.add(this.jaw);
    const jawGeo = new THREE.CylinderGeometry(0.42, 1.75, 4.8, 6, 1).rotateX(Math.PI / 2).scale(1.15, 0.42, 1).translate(0, -0.42, 2.25);
    this.jaw.add(tag(new THREE.Mesh(jawGeo, armor)));
    const lower = new THREE.InstancedMesh(new THREE.ConeGeometry(0.1, 0.62, 4), bone, 14);
    for (let k = 0; k < 14; k++) {
      const s = k % 2 ? 1 : -1, j = k >> 1, z = 4.2 - j * 0.5, w = 0.38 + (4.2 - z) * 0.28;
      _m.compose(_v.set(s * w, -0.05, z), _q.identity(), _s.setScalar(1 - j * 0.05 + (j === 1 ? 0.45 : 0)));
      lower.setMatrixAt(k, _m);
    }
    this.jaw.add(noHit(lower));
    // the lure: a glowing bulb dangling ahead of the head on a long stalk
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.1, 0.6), new THREE.Vector3(0, 2.7, 1.6), new THREE.Vector3(0, 2.9, 3.6), new THREE.Vector3(0, 2.0, 5.1)]);
    this.lure = new THREE.Group();
    this.lure.position.set(0, 0, 0);
    this.lure.add(noHit(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.07, 5), armor)));
    const bulb = noHit(new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 8), eye));
    bulb.position.set(0, 2.0, 5.1);
    this.lureHalo = glowSprite(0x5fd8ff, 1.6);
    this.lureHalo.position.copy(bulb.position);
    this.lure.add(bulb, this.lureHalo);
    head.add(this.lure);
    this.mouthPoint = new THREE.Vector3(0, -0.1, 3.0); // head-local point orbs leave from and bites land on

    // ---- body (instanced: one draw per part for all segments) ----
    const plateGeo = new THREE.CylinderGeometry(0.8, 1, 1, 8, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 8);
    this.plates = tag(new THREE.InstancedMesh(plateGeo, armor, SEGS));
    const spikeGeo = new THREE.ConeGeometry(0.2, 1.25, 4).rotateX(-0.75).translate(0, 0.95, -0.15);
    this.spikes = noHit(new THREE.InstancedMesh(spikeGeo, bone, SEGS));
    const finShape = new THREE.Shape();
    finShape.moveTo(-0.7, 0);
    finShape.quadraticCurveTo(0.2, 1.2, 0.6, 1.9);
    finShape.quadraticCurveTo(1.1, 0.8, 1.9, 0);
    finShape.lineTo(-0.7, 0);
    const finGeo = new THREE.ShapeGeometry(finShape, 6).rotateY(Math.PI / 2).translate(0, 0.7, 0);
    this.fins = noHit(new THREE.InstancedMesh(finGeo, fin, SEGS));
    // glow: lateral lines and belly photophores
    const parts = [];
    for (const s of [-1, 1]) {
      parts.push(new THREE.BoxGeometry(0.07, 0.11, 0.92).translate(s * 0.93, 0.12, 0));
      parts.push(new THREE.BoxGeometry(0.1, 0.1, 0.16).translate(s * 0.48, -0.84, 0.15));
      parts.push(new THREE.BoxGeometry(0.06, 0.06, 0.1).translate(s * 0.72, -0.55, -0.25));
    }
    this.lines = noHit(new THREE.InstancedMesh(mergeBoxes(parts), glow, SEGS));
    for (const im of [this.plates, this.spikes, this.fins, this.lines]) {
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      root.add(im);
    }
    // pectoral fins (wings) on segment 1, the tail fluke on the last
    this.pecs = new THREE.Group();
    root.add(this.pecs);
    const wing = new THREE.Shape();
    wing.moveTo(0, 0.6);
    wing.quadraticCurveTo(2.6, 0.2, 4.6, 2.4);
    wing.quadraticCurveTo(3.0, 2.2, 2.2, 3.1);
    wing.quadraticCurveTo(1.0, 2.0, 0, 2.4);
    wing.lineTo(0, 0.6);
    const wingGeo = new THREE.ShapeGeometry(wing, 8).rotateX(-Math.PI / 2).translate(0, 0, 1.2);
    this.wings = [-1, 1].map((s) => {
      const g = new THREE.Group();
      g.position.set(s * 1.6, -0.5, 0);
      const m = noHit(new THREE.Mesh(wingGeo, fin));
      m.scale.x = s;
      g.add(m);
      this.pecs.add(g);
      return g;
    });
    this.fluke = new THREE.Group();
    root.add(this.fluke);
    const tail = new THREE.Shape();
    tail.moveTo(0, 0);
    tail.quadraticCurveTo(1.4, 1.1, 3.4, 3.0);
    tail.quadraticCurveTo(2.2, 1.0, 2.3, 0);
    tail.quadraticCurveTo(2.2, -1.0, 3.4, -3.0);
    tail.quadraticCurveTo(1.4, -1.1, 0, 0);
    this.fluke.add(tag(new THREE.Mesh(new THREE.ShapeGeometry(tail, 8).rotateY(Math.PI / 2).translate(0, 0, 0.3), this.flukeMat), 'tail'));
    for (const y of [-3, 3]) {
      const tip = noHit(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), eye));
      tip.position.set(0, y, -3.1);
      this.fluke.add(tip);
    }
    // trailing tendrils from under the jaw: verlet chains drawn as glowing instanced sticks
    this.tendrilAnchors = [];
    for (const s of [-1, 1]) for (const [x, y, z] of [[1.25, -0.75, -1.2], [1.75, -0.2, -1.9], [0.55, -0.95, -1.7]]) this.tendrilAnchors.push(new THREE.Vector3(s * x, y, z));
    this.tendrils = this.tendrilAnchors.map(() => ({ p: Array.from({ length: 10 }, () => new THREE.Vector3()), o: Array.from({ length: 10 }, () => new THREE.Vector3()) }));
    this.tendrilMesh = noHit(new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 1), tendril, this.tendrils.length * 9));
    this.tendrilMesh.frustumCulled = false;
    this.tendrilMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(this.tendrilMesh);

    // ---- weak points ----
    // gill sacs: three gills, a sac on each flank of its segment (both share the gill's hits)
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    this.gills = [0, 1, 2].map((k) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
      const sacs = [-1, 1].map((s) => {
        const g = new THREE.Group();
        const sac = tag(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat), 'gill');
        sac.userData.gill = k;
        // gill slits: dark ribs across the sac
        for (let r = -1; r <= 1; r++) {
          const rib = noHit(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 1.9), armor));
          rib.position.set(s * 0.82, r * 0.45, 0);
          sac.add(rib);
        }
        const proxy = tag(new THREE.Mesh(new THREE.SphereGeometry(1.25, 8, 6), proxyMat), 'gill');
        proxy.userData.gill = k;
        g.add(sac, proxy);
        g.userData.sac = sac;
        g.userData.proxy = proxy;
        g.userData.side = s;
        root.add(g);
        return g;
      });
      return { k, mat, sacs, seg: 5, color: 0, hp: GILL_HITS, alive: false, open: 0, flash: 0 };
    });
    // the heart (phase 3): two glowing lobes bulging out through cracked plates on either side of the chest
    this.heart = new THREE.Group();
    root.add(this.heart);
    const shardGeo = new THREE.ConeGeometry(0.3, 1.5, 3);
    this.heartLobes = [-1, 1].map((s) => {
      const g = new THREE.Group();
      g.position.set(s * 1.75, -0.4, 0);
      const core = tag(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), this.heartMat), 'heart');
      const proxy = tag(new THREE.Mesh(new THREE.SphereGeometry(1.45, 8, 6), proxyMat), 'heart');
      const halo = glowSprite(0xffffff, 4);
      g.add(core, proxy, halo);
      for (let k = 0; k < 5; k++) {
        // jagged plate shards torn back around it
        const shard = noHit(new THREE.Mesh(shardGeo, armor));
        const a = (k / 5) * Math.PI * 2;
        shard.position.set(-s * 0.2, Math.cos(a) * 1.1, Math.sin(a) * 1.1);
        shard.rotation.set(Math.sin(a) * 1.1, 0, s * 0.6 - Math.cos(a) * 0.9);
        g.add(shard);
      }
      this.heart.add(g);
      return { s, g, core, proxy, halo };
    });

    // ---- telegraphs ----
    // the lunge's path: a faint tube as wide as the bite, from the jaws to where it will stop
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    this.beamMat = swirlMaterial(0xff6a5a, { bands: 2, twist: 0.35, speed: 2.4, length: 20, opacity: 0.5 });
    this.beam = noHit(new THREE.Mesh(beamGeo, this.beamMat));
    this.beam.userData.noCull = true;
    this.beam.visible = false;
    this.world.scene.add(this.beam);
    // the vortex funnel
    this.funnelMat = swirlMaterial(0x7fe8ff, { bands: 5, twist: 0.12, speed: 1.6, length: this.D, opacity: 0 });
    this.funnel = noHit(new THREE.Mesh(new THREE.CylinderGeometry(11, 5, this.D, 32, 1, true), this.funnelMat));
    this.funnel.position.set(this.c.x, this.c.y + this.D / 2, this.c.z);
    this.funnel.userData.noCull = true;
    this.funnel.visible = false;
    this.world.scene.add(this.funnel);

    // lights that travel with it (pooled virtual lights: see World.addLight)
    this.lightHead = this.world.addLight(0x6ff0ff, 0, 22, 1.5);
    this.lightBody = this.world.addLight(0x3ab8ff, 0, 20, 1.5);
  }

  // ------------------------------------------------------------------ state
  reset() {
    if (this.malfunction) {
      this.malfunction.update(1, false);
      for (const m of [this.mawMarker, this.gillMarker, ...this.heartMarkers]) m.update(1, null);
    }
    director.release(this);
    for (const p of this.piranhas) p.dispose();
    this.piranhas = [];
    this.beam.visible = false;
    this.funnel.visible = false;
    this.funnelMat.uniforms.uOpacity.value = 0;
    if (this.defeated) return; // the corpse stays where it sank
    this.state = 'dormant';
    this.t = 0;
    this.time = 0;
    this.hp = MAX_HP;
    this.phase = 1;
    this.jawOpen = 0;
    this.jawTarget = 0;
    this.attackT = 3;
    this.last = null;
    this.cool = { whip: 0, breach: 4, vortex: 0, summon: 0 };
    this.whip = 0;
    this.whipSide = new THREE.Vector3();
    this.flash = 0;
    this.mawColor = this.palette[0];
    this.mawFlash = 0;
    this.heartColor = this.palette.includes(3) ? 3 : this.palette[0];
    this.heartT = 0;
    this.heartOpen = 0;
    this.heartFlash = 0;
    this.heartVisible = false;
    this.gillIdx = -1;
    this.gillT = 1.5;
    this.hinted = {};
    this.sense = 1;
    this.convulse = 0;
    this.glowLevel = 1;
    this.sinking = false;
    this.lunge = null;
    this.pos.set(this.c.x + this.patrolR * 0.95, this.c.y + this.D * 0.42, this.c.z);
    this.dir.set(0, 0, -1);
    this.speed = 4;
    // a straight trail behind the head so the body starts laid out along the circle's tangent
    for (let i = 0; i < TRAIL; i++) this.trail[i].copy(this.pos).addScaledVector(this.dir, -i * TRAIL_STEP);
    this.setupGills(1);
    for (const g of this.gills) g.open = 0;
    this.heart.visible = false;
    this.root.visible = false;
    this.updateBody(0);
    this.initTendrils();
  }

  get active() {
    return this.state !== 'dormant' && this.state !== 'dead';
  }

  // The fight begins (the arena calls this when you swim in).
  start() {
    if (this.state !== 'dormant' || this.defeated) return;
    this.state = 'intro';
    this.t = 0;
    const hud = this.game.hud;
    const nameEl = document.querySelector('#boss-bar .boss-name');
    if (nameEl) {
      this.savedName ??= nameEl.textContent;
      nameEl.textContent = NAME;
    }
    hud.bossShow(true);
    hud.bossBar(1);
    hud.zoneTitle('THE DROWNED LEVIATHAN', 'CHARYBDIS', COLORS[3].css);
    audio.setIntensity?.(2);
    this.onStart?.();
  }

  hideHud() {
    this.game.hud.bossShow(false);
    const nameEl = document.querySelector('#boss-bar .boss-name');
    if (nameEl && this.savedName) nameEl.textContent = this.savedName;
  }

  // Skip straight to the corpse (e.g. restoring a save where it's already dead).
  setDefeated() {
    this.defeated = true;
    this.state = 'dead';
    this.root.visible = true;
    this.heart.visible = false;
    for (const g of this.gills) g.alive = false;
    this.glowLevel = 0.15;
    for (let i = 0; i < SEGS; i++) {
      const p = this.segPos[i];
      p.set(this.c.x - 6 + i * 1.2, this.c.y + RAD[i] * 0.75, this.c.z + 8 + Math.sin(i * 0.4) * 3);
      this.segPrev[i].copy(p);
    }
    this.pos.set(this.c.x - 9.5, this.c.y + 1.6, this.c.z + 8);
    this.dir.set(-1, 0, 0);
    this.sinking = true;
    this.deadT = 99;
    this.layoutDead();
    this.applyGlow();
  }

  // Gone for good (its world's engine is already down): nothing left to fight.
  vanish() {
    this.reset();
    this.defeated = true;
    this.gone = true;
    this.state = 'dead';
    this.root.visible = false;
    this.lightHead.intensity = this.lightBody.intensity = 0;
    this.groan?.setGain(0);
    this.hideHud();
  }

  // ------------------------------------------------------------------ helpers
  playerCenter(out = _a) {
    const p = this.game.player;
    return out.set(p.pos.x, p.pos.y + 0.9, p.pos.z);
  }

  mouthWorld(out) {
    return this.head.localToWorld(out.copy(this.mouthPoint));
  }

  kill(cause, banner) {
    const g = this.game, p = g.player;
    if (p.dead || p.invuln > 0 || g.godMode || g.rulesPaused) return;
    p.damage(1, cause);
    if (p.dead && banner) g.hud.deathBanner(banner, g.reviveOffered);
  }

  sfx(name, fallback, opts = { gain: 1 }) {
    if (!audio.sample(name, opts)) fallback?.();
  }

  // turn the heading toward a desired unit direction at up to `rate` rad/s
  turnToward(desired, rate, dt) {
    const ang = this.dir.angleTo(desired);
    if (ang < 1e-4) return;
    if (ang > 3.0) desired = _u.copy(desired).addScaledVector(_w.crossVectors(this.dir, UP).normalize(), 0.3).normalize();
    this.dir.lerp(desired, Math.min(1, (rate * dt) / ang)).normalize();
  }

  // Swim toward a point: turn (with obstacle and bounds avoidance), ease speed, move.
  swimTo(target, speed, rate, dt, { avoid = true, free = false } = {}) {
    const d = _b.subVectors(target, this.pos);
    if (d.lengthSq() > 1e-6) d.normalize();
    if (avoid) {
      const c = this.c, ahead = _v.copy(this.pos).addScaledVector(this.dir, 5);
      for (const P of this.pillars) {
        const m = 3.4;
        if (ahead.x > P.x1 - m && ahead.x < P.x2 + m && ahead.z > P.z1 - m && ahead.z < P.z2 + m) {
          _w.set(ahead.x - (P.x1 + P.x2) / 2, 0, ahead.z - (P.z1 + P.z2) / 2).normalize();
          d.addScaledVector(_w, 1.4);
        }
      }
      const lim = this.H - 4;
      if (Math.abs(ahead.x - c.x) > lim) d.x -= Math.sign(ahead.x - c.x) * 1.2;
      if (Math.abs(ahead.z - c.z) > lim) d.z -= Math.sign(ahead.z - c.z) * 1.2;
      if (ahead.y < c.y + 3) d.y += 1;
      if (ahead.y > c.y + this.D - 3.5) d.y -= 1;
      d.normalize();
    }
    this.turnToward(d, rate, dt);
    this.speed += (speed - this.speed) * Math.min(1, dt * 2);
    this.pos.addScaledVector(this.dir, this.speed * dt);
    if (!free) this.clampPos();
  }

  clampPos() {
    const c = this.c, lim = this.H - 2.6;
    this.pos.x = clamp(this.pos.x, c.x - lim, c.x + lim);
    this.pos.z = clamp(this.pos.z, c.z - lim, c.z + lim);
    this.pos.y = clamp(this.pos.y, c.y + 2.2, c.y + this.D - 2.4);
  }

  // the next point along its patrol loop (a wobbling ring around the central shaft)
  patrolTarget(out, radius = this.patrolR, lead = 0.55) {
    const c = this.c;
    const a = Math.atan2(this.pos.z - c.z, this.pos.x - c.x) + lead * this.sense;
    const r = radius + Math.sin(a * 2 + this.time * 0.3) * 1.6;
    return out.set(c.x + Math.cos(a) * r, c.y + this.D * 0.43 + Math.sin(a * 1.5 + this.time * 0.25) * this.D * 0.22, c.z + Math.sin(a) * r);
  }

  // ------------------------------------------------------------------ weak points
  setupGills(phase) {
    const segs = GILL_SEGS[Math.min(2, phase)];
    let cols = shuffle(this.palette);
    // phase 1 favors the warm colors; phase 2 puts blue in the mix when you have it
    if (phase === 1 && cols.length > 3) cols = cols.filter((c) => c !== 3).concat(cols.filter((c) => c === 3));
    if (phase === 2 && cols.includes(3) && cols.indexOf(3) > 2) cols.splice(Math.floor(Math.random() * 3), 0, cols.splice(cols.indexOf(3), 1)[0]);
    this.gills.forEach((g, k) => {
      g.seg = segs[k];
      g.color = cols[k % cols.length];
      g.hp = GILL_HITS;
      g.alive = phase < 3;
      g.open = 0;
      g.flash = 0;
    });
    if (phase === 1) this.gills.forEach((g) => (g.order = Math.random()));
  }

  gillsLeft() {
    return this.gills.reduce((n, g) => n + (g.alive ? 1 : 0), 0);
  }

  hitGill(g, hit) {
    g.hp--;
    g.flash = 1;
    const fx = this.world.fx, hex = COLORS[g.color].hex;
    fx.sparks(hit.point, hit.normal || UP, hex, { count: 6, speed: 7, spread: 0.9, life: 0.35, gravity: 0 });
    if (g.hp > 0) {
      critHit(this.game, hit, { color: hex, spark: 0xe0ffff, scale: 0.85, gain: 0.8, shake: 0.22, pop: false });
      audio.bossCoreHit();
      this.convulse = Math.max(this.convulse, 0.2);
      this.pain.hurt(0.8);
      this.damage(GILL_DMG);
      return;
    }
    g.alive = false;
    const p = g.sacs[0].getWorldPosition(_v);
    for (const s of g.sacs) {
      const q = s.getWorldPosition(_w);
      fx.burst(q, hex, { count: 70, speed: 9, life: 1.1, size: 0.45, gravity: 1.5 });
      fx.burst(q, 0xffffff, { count: 24, speed: 5, life: 0.5, size: 0.5, gravity: 0 });
      fx.ring(q, null, hex, { size: 0.5, end: 6, life: 0.5, thick: 0.12, k: 1.6 });
      fx.bubbles(q, 12);
    }
    audio.bossLimbBreak();
    this.pain.roar();
    this.game.hud.bossCrit(true);
    this.flash = 1;
    this.convulse = 0.8;
    if (p.distanceTo(this.game.player.pos) < 30) this.game.player.shake = Math.max(this.game.player.shake, 0.4);
    const left = this.gillsLeft();
    this.damage(GILL_DMG + GILL_BURST);
    if (this.state !== 'roar' && this.state !== 'dying' && left > 0) this.game.hud.bossHint(`Gill burst! ${left} left.`, true);
  }

  // ------------------------------------------------------------------ damage
  onHit(color, hit) {
    if (!this.active || this.state === 'intro' || this.state === 'roar' || this.state === 'dying') return 'immune';
    const part = hit.part;
    if (part === 'gill') {
      const g = this.gills[hit.object?.userData.gill];
      if (!g || !g.alive || g.open < 0.6 || color !== g.color) return 'immune';
      this.hitGill(g, hit);
      return 'hit';
    }
    if (part === 'maw') {
      const exposed = this.state === 'stun' || (this.state === 'lunge_wind' && this.jawOpen > 0.5);
      if (!exposed || color !== this.mawColor) return 'immune';
      this.mawFlash = 1;
      const stun = this.state === 'stun';
      critHit(this.game, hit, { color: COLORS[color].hex, spark: 0xe8ffff, scale: stun ? 1.5 : 1, shake: stun ? 0.34 : 0.25 });
      audio.bossCoreHit();
      this.world.fx.bubbles(hit.point, 5);
      this.convulse = Math.max(this.convulse, stun ? 0.45 : 0.3);
      this.pain.hurt(stun ? 1.3 : 1);
      this.damage(stun ? MAW_DMG : MAW_WIND_DMG);
      return 'hit';
    }
    if (part === 'heart') {
      if (!this.heartVisible || this.heartOpen < 0.6 || color !== this.heartColor) return 'immune';
      this.heartFlash = 1;
      critHit(this.game, hit, { color: COLORS[color].hex, spark: 0xffffff, scale: 1.35, shake: 0.32 });
      audio.bossCoreHit();
      this.world.fx.bubbles(hit.point, 4);
      this.convulse = Math.max(this.convulse, 0.4);
      this.pain.hurt(1.2);
      this.damage(HEART_DMG);
      return 'hit';
    }
    this.flash = Math.max(this.flash, 0.25);
    return 'immune';
  }

  damage(n) {
    if (this.state === 'dying' || this.state === 'dead' || this.state === 'roar') return;
    // a phase is never skipped: damage stops at the threshold and the transition plays
    const floor = this.phase === 1 ? MAX_HP * 0.66 : this.phase === 2 ? MAX_HP * 0.33 : 0;
    this.hp = Math.max(floor, this.hp - n);
    this.game.hud.bossBar(this.hp / MAX_HP);
    if (this.hp <= 0) return this.die();
    if (this.hp <= floor || (this.phase < 3 && this.gillsLeft() === 0)) this.nextPhase();
  }

  nextPhase() {
    this.phase++;
    this.hp = Math.min(this.hp, this.phase === 2 ? MAX_HP * 0.66 : MAX_HP * 0.33);
    this.game.hud.bossBar(this.hp / MAX_HP);
    this.enter('roar');
    this.beam.visible = false;
    this.funnel.visible = false;
    this.whip = 0;
    audio.bossPhase();
    this.sfx('leviathan_roar', () => audio.bossRoar(), { gain: 1.1 });
    this.pain.roar();
    for (const j of this.malfunction.joints) this.malfunction.sputter(j, 1.3);
    this.game.player.shake = Math.max(this.game.player.shake, 0.8);
    this.convulse = 1.2;
    if (this.phase === 2) {
      this.setupGills(2);
      this.game.hud.bossHint('It sheds its wounds — new gills, and it looses its brood. Shoot the piranhas!', true);
    } else {
      this.setupGills(3);
      this.heartVisible = true;
      this.heart.visible = true;
      this.heartT = 0;
      this.cool.vortex = 3;
      const hex = COLORS[this.heartColor].hex;
      this.world.fx.burst(this.segPos[2], hex, { count: 120, speed: 10, life: 1.2, size: 0.5, gravity: 0, mode: 'shard' });
      this.game.hud.bossHint('FINAL PHASE — its armor cracks: shoot the HEART under its chest!', true);
    }
  }

  die() {
    this.hp = 0;
    this.enter('dying');
    this.deadT = 0;
    this.beam.visible = false;
    this.funnel.visible = false;
    this.whip = 0;
    this.game.hud.bossBar(0);
    this.game.hud.bossHint('Charybdis is tearing itself apart!', true);
    this.sfx('leviathan_death', () => audio.sample('boss_death', { gain: 1 }) || audio.bossRoar(), { gain: 1.2 });
    for (const p of this.piranhas) p.die(false);
    this.piranhas = [];
    for (const pr of this.world.projectiles) if (pr.isLeviathanOrb) pr.pop();
    audio.setIntensity?.(0);
  }

  enter(state) {
    this.state = state;
    this.t = 0;
  }

  // ------------------------------------------------------------------ update
  update(dt, player) {
    if (this.gone) return;
    const near = this.pos.distanceTo(player.pos) < 140 || this.active;
    if (!near) {
      this.root.visible = false;
      this.lightHead.intensity = this.lightBody.intensity = 0;
      this.groan?.setGain(0);
      return;
    }
    this.root.visible = true;
    if (this.game.rulesPaused) return;
    this.time += dt;
    this.t += dt;
    for (const k in this.cool) this.cool[k] -= dt;

    if (this.state === 'dead') this.updateDead(dt);
    else if (this.state === 'dying') this.updateDying(dt);
    else this.think(dt, player);

    if (this.state !== 'dead' || !this.sinking) this.updateBody(dt);
    this.updateTendrils(dt);
    this.updateParts(dt);
    this.updateFeel(dt);
    this.updatePiranhas(dt, player);
    if (this.active && this.state !== 'dying') this.contact(player);
    this.updateSound(player);
  }

  think(dt, player) {
    const pc = this.playerCenter(new THREE.Vector3());
    const ph = this.phase;
    this.jawTarget = 0.08;
    switch (this.state) {
      case 'dormant': {
        // circling in the deep, unaware
        this.swimTo(this.patrolTarget(_a, this.patrolR * 0.95), 4.5, 0.8, dt);
        break;
      }
      case 'intro': {
        // it turns on you, sweeps close past and roars
        const tgt = _a.copy(pc).addScaledVector(_w.subVectors(this.pos, pc).setY(0).normalize(), 9);
        tgt.y = clamp(pc.y, this.c.y + 4, this.c.y + this.D - 4);
        this.swimTo(tgt, this.t < 2 ? 11 : 4, 1.8, dt);
        if (this.t > 1.5) this.jawTarget = 1;
        if (this.t > 1.6 && !this.roared) {
          this.roared = true;
          this.sfx('leviathan_roar', () => audio.bossRoar(), { gain: 1.2 });
          player.shake = Math.max(player.shake, 0.7);
          this.world.fx.bubbles(this.mouthWorld(_v), 30);
        }
        if (this.t > 3.6) {
          this.enter('swim');
          this.attackT = 1.8;
          this.game.hud.bossHint('Burst its glowing gills with their color. Breathe at the lit air pockets!', true);
        }
        break;
      }
      case 'swim': {
        this.swimTo(this.patrolTarget(_a), ph === 3 ? 8.5 : 7.5, 1.1, dt);
        if (this.t > 6 && Math.random() < dt * 0.08) this.sense = -this.sense;
        this.attackT -= dt;
        if (this.attackT <= 0) this.chooseAttack(pc);
        break;
      }
      case 'roar': {
        // rears up, thrashing, invulnerable while it changes
        this.swimTo(this.patrolTarget(_a), 3, 1.2, dt);
        this.jawTarget = 1;
        this.convulse = Math.max(this.convulse, 0.5);
        if (this.t > 2.3) {
          this.enter('swim');
          this.attackT = 1.2;
          if (this.phase === 2) this.startAttack('summon');
        }
        break;
      }
      case 'lunge_wind': {
        const L = this.lunge;
        const wind = LUNGE_WIND[ph];
        const left = wind - this.t;
        this.jawTarget = 0.4 + 0.6 * smooth(this.t / wind);
        if (left > LOCK) {
          // still tracking you: it turns and coils back
          L.target.copy(pc);
          this.swimTo(_v.copy(this.pos).addScaledVector(_w.subVectors(pc, this.pos).normalize(), 3), 1.5, 2.6, dt, { avoid: false });
        } else {
          if (!L.locked) this.lockLunge(L);
          this.turnToward(L.dir, 5, dt);
          this.speed += (0 - this.speed) * Math.min(1, dt * 4);
          this.pos.addScaledVector(L.dir, -1.2 * dt); // drawing back before the strike
          this.clampPos();
          this.updateBeam(L, 1 - left / LOCK);
        }
        if (this.dist(pc) < 30) player.shake = Math.max(player.shake, 0.12 + 0.15 * smooth(this.t / wind));
        if (Math.random() < dt * 14) this.world.fx.bubbles(this.mouthWorld(_v), 2);
        if (this.t >= wind) {
          this.enter('lunge');
          this.beam.visible = false;
          this.sfx('leviathan_lunge', () => audio.sweep(), { gain: 1.1 });
          L.start.copy(this.pos);
        }
        break;
      }
      case 'lunge': {
        const L = this.lunge;
        this.jawTarget = 1;
        this.dir.copy(L.dir);
        this.speed = LUNGE_SPEED;
        const prev = this.mouthWorld(_w).clone();
        this.pos.addScaledVector(L.dir, LUNGE_SPEED * dt);
        const traveled = this.pos.distanceTo(L.start);
        this.updateBody(0);
        const mouth = this.mouthWorld(_v);
        if (segDist(pc, prev, mouth) < 2.5) this.kill('bite', 'DEVOURED');
        if (Math.random() < dt * 30) this.world.fx.bubbles(mouth, 3);
        if (traveled >= L.dist) {
          if (L.crash) this.crash();
          else this.enter('stun');
          this.stunLen = L.crash ? 3.4 : 2.6;
          this.cool.whip = Math.min(this.cool.whip, 0);
          this.game.hud.bossHint(this.hinted.maw ? '' : 'It missed! Shoot the core in its open maw!', !this.hinted.maw);
          this.hinted.maw = true;
        }
        break;
      }
      case 'stun': {
        this.jawTarget = 0.85 + Math.sin(this.time * 9) * 0.1;
        this.speed += (0.8 - this.speed) * Math.min(1, dt * 3);
        _v.copy(this.dir).applyAxisAngle(UP, Math.sin(this.time * 3.1) * 0.6 * dt);
        this.dir.copy(_v).normalize();
        this.pos.addScaledVector(this.dir, this.speed * dt);
        this.clampPos();
        this.convulse = Math.max(this.convulse, 0.25);
        if (this.t > this.stunLen) this.enterSwim(0.8);
        break;
      }
      case 'spit': {
        this.swimTo(_v.copy(this.pos).addScaledVector(_w.subVectors(pc, this.pos).normalize(), 4), 3.5, 1.9, dt);
        this.jawTarget = smooth(this.t / 0.75);
        if (Math.random() < dt * 10) this.world.fx.bubbles(this.mouthWorld(_v), 2);
        if (this.t > 0.75 && !this.spat) {
          this.spat = true;
          this.spitVolley(pc);
        }
        if (this.t > 1.2) this.enterSwim();
        break;
      }
      case 'whip': {
        // the tail coils away from you (fluke glowing), then lashes through the water toward you
        this.swimTo(this.patrolTarget(_a), 3, 0.8, dt);
        const W1 = 1.0, W2 = W1 + 0.28, W3 = W2 + 0.3, W4 = W3 + 0.8;
        const t = this.t;
        this.whip = t < W1 ? -2.6 * smooth(t / W1) : t < W2 ? -2.6 + 8.6 * smooth((t - W1) / (W2 - W1)) : t < W3 ? 6 : 6 * (1 - smooth((t - W3) / (W4 - W3)));
        if (t < W1 && Math.random() < dt * 20) this.world.fx.bubbles(this.segPos[SEGS - 1], 2);
        if (t >= W1 && !this.whipped) {
          this.whipped = true;
          audio.sweep();
          this.sfx('leviathan_lunge', null, { gain: 0.6, rate: 1.4 });
        }
        if (t > W1 && t < W3) {
          for (let i = 12; i < SEGS; i++) if (this.segPos[i].distanceTo(pc) < RAD[i] + 1.0) this.kill('tail', 'CRUSHED');
          if (this.fluke.getWorldPosition(_v).distanceTo(pc) < 2.8) this.kill('tail', 'CRUSHED');
        }
        if (t > W4) {
          this.whip = 0;
          this.enterSwim();
        }
        break;
      }
      case 'breach_go': {
        // dive under the central shaft, then rise
        const B = this.breach;
        const d = this.pos.distanceTo(B.under);
        this.swimTo(B.under, Math.min(9, 2.5 + d * 0.6), 2.2, dt, { avoid: false });
        this.clampPos();
        if (d < 4 || this.t > 6) this.enter('breach_wind');
        break;
      }
      case 'breach_wind': {
        const B = this.breach;
        this.turnToward(UP, 2.4, dt);
        this.speed = 3.5;
        this.pos.addScaledVector(this.dir, this.speed * dt);
        this.pos.x += (B.rise.x - this.pos.x) * Math.min(1, dt * 2);
        this.pos.z += (B.rise.z - this.pos.z) * Math.min(1, dt * 2);
        this.pos.y = Math.min(this.pos.y, this.c.y + this.D - 5);
        // the telegraph: the pool's surface boils and a ring of light spreads over it
        const surf = _v.set(B.rise.x, this.c.y + this.D + 0.05, B.rise.z);
        if (Math.random() < dt * 9) this.world.fx.ring(surf, UP, 0x9bf6ff, { size: 0.5, end: 5, life: 0.6, thick: 0.1, k: 1.4 });
        for (let k = 0; k < 3; k++) if (Math.random() < dt * 20) this.world.fx.bubbles(_w.set(B.rise.x + rnd(-3, 3), this.pos.y + rnd(0, 5), B.rise.z + rnd(-3, 3)), 2);
        if (this.dist(pc) < 40) player.shake = Math.max(player.shake, 0.15);
        if (this.dist(pc) < 3) this.kill('bite', 'DEVOURED');
        if (this.t > 1.15) {
          this.enter('breach');
          B.vel = new THREE.Vector3(B.across.x * 3, 17, B.across.z * 3);
          B.out = false;
          this.sfx('leviathan_roar', () => audio.bossRoar(), { gain: 0.8, rate: 1.2 });
        }
        break;
      }
      case 'breach': {
        const B = this.breach, surface = this.c.y + this.D;
        this.jawTarget = 1;
        if (this.pos.y > surface) B.vel.y -= 24 * dt;
        this.pos.addScaledVector(B.vel, dt);
        this.dir.copy(B.vel).normalize();
        this.speed = B.vel.length();
        const crossing = (B.out ? this.pos.y < surface : this.pos.y > surface);
        if (crossing) {
          B.out = !B.out;
          this.splash(_v.set(this.pos.x, surface, this.pos.z), B.out);
        }
        if (this.dist(pc) < 3.2) this.kill('bite', 'DEVOURED');
        if (this.pos.y < surface - 4 && B.vel.y < 0 && this.t > 0.5) {
          this.dir.y = Math.max(this.dir.y, -0.7);
          this.dir.normalize();
          this.enterSwim(0.5);
        }
        break;
      }
      case 'summon': {
        this.swimTo(this.patrolTarget(_a), 3, 1, dt);
        this.convulse = Math.max(this.convulse, 0.2);
        if (this.t > 0.7 && !this.summoned) {
          this.summoned = true;
          this.spawnPiranhas(this.phase >= 3 ? 3 : 4);
          director.release(this);
        }
        if (this.t > 1.2) this.enterSwim();
        break;
      }
      case 'vortex_go': {
        const V = this.vortex;
        const a = Math.atan2(this.pos.z - this.c.z, this.pos.x - this.c.x) + 0.6 * V.sense;
        const tgt = _a.set(this.c.x + Math.cos(a) * V.r, this.c.y + this.D * 0.55, this.c.z + Math.sin(a) * V.r);
        this.swimTo(tgt, 10, 2.2, dt, { avoid: false });
        this.clampPos();
        if (Math.hypot(this.pos.x - this.c.x, this.pos.z - this.c.z) < V.r + 2.5 || this.t > 5) {
          this.enter('vortex');
          this.game.hud.bossHint(this.hinted.vortex ? '' : 'VORTEX — swim against the pull, shelter behind a pillar, shoot its heart!', true);
          this.hinted.vortex = true;
          this.sfx('leviathan_roar', () => audio.bossRoar(), { gain: 1, rate: 0.85 });
        }
        break;
      }
      case 'vortex': {
        const V = this.vortex;
        V.a += (12 / V.r) * dt * V.sense;
        const tgt = _a.set(this.c.x + Math.cos(V.a + 0.5 * V.sense) * V.r, this.c.y + this.D * 0.55 + Math.sin(this.t * 1.3) * this.D * 0.16, this.c.z + Math.sin(V.a + 0.5 * V.sense) * V.r);
        this.swimTo(tgt, 12, 4.5, dt, { avoid: false });
        this.clampPos();
        // the pull ramps up over the first second and a half (the telegraph), then holds
        V.k = smooth(this.t / 1.5) * (this.t > V.len - 1 ? Math.max(0, V.len - this.t) : 1);
        this.drag(player, dt, V);
        this.funnel.visible = true;
        this.funnelMat.uniforms.uOpacity.value = 0.55 * V.k;
        this.funnelMat.uniforms.uSpeed.value = 1.6 * V.sense;
        this.funnel.rotation.y += dt * 0.8 * V.sense;
        if (Math.random() < dt * 30) {
          const a = Math.random() * Math.PI * 2, r = rnd(3, 16);
          this.world.fx.sparks(_v.set(this.c.x + Math.cos(a) * r, this.c.y + rnd(1, this.D - 1), this.c.z + Math.sin(a) * r),
            _w.set(-Math.sin(a) * V.sense, 0.15, Math.cos(a) * V.sense), 0x9bf6ff, { count: 2, speed: 9 * V.k + 1, spread: 0.1, life: 0.6, gravity: 0, drag: 0.5, stretch: 0.08, k: 0.9 });
        }
        if (Math.random() < dt * 12) this.world.fx.bubbles(_v.set(this.c.x + rnd(-6, 6), this.c.y + rnd(0, 4), this.c.z + rnd(-6, 6)), 2);
        if (this.t > V.len) {
          this.funnel.visible = false;
          this.enterSwim(0.6);
        }
        break;
      }
    }
  }

  dist(p) {
    return this.pos.distanceTo(p);
  }

  enterSwim(gap = 1) {
    this.enter('swim');
    this.attackT = (ATTACK_GAP[this.phase] + rnd(0, 0.8)) * gap;
    this.jawTarget = 0.08;
  }

  chooseAttack(pc) {
    const ph = this.phase, c = this.c;
    let nearTail = false;
    for (let i = 14; i < SEGS; i++) if (this.segPos[i].distanceTo(pc) < 9) nearTail = true;
    const inPool = this.canBreach && Math.abs(pc.x - this.bc.x) < this.poolHalf && Math.abs(pc.z - this.bc.z) < this.poolHalf && pc.y > c.y + this.D - 3.5;
    let kind;
    if (nearTail && this.cool.whip <= 0 && this.dist(pc) > 8) kind = 'whip';
    else if (inPool && this.cool.breach <= 0) kind = 'breach';
    else {
      const w = { lunge: 3.2, spit: 2.3 };
      if (this.canBreach && this.cool.breach <= 0) w.breach = 0.7;
      if (ph >= 2 && this.cool.summon <= 0 && this.piranhas.length < 4) w.summon = ph === 2 ? 2.6 : 2;
      if (ph === 3 && this.cool.vortex <= 0) w.vortex = 4;
      if (this.last && this.last !== 'lunge') delete w[this.last];
      let sum = 0;
      for (const k in w) sum += w[k];
      let r = Math.random() * sum;
      for (const k in w) if ((r -= w[k]) <= 0) {
        kind = k;
        break;
      }
      kind ??= 'lunge';
    }
    this.startAttack(kind, pc);
  }

  startAttack(kind, pc = this.playerCenter(new THREE.Vector3())) {
    // adds go through the combat director (its signature attacks don't need a token)
    if (kind === 'summon' && !director.request(this, 1.5)) kind = 'spit';
    this.last = kind;
    if (kind === 'lunge') {
      this.lunge = { target: pc.clone(), dir: new THREE.Vector3(), start: new THREE.Vector3(), dist: 0, crash: false, locked: false };
      this.mawColor = pick(this.palette);
      this.enter('lunge_wind');
      audio.bossCharge();
    } else if (kind === 'spit') {
      this.spat = false;
      this.volleyColor = pick(this.palette);
      this.enter('spit');
      this.sfx('leviathan_spit', null, { gain: 0.7, rate: 0.8 });
    } else if (kind === 'whip') {
      this.cool.whip = 6;
      this.whipped = false;
      // lash toward you: perpendicular to the tail's own heading
      const i = Math.floor(SEGS * 0.8), f = this.segFwd[i];
      this.whipSide.subVectors(pc, this.segPos[i]);
      this.whipSide.addScaledVector(f, -this.whipSide.dot(f));
      if (this.whipSide.lengthSq() < 0.01) this.whipSide.copy(this.segRight[i]);
      this.whipSide.normalize();
      this.enter('whip');
      audio.charge();
    } else if (kind === 'breach') {
      this.cool.breach = 14;
      const c = this.bc;
      const across = new THREE.Vector3(c.x - this.pos.x, 0, c.z - this.pos.z);
      if (across.lengthSq() < 0.01) across.set(1, 0, 0);
      across.normalize();
      this.breach = { across, under: new THREE.Vector3(c.x - across.x * 9, this.c.y + this.D * 0.45, c.z - across.z * 9), rise: new THREE.Vector3(c.x - across.x * 2.2, 0, c.z - across.z * 2.2) };
      this.enter('breach_go');
    } else if (kind === 'summon') {
      this.cool.summon = 9;
      this.summoned = false;
      this.enter('summon');
      this.sfx('leviathan_spit', () => audio.droneAlert(), { gain: 0.8, rate: 1.3 });
    } else if (kind === 'vortex') {
      this.cool.vortex = 16;
      this.vortex = { r: 6, a: Math.atan2(this.pos.z - this.c.z, this.pos.x - this.c.x), sense: this.sense, len: 8, k: 0 };
      this.enter('vortex_go');
    }
  }

  // Commit the lunge: straight at where you are now, through and past you, stopping at the first wall.
  lockLunge(L) {
    L.locked = true;
    const mouth = this.mouthWorld(new THREE.Vector3());
    L.dir.subVectors(L.target, mouth);
    if (L.dir.lengthSq() < 0.01) L.dir.copy(this.dir);
    L.dir.normalize();
    // stay in the water
    if (L.dir.y > 0.75) {
      L.dir.y = 0.75;
      L.dir.normalize();
    }
    let dist = mouth.distanceTo(L.target) + 7;
    const hit = this.world.raycast(mouth, L.dir, dist + 2.6, { meshes: false });
    L.crash = false;
    if (hit) {
      dist = Math.max(1, hit.t - 2.2);
      L.crash = true;
    }
    // the head may not leave the water's top
    const topY = this.c.y + this.D - 1;
    if (L.dir.y > 0 && mouth.y + L.dir.y * dist > topY) dist = Math.max(1, (topY - mouth.y) / L.dir.y);
    L.dist = dist;
  }

  updateBeam(L, k) {
    const b = this.beam;
    b.visible = true;
    const mouth = this.mouthWorld(_v);
    b.position.copy(mouth);
    b.quaternion.setFromUnitVectors(_w.set(0, 0, 1), L.dir);
    b.scale.set(2.3, 2.3, L.dist + 1.5);
    this.beamMat.uniforms.uOpacity.value = 0.18 + 0.3 * k + 0.12 * Math.sin(this.time * 30);
    this.beamMat.uniforms.uLen.value = L.dist;
  }

  crash() {
    this.enter('stun');
    const p = this.mouthWorld(_v);
    const fx = this.world.fx;
    fx.burst(p, 0x9aa8b8, { count: 60, speed: 9, life: 1.2, size: 0.4, gravity: 3, mode: 'shard' });
    fx.burst(p, 0xffffff, { count: 20, speed: 5, life: 0.4, size: 0.6, gravity: 0 });
    fx.ring(p, null, 0x9bf6ff, { size: 1, end: 9, life: 0.5, thick: 0.1, k: 1.3 });
    fx.bubbles(p, 30);
    audio.slam();
    this.convulse = 1;
    if (this.dist(this.game.player.pos) < 30) this.game.player.shake = Math.max(this.game.player.shake, 0.6);
  }

  splash(p, out) {
    const fx = this.world.fx;
    fx.splash(p, 30);
    fx.splash(_w.copy(p).add(_u.set(1.5, 0, 0.5)), 24);
    fx.splash(_w.copy(p).add(_u.set(-1.2, 0, -1)), 24);
    fx.ring(p, UP, 0xdff4ff, { size: 1, end: 10, life: 1.1, thick: 0.08, k: 1.2 });
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2, s = rnd(2, 9);
      fx.ember(p, Math.cos(a) * s, rnd(6, 16), Math.sin(a) * s, 0xbfefff, rnd(0.8, 1.6), rnd(0.06, 0.14));
    }
    fx.bubbles(_w.copy(p).setY(p.y - 2), 30);
    this.sfx('leviathan_splash', () => audio.slam(), { gain: out ? 1 : 1.1 });
    if (this.dist(this.game.player.pos) < 35) this.game.player.shake = Math.max(this.game.player.shake, 0.5);
  }

  spitVolley(pc) {
    const ph = this.phase, n = [0, 3, 5, 5][ph];
    const mouth = this.mouthWorld(new THREE.Vector3());
    const aim = _a.subVectors(director.aim(this, mouth, pc), mouth).normalize();
    const right = _u.crossVectors(aim, UP);
    if (right.lengthSq() < 0.01) right.set(1, 0, 0);
    right.normalize();
    const speed = ph === 3 ? 7.5 : 6.5;
    this.sfx('leviathan_spit', () => audio.bossOrbs(), { gain: 1 });
    audio.enemyShoot?.();
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * 0.24;
      const v = aim.clone().addScaledVector(right, off).add(_v.set(0, rnd(-0.06, 0.06), 0)).normalize().multiplyScalar(speed);
      const color = ph === 1 ? this.volleyColor : pick(this.palette);
      const orb = new Orb(this.world, mouth, v, color, { radius: 0.45, life: 8, homing: [0, 0, 0.25, 0.35][ph], speed });
      orb.isLeviathanOrb = true;
      orb.mesh.userData.noCull = true;
    }
    this.world.fx.bubbles(mouth, 14);
  }

  spawnPiranhas(n) {
    n = Math.min(n, 6 - this.piranhas.length);
    const fx = this.world.fx;
    const from = this.gills.filter((g) => g.alive);
    for (let k = 0; k < n; k++) {
      const src = from.length ? from[k % from.length].sacs[k % 2].getWorldPosition(new THREE.Vector3()) : this.mouthWorld(new THREE.Vector3());
      const color = this.palette[(k + Math.floor(Math.random() * 4)) % this.palette.length];
      const out = new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 0.6), rnd(-1, 1)).normalize().multiplyScalar(6);
      this.piranhas.push(new Piranha(this, src, out, color));
      fx.burst(src, COLORS[color].hex, { count: 16, speed: 5, life: 0.5, size: 0.3, gravity: 0 });
      fx.bubbles(src, 8);
    }
    if (!this.hinted.piranha) {
      this.hinted.piranha = true;
      this.game.hud.bossHint('Piranha drones! One hit of their color — or outswim them with Shift.', true);
    }
  }

  updatePiranhas(dt, player) {
    for (const p of this.piranhas) p.update(dt, player);
    this.piranhas = this.piranhas.filter((p) => p.alive);
  }

  // The vortex current: around and in toward the axis; a pillar between you and the axis breaks it.
  drag(player, dt, V) {
    if (!player.swimming || V.k <= 0) return;
    const c = this.c, dx = player.pos.x - c.x, dz = player.pos.z - c.z;
    const r = Math.hypot(dx, dz) || 1;
    const fall = clamp(1.25 - r / 24, 0.25, 1);
    let k = V.k * fall;
    for (const P of this.pillars) {
      if (segBox2(player.pos.x, player.pos.z, c.x, c.z, P)) {
        k *= 0.25;
        break;
      }
    }
    const tx = (-dz / r) * V.sense, tz = (dx / r) * V.sense;
    const vt = 5.2 * k, vin = 2.6 * k;
    _v.set(tx * vt - (dx / r) * vin, Math.sign(c.y + this.D * 0.55 - player.pos.y) * 0.6 * k, tz * vt - (dz / r) * vin);
    player.vel.addScaledVector(_v, Math.min(1, dt * 2.5));
    if (Math.random() < dt * 6) this.world.fx.bubbles(_w.set(player.pos.x, player.pos.y + 1, player.pos.z), 1);
  }

  // Its flank shoves you aside (only the jaws and the lashing tail kill).
  contact(player) {
    if (player.dead) return;
    const pc = this.playerCenter(_a);
    for (let i = 0; i < SEGS; i++) {
      const d = _v.subVectors(pc, this.segPos[i]);
      const r = RAD[i] + 0.6, l = d.length();
      if (l < r && l > 1e-3) {
        d.divideScalar(l);
        const vn = player.vel.dot(d);
        player.vel.addScaledVector(d, Math.max(0, 4 - vn) + (r - l) * 6);
      }
    }
    const deadly = this.state === 'vortex';
    const dh = _v.subVectors(pc, this.pos);
    const l = dh.length();
    if (l < 3.0) {
      if (deadly) return this.kill('bite', 'DEVOURED');
      dh.divideScalar(l || 1);
      player.vel.addScaledVector(dh, Math.max(0, 4 - player.vel.dot(dh)));
    }
  }

  // ------------------------------------------------------------------ dying
  updateDying(dt) {
    const t = this.deadT += dt;
    const fx = this.world.fx, player = this.game.player;
    this.jawTarget = 0.5 + Math.sin(this.time * 11) * 0.5;
    this.convulse = 1.3;
    if (t < 3.2) {
      // convulsing: wild turns, light bursting out of it from head to tail
      if (Math.random() < dt * 3) this.thrash = new THREE.Vector3(rnd(-1, 1), rnd(-0.6, 0.6), rnd(-1, 1)).normalize();
      this.swimTo(_a.copy(this.pos).addScaledVector(this.thrash || this.dir, 5), 5, 3.5, dt);
      this.burstT = (this.burstT || 0) - dt;
      if (this.burstT <= 0) {
        this.burstT = 0.09;
        this.burstI = ((this.burstI ?? -1) + 1) % SEGS;
        const p = this.segPos[this.burstI], hex = COLORS[pick(this.palette)].hex;
        fx.burst(p, hex, { count: 30, speed: 7, life: 0.9, size: 0.45, gravity: 0 });
        fx.burst(p, 0xffffff, { count: 10, speed: 4, life: 0.4, size: 0.6, gravity: 0 });
        fx.bubbles(p, 6);
        if (this.burstI % 6 === 0) fx.ring(p, null, hex, { size: 0.6, end: 7, life: 0.6, thick: 0.1, k: 1.5 });
      }
      player.shake = Math.max(player.shake, 0.3);
      this.flash = 0.5 + 0.5 * Math.sin(t * 30);
    } else if (!this.sinking) {
      // the final burst: it goes rigid, flares white and dies
      this.sinking = true;
      for (let i = 0; i < SEGS; i++) {
        this.segPrev[i].copy(this.segPos[i]).addScaledVector(this.segFwd[i], -this.speed * 0.016);
        if (i % 3 === 0) fx.burst(this.segPos[i], 0xffffff, { count: 30, speed: 10, life: 1.0, size: 0.6, gravity: 0 });
      }
      for (let k = 0; k < 40; k++) {
        const i = Math.floor(Math.random() * SEGS);
        _v.set(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(2, 6));
        fx.shard(this.segPos[i], _v.x, _v.y, _v.z, _c.set(0x6a8aa8), 0.9, rnd(2, 4), rnd(0.15, 0.35), 1.6);
      }
      fx.ring(this.pos, null, 0xffffff, { size: 2, end: 30, life: 1.2, thick: 0.06, k: 1.4 });
      this.game.hud.whiteFlash();
      audio.explode?.(true);
      player.shake = Math.max(player.shake, 1);
      this.heart.visible = false;
      for (const g of this.gills) g.alive = false;
    }
    if (this.sinking) {
      this.glowLevel = Math.max(0.12, 1 - (t - 3.2) / 3);
      this.flash = Math.max(0, 1 - (t - 3.2) * 2);
      this.sinkStep(dt);
    }
    if (t > 6.8) {
      this.state = 'dead';
      this.defeated = true;
      this.hideHud();
      this.game.hud.zoneTitle('CHARYBDIS', 'SLAIN', COLORS[3].css);
      this.onDefeated?.();
    }
  }

  updateDead(dt) {
    this.deadT += dt;
    if (this.deadT < 16) this.sinkStep(dt);
    if (this.deadT < 30 && Math.random() < dt * 3) this.world.fx.bubbles(this.segPos[Math.floor(Math.random() * SEGS)], 2);
  }

  // The corpse as a verlet chain, sinking slowly onto the floor.
  sinkStep(dt) {
    const floorY = this.c.y;
    for (let i = 0; i < SEGS; i++) {
      const p = this.segPos[i], o = this.segPrev[i];
      _v.subVectors(p, o).multiplyScalar(0.96);
      o.copy(p);
      p.add(_v);
      p.y -= 1.6 * dt * dt * 60 * 0.016 + 0.9 * dt;
      p.y = Math.max(p.y, floorY + RAD[i] * 0.7);
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < SEGS; i++) {
        const a = this.segPos[i - 1], b = this.segPos[i];
        _v.subVectors(b, a);
        const l = _v.length() || 1, k = (l - SPACING) / l / 2;
        a.addScaledVector(_v, k);
        b.addScaledVector(_v, -k);
      }
    }
    // the head hangs off the first segment
    _v.subVectors(this.pos, this.segPos[0]);
    const l = _v.length() || 1;
    this.pos.copy(this.segPos[0]).addScaledVector(_v, HEAD_BACK / l);
    this.pos.y = Math.max(floorY + 1.4, this.pos.y - 0.9 * dt);
    this.dir.subVectors(this.pos, this.segPos[0]).normalize();
    this.layoutDead();
  }

  layoutDead() {
    for (let i = 0; i < SEGS; i++) {
      const prev = i === 0 ? this.pos : this.segPos[i - 1];
      this.segFwd[i].subVectors(prev, this.segPos[i]).normalize();
      this.orient(i, 0.6);
    }
    this.writeInstances();
  }

  // ------------------------------------------------------------------ body
  updateBody() {
    // record the head's path
    if (this.trail[0].distanceToSquared(this.pos) > TRAIL_STEP * TRAIL_STEP) {
      const v = this.trail.pop();
      v.copy(this.pos);
      this.trail.unshift(v);
    }
    // place each segment at its distance back along the path
    let j = 0, acc = 0, a = this.pos, b = this.trail[0], segLen = a.distanceTo(b);
    for (let i = 0; i < SEGS; i++) {
      const s = HEAD_BACK + i * SPACING;
      while (acc + segLen < s && j < TRAIL - 1) {
        acc += segLen;
        a = this.trail[j];
        b = this.trail[++j];
        segLen = a.distanceTo(b);
      }
      const p = this.segPos[i];
      if (acc + segLen < s) p.copy(b).addScaledVector(this.segFwd[Math.max(0, i - 1)], -(s - acc - segLen));
      else p.lerpVectors(a, b, segLen > 1e-6 ? (s - acc) / segLen : 0);
    }
    // headings and banking from the path itself, then the swimming wave and the tail lash on top
    for (let i = 0; i < SEGS; i++) {
      const prev = i === 0 ? this.pos : this.segPos[i - 1];
      const f = this.segFwd[i].subVectors(prev, this.segPos[i]);
      if (f.lengthSq() < 1e-8) f.copy(i ? this.segFwd[i - 1] : this.dir);
      f.normalize();
    }
    for (let i = 0; i < SEGS; i++) {
      // turning: bank into the turn (top toward its center, belly out) like a diving bird
      const fa = i === 0 ? this.dir : this.segFwd[i - 1], fb = this.segFwd[Math.min(SEGS - 1, i + 1)];
      _u.subVectors(fa, fb).multiplyScalar(1 / (2 * SPACING)); // curvature, toward the turn's center
      const bank = clamp(_u.length() * 9, 0, 2.2);
      this.orient(i, 1, _u.lengthSq() > 1e-8 ? _u.normalize().multiplyScalar(bank) : null);
    }
    const tm = this.time, swim = 0.25 + Math.min(1, this.speed / 10) * 0.35 + this.convulse * 0.6;
    for (let i = 0; i < SEGS; i++) {
      const t = i / (SEGS - 1);
      const wave = Math.sin(tm * (3 + this.convulse * 6) - i * 0.45) * swim * (0.3 + t * 1.2);
      this.segPos[i].addScaledVector(this.segRight[i], wave);
      if (this.whip) {
        const w = smooth((t - 0.45) / 0.55);
        this.segPos[i].addScaledVector(this.whipSide, this.whip * w * w);
      }
    }
    if (this.whip || this.convulse > 0.01) {
      for (let i = 0; i < SEGS; i++) {
        const prev = i === 0 ? this.pos : this.segPos[i - 1];
        this.segFwd[i].subVectors(prev, this.segPos[i]).normalize();
        this.orient(i, 1, null, true);
      }
    }
    this.writeInstances();
  }

  // basis for segment i from its heading; bankV leans the up vector (toward a turn's center)
  orient(i, upY = 1, bankV = null, keepUp = false) {
    const f = this.segFwd[i];
    const up = keepUp ? _w.copy(this.segUp[i]) : _w.set(0, upY, 0);
    if (bankV) up.add(bankV);
    const r = this.segRight[i].crossVectors(up, f);
    if (r.lengthSq() < 1e-4) r.copy(i ? this.segRight[i - 1] : this.headRight);
    r.normalize();
    this.segUp[i].crossVectors(f, r).normalize();
    _m.makeBasis(r, this.segUp[i], f);
    this.segQuat[i].setFromRotationMatrix(_m);
  }

  writeInstances() {
    for (let i = 0; i < SEGS; i++) {
      const p = this.segPos[i], q = this.segQuat[i], r = RAD[i];
      _m.compose(p, q, _s.set(r * 1.05, r * 0.9, SPACING * 1.4));
      this.plates.setMatrixAt(i, _m);
      _m.compose(p, q, _s.set(r * 1.06, r * 0.92, SPACING));
      this.lines.setMatrixAt(i, _m);
      const finned = i >= 3 && i <= 18;
      _m.compose(p, q, _s.setScalar(finned ? 0 : r * 0.9));
      this.spikes.setMatrixAt(i, _m);
      _m.compose(p, q, _s.set(1, finned ? r * (0.8 + 0.25 * Math.sin(i * 0.7)) : 0, finned ? r * 0.75 : 0));
      this.fins.setMatrixAt(i, _m);
    }
    for (const im of [this.plates, this.lines, this.spikes, this.fins]) {
      im.instanceMatrix.needsUpdate = true;
      im.boundingSphere = null; // recomputed lazily for ray casts
    }
  }

  initTendrils() {
    this.placeHead();
    for (let k = 0; k < this.tendrils.length; k++) {
      const T = this.tendrils[k];
      const a = this.head.localToWorld(_v.copy(this.tendrilAnchors[k]));
      T.p.forEach((p, n) => p.copy(a).addScaledVector(this.dir, -n * 0.55).setY(a.y - n * 0.1));
      T.o.forEach((o, n) => o.copy(T.p[n]));
    }
  }

  updateTendrils(dt) {
    const im = this.tendrilMesh;
    let n = 0;
    for (let k = 0; k < this.tendrils.length; k++) {
      const T = this.tendrils[k];
      T.p[0].copy(this.head.localToWorld(_v.copy(this.tendrilAnchors[k])));
      for (let i = 1; i < T.p.length; i++) {
        const p = T.p[i], o = T.o[i];
        _v.subVectors(p, o).multiplyScalar(0.9);
        o.copy(p);
        p.add(_v);
        p.y -= 0.4 * dt;
        p.x += Math.sin(this.time * 2 + i + k) * 0.01;
      }
      for (let it = 0; it < 2; it++) {
        for (let i = 1; i < T.p.length; i++) {
          const a = T.p[i - 1], b = T.p[i];
          _v.subVectors(b, a);
          const l = _v.length() || 1;
          b.copy(a).addScaledVector(_v, 0.55 / l);
        }
      }
      for (let i = 1; i < T.p.length; i++) {
        const a = T.p[i - 1], b = T.p[i];
        _v.subVectors(b, a);
        const l = _v.length() || 1e-3;
        _q.setFromUnitVectors(_w.set(0, 0, 1), _v.divideScalar(l));
        _m.compose(_u.addVectors(a, b).multiplyScalar(0.5), _q, _s.set(1 - i * 0.07, 1 - i * 0.07, l));
        im.setMatrixAt(n++, _m);
      }
    }
    im.instanceMatrix.needsUpdate = true;
  }

  placeHead() {
    const f = this.dir;
    const up = _w.set(0, 1, 0);
    if (this.segUp[0]) up.copy(this.segUp[0]).lerp(UP, 0.5);
    const r = this.headRight.crossVectors(up, f);
    if (r.lengthSq() < 1e-4) r.copy(this.segRight[0]);
    r.normalize();
    const u = _u.crossVectors(f, r).normalize();
    _m.makeBasis(r, u, f);
    this.head.quaternion.setFromRotationMatrix(_m);
    if (this.convulse > 0.01) {
      _q.setFromAxisAngle(f, Math.sin(this.time * 17) * 0.25 * this.convulse);
      this.head.quaternion.premultiply(_q);
    }
    this.head.position.copy(this.pos);
    this.head.updateMatrixWorld(true);
  }

  // head, jaw, fins, fluke, weak points, glow, lights
  // stunned: discharge crackles along its armor seams; whatever's open wears a target
  updateFeel(dt) {
    const live = this.active && this.state !== 'intro' && this.state !== 'roar' && this.state !== 'dying';
    const stun = live && this.state === 'stun';
    this.malfunction.update(dt, stun);
    if (stun) this.mawMarker.tint(COLORS[this.mawColor].hex);
    this.mawMarker.update(dt, stun ? this.maw.getWorldPosition(_v) : null, 1.6);
    const g = live && this.gills.find((q) => q.alive && q.open > 0.8);
    if (g) this.gillMarker.tint(COLORS[g.color].hex);
    // (the sac on the side facing you)
    const sac = g && g.sacs.reduce((a, b) => (a.position.distanceToSquared(this.game.camera.position) < b.position.distanceToSquared(this.game.camera.position) ? a : b));
    this.gillMarker.update(dt, g && !stun ? sac.position : null, 1);
    const heart = live && this.heartVisible && this.heartOpen > 0.6;
    this.heartLobes.forEach((l, i) => {
      if (heart) this.heartMarkers[i].tint(COLORS[this.heartColor].hex);
      this.heartMarkers[i].update(dt, heart ? l.core.getWorldPosition(_v) : null, 1.3);
    });
  }

  updateParts(dt) {
    this.convulse = Math.max(0, this.convulse - dt * 0.9);
    this.placeHead();
    this.jawOpen += (this.jawTarget - this.jawOpen) * Math.min(1, dt * (this.jawTarget > this.jawOpen ? 7 : 4));
    this.jaw.rotation.x = this.jawOpen * 0.85;
    this.lure.rotation.x = Math.sin(this.time * 1.7) * 0.08 - this.jawOpen * 0.1;
    this.lure.rotation.z = Math.sin(this.time * 1.1) * 0.06;
    this.lureHalo.scale.setScalar(1.5 + Math.sin(this.time * 3) * 0.3);
    // pectoral wings on segment 1, fluke on the last
    this.pecs.position.copy(this.segPos[1]);
    this.pecs.quaternion.copy(this.segQuat[1]);
    const flap = Math.sin(this.time * (2 + this.speed * 0.15)) * 0.35;
    this.wings[0].rotation.z = -0.2 + flap;
    this.wings[1].rotation.z = 0.2 - flap;
    this.wings.forEach((w) => (w.rotation.y = (w.position.x < 0 ? -1 : 1) * -0.25));
    const L = SEGS - 1;
    this.fluke.position.copy(this.segPos[L]).addScaledVector(this.segFwd[L], -0.4);
    this.fluke.quaternion.copy(this.segQuat[L]);

    // gills: one at a time opens in sequence; all of them flare open while it's stunned or exposed
    const ph = this.phase;
    const flare = ['stun', 'breach_wind', 'breach', 'summon'].includes(this.state) && this.active;
    this.gillT -= dt;
    const alive = this.gills.filter((g) => g.alive).sort((a, b) => a.seg - b.seg);
    if (this.gillT <= 0 && alive.length) {
      this.gillIdx = (this.gillIdx + 1) % alive.length;
      this.gillT = GILL_OPEN[ph] + 1;
      if (!this.hinted.gill && this.state === 'swim') {
        this.hinted.gill = true;
        this.game.hud.bossHint('A gill sac is open — burst it with its color!', false);
      }
    }
    const openGill = this.active && this.state !== 'intro' && this.state !== 'roar' && this.gillT > 1 ? alive[this.gillIdx % Math.max(1, alive.length)] : null;
    for (const g of this.gills) {
      const want = g.alive && (flare || g === openGill) ? 1 : 0;
      g.open += (want - g.open) * Math.min(1, dt * 6);
      g.flash = Math.max(0, g.flash - dt * 5);
      const i = g.seg, r = RAD[i];
      const pulse = 1 + Math.sin(this.time * 9 + g.k) * 0.08 * g.open;
      for (const sac of g.sacs) {
        const s = sac.userData.side;
        const size = g.alive ? (0.42 + 0.58 * g.open) * r * 0.6 * pulse : r * 0.32;
        sac.position.copy(this.segPos[i]).addScaledVector(this.segRight[i], s * r * (0.72 + 0.22 * g.open)).addScaledVector(this.segUp[i], -r * 0.1);
        sac.quaternion.copy(this.segQuat[i]);
        sac.scale.set(size * 0.8, size, size * 1.25);
        sac.userData.proxy.visible = g.alive && g.open > 0.6;
      }
      if (g.alive) {
        _c.set(COLORS[g.color].hex).multiplyScalar(0.25 + g.open * (1.5 + 0.5 * Math.sin(this.time * 10)) * this.glowLevel);
        if (g.flash > 0) _c.lerp(new THREE.Color(3, 3, 3), g.flash * 0.6);
        g.mat.color.copy(_c);
      } else {
        g.mat.color.setRGB(0.05, 0.03, 0.04);
        if (this.active && Math.random() < dt * 2) this.world.fx.bubbles(g.sacs[Math.random() < 0.5 ? 0 : 1].position, 2);
      }
    }

    // heart: phase 3 only — cycles colors, opens on a rhythm and whenever it's spinning or stunned
    if (this.heartVisible && this.state !== 'dead') {
      this.heartT += dt;
      if (this.heartT > 2.6) {
        this.heartT = 0;
        const i = this.palette.indexOf(this.heartColor);
        this.heartColor = this.palette[(i + 1) % this.palette.length];
        for (const l of this.heartLobes) this.world.fx.burst(l.core.getWorldPosition(_v), COLORS[this.heartColor].hex, { count: 14, speed: 4, life: 0.5, size: 0.4, gravity: 0 });
      }
      const rhythm = (this.time % 6.5) < 3.6;
      const want = this.state === 'vortex' || this.state === 'stun' || (this.state === 'swim' && rhythm) ? 1 : 0;
      this.heartOpen += (want - this.heartOpen) * Math.min(1, dt * 5);
      this.heartFlash = Math.max(0, this.heartFlash - dt * 5);
      const r = RAD[2];
      this.heart.position.copy(this.segPos[2]);
      this.heart.quaternion.copy(this.segQuat[2]);
      const sc = 0.55 + 0.45 * this.heartOpen + Math.sin(this.time * 7) * 0.05;
      _c.set(COLORS[this.heartColor].hex).multiplyScalar(0.4 + this.heartOpen * 1.8);
      if (this.heartFlash > 0) _c.lerp(new THREE.Color(3, 3, 3), this.heartFlash * 0.6);
      this.heartMat.color.copy(_c);
      for (const l of this.heartLobes) {
        l.g.position.x = l.s * r * (0.7 + 0.15 * this.heartOpen);
        l.core.scale.setScalar(sc);
        l.halo.material.color.set(COLORS[this.heartColor].hex);
        l.halo.scale.setScalar(1.5 + 3 * this.heartOpen);
        l.proxy.visible = this.heartOpen > 0.6;
      }
    }

    // maw: its color shows in the throat while it's open
    this.mawFlash = Math.max(0, this.mawFlash - dt * 5);
    const mawHex = this.state === 'spit' ? COLORS[this.volleyColor ?? 0].hex : COLORS[this.mawColor].hex;
    const showMaw = ['lunge_wind', 'lunge', 'stun', 'spit'].includes(this.state);
    _c.set(showMaw ? mawHex : 0x9bf6ff).multiplyScalar((0.3 + this.jawOpen * 1.8) * this.glowLevel);
    if (this.mawFlash > 0) _c.lerp(new THREE.Color(3, 3, 3), this.mawFlash * 0.6);
    this.mawMat.color.copy(_c);
    this.throatMat.color.copy(_c).multiplyScalar(0.5);
    this.throat.scale.setScalar(0.45 + this.jawOpen * 0.3 + Math.sin(this.time * 14) * 0.04);

    this.flash = Math.max(0, this.flash - dt * 3);
    this.applyGlow();
    // fluke charges white before a lash
    const charge = this.state === 'whip' && this.t < 1 ? smooth(this.t) : 0;
    this.flukeMat.emissive.setRGB(0.04 + charge * 1.8, 0.4 * this.glowLevel + charge * 1.8, 0.53 * this.glowLevel + charge * 1.8);

    // lights
    this.lightHead.position.copy(this.mouthWorld(_v));
    this.lightHead.color.copy(this.mawMat.color).lerp(new THREE.Color(0x6ff0ff), 0.4);
    this.lightHead.intensity = (14 + this.jawOpen * 26) * this.glowLevel;
    this.lightBody.position.copy(this.segPos[9]);
    this.lightBody.intensity = 12 * this.glowLevel;
  }

  applyGlow() {
    const g = this.glowLevel;
    _c.copy(this.glowBase).multiplyScalar(1.6 * g);
    if (this.phase === 3 && this.heartVisible && this.state !== 'dead') _c.lerp(new THREE.Color(COLORS[this.heartColor].hex), 0.35 + 0.15 * Math.sin(this.time * 6));
    if (this.flash > 0) _c.lerp(new THREE.Color(3, 3, 3), this.flash * 0.5);
    this.mats.glow.color.copy(_c);
    this.mats.tendril.opacity = 0.85 * g;
    this.mats.eye.color.set(this.phase === 3 && this.state !== 'dead' ? 0xff8a6a : 0xbff8ff).multiplyScalar(2.5 * Math.max(0.1, g));
  }

  updateSound(player) {
    if (!this.groan && audio.available) {
      const own = audio.available.has('leviathan_groan');
      this.groan = audio.createLoop(own ? 'leviathan_groan' : 'drone_hum', { rate: own ? 1 : 0.32 });
      this.groanGain = own ? 0.7 : 0.45;
    }
    if (!this.groan) return;
    const d = this.pos.distanceTo(player.pos);
    const alive = this.state !== 'dead';
    this.groan.setGain(alive ? this.groanGain * clamp(1 - (d - 6) / 50, 0, 1) * (this.active ? 1 : 0.6) : 0);
  }
}

// distance from p to the segment a-b
function segDist(p, a, b) {
  _u.subVectors(b, a);
  const l2 = _u.lengthSq();
  const t = l2 > 0 ? clamp(_w.subVectors(p, a).dot(_u) / l2, 0, 1) : 0;
  return _w.copy(a).addScaledVector(_u, t).distanceTo(p);
}

// does the 2D segment (x1,z1)-(x2,z2) cross the box P (x1..x2, z1..z2)?
function segBox2(ax, az, bx, bz, P) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax - P.x1], [dx, P.x2 - ax], [-dz, az - P.z1], [dz, P.z2 - az]]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
}

function mergeBoxes(geos) {
  // tiny local merge (BoxGeometry pieces share layout): positions/normals/uvs/indices
  let vCount = 0;
  const pos = [], nor = [], uv = [], idx = [];
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u.getX(i), u.getY(i));
    }
    for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + vCount);
    vCount += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
