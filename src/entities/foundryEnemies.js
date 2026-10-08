// Crimson Foundry ground enemies: the Blast Crab (a dumb leaper that explodes) and the Welder (a hulking
// flamethrower/rivet-gun humanoid that strafes, takes cover and dodge-rolls). Both are only hurt by their
// own color and are restockable (see groundKit.js / restock.js).
import * as THREE from 'three';
import { COLORS, RED } from '../colors.js';
import { audio } from '../audio.js';
import { director } from '../combat/director.js';
import { GroundEnemy, Trooper, RigDef, Bolt, blast, explosionFx, sfx, falloff, rnd, esfx, barks } from './groundKit.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _np = new THREE.Vector3();
const _fd = new THREE.Vector3();
const _pp = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const _steam = new THREE.Color(0x8a8a90);
const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

const glowHex = (color, k = 2.4) => new THREE.Color(COLORS[color].hex).multiplyScalar(k);

// ================================================================ BLAST CRAB
// A small armored crab with a glowing warhead on its back. It scuttles sideways about its patch (never
// off a ledge), notices you, zig-zags in, then crouches (legs tense, beeping faster, warhead flaring:
// ~0.55 s) and LEAPS at your face. It explodes on contact or when shot, and the blast kills anything
// close: shoot it before it lands. One hit; wrong colors ricochet off the shell.
const CRAB_ARM = 0.55; // the crouch telegraph
const CRAB_LEAP_MAX = 8.5;
const CRAB_LEGS = [
  [0.4, 0.13, 0.55], [0.43, -0.03, 0.05], [0.38, -0.18, -0.5], // left: hip x, hip z, splay
  [-0.4, 0.13, 0.55], [-0.43, -0.03, 0.05], [-0.38, -0.18, -0.5],
];

const CRAB = new RigDef((r) => {
  r.node('body', null, [0, 0.32, 0]);
  // carapace: a wide, flat hexagonal shell with a raised plate and a glowing warhead dome in a cage
  const hex = [0, Math.PI / 6, 0], wide = [1.35, 1, 0.8];
  r.add('body', 'armor', new THREE.CylinderGeometry(0.38, 0.42, 0.15, 6), [0, 0, 0], hex, wide);
  r.add('body', 'shell', new THREE.CylinderGeometry(0.27, 0.35, 0.08, 6), [0, 0.11, -0.02], hex, wide);
  r.add('body', 'dark', new THREE.CylinderGeometry(0.33, 0.24, 0.1, 6), [0, -0.12, 0], hex, wide);
  r.add('body', 'glow', new THREE.SphereGeometry(0.15, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.15, -0.04]);
  for (const a of [0, Math.PI / 3, -Math.PI / 3]) r.add('body', 'dark', new THREE.TorusGeometry(0.16, 0.016, 4, 12, Math.PI), [0, 0.15, -0.04], [0, a, 0]);
  for (const s of [-1, 1]) r.box('body', 'shell', [0.16, 0.06, 0.34], [s * 0.33, 0.08, -0.02], [0, 0, s * -0.25]); // shoulder ridges
  r.box('body', 'dark', [0.46, 0.11, 0.08], [0, 0, 0.3]); // face plate
  r.box('body', 'glow', [0.28, 0.025, 0.03], [0, 0.03, 0.345]); // mouth grille glow
  for (const s of [-1, 1]) {
    r.add('body', 'dark', new THREE.CylinderGeometry(0.024, 0.024, 0.18, 5), [s * 0.12, 0.13, 0.27], [0.3, 0, 0]);
    r.add('body', 'glow', new THREE.SphereGeometry(0.05, 8, 6), [s * 0.12, 0.23, 0.3]);
    r.box('body', 'glow', [0.025, 0.025, 0.22], [s * 0.5, 0.02, -0.02]); // side vents
  }
  r.box('body', 'armor', [0.26, 0.05, 0.12], [0, 0.06, -0.3], [-0.3, 0, 0]); // tail plate
  // big pincers held up in front, like a boxer's guard
  for (const [name, s] of [['clawL', 1], ['clawR', -1]]) {
    r.node(name, 'body', [s * 0.26, 0, 0.24], { rot: [0, s * 0.3, 0] });
    r.box(name, 'dark', [0.09, 0.09, 0.18], [0, 0, 0.08]);
    r.box(name, 'armor', [0.17, 0.14, 0.2], [0, 0.02, 0.24]);
    r.box(name, 'glow', [0.12, 0.02, 0.12], [0, 0.095, 0.24]);
    r.add(name, 'armor', new THREE.ConeGeometry(0.05, 0.2, 4), [-s * 0.035, 0.04, 0.43], [Math.PI / 2, 0, 0]);
    r.add(name, 'shell', new THREE.ConeGeometry(0.04, 0.16, 4), [s * 0.04, -0.03, 0.41], [Math.PI / 2 - 0.2, 0, 0]);
  }
  // six legs: an armored thigh up to the knee, then a tapering spike down to the ground (y -0.32)
  CRAB_LEGS.forEach(([x, z, splay], i) => {
    const s = x > 0 ? 1 : -1;
    r.node('leg' + i, 'body', [x, -0.02, z], { rot: [0, (s > 0 ? 0 : Math.PI) - s * splay, 0] });
    r.box('leg' + i, 'armor', [0.28, 0.075, 0.085], [0.12, 0.07, 0], [0, 0, 0.53]);
    r.add('leg' + i, 'dark', new THREE.SphereGeometry(0.05, 6, 4), [0.24, 0.14, 0]);
    r.add('leg' + i, 'dark', new THREE.ConeGeometry(0.045, 0.48, 5), [0.31, -0.09, 0], [0, 0, -2.847]);
  });
});

export class BlastCrab extends GroundEnemy {
  constructor(world, opts) {
    super(world, opts, { radius: 0.42, height: 0.5, hp: 1, range: 16, color: RED, patrol: 3, accel: 40 });
    this.blastRadius = opts.blast ?? 2.4;
    this.leapCool = rnd(0.3, 1);
    this.zig = Math.random() < 0.5 ? -1 : 1;
    this.zigT = 0;
    this.waitT = rnd(0.3, 1.5);
    this.target = null;
    this.legPhase = Math.random() * 10;
    this.beepT = 0;
    this.pulse = 0;
    this.m = {
      armor: this.mat(new THREE.MeshStandardMaterial({ color: 0x6e161c, metalness: 0.6, roughness: 0.38, flatShading: true })),
      shell: this.mat(new THREE.MeshStandardMaterial({ color: 0x2a2c34, metalness: 0.85, roughness: 0.3, flatShading: true })),
      dark: this.mat(new THREE.MeshStandardMaterial({ color: 0x121318, metalness: 0.7, roughness: 0.5, flatShading: true })),
      glow: this.mat(new THREE.MeshBasicMaterial({ color: 0xffffff })),
    };
    const rig = CRAB.build(this.m);
    this.n = rig.n;
    this.legs = CRAB_LEGS.map((_, i) => rig.n['leg' + i]);
    this.group.add(rig.root);
    // a slightly generous invisible hit shell (it's a small target)
    crabProxyGeo ??= new THREE.SphereGeometry(0.5, 8, 6).scale(1, 0.75, 1);
    proxyMat ??= new THREE.MeshBasicMaterial({ visible: false });
    const proxy = new THREE.Mesh(crabProxyGeo, proxyMat);
    proxy.position.y = 0.3;
    this.group.add(proxy);
    this.applyColor();
    this.attach();
  }

  applyColor() {
    this.m.glow.color.copy(glowHex(this.color));
    this.m.armor.emissive.copy(glowHex(this.color, 0.05));
  }

  onAlert() {
    this.setState('hunt');
    sfx('crab_chirp', 0.5 * falloff(this.dist, 4, 30), { alt: 'drone_alert', altRate: 1.6, altGain: 0.6 });
  }

  think(dt, player) {
    this.leapCool -= dt;
    // touching you sets it off, whatever it was doing
    if (this.touches(player, 0.18)) return this.detonate();
    const d = this.toPlayer(player, _v);
    const s = this.state;
    if (s === 'leap') return;
    if (!this.aggro && s !== 'idle') this.setState('idle');
    if (this.state === 'idle') return this.patrolStep(dt);
    if (s === 'recover') {
      this.move.set(0, 0, 0);
      if (this.stateT > 0.6) this.setState('hunt');
      return;
    }
    const faceYaw = Math.atan2(_v.x, _v.z);
    if (s === 'arm') {
      this.move.set(0, 0, 0);
      this.turnToward(faceYaw, 10, dt);
      // beeps that speed up toward the leap
      this.beepT -= dt;
      if (this.beepT <= 0) {
        const k = this.stateT / CRAB_ARM;
        this.beepT = 0.15 - 0.1 * k;
        this.pulse = 1;
        const g = 0.35 * falloff(this.dist, 3, 26);
        sfx('crab_beep', g, { rate: 1 + k * 0.5, vary: 0, synth: (gg) => audio.tone({ type: 'square', f: 1700 + k * 900, dur: 0.045, gain: 0.07 * gg / 0.35 }) });
      }
      if (this.stateT >= CRAB_ARM) {
        if (this.sees || this.dist < 4) this.leap(player);
        else {
          this.leapCool = 0.5;
          director.release(this);
          this.setState('hunt');
        }
      }
      return;
    }
    // hunt: zig-zag in sideways, facing you
    this.turnToward(faceYaw, 8, dt);
    this.zigT -= dt;
    if (this.zigT <= 0 || this.blockedBy?.x || this.blockedBy?.z) {
      this.zig *= -1;
      this.zigT = rnd(0.5, 0.9);
    }
    const approach = d > 3 ? 0.55 : 0.2;
    this.move.set(_v.x * approach - _v.z * this.zig, 0, _v.z * approach + _v.x * this.zig).normalize().multiplyScalar(3.4);
    if (this.dist < CRAB_LEAP_MAX && this.sees && this.leapCool <= 0 && this.grounded) {
      // (only while it holds one of the director's attack tokens: the whole crouch and the flight)
      if (!this.mayAttack(CRAB_ARM + 1.1)) {
        this.leapCool = this.attackWait;
        return;
      }
      this.setState('arm');
      esfx('crab_arm_whine', this.pos, 1, 1); // the warhead spins up: a rising whine under the beeps
      this.beepT = 0;
    }
  }

  // idle: scuttle sideways to a spot in its patch, pause, repeat
  patrolStep(dt) {
    if (!this.target) {
      this.move.set(0, 0, 0);
      this.waitT -= dt;
      if (this.waitT <= 0) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * this.patrol;
        const x = this.home.x + Math.cos(a) * r, z = this.home.z + Math.sin(a) * r;
        if (this.pathClear(x, z, 0.4)) this.target = new THREE.Vector3(x, 0, z);
        this.waitT = rnd(0.4, 1.6);
        if (Math.random() < 0.3 && this.dist < 14) esfx('robot_idle_click', this.pos, 0.6, 1.7); // a curious chirp-click
      }
      return;
    }
    _v.set(this.target.x - this.pos.x, 0, this.target.z - this.pos.z);
    const len = _v.length();
    if (len < 0.25 || this.blockedBy?.ledge || this.blockedBy?.x || this.blockedBy?.z) {
      this.target = null;
      return;
    }
    _v.divideScalar(len);
    this.move.copy(_v).multiplyScalar(1.7);
    // crabs go sideways: face across the direction of travel
    const side = Math.atan2(_v.x, _v.z) + Math.PI / 2;
    const alt = side + Math.PI;
    const a = Math.abs(Math.atan2(Math.sin(side - this.yaw), Math.cos(side - this.yaw))) < Math.PI / 2 ? side : alt;
    this.turnToward(a, 6, dt);
  }

  // jump at your face along a ballistic arc
  leap(player) {
    const T = THREE.MathUtils.clamp(0.32 + this.dist * 0.055, 0.4, 0.8);
    _w.copy(player.pos);
    _w.y += player.eye - 0.45;
    _w.addScaledVector(player.vel, T * 0.5).setY(_w.y); // lead you a little
    const v = this.leapVelocity(this.aimAt(this.center(new THREE.Vector3()), _w), T, new THREE.Vector3());
    if (v.length() > 17) v.setLength(17);
    this.vel.copy(v);
    this.grounded = false;
    this.ground = null;
    this.setState('leap');
    esfx('robot_effort', this.pos, 0.6, 1.7); // a strained little servo grunt as it springs
    this.leapCool = rnd(1.0, 1.6);
    const fx = this.world.fx;
    fx.burst(this.pos, 0x5a4a40, { count: 10, speed: 2.5, life: 0.5, size: 0.3, gravity: 3 });
    fx.sparks(this.center(_w), UP, COLORS[this.color].hex, { count: 8, speed: 5, spread: 1.2 });
    sfx('crab_leap', 0.5 * falloff(this.dist, 3, 24), { synth: (g) => audio.noise({ dur: 0.25, gain: 0.25 * g, freq: 1800, f2: 4000, q: 1.2 }) });
  }

  onLand() {
    if (this.state === 'leap') {
      this.setState('recover');
      this.world.fx.burst(this.pos, 0x5a4a40, { count: 8, speed: 2, life: 0.4, size: 0.25, gravity: 3 });
    }
  }

  onBlast(center, source) {
    // a neighbour's blast sets it off a beat later
    if (this.dead || this.fuse) return;
    this.fuse = 0.1 + Math.random() * 0.1;
  }

  update(dt, player) {
    if (this.fuse && !this.dead) {
      this.fuse -= dt;
      if (this.fuse <= 0) return this.detonate();
    }
    super.update(dt, player);
  }

  animate(dt) {
    const n = this.n;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const air = this.grounded ? 0 : 1;
    const arm = this.state === 'arm' ? Math.min(1, this.stateT / 0.2) : 0;
    const recover = this.state === 'recover' ? 1 - this.stateT / 0.6 : 0;
    const k = Math.min(1, speed / 2) * (1 - air);
    this.legPhase += dt * (4 + speed * 7) * (k > 0.05 ? 1 : 0);
    this.legs.forEach((leg, i) => {
      const tri = (i % 3 + (i < 3 ? 0 : 1)) % 2;
      const ph = this.legPhase + tri * Math.PI;
      const base = leg.userData.baseY ??= leg.rotation.y;
      // the tense crouch: legs splay and quiver; mid-leap they reach forward
      const quiver = arm ? Math.sin(this.t * 70 + i) * 0.04 : 0;
      leg.rotation.y = base + Math.sin(ph) * 0.32 * k + quiver + recover * Math.sin(this.t * 30 + i * 2) * 0.4 + air * (i < 3 ? -0.35 : 0.35);
      leg.rotation.z = Math.max(0, Math.cos(ph)) * 0.4 * k + arm * 0.3 - air * 0.35;
    });
    if (k > 0.05 && Math.sign(Math.sin(this.legPhase)) !== this.tickSign) {
      this.tickSign = Math.sign(Math.sin(this.legPhase));
      if (this.dist < 12) {
        const g = 0.25 * falloff(this.dist, 2, 12);
        sfx('crab_skitter', g, { synth: (gg) => audio.noise({ dur: 0.02, gain: 0.12 * gg, freq: 5200, q: 3 }) });
      }
    }
    const bob = Math.abs(Math.sin(this.legPhase * 2)) * 0.02 * k;
    n.body.position.y = 0.32 + bob - arm * 0.12 + air * 0.02;
    // nose up while arming, along the arc while airborne
    const pitch = air ? -Math.atan2(this.vel.y, Math.hypot(this.vel.x, this.vel.z) + 0.01) * 0.7 : -arm * 0.25;
    n.body.rotation.x = THREE.MathUtils.lerp(n.body.rotation.x, pitch, Math.min(1, dt * 12));
    n.body.rotation.z = arm ? Math.sin(this.t * 55) * 0.03 : 0;
    // claws snap idly; spread wide to grab mid-leap
    const snap = Math.max(0, Math.sin(this.t * 3.1)) ** 8;
    n.clawL.rotation.set(-0.25 - arm * 0.45 - air * 0.5, 0.3 + snap * 0.25 + air * 0.45, 0);
    n.clawR.rotation.set(-0.25 - arm * 0.45 - air * 0.5, -0.3 - snap * 0.25 - air * 0.45, 0);
    // the warhead: flares on each beep, white on a hit
    this.pulse = Math.max(0, this.pulse - dt * 9);
    if (this.immuneFlash > 0) this.m.glow.color.setRGB(0.7, 0.7, 0.8);
    else this.m.glow.color.copy(glowHex(this.color, 2.4 + arm * 1.5 + this.pulse * 4));
    if (air && Math.random() < dt * 30) this.world.fx.ember(this.center(_w), 0, 0, 0, COLORS[this.color].hex, 0.3, 0.06);
  }

  onHit(color, hit) {
    if (this.dead) return undefined;
    if (color !== this.color) {
      if (!this.aggro) this.onAlert();
      this.aggro = true;
      return this.immune();
    }
    this.hitSparks(hit);
    this.detonate(hit);
    return 'kill';
  }

  // Boom: kills you (and sets off other crabs) inside the blast radius, flings the shell and legs.
  detonate(hit = null) {
    if (this.dead) return;
    this.dead = true;
    const c = this.center(new THREE.Vector3());
    const hex = COLORS[this.color].hex;
    explosionFx(this.world.fx, c, hex, 0.75);
    const g = Math.max(0.25, falloff(this.dist, 6, 55));
    sfx('crab_explode', 0.9 * g, { alt: 'drone_explode', altRate: 1.35, synth: (gg) => audio.explode(false) });
    audio.tone({ type: 'sine', f: 120, f2: 35, dur: 0.4, gain: 0.35 * g });
    blast(this.world, c, this.blastRadius, this);
    barks.died(this); // a welder nearby reacts ("Crab blew! Stay back!")
    this.onDeath?.(this);
    const push = hit?.dir ? hit.dir.clone().multiplyScalar(3) : null;
    this.scatter([...this.legs, this.n.clawL, this.n.clawR, this.n.body], push, { speed: 7, up: 0.8, life: 1.4 });
    this.m.armor.emissive.setRGB(0.9, 0.3, 0.05);
  }

  cool(t) {
    const k = Math.max(0, 1 - t / 1.2);
    this.m.glow.color.setRGB(2.2 * k + 0.1, 0.6 * k * k + 0.03, 0.2 * k * k + 0.02);
    this.m.armor.emissive.setRGB(0.9 * k, 0.3 * k * k, 0.05 * k);
  }

  resetExtra() {
    this.fuse = 0;
    this.leapCool = rnd(0.3, 1);
    this.target = null;
  }
}
let crabProxyGeo = null;
let proxyMat = null;

// ================================================================ WELDER
// A hulking welding robot: crimson armor plates, a glowing welding visor, a flamethrower torch on the
// right arm and a rivet gun on the left. It strafes at mid range firing rivet bursts (shootable red
// slugs; the gun arm comes up and its muzzle glows for 0.5 s first), stomps in on you when you get
// close and torches the space in front of it (planted, flare at the nozzle 0.6 s, then a 1.6 s cone of
// fire that turns slowly: sidestep it or stagger it). Hurt, it ducks behind cover; line up a shot and
// it may dodge-roll. Every correct hit staggers it and cancels its attack. Its back is armored: shots
// there ricochet. 5 hp.
const FLAME_LEN = 5.6;
const FLAME_TAN = Math.tan(0.3);
const IGNITE_T = 0.6;
const FLAME_T = 1.6;
const AIM_T = 0.5;

const WELDER = new RigDef((r) => {
  r.node('body', null, [0, 1.06, 0]);
  r.node('pelvis', 'body', [0, 0, 0]);
  r.box('pelvis', 'dark', [0.62, 0.26, 0.42], [0, 0, 0]);
  r.box('pelvis', 'armor', [0.72, 0.12, 0.48], [0, 0.08, 0]);
  r.box('pelvis', 'armor', [0.28, 0.24, 0.08], [0, -0.1, 0.24], [0.15, 0, 0]);
  // torso: a barrel chest hunched forward
  r.node('torso', 'body', [0, 0.12, 0], { rot: [0.2, 0, 0] });
  r.box('torso', 'dark', [0.66, 0.32, 0.5], [0, 0.12, 0.02]);
  r.box('torso', 'armor', [0.98, 0.7, 0.64], [0, 0.5, 0]);
  r.box('torso', 'shell', [0.78, 0.3, 0.1], [0, 0.62, 0.32]);
  for (const y of [0.3, 0.38, 0.46]) r.box('torso', 'dark', [0.46, 0.04, 0.04], [0, y, 0.33]);
  r.box('torso', 'glow', [0.2, 0.12, 0.03], [0, 0.62, 0.38]); // chest core
  for (const s of [-1, 1]) r.box('torso', 'glow', [0.04, 0.36, 0.03], [s * 0.36, 0.48, 0.33]);
  r.box('torso', 'dark', [0.56, 0.12, 0.5], [0, 0.88, -0.02]); // collar
  // fuel tanks on the back: armored (shots ricochet)
  r.node('pack', 'torso', [0, 0.5, -0.38], { part: 'armor' });
  r.box('pack', 'shell', [0.64, 0.72, 0.12], [0, 0, 0.02]);
  for (const s of [-1, 1]) {
    r.add('pack', 'dark', new THREE.CylinderGeometry(0.16, 0.16, 0.78, 10), [s * 0.18, 0, -0.14]);
    r.add('pack', 'shell', new THREE.SphereGeometry(0.16, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), [s * 0.18, 0.39, -0.14]);
    for (const y of [-0.22, 0.2]) r.add('pack', 'armor', new THREE.CylinderGeometry(0.17, 0.17, 0.07, 10), [s * 0.18, y, -0.14]);
  }
  r.box('pack', 'glow', [0.06, 0.06, 0.04], [0, 0.28, -0.12]);
  // head: a squat helmet with a welding mask and a slit visor
  r.node('head', 'torso', [0, 0.94, 0.1]);
  r.box('head', 'shell', [0.36, 0.34, 0.38], [0, 0.13, -0.02]);
  r.box('head', 'armor', [0.42, 0.32, 0.1], [0, 0.11, 0.2], [-0.12, 0, 0]);
  r.box('head', 'glow', [0.32, 0.055, 0.04], [0, 0.14, 0.255], [-0.12, 0, 0]);
  r.box('head', 'dark', [0.44, 0.06, 0.3], [0, 0.31, -0.02]);
  for (const s of [-1, 1]) r.add('head', 'dark', new THREE.CylinderGeometry(0.07, 0.07, 0.06, 8), [s * 0.2, 0.12, 0.02], [0, 0, Math.PI / 2]);
  // arms: shoulder pivots; a rivet gun on the left, the torch on the right
  for (const [arm, fore, s] of [['armL', 'foreL', 1], ['armR', 'foreR', -1]]) {
    r.node(arm, 'torso', [s * 0.64, 0.74, 0]);
    r.box(arm, 'armor', [0.44, 0.24, 0.5], [s * 0.05, 0.1, 0], [0, 0, s * -0.15]);
    r.box(arm, 'dark', [0.22, 0.52, 0.24], [0, -0.3, 0]);
    r.node(fore, arm, [0, -0.58, 0]);
    r.box(fore, 'shell', [0.27, 0.46, 0.3], [0, -0.22, 0]);
    r.box(fore, 'armor', [0.3, 0.14, 0.33], [0, -0.06, 0]);
  }
  r.box('foreL', 'armor', [0.24, 0.32, 0.38], [0, -0.52, 0.05]);
  r.add('foreL', 'dark', new THREE.CylinderGeometry(0.05, 0.05, 0.36, 6), [0, -0.82, 0.08]);
  r.add('foreL', 'dark', new THREE.CylinderGeometry(0.13, 0.13, 0.13, 10), [0.16, -0.52, 0.02], [0, 0, Math.PI / 2]);
  r.add('foreL', 'hot', new THREE.TorusGeometry(0.06, 0.02, 4, 10), [0, -1.0, 0.08], [Math.PI / 2, 0, 0]);
  r.node('muzzleL', 'foreL', [0, -1.05, 0.08]);
  r.add('foreR', 'dark', new THREE.CylinderGeometry(0.11, 0.15, 0.24, 8), [0, -0.52, 0]);
  r.add('foreR', 'shell', new THREE.CylinderGeometry(0.06, 0.09, 0.42, 8), [0, -0.8, 0]);
  for (const y of [-0.66, -0.74, -0.82]) r.add('foreR', 'dark', new THREE.CylinderGeometry(0.11, 0.11, 0.025, 8), [0, y, 0]);
  r.add('foreR', 'hot', new THREE.SphereGeometry(0.055, 8, 6), [0, -1.03, 0]);
  r.add('foreR', 'dark', new THREE.TorusGeometry(0.2, 0.03, 4, 10, Math.PI), [0.08, -0.4, -0.12], [0, Math.PI / 2, 0]); // fuel line
  r.node('nozzle', 'foreR', [0, -1.04, 0]);
  // legs: short and heavy
  for (const [leg, shin, s] of [['legL', 'shinL', 1], ['legR', 'shinR', -1]]) {
    r.node(leg, 'body', [s * 0.24, -0.06, 0]);
    r.box(leg, 'dark', [0.28, 0.5, 0.32], [0, -0.25, 0]);
    r.box(leg, 'armor', [0.32, 0.2, 0.12], [0, -0.48, 0.15]);
    r.node(shin, leg, [0, -0.5, 0]);
    r.box(shin, 'armor', [0.27, 0.42, 0.32], [0, -0.21, 0]);
    r.box(shin, 'dark', [0.34, 0.12, 0.5], [0, -0.44, 0.07]);
  }
});

// the torch's cone of fire: white-hot at the nozzle, fading to nothing (additive, so black is clear)
let flameGeo = null;
function makeFlameGeo() {
  // (shifted so the apex sits at the nozzle and it widens along -y, the way the arm points)
  const g = new THREE.ConeGeometry(FLAME_LEN * FLAME_TAN, FLAME_LEN, 14, 6, true).translate(0, -FLAME_LEN / 2, 0);
  const pos = g.attributes.position, col = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const u = THREE.MathUtils.clamp(-pos.getY(i) / FLAME_LEN, 0, 1);
    c.setRGB(1, 0.85, 0.5).lerp(new THREE.Color(1, 0.35, 0.05), Math.min(1, u * 1.6)).multiplyScalar(Math.pow(1 - u, 1.4) * 0.55);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export class Welder extends Trooper {
  constructor(world, opts) {
    super(world, opts, { radius: 0.6, height: 2.45, hp: 5, range: 26, color: RED, patrol: 4, speed: 2.4, prefer: [4, 12], dodge: 2.2, accel: 14 });
    this.fireCool = rnd(1, 2);
    this.flameCool = 1.5;
    this.chargeCool = 1;
    this.turnRate = 5;
    this.stride = 0.5;
    this.strideLen = 1.05; // m per step: short, heavy strides
    this.crouchDrop = 0.3;
    this.rollRadius = 0.62; // hip height when tucked into a roll (the curled body's reach)
    this.barkPersona = 'foundry'; // combat/barks.js
    this.painSound = 'robot_pain_heavy';
    this.voicePitch = 0.9;
    this.m = {
      armor: this.mat(new THREE.MeshStandardMaterial({ color: 0x8a1c24, metalness: 0.55, roughness: 0.4, flatShading: true })),
      shell: this.mat(new THREE.MeshStandardMaterial({ color: 0x2c2e36, metalness: 0.85, roughness: 0.32, flatShading: true })),
      dark: this.mat(new THREE.MeshStandardMaterial({ color: 0x141519, metalness: 0.7, roughness: 0.55, flatShading: true })),
      glow: this.mat(new THREE.MeshBasicMaterial({ color: 0xffffff })),
      hot: this.mat(new THREE.MeshBasicMaterial({ color: 0x331008 })), // the torch tip and muzzle ring
    };
    const rig = WELDER.build(this.m);
    this.n = rig.n;
    for (const a of [this.n.armL, this.n.armR]) a.rotation.order = 'YXZ';
    this.group.add(rig.root);
    flameGeo ??= makeFlameGeo();
    this.flameMat = this.mat(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.flame = new THREE.Mesh(flameGeo, this.flameMat);
    this.flame.visible = false;
    this.flame.userData.noHit = true;
    this.n.nozzle.add(this.flame);
    this.roar = audio.createLoop('incinerator_roar');
    this.loops.push(this.roar);
    this.applyColor();
    this.attach();
  }

  applyColor() {
    this.m.glow.color.copy(glowHex(this.color));
    this.m.armor.emissive.copy(glowHex(this.color, 0.04));
  }

  onAlert() {
    this.setState('engage');
    sfx('welder_alert', 0.6 * falloff(this.dist, 5, 35), { alt: 'drone_alert', altRate: 0.55, synth: (g) => audio.tone({ type: 'sawtooth', f: 90, f2: 60, dur: 0.5, gain: 0.12 * g }) });
  }

  onStep(amp = 1) {
    const g = 0.3 * falloff(this.dist, 3, 26);
    sfx('welder_step', g, { alt: 'boss_step', altRate: 1.8, altGain: 0.5, synth: (gg) => audio.tone({ type: 'sine', f: 70, f2: 40, dur: 0.12, gain: 0.25 * gg }) });
    // the knee and hip servos whine with each stride, harder and higher the faster it goes
    esfx('servo_heavy', this.pos, 0.35 + 0.45 * amp, 0.8 + 0.3 * amp);
  }

  onRoll() {
    const g = 0.5 * falloff(this.dist, 3, 26);
    sfx('welder_roll', g, { synth: (gg) => {
      audio.noise({ dur: 0.35, gain: 0.2 * gg, freq: 600, f2: 2400, q: 1 });
      audio.tone({ type: 'sine', f: 90, f2: 40, dur: 0.2, gain: 0.3 * gg, delay: 0.45 });
    } });
  }

  engage(dt, player, d) {
    this.fireCool -= dt;
    this.flameCool -= dt;
    this.chargeCool -= dt;
    if (!this.sees || this.stagger > 0 || this.attackWait > 0) return;
    // every attack waits for one of the director's tokens (held through its wind-up)
    if (this.flameCool <= 0 && d < 5.5) {
      if (this.mayAttack(IGNITE_T + FLAME_T + 0.2)) this.setState('ignite');
      return;
    }
    if (this.flameCool <= 0 && this.chargeCool <= 0 && d < 11) {
      this.chargeCool = rnd(5, 8);
      if (this.mayAttack(2.6 + IGNITE_T + FLAME_T)) this.setState('charge');
      return;
    }
    if (this.fireCool <= 0 && d > 3.5 && this.mayAttack(AIM_T + 0.5)) this.setState('aim');
  }

  act(dt, player, d) {
    const s = this.state;
    this.move.set(0, 0, 0);
    if (s === 'charge') {
      // stomp straight at you, then light up
      if (this.stateT <= dt * 1.5) {
        barks.say(this, 'charge');
        esfx('robot_effort', this.pos, 1, 0.85);
      }
      this.toPlayer(player, _v);
      this.move.copy(_v).multiplyScalar(this.speed * 1.45);
      if (d < 5.2) this.setState('ignite');
      else if (this.stateT > 2.6 || !this.sees || this.blockedBy?.ledge) {
        director.release(this);
        this.setState('engage');
      }
    } else if (s === 'aim') {
      if (this.stateT >= AIM_T) {
        this.setState('burst');
        this.shots = 0;
        this.shotT = 0;
      }
    } else if (s === 'burst') {
      this.shotT -= dt;
      if (this.shotT <= 0) {
        this.shotT = 0.14;
        this.fireRivet(player);
        if (++this.shots >= 3) {
          this.fireCool = rnd(2, 3.2);
          director.release(this);
          this.setState('engage');
        }
      }
    } else if (s === 'ignite') {
      this.wantCrouch = 0.35;
      if (this.stateT === dt || this.stateT < dt * 1.5) {
        sfx('welder_ignite', 0.45 * falloff(this.dist, 3, 30), { synth: (g) => audio.noise({ dur: 0.6, gain: 0.18 * g, freq: 3000, f2: 7000, q: 0.8 }) });
      }
      if (this.stateT >= IGNITE_T) {
        this.setState('flame');
        sfx('welder_ignite_burst', 0.8 * falloff(this.dist, 3, 34), { alt: 'incinerator_ignite', altRate: 1.15, synth: (g) => audio.noise({ dur: 0.4, gain: 0.35 * g, freq: 700, q: 0.6, type: 'lowpass' }) });
      }
    } else if (s === 'flame') {
      this.wantCrouch = 0.25;
      this.toPlayer(player, _v);
      this.move.copy(_v).multiplyScalar(0.5); // a slow advance behind the fire
      if (this.stateT >= FLAME_T) this.setState('vent');
    } else if (s === 'vent') {
      this.wantCrouch = 0;
      if (this.stateT <= dt * 1.5) {
        // the torch overheats: it vents steam from the tanks, shoulders slumped
        esfx('welder_vent', this.pos, 1, 1);
        barks.say(this, 'reload');
      }
      if (this.dist < 30 && Math.random() < dt * 30) {
        this.group.updateMatrixWorld(true);
        const p = this.n.pack.getWorldPosition(_w);
        this.world.fx.puff(p, rnd(-0.6, 0.6), rnd(1, 2), rnd(-0.6, 0.6), _steam, 0.4, 0.9, 0.35, 2.5);
      }
      if (this.stateT >= 0.7) {
        director.release(this);
        this.flameCool = rnd(3.5, 5);
        this.fireCool = Math.max(this.fireCool, 0.8);
        this.setState('engage');
      }
    }
    if (s !== 'ignite' && s !== 'flame') this.wantCrouch = this.state === 'cover' ? 0.6 : 0;
  }

  // a correct hit (or a roll) cancels whatever it was winding up
  interrupt() {
    if (this.state === 'flame' || this.state === 'ignite' || this.state === 'charge') this.flameCool = 2.2;
    this.fireCool = Math.max(this.fireCool, 1);
    this.wantCrouch = 0;
    director.release(this);
    this.setState('engage');
  }

  // the roll turns slowly while torching: you can outpace the cone by circling
  get turnRateNow() {
    return this.state === 'flame' ? 1.1 : this.state === 'ignite' ? 3 : 5;
  }

  think(dt, player) {
    this.turnRate = this.turnRateNow;
    if (this.state !== 'cover' && this.state !== 'ignite' && this.state !== 'flame') this.wantCrouch = this.state === 'cover' ? 0.6 : 0;
    super.think(dt, player);
    if (this.state === 'cover') this.wantCrouch = this.coverAt ? 0 : 0.6;
  }

  canDodge() {
    return this.state === 'engage' || this.state === 'cover' || this.state === 'aim';
  }

  fireRivet(player) {
    this.group.updateMatrixWorld(true);
    const from = this.n.muzzleL.getWorldPosition(new THREE.Vector3());
    _w.copy(player.pos).y += player.eye * 0.7;
    const dist = from.distanceTo(_w);
    _w.addScaledVector(player.vel, (dist / 17) * 0.5); // a little lead
    const dir = this.aimAt(from, _w).sub(from).normalize();
    dir.x += (Math.random() - 0.5) * 0.04;
    dir.y += (Math.random() - 0.5) * 0.03;
    dir.z += (Math.random() - 0.5) * 0.04;
    new Bolt(this.world, from, dir.normalize().multiplyScalar(17), this.color, { radius: 0.18, style: 'rivet' });
    this.world.fx.flash(from, COLORS[this.color].hex, { size: 0.4, life: 0.08, k: 1.8 });
    this.world.fx.sparks(from, dir, 0xffd9a0, { count: 6, speed: 9, spread: 0.4, life: 0.2 });
    this.recoil = 1;
    // the kick: the torso rocks back and twists off the gun side, the hips give a little
    this.pS.kick(-2.2);
    this.tS.kick(1.4); // (y > 0 swings its left, gun-side shoulder back)
    this.sqS.kick(-0.15);
    sfx('welder_rivet', 0.55 * falloff(this.dist, 4, 40), { alt: 'enemy_shot', altRate: 0.72, synth: () => audio.enemyShoot() });
  }

  animate(dt, player) {
    const n = this.n;
    const s = this.state;
    const u = this.stateT;
    // the body language of each attack, fed to the shared pose as lean / twist targets:
    //   aim: settles back onto its heels and squares the gun shoulder to you (anticipation)
    //   burst: braced, each rivet kicks the torso back (fireRivet)
    //   ignite: rears back as the pilot sputters, then hunches over the torch as it catches
    //   flame: leans into the fire, shuddering; vent: slumps, head down, steaming; charge: head down, rushing
    let ap = 0, ar = 0, at = 0, nod = 0;
    if (s === 'aim') {
      ap = -0.1 * smooth01(u / AIM_T * 1.6);
      at = this.aimErr * 0.45 + 0.12;
    } else if (s === 'burst') {
      ap = -0.05;
      at = this.aimErr * 0.45 + 0.12;
    } else if (s === 'ignite') {
      const k = u / IGNITE_T;
      ap = -0.16 * smooth01(k * 2.5) + 0.42 * smooth01((k - 0.55) * 2.2);
      ar = Math.sin(this.t * 31) * 0.02 * k;
    } else if (s === 'flame') {
      ap = 0.26 + Math.sin(this.t * 27) * 0.02;
      ar = Math.sin(this.t * 19) * 0.025;
    } else if (s === 'vent') {
      const k = Math.min(1, u / 0.7);
      ap = 0.3 * (1 - k * k);
      nod = 0.35 * (1 - k);
    } else if (s === 'charge') {
      ap = 0.3;
      nod = 0.15;
    } else if (s === 'cover' && !this.coverAt) ap = 0.15;
    this.actPitch = ap;
    this.actRoll = ar;
    this.actTwist = at;
    this.headNod = nod;
    this.poseBase(dt);
    // aim: the arm pitch onto your chest (the torso's lean taken out), and the yaw that brings an offset
    // arm onto you (the torso's twist taken out)
    const d = Math.max(1, Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z));
    const aimX = this.aimPitch(player, 1.95);
    const inward = Math.atan2(0.64, d);
    this.recoil = Math.max(0, (this.recoil || 0) - dt * 8);
    const breathe = this.breath * 1.5; // shoulders rise and fall when it stands still
    // left arm: rivet gun (it may lead the body onto you: the rivets aim themselves)
    const aiming = s === 'aim' || s === 'burst';
    const aimK = aiming ? Math.min(1, u / 0.22 + (s === 'burst' ? 1 : 0)) : 0;
    const was = this.aimL ?? 0;
    this.aimL = THREE.MathUtils.lerp(was, aimK, Math.min(1, dt * 14));
    if (was < 0.15 && this.aimL >= 0.15) esfx('servo_heavy', this.pos, 0.7, 1.15); // the gun arm swings up
    n.armL.rotation.set(
      THREE.MathUtils.lerp(this.armSwing * 0.8 + 0.06, aimX + this.recoil * 0.3, this.aimL) - this.tuck * 1.2,
      THREE.MathUtils.lerp(0, -inward + this.aimErr - this.bodyTwist, this.aimL),
      (0.14 + breathe) * (1 - this.aimL),
    );
    n.foreL.rotation.x = THREE.MathUtils.lerp(-0.35 - this.gaitAmp * 0.15, -this.recoil * 0.2, this.aimL) - this.tuck * 1.4;
    // right arm: torch (locked to the body's facing: the cone turns only as fast as the body does)
    const torch = s === 'ignite' || s === 'flame' ? Math.min(1, u / 0.25 + (s === 'flame' ? 1 : 0)) : 0;
    const wasR = this.aimR ?? 0;
    this.aimR = THREE.MathUtils.lerp(wasR, torch, Math.min(1, dt * 12));
    if (wasR < 0.15 && this.aimR >= 0.15) esfx('servo_heavy', this.pos, 0.7, 0.9);
    n.armR.rotation.set(
      THREE.MathUtils.lerp(-this.armSwing * 0.8 + 0.06, aimX, this.aimR) - this.tuck * 1.2,
      THREE.MathUtils.lerp(0, inward - this.bodyTwist, this.aimR),
      (-0.14 - breathe) * (1 - this.aimR),
    );
    n.foreR.rotation.x = THREE.MathUtils.lerp(-0.35 - this.gaitAmp * 0.15, 0, this.aimR) - this.tuck * 1.4;
    // glows: the visor flares when it attacks; the muzzle ring and torch tip heat up on the wind-up
    const flare = s === 'ignite' ? (0.4 + 0.6 * (this.stateT / IGNITE_T)) * (0.7 + 0.3 * Math.sin(this.t * 60)) : s === 'flame' ? 1 : 0;
    const muzzle = s === 'aim' ? this.stateT / AIM_T : s === 'burst' ? 1 : 0;
    const heat = Math.max(flare, muzzle);
    this.m.hot.color.setRGB(0.2 + 3 * heat, 0.06 + 1.6 * heat, 0.03 + 0.6 * heat);
    if (this.flash > 0) this.m.glow.color.setRGB(3, 3, 3);
    else if (this.immuneFlash > 0) this.m.glow.color.setRGB(0.7, 0.7, 0.8);
    else this.m.glow.color.copy(glowHex(this.color, 2.4 + heat * 1.2));
    this.updateFlame(dt, player, s, flare);
  }

  // the torch: ignition sparks, then the lethal cone with streaming fire
  updateFlame(dt, player, s, flare) {
    const fx = this.world.fx;
    const lit = s === 'flame';
    this.flame.visible = lit;
    this.roar.setGain(lit ? 0.9 * falloff(this.dist, 4, 34) ** 2 : 0);
    if (s !== 'ignite' && !lit) return;
    this.group.updateMatrixWorld(true);
    const np = this.n.nozzle.getWorldPosition(_np);
    this.n.nozzle.getWorldQuaternion(_q);
    const fd = _fd.set(0, -1, 0).applyQuaternion(_q);
    if (s === 'ignite') {
      // the ignition flare: a sputtering pilot that brightens, spitting sparks
      if (Math.random() < dt * 40) fx.sparks(np, fd, 0xffb040, { count: 3, speed: 5, spread: 0.9, life: 0.25, gravity: 6 });
      if (Math.random() < dt * 25) fx.flash(np, 0xff9a30, { size: 0.25 + 0.35 * flare, life: 0.06, k: 1.6 });
      return;
    }
    // flicker the cone
    const f = 0.85 + Math.random() * 0.3;
    this.flame.scale.set(f, Math.min(1, this.stateT / 0.12) * (0.92 + Math.random() * 0.1), f);
    // streaming fire and smoke along the cone
    for (let i = 0, c = Math.ceil(dt * 100); i < c; i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(FLAME_TAN * 1.6).add(fd).normalize();
      const sp = rnd(10, 14);
      fx.ember(np, _v.x * sp, _v.y * sp, _v.z * sp, Math.random() < 0.5 ? 0xffb040 : 0xff6a1a, FLAME_LEN / sp, rnd(0.05, 0.11));
    }
    if (Math.random() < dt * 20) {
      _w.copy(np).addScaledVector(fd, FLAME_LEN * rnd(0.6, 1));
      fx.puff(_w, rnd(-0.5, 0.5), rnd(0.5, 1.2), rnd(-0.5, 0.5), new THREE.Color(0x4a3a34), 0.35, 1, 0.5, 3);
    }
    if (this.stateT < 0.1 && this.stateT >= 0) fx.flash(np, 0xffc070, { size: 1.2, life: 0.15, k: 1.8 });
    // lethal: any part of you inside the cone with a clear line from the nozzle
    for (const h of [0.3, player.height * 0.5, player.eye]) {
      _pp.copy(player.pos).y += h;
      _v.subVectors(_pp, np);
      const along = _v.dot(fd);
      if (along < 0 || along > FLAME_LEN) continue;
      const perp = Math.sqrt(Math.max(0, _v.lengthSq() - along * along));
      if (perp < along * FLAME_TAN + 0.3 && this.world.lineOfSight(np, _pp)) {
        player.damage(1, 'burn');
        break;
      }
    }
  }

  onHit(color, hit) {
    if (this.dead) return undefined;
    // the back is armored: ricochet
    if (hit?.object?.userData.part === 'armor' || color !== this.color) {
      if (!this.aggro) this.onAlert();
      if (color !== this.color && this.rollCool <= 0 && this.canDodge() && Math.random() < 0.4) this.tryRoll(this.world.game.player);
      return this.immune();
    }
    return this.takeHit(hit, { stagger: 0.3, knock: 2 });
  }

  onDie() {
    this.flame.visible = false;
    this.roar.setGain(0);
    sfx('welder_death', 0.7 * Math.max(0.3, falloff(this.dist, 6, 50)), { alt: 'drone_crash', altRate: 0.7 });
  }

  dyingFx(dt, k) {
    // a ruptured tank spits fire and sparks before it blows
    this.group.updateMatrixWorld(true);
    const p = this.n.pack.getWorldPosition(_w);
    const fx = this.world.fx;
    fx.burst(p, 0xffa040, { count: 3, speed: 4, life: 0.4, size: 0.2, gravity: 6 });
    if (Math.random() < 0.5) fx.burst(p, 0x3a3a44, { count: 1, speed: 0.6, life: 1.2, size: 0.6, gravity: -1.5, drag: 1 });
    this.m.glow.color.setRGB(Math.random() < 0.3 ? 2 : 0.3, 0.08, 0.05);
  }

  finishDeath() {
    this.group.updateMatrixWorld(true);
    const p = this.n.pack.getWorldPosition(new THREE.Vector3());
    explosionFx(this.world.fx, p, COLORS[this.color].hex, 1.1);
    audio.droneExplode(Math.max(0.25, falloff(this.dist, 8, 60)));
    const player = this.world.game.player;
    player.shake = Math.max(player.shake, 0.2 + 0.3 * falloff(this.dist, 4, 30));
    const n = this.n;
    this.scatter([n.head, n.armL, n.armR, n.pack, n.legL, n.legR, n.torso, n.pelvis], this.deathDir.clone().multiplyScalar(2), { speed: 6, up: 0.9, life: 1.8 });
    this.m.armor.emissive.setRGB(0.9, 0.3, 0.05);
  }

  cool(t) {
    const k = Math.max(0, 1 - t / 1.6);
    this.m.glow.color.setRGB(2 * k + 0.1, 0.6 * k * k + 0.03, 0.2 * k * k + 0.02);
    this.m.armor.emissive.setRGB(0.9 * k, 0.3 * k * k, 0.05 * k);
  }

  resetExtra() {
    this.flame.visible = false;
    this.roar.setGain(0);
    this.fireCool = rnd(1, 2);
    this.flameCool = 1.5;
    this.wantCrouch = 0;
    this.stagger = 0;
  }
}
