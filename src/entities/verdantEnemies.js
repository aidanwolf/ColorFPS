// VERDANT creatures: the Slime Mold (a dumb ground leaper with a robot core inside) and the Spider Bot
// (a smart wall-crawler that spits acid and rolls aside when you line up a shot).
import * as THREE from 'three';
import { COLORS, RED, GREEN } from '../colors.js';
import {
  UP, falloff, rnd, sfx, Voice, moveSafe, groundBelow, aimedAt, touchesPlayer, lobVelocity,
  floorGlowTexture, Glob, Debris, blast, hitSparks, tint, shortRay,
} from './critters.js';
import { director } from '../combat/director.js';
import { esfx } from './enemySfx.js';
import { barks } from '../combat/barks.js';

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

const GRAVITY = 20;
const DORMANT = 70; // m: farther than this, a creature only idles

// ======================================================================================================
// SLIME MOLD
// A quivering blob of glowing slime around a little robot core. It oozes about, and when you come near it
// creeps after you; in range it squashes down and quivers (the telegraph) and springs at where you stood.
// Shoot it with the slime's color and the slime blasts off, exposing the core (another color), which
// scurries away and hops at you; finish the core with its color before the slime grows back.
// ======================================================================================================
const SLIME = {
  windup: 0.8, // s squashing down before a leap
  coreWindup: 0.55,
  creep: 1.7, // m/s oozing toward you
  scurry: 4.6, // m/s the bare core runs
  land: 0.9, // s to recover after landing
  cool: 1.2, // s between leaps
  regrowTime: 1.3, // s the slime visibly takes to grow back (at the end of `regrow`)
};
let slimeGeo = null;
// dark mold nodules dotting the top of the blob (unit-sphere coordinates)
const SPORES = [[0.35, 0.82, 0.3, 0.1], [-0.42, 0.75, -0.2, 0.12], [0.05, 0.95, -0.25, 0.08], [-0.2, 0.7, 0.62, 0.09], [0.6, 0.55, -0.45, 0.08], [-0.7, 0.5, 0.3, 0.07]];

function slimeGeometry() {
  if (slimeGeo) return slimeGeo;
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    legs.push(new THREE.CylinderGeometry(0.025, 0.04, 0.32, 4).translate(0, -0.16, 0).rotateZ(0.7).rotateY(-a).translate(Math.cos(a) * 0.15, -0.04, Math.sin(a) * 0.15));
  }
  slimeGeo = {
    blob: new THREE.SphereGeometry(1, 22, 16),
    bit: new THREE.IcosahedronGeometry(1, 0),
    core: new THREE.IcosahedronGeometry(0.2, 1),
    band: new THREE.TorusGeometry(0.205, 0.04, 5, 18).rotateX(Math.PI / 2),
    eye: new THREE.SphereGeometry(0.075, 8, 6).scale(1.4, 1, 1).translate(0, 0.05, -0.18),
    spores: mergeAll(SPORES.map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 0).translate(x, y, z))),
    legs: mergeAll(legs),
    glow: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  };
  return slimeGeo;
}

function mergeAll(geos) {
  // a tiny merge for same-attribute geometries (keeps this file free of the addons import)
  const out = new THREE.BufferGeometry();
  const pos = [], nor = [], idx = [];
  let base = 0;
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(i + base);
    base += p.count;
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

// The slime's look: translucent goo with a bright rim, its surface rippling (vertex shader).
function slimeMaterial(color, uniforms) {
  const c = new THREE.Color(COLORS[color].hex);
  const m = new THREE.MeshStandardMaterial({
    color: c.clone().multiplyScalar(0.3), emissive: c.clone().multiplyScalar(0.3), roughness: 0.15, metalness: 0.05,
    transparent: true, opacity: 0.6,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uAmp = uniforms.uAmp;
    sh.vertexShader = 'uniform float uTime;\nuniform float uAmp;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float wob = sin(position.x * 5.0 + uTime * 4.1) * sin(position.y * 4.0 + uTime * 3.3) + 0.6 * sin(position.z * 6.0 - uTime * 5.2);
      transformed += normal * wob * uAmp;`,
    );
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float rim = 1.0 - abs(dot(normalize(vViewPosition), normal));
      totalEmissiveRadiance += emissive * rim * rim * 3.5;`,
    );
  };
  m.customProgramCacheKey = () => 'slime-goo';
  return m;
}

export class Slime {
  constructor(world, opts) {
    const { pos, color = GREEN, core = RED, slimeHp = 1, range = 16, leapRange = 8.5, regrow = 4.5, wander = 3, size = 1, onDeath = null } = opts;
    this.spawnOpts = opts; // so the area can restock it (see restock.js)
    this.critter = true;
    this.barkPersona = 'verdant'; // the robot core inside speaks for the swarm (combat/barks.js)
    this.world = world;
    this.slimeColor = color;
    this.coreColor = core === color ? (color + 2) % 4 : core;
    this.slimeMax = slimeHp;
    this.range = range;
    this.leapRange = leapRange;
    this.regrow = regrow;
    this.wander = wander;
    this.size = size;
    this.R = 0.7 * size; // slime radius
    this.onDeath = onDeath;
    this.home = new THREE.Vector3(...pos);
    const g = groundBelow(world, this.home, 1, 6);
    if (g) this.home.y = g.point.y;
    this.pos = new THREE.Vector3(); // the center of the blob (or of the core)
    this.vel = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.face = new THREE.Vector3(0, 0, -1);
    this.t = Math.random() * 100;
    this.dead = false;
    this.dist = Infinity;
    this.uniforms = { uTime: { value: 0 }, uAmp: { value: 0.04 } };

    const G = slimeGeometry();
    this.group = new THREE.Group();
    this.group.userData.hit = this;
    this.gooMat = slimeMaterial(color, this.uniforms);
    this.blob = new THREE.Mesh(G.blob, this.gooMat);
    this.blob.renderOrder = 2;
    // bright motes drifting inside the goo
    this.bitMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS[color].hex).multiplyScalar(2.2) });
    this.sporeMat = new THREE.MeshStandardMaterial({ color: 0x1c2a12, roughness: 0.9, flatShading: true, emissive: new THREE.Color(COLORS[color].hex).multiplyScalar(0.08) });
    this.blob.add(new THREE.Mesh(G.spores, this.sporeMat));
    this.bits = [];
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(G.bit, this.bitMat);
      b.scale.setScalar(0.05 * size);
      this.bits.push(b);
      this.blob.add(b);
    }
    // the robot core: a dark metal ball with a glowing band and eye, on stubby legs
    this.metalMat = new THREE.MeshStandardMaterial({ color: 0x8a8f9c, metalness: 0.7, roughness: 0.35, flatShading: true });
    this.coreGlow = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.core = new THREE.Group();
    const shell = new THREE.Mesh(G.core, this.metalMat);
    const band = new THREE.Mesh(G.band, this.coreGlow);
    const eye = new THREE.Mesh(G.eye, this.coreGlow);
    this.legs = new THREE.Mesh(G.legs, this.metalMat);
    this.core.add(shell, band, eye, this.legs);
    this.core.scale.setScalar(size * 1.25);
    this.coreParts = [shell, band, eye, this.legs];
    // a glow pooled on the floor under it: reads from a distance and in the dark
    this.floorMat = new THREE.MeshBasicMaterial({ map: floorGlowTexture(), color: new THREE.Color(COLORS[color].hex).multiplyScalar(0.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.floorGlow = new THREE.Mesh(G.glow, this.floorMat);
    this.floorGlow.raycast = () => {};
    this.group.add(this.blob, this.core, this.floorGlow);
    world.scene.add(this.group);
    world.addHittable(this.group);
    world.add(this);
    this.voice = new Voice('slime_burble', { gain: 0.25, near: 2, far: 14, rate: rnd(0.9, 1.1) });
    this.reset();
  }

  get color() {
    return this.stage === 'slime' ? this.slimeColor : this.coreColor;
  }

  // back to its post with its slime on (also on every player respawn)
  reset() {
    if (this.dead) return;
    this.stage = 'slime';
    this.state = 'idle';
    this.slimeHp = this.slimeMax;
    this.pos.copy(this.home).y += this.R * 0.75;
    this.vel.set(0, 0, 0);
    this.timer = rnd(0.5, 2);
    this.cool = 1;
    this.aggro = false;
    this.sees = false;
    this.sightTimer = 0;
    this.lostT = 0;
    this.flash = 0;
    this.immuneFlash = 0;
    this.grow = 1;
    this.squash = 1;
    this.squashV = 0;
    this.groundY = this.home.y;
    this.blob.visible = true;
    this.core.position.set(0, -0.05 * this.size, 0);
    this.core.rotation.set(0, 0, 0);
    this.puddle?.dispose();
    this.puddle = null;
    this.applyColor();
    this.sync(0);
  }

  applyColor() {
    tint(this.coreGlow, this.coreColor, 2.4);
  }

  update(dt, player) {
    if (this.dead) return;
    _eye.copy(player.pos).y += player.eye;
    this.dist = this.pos.distanceTo(_eye);
    this.t += dt;
    this.uniforms.uTime.value = this.t;
    if (this.puddle && this.puddle.update(dt)) this.puddle = null;
    if (this.dist > DORMANT) {
      this.voice.update(this.dist);
      return;
    }
    this.sightTimer -= dt;
    if (this.sightTimer <= 0) {
      this.sightTimer = 0.25;
      this.sees = this.dist < this.range && this.world.lineOfSight(this.pos, _eye);
      if (this.sees && !this.aggro) {
        sfx('slime_squelch', 0.5 * falloff(this.dist, 4, 25));
        barks.say(this, 'spot');
      }
      if (this.sees) this.aggro = true;
    }
    this.lostT = this.sees ? 0 : this.lostT + dt;
    if (this.aggro && this.lostT > 5) this.aggro = false;
    this.cool -= dt;
    this.timer -= dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.immuneFlash = Math.max(0, this.immuneFlash - dt * 5);
    if (this.stage === 'slime') this.updateSlime(dt, player);
    else this.updateCore(dt, player);
    if (this.dead) return;
    // fell off the world (into a pit): gone
    if (this.pos.y < this.home.y - 30) return this.vanish();
    // anything of it touching you is fatal
    const r = this.stage === 'slime' ? this.R * 0.85 * this.grow : 0.3 * this.size;
    if (touchesPlayer(player, this.pos, r)) player.damage(1, 'slime');
    this.sync(dt);
    this.voice.update(this.dist, this.stage === 'slime' ? 1 : 0.4, this.state === 'windup' ? 1.5 : 1);
  }

  // ---- slime stage ----
  updateSlime(dt, player) {
    const hd = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    switch (this.state) {
      case 'idle': {
        // ooze about near home
        if (this.aggro) {
          this.state = 'creep';
          break;
        }
        if (this.timer <= 0) {
          this.timer = rnd(2, 4);
          this.target.set(this.home.x + rnd(-1, 1) * this.wander, 0, this.home.z + rnd(-1, 1) * this.wander);
        }
        this.ooze(dt, this.target, SLIME.creep * 0.45);
        break;
      }
      case 'creep': {
        if (!this.aggro) {
          this.state = 'idle';
          this.timer = 0;
          break;
        }
        this.ooze(dt, player.pos, SLIME.creep);
        if (this.sees && this.cool <= 0 && hd < this.leapRange && Math.abs(player.pos.y - this.groundY) < 4) this.startWindup(SLIME.windup);
        break;
      }
      case 'windup': {
        this.faceToward(player.pos, dt * 8);
        if (Math.random() < dt * 20) this.world.fx.burst(_v.copy(this.pos).setY(this.groundY + 0.05), COLORS[this.slimeColor].hex, { count: 1, speed: 2, life: 0.4, size: 0.12, gravity: 8 });
        if (this.timer > 0.3) this.target.copy(player.pos); // (it fixes on where you are 0.3 s before it springs)
        if (this.timer <= 0) this.launch(player, 10, 0.85);
        break;
      }
      case 'leap':
        this.fly(dt);
        break;
      case 'land':
        if (this.timer <= 0) this.state = this.aggro ? 'creep' : 'idle';
        break;
    }
  }

  // (every leap needs one of the combat director's attack tokens: without one it waits a moment and asks again)
  startWindup(time) {
    if (!director.request(this, time + 1.1)) {
      this.cool = rnd(0.25, 0.5);
      if (this.stage === 'core') this.timer = this.cool;
      return;
    }
    this.state = 'windup';
    this.timer = time;
    this.windupTime = time;
    sfx(this.stage === 'slime' ? 'slime_squelch' : 'core_chirp', 0.8 * falloff(this.dist, 4, 30), { rate: this.stage === 'slime' ? 1.25 : 1 });
  }

  // spring at where the player stood a moment ago (no leading: step aside and it sails past)
  launch(player, speed, maxT) {
    _a.copy(this.target).y += 0.55;
    _a.copy(director.aim(this, this.pos, _a)); // (a first leap from off screen lands wide, as a warning)
    const hd = Math.hypot(_a.x - this.pos.x, _a.z - this.pos.z);
    const T = THREE.MathUtils.clamp(hd / speed, 0.45, maxT);
    lobVelocity(this.pos, _a, T, GRAVITY, this.vel);
    // keep a little momentum past the target, so a miss carries on rather than stopping dead on the spot
    this.vel.x *= 1.12;
    this.vel.z *= 1.12;
    this.state = 'leap';
    this.squashV = 6;
    sfx(this.stage === 'slime' ? 'slime_leap' : 'core_chirp', 0.8 * falloff(this.dist, 4, 30));
  }

  // ballistic flight; lands on whatever is under it
  fly(dt) {
    this.vel.y -= GRAVITY * dt;
    const h = this.stage === 'slime' ? this.R * 0.75 : 0.26 * this.size;
    _v.copy(this.vel).multiplyScalar(dt);
    const blocked = moveSafe(this.world, this.pos, _v, h * 0.7);
    if (blocked.x) this.vel.x = 0;
    if (blocked.z) this.vel.z = 0;
    if (blocked.y && this.vel.y > 0) this.vel.y = 0;
    if (this.vel.y < 0) {
      const g = groundBelow(this.world, this.pos, 0, h + 0.05);
      if (g || blocked.y) {
        if (g) {
          this.groundY = g.point.y;
          this.pos.y = g.point.y + h;
        }
        this.vel.set(0, 0, 0);
        this.state = this.stage === 'slime' ? 'land' : 'scurry';
        this.timer = this.stage === 'slime' ? SLIME.land : rnd(0.9, 1.4);
        this.cool = this.stage === 'slime' ? SLIME.cool : 0.8;
        this.squashV = -7;
        const p = _a.copy(this.pos).setY(this.groundY + 0.05);
        if (this.stage === 'slime') {
          this.world.fx.ring(p, UP, COLORS[this.slimeColor].hex, { size: 0.3, end: 2.2 * this.size, life: 0.4, k: 1.2 });
          this.world.fx.burst(p, COLORS[this.slimeColor].hex, { count: 14, speed: 4, life: 0.5, size: 0.14, gravity: 14 });
          sfx('slime_splat', 0.6 * falloff(this.dist, 4, 30));
        } else this.world.fx.burst(p, 0xffd9a0, { count: 5, speed: 3, life: 0.3, size: 0.1, gravity: 10 });
      }
    }
  }

  // creep along the ground toward a point, never off a ledge or up a wall
  ooze(dt, to, speed) {
    _a.set(to.x - this.pos.x, 0, to.z - this.pos.z);
    const d = _a.length();
    if (d < 0.3) return;
    _a.divideScalar(d);
    this.faceToward(to, dt * 4);
    // slime inches along in pulses; the core just runs
    const pulse = this.stage === 'slime' ? 0.35 + 0.65 * Math.max(0, Math.sin(this.t * 5)) : 1;
    this.step(_a.multiplyScalar(Math.min(d, speed * pulse * dt)));
  }

  // move horizontally by `d` if there's floor under the new spot (a step up or down of under ~0.6 m)
  step(d) {
    const h = this.stage === 'slime' ? this.R * 0.75 : 0.26 * this.size;
    _b.copy(this.pos);
    const blocked = moveSafe(this.world, this.pos, d, h * 0.7);
    const g = groundBelow(this.world, this.pos, 0.6, h + 0.7);
    if (!g || g.solid?.hazard) {
      this.pos.copy(_b);
      return false;
    }
    this.groundY = g.point.y;
    this.pos.y = g.point.y + h;
    return !blocked.any;
  }

  faceToward(p, k) {
    _v.set(p.x - this.pos.x, 0, p.z - this.pos.z);
    if (_v.lengthSq() < 1e-4) return;
    this.face.lerp(_v.normalize(), Math.min(1, k)).normalize();
  }

  // ---- core stage ----
  updateCore(dt, player) {
    this.regrowT -= dt;
    if (this.regrowT <= 0) {
      // fully regrown: slime on, back to the hunt
      this.stage = 'slime';
      this.slimeHp = this.slimeMax;
      this.grow = 1;
      this.state = 'creep';
      this.cool = 0.8;
      this.pos.y = this.groundY + this.R * 0.75;
      this.core.position.set(0, -0.05 * this.size, 0);
      return;
    }
    if (this.regrowT < SLIME.regrowTime && this.state !== 'leap') {
      // the slime wells back up around the core: shoot it now
      if (this.state !== 'regrow') {
        this.state = 'regrow';
        this.blob.visible = true;
        sfx('slime_regrow', 0.7 * falloff(this.dist, 4, 30));
      }
      this.grow = 1 - this.regrowT / SLIME.regrowTime;
      this.pos.y = this.groundY + 0.26 * this.size + (this.R * 0.75 - 0.26 * this.size) * this.grow;
      return;
    }
    const hd = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    switch (this.state) {
      case 'pop':
        this.fly(dt);
        break;
      case 'scurry': {
        // run away from the player, zig-zagging; then turn and hop at them
        _v.set(this.pos.x - player.pos.x, 0, this.pos.z - player.pos.z).normalize();
        _v.applyAxisAngle(UP, Math.sin(this.t * 3 + this.zig) * 0.9);
        _s.copy(this.pos).addScaledVector(_v, 2);
        if (!this.ooze2(dt, _s, SLIME.scurry)) this.zig += Math.PI * 0.7;
        if (Math.random() < dt * 1.5) sfx('core_chirp', 0.4 * falloff(this.dist, 3, 20));
        if (this.timer <= 0) this.state = 'stalk';
        break;
      }
      case 'stalk': {
        // then it comes back at you, zig-zagging, and hops from a few meters out
        if (hd > 2.5) {
          _v.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z).normalize();
          _v.applyAxisAngle(UP, Math.sin(this.t * 4 + this.zig) * 0.6);
          _s.copy(this.pos).addScaledVector(_v, 2);
          if (!this.ooze2(dt, _s, SLIME.scurry * 0.8)) this.zig += Math.PI * 0.7;
        } else this.faceToward(player.pos, dt * 8);
        if (this.sees && hd < 6 && this.cool <= 0) this.startWindup(SLIME.coreWindup);
        break;
      }
      case 'windup':
        this.faceToward(player.pos, dt * 10);
        if (this.timer > 0.25) this.target.copy(player.pos);
        if (this.timer <= 0) this.launch(player, 9, 0.7);
        break;
      case 'leap':
        this.fly(dt);
        break;
      default:
        this.state = 'scurry';
    }
  }

  ooze2(dt, to, speed) {
    _a.set(to.x - this.pos.x, 0, to.z - this.pos.z).normalize();
    this.faceToward(to, dt * 8);
    return this.step(_a.multiplyScalar(speed * dt));
  }

  // the slime is blasted off: goo everywhere, the core pops out and runs
  blowOff(hit) {
    director.release(this); // (a leap it was winding up is off)
    this.stage = 'core';
    this.state = 'pop';
    this.regrowT = this.regrow;
    this.grow = 0;
    this.zig = Math.random() * 6;
    this.blob.visible = false;
    const hex = COLORS[this.slimeColor].hex, fx = this.world.fx, p = this.pos;
    fx.burst(p, hex, { count: 60, speed: 8, life: 0.9, size: 0.22, gravity: 16 });
    fx.burst(p, 0xffffff, { count: 12, speed: 4, life: 0.25, size: 0.4, gravity: 0 });
    fx.ring(_a.copy(p).setY(this.groundY + 0.05), UP, hex, { size: 0.4, end: 3, life: 0.45, k: 1.4 });
    for (let i = 0; i < 10; i++) fx.shard(p, rnd(-5, 5), rnd(2, 7), rnd(-5, 5), _c.set(hex), 1.4, rnd(0.5, 0.9), rnd(0.06, 0.12), 1.4);
    sfx('slime_splat', 0.9 * falloff(this.dist, 4, 40), { rate: 0.85 });
    esfx('core_squeal', this.pos, 1, 1); // the bare core shrieks
    barks.say(this, 'hit');
    this.puddle?.dispose();
    this.puddle = new Puddle(this.world, _a.copy(p).setY(this.groundY + 0.03), this.slimeColor, this.R * 2.6);
    // the core pops out, away from the shot
    _v.copy(hit?.dir ?? _b.set(0, 0, 0)).setY(0);
    if (_v.lengthSq() < 1e-4) _v.set(rnd(-1, 1), 0, rnd(-1, 1));
    _v.normalize();
    this.vel.set(_v.x * 3, 5.5, _v.z * 3);
    this.pos.y = this.groundY + 0.3 * this.size;
    this.timer = 1;
  }

  onHit(color, hit) {
    if (this.dead) return undefined;
    this.aggro = true;
    if (color !== this.color) {
      this.immuneFlash = 1;
      this.squashV += 3;
      return 'immune';
    }
    this.flash = 1;
    const p = hit?.point ?? this.pos;
    if (this.stage === 'slime') {
      this.slimeHp--;
      this.squashV += 5;
      if (this.slimeHp > 0) {
        this.world.fx.burst(p, COLORS[this.slimeColor].hex, { count: 16, speed: 5, life: 0.5, size: 0.16, gravity: 12 });
        sfx('slime_splat', 0.5 * falloff(this.dist, 4, 30), { rate: 1.3 });
        return 'hit';
      }
      this.blowOff(hit);
      return 'hit';
    }
    hitSparks(this.world, hit, p, this.coreColor);
    this.die();
    return 'kill';
  }

  die() {
    this.dead = true;
    this.world.removeHittable(this.group);
    blast(this.world, this.pos, this.coreColor, 0.55);
    barks.died(this);
    sfx('critter_die', 0.8 * falloff(this.dist, 6, 50));
    this.group.updateMatrixWorld(true);
    this.coreGlow.color.setRGB(0.5, 0.15, 0.1);
    new Debris(this.world, this.coreParts, { from: this.pos, speed: 5, mats: [this.metalMat, this.coreGlow] });
    this.onDeath?.(this);
    this.dispose(false);
  }

  // dropped into a pit or out of the world: no fanfare
  vanish() {
    this.dead = true;
    this.onDeath?.(this);
    this.dispose();
  }

  // place and animate the meshes
  sync(dt) {
    // squash: a damped spring the leaps and hits kick
    this.squashV += (-60 * (this.squash - 1) - 7 * this.squashV) * dt;
    this.squash = THREE.MathUtils.clamp(this.squash + this.squashV * dt, 0.45, 1.6);
    this.group.position.copy(this.pos);
    const S = this.R;
    let sy = this.squash, sxz = 1 / Math.sqrt(sy);
    let amp = 0.035;
    if (this.state === 'windup') {
      // the telegraph: it squashes down, swells and quivers harder and harder
      const k = 1 - this.timer / this.windupTime;
      sy *= 1 - 0.38 * k;
      sxz *= 1 + 0.22 * k + Math.sin(this.t * 40) * 0.04 * k;
      amp = 0.035 + 0.09 * k;
    } else if (this.state === 'leap' && this.stage === 'slime') {
      sy *= 1.25;
      sxz *= 0.85;
    }
    this.uniforms.uAmp.value = amp + this.immuneFlash * 0.05;
    const grow = this.stage === 'slime' ? 1 : this.grow;
    this.blob.scale.set(S * sxz * grow, S * 0.8 * sy * grow, S * sxz * grow);
    this.blob.position.y = 0;
    this.blob.rotation.y = Math.atan2(-this.face.x, -this.face.z);
    for (let i = 0; i < this.bits.length; i++) {
      const b = this.bits[i], a = this.t * (0.6 + i * 0.23) + i * 1.7;
      b.position.set(Math.cos(a) * 0.55, Math.sin(a * 1.3) * 0.35, Math.sin(a) * 0.55);
    }
    // goo glows brighter as it winds up and flashes on a hit
    const wk = this.state === 'windup' ? 1 - this.timer / this.windupTime : 0;
    _c.set(COLORS[this.slimeColor].hex);
    this.gooMat.emissive.copy(_c).multiplyScalar(0.3 + wk * 0.45 + this.flash * 1.2);
    this.gooMat.opacity = this.stage === 'slime' ? 0.6 + wk * 0.15 : 0.3 + 0.3 * this.grow;
    // the core: tucked inside the slime, or out on its legs
    const yaw = Math.atan2(-this.face.x, -this.face.z);
    if (this.stage === 'slime') {
      this.core.position.set(Math.sin(this.t * 1.3) * 0.05, -0.05 * this.size + Math.sin(this.t * 2) * 0.03, 0);
      this.core.rotation.set(0, yaw + Math.sin(this.t * 0.7) * 0.6, 0);
      this.legs.visible = false;
    } else {
      this.legs.visible = true;
      const run = this.state === 'scurry' ? 1 : 0;
      this.core.position.set(0, Math.abs(Math.sin(this.t * 22)) * 0.04 * run, 0);
      this.core.rotation.set(this.state === 'windup' ? 0.35 : Math.sin(this.t * 22) * 0.12 * run, yaw, this.state === 'pop' || this.state === 'leap' ? this.t * 14 : 0);
    }
    // core band: blinks while winding up, hot white on a hit
    if (this.flash > 0) this.coreGlow.color.setRGB(3, 3, 3);
    else if (this.stage === 'core' && this.state === 'windup' && Math.sin(this.t * 40) > 0) this.coreGlow.color.setRGB(3, 3, 3);
    else if (this.immuneFlash > 0 && this.stage === 'core') this.coreGlow.color.setRGB(0.7, 0.7, 0.8);
    else this.applyColor();
    const fg = this.stage === 'slime' ? 1 : 0.35 + 0.65 * this.grow;
    this.floorGlow.position.y = this.groundY - this.pos.y + 0.03;
    this.floorGlow.scale.setScalar(S * 3.4 * fg);
    this.floorMat.opacity = 0.55 + wk * 0.45;
    this.floorMat.color.set(this.stage === 'slime' ? COLORS[this.slimeColor].hex : COLORS[this.coreColor].hex).multiplyScalar(0.8);
  }

  dispose(full = true) {
    this.dead = true;
    this.voice.stop();
    this.world.removeHittable(this.group);
    this.world.remove(this);
    this.world.scene.remove(this.group);
    this.puddle?.dispose();
    this.puddle = null;
    for (const m of [this.gooMat, this.bitMat, this.floorMat, this.sporeMat]) m.dispose();
    if (full) {
      this.metalMat.dispose();
      this.coreGlow.dispose();
    }
  }
}

// The goo left behind when a slime is blasted off: a glowing splat that fades over a few seconds.
class Puddle {
  constructor(world, p, color, size) {
    this.world = world;
    this.life = this.max = 4;
    this.mat = new THREE.MeshBasicMaterial({ map: floorGlowTexture(), color: new THREE.Color(COLORS[color].hex).multiplyScalar(1.3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.Mesh(slimeGeometry().glow, this.mat);
    this.mesh.position.copy(p);
    this.mesh.scale.set(size, 1, size * 0.8);
    this.mesh.rotation.y = Math.random() * 6;
    this.mesh.raycast = () => {};
    world.scene.add(this.mesh);
  }

  // returns true once gone
  update(dt) {
    this.life -= dt;
    this.mat.opacity = Math.min(1, this.life / this.max * 1.6);
    if (this.life <= 0) {
      this.dispose();
      return true;
    }
    return false;
  }

  dispose() {
    if (!this.mat) return;
    this.world.scene.remove(this.mesh);
    this.mat.dispose();
    this.mat = null;
  }
}

// ======================================================================================================
// SPIDER BOT
// A moss-grown robot spider. It skitters over floors, up walls and across ceilings (it follows the surfaces
// of the boxes around it), keeps its distance and spits acid globs (shootable with its color) after a
// hiss and a glow in its abdomen. Line up a shot and it rolls aside; from a ceiling it drops on a thread to
// shoot from above. Correct hits stagger it (and can knock it off a wall); its color shifts on a cycle.
// ======================================================================================================
const SPIDER = {
  S: 1.6, // model scale
  H: 0.66, // body center above the surface it clings to
  patrol: 2.2,
  run: 4.2,
  windup: 0.6, // s of hiss + glow before each spit
  spitSpeed: 15,
  spitGravity: 5,
  stagger: 0.32,
  roll: 0.42, // s an action roll lasts
};
let spiderGeo = null;

function spiderGeometry() {
  if (spiderGeo) return spiderGeo;
  const moss = [];
  for (let i = 0; i < 6; i++) {
    const a = i * 2.1;
    moss.push(new THREE.DodecahedronGeometry(0.09 + (i % 3) * 0.03, 0).scale(1.4, 0.45, 1.2).translate(Math.cos(a) * 0.16, 0.2 + (i % 2) * 0.04, 0.32 + Math.sin(a) * 0.18));
  }
  moss.push(new THREE.DodecahedronGeometry(0.12, 0).scale(1.5, 0.4, 1.3).translate(0.04, 0.16, -0.05));
  const eyes = [];
  for (const [x, y, r] of [[-0.07, 0.07, 0.045], [0.07, 0.07, 0.045], [-0.12, 0.02, 0.03], [0.12, 0.02, 0.03], [-0.035, 0.12, 0.025], [0.035, 0.12, 0.025]]) eyes.push(new THREE.SphereGeometry(r, 8, 6).translate(x, y, -0.36));
  const fangs = [];
  for (const sx of [-1, 1]) fangs.push(new THREE.ConeGeometry(0.03, 0.18, 5).rotateX(Math.PI * 0.62).translate(sx * 0.06, -0.08, -0.42));
  spiderGeo = {
    thorax: new THREE.DodecahedronGeometry(0.26, 0).scale(1, 0.62, 1.15),
    head: new THREE.DodecahedronGeometry(0.16, 0).scale(1.1, 0.75, 1).translate(0, 0.02, -0.28),
    abdomen: new THREE.IcosahedronGeometry(0.36, 1).scale(0.95, 0.75, 1.25).translate(0, 0.1, 0.5),
    sac: new THREE.IcosahedronGeometry(0.2, 1).scale(0.9, 0.5, 1.2).translate(0, 0.05, 0.62),
    stripe: new THREE.BoxGeometry(0.06, 0.03, 0.62).translate(0, 0.37, 0.48),
    moss: mergeAll(moss),
    eyes: mergeAll(eyes),
    fangs: mergeAll(fangs),
    seg: new THREE.CylinderGeometry(0.03, 0.05, 1, 5),
    thread: new THREE.CylinderGeometry(0.012, 0.012, 1, 4).translate(0, 0.5, 0),
  };
  return spiderGeo;
}

// hips (body-local, front = -z) for the 8 legs: [x, z, outward yaw]
const HIPS = [];
for (const s of [-1, 1]) for (const [z, a] of [[-0.22, 0.75], [-0.08, 0.25], [0.06, -0.2], [0.2, -0.65]]) HIPS.push({ x: s * 0.17, z, dir: new THREE.Vector3(s * Math.cos(a), 0, -Math.sin(a)), s });

export class SpiderBot {
  constructor(world, opts) {
    const { pos, color = [GREEN, RED], hp = 5, range = 30, fireInterval = 1.8, cycle = 3.5, leash = 14, ceiling = false, onDeath = null } = opts;
    this.spawnOpts = opts;
    this.critter = true;
    this.barkPersona = 'verdant'; // combat/barks.js
    this.world = world;
    this.palette = Array.isArray(color) ? color : [color];
    this.cycle = cycle;
    this.maxHp = hp;
    this.range = range;
    this.fireInterval = fireInterval;
    this.leash = leash;
    this.startCeiling = ceiling;
    this.onDeath = onDeath;
    this.home = new THREE.Vector3(...pos);
    this.pos = new THREE.Vector3();
    this.n = new THREE.Vector3(0, 1, 0); // the normal of the surface it clings to
    this.heading = new THREE.Vector3(0, 0, -1); // crawl direction (tangent to the surface)
    this.face = new THREE.Vector3(0, 0, -1);
    this.vel = new THREE.Vector3();
    this.anchor = new THREE.Vector3();
    this.t = Math.random() * 100;
    this.dead = false;
    this.dist = Infinity;

    const G = spiderGeometry();
    this.group = new THREE.Group();
    this.group.userData.hit = this;
    this.body = new THREE.Group(); // rolls during a dodge
    this.metalMat = new THREE.MeshStandardMaterial({ color: 0x3a3f3a, metalness: 0.8, roughness: 0.38, flatShading: true, emissive: 0x000000 });
    this.darkMat = new THREE.MeshStandardMaterial({ color: 0x1b1d1f, metalness: 0.7, roughness: 0.5, flatShading: true });
    this.mossMat = new THREE.MeshStandardMaterial({ color: 0x3f7a2e, roughness: 1, flatShading: true, emissive: 0x0c2208 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.sacMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    const thorax = new THREE.Mesh(G.thorax, this.metalMat);
    const head = new THREE.Mesh(G.head, this.darkMat);
    const abdomen = new THREE.Mesh(G.abdomen, this.metalMat);
    this.sac = new THREE.Mesh(G.sac, this.sacMat);
    this.sac.position.y = 0.2;
    const stripe = new THREE.Mesh(G.stripe, this.glowMat);
    const moss = new THREE.Mesh(G.moss, this.mossMat);
    const eyes = new THREE.Mesh(G.eyes, this.glowMat);
    const fangs = new THREE.Mesh(G.fangs, this.darkMat);
    this.body.add(thorax, head, abdomen, this.sac, stripe, moss, eyes, fangs);
    this.parts = [thorax, head, abdomen, moss];
    // 16 leg segments, one draw: matrices rebuilt each frame from hip / knee / foot points
    this.legs = new THREE.InstancedMesh(G.seg, this.darkMat, 16);
    this.legs.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.2);
    this.legs.frustumCulled = false;
    this.body.add(this.legs);
    this.body.scale.setScalar(SPIDER.S);
    this.group.add(this.body);
    // the silk thread it drops on (in world space)
    this.threadMat = new THREE.MeshBasicMaterial({ color: 0xd8ffe0, transparent: true, opacity: 0.6 });
    this.thread = new THREE.Mesh(G.thread, this.threadMat);
    this.thread.visible = false;
    this.thread.raycast = () => {};
    this.group.position.copy(this.home);
    world.scene.add(this.group);
    world.scene.add(this.thread);
    world.addHittable(this.group);
    world.add(this);
    this.voice = new Voice('spider_skitter', { gain: 0.3, near: 3, far: 20, rate: rnd(0.9, 1.1) });
    this.reset();
  }

  reset() {
    if (this.dead) return;
    this.hp = this.maxHp;
    this.colorIdx = 0;
    this.color = this.palette[0];
    this.cycleTimer = this.cycle;
    this.state = 'patrol';
    this.timer = 0;
    this.aggro = false;
    this.sees = false;
    this.sightTimer = 0;
    this.lostT = 0;
    this.fireTimer = 1.2 + Math.random() * this.fireInterval;
    this.dodgeCool = 0.5;
    this.dropCool = 1;
    this.stagger = 0;
    this.flash = 0;
    this.immuneFlash = 0;
    this.strafe = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = rnd(1.5, 3);
    this.climbT = rnd(2, 5);
    this.seek = null;
    this.roll = 0;
    this.speed = 0;
    this.windupT = 0;
    this.vel.set(0, 0, 0);
    this.thread.visible = false;
    this.pos.copy(this.home);
    this.n.set(0, 1, 0);
    if (this.startCeiling) {
      const hit = this.world.raycast(this.home, UP, 30, { meshes: false });
      if (hit) {
        this.n.set(0, -1, 0);
        this.pos.copy(hit.point).addScaledVector(this.n, SPIDER.H);
      }
    } else {
      const g = groundBelow(this.world, this.home, 1, 6);
      if (g) this.pos.copy(g.point).y += SPIDER.H;
    }
    this.heading.set(rnd(-1, 1), 0, rnd(-1, 1));
    this.tangent(this.heading);
    this.orient(1, true);
    this.applyColor();
  }

  applyColor() {
    const c = _c.set(COLORS[this.color].hex);
    this.glowMat.color.copy(c).multiplyScalar(2.4);
    this.metalMat.emissive.copy(c).multiplyScalar(0.06);
  }

  // project v onto the current surface's plane (normalized; falls back to any tangent)
  tangent(v) {
    v.addScaledVector(this.n, -v.dot(this.n));
    if (v.lengthSq() < 1e-5) {
      v.set(Math.abs(this.n.x) < 0.9 ? 1 : 0, 0, Math.abs(this.n.x) < 0.9 ? 0 : 1);
      v.addScaledVector(this.n, -v.dot(this.n));
    }
    return v.normalize();
  }

  // Crawl along the surface by `len` in direction `d` (tangent). Climbs onto walls in the way and wraps
  // over convex edges; won't step off into the air or onto hazards. Returns 'ok' | 'climb' | 'wrap' | 'stuck'.
  crawl(d, len) {
    if (len <= 0) return 'ok';
    const W = this.world, H = SPIDER.H;
    // a surface in the way: climb onto it
    const hit = shortRay(W, this.pos, d, len + H);
    if (hit && hit.normal.dot(this.n) < 0.5) {
      if (!hit.solid?.static || hit.solid.hazard) return 'stuck';
      const old = _b.copy(this.n);
      this.n.copy(hit.normal);
      this.pos.copy(hit.point).addScaledVector(this.n, H);
      this.heading.copy(old);
      return 'climb';
    }
    _s.copy(this.pos);
    this.pos.addScaledVector(d, len);
    _v.copy(this.n).negate();
    const g = shortRay(W, this.pos, _v, H + 0.6);
    if (g && g.normal.dot(this.n) > 0.7 && g.solid?.static && !g.solid.hazard) {
      this.pos.copy(g.point).addScaledVector(this.n, H);
      return 'ok';
    }
    // over an edge: wrap round onto the next face (wall top, ledge side...)
    _a.copy(this.pos).addScaledVector(this.n, -(H + 0.3));
    _v.copy(d).negate();
    const w = shortRay(W, _a, _v, 1.2);
    if (w && w.normal.dot(d) > 0.7 && w.solid?.static && !w.solid.hazard) {
      const old = _b.copy(this.n);
      this.n.copy(w.normal);
      this.pos.copy(w.point).addScaledVector(this.n, H);
      this.heading.copy(old).negate();
      return 'wrap';
    }
    this.pos.copy(_s);
    return 'stuck';
  }

  // direction (along the floor) to the nearest wall within 6 m, or null
  findWall() {
    let best = null, bd = 6;
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
      _v.set(...d);
      const h = shortRay(this.world, this.pos, _v, bd);
      if (h && h.solid?.static && !h.solid.hazard && h.normal.y === 0 && h.t < bd) {
        bd = h.t;
        best = _v.clone();
      }
    }
    return best;
  }

  get onFloor() {
    return this.n.y > 0.7;
  }

  update(dt, player) {
    if (this.dead) return;
    _eye.copy(player.pos).y += player.eye;
    this.dist = this.pos.distanceTo(_eye);
    if (this.dist > DORMANT) {
      this.voice.update(this.dist);
      return;
    }
    this.t += dt;
    // color cycle (with a flicker just before it shifts)
    if (this.palette.length > 1) {
      this.cycleTimer -= dt;
      if (this.cycleTimer <= 0) {
        this.cycleTimer = this.cycle;
        this.colorIdx = (this.colorIdx + 1) % this.palette.length;
        this.color = this.palette[this.colorIdx];
      }
    }
    this.sightTimer -= dt;
    if (this.sightTimer <= 0) {
      this.sightTimer = 0.25;
      this.sees = this.dist < this.range && this.world.lineOfSight(this.pos, _eye);
      if (this.sees && !this.aggro) {
        sfx('spider_hiss', 0.6 * falloff(this.dist, 4, 30));
        barks.say(this, 'spot');
      }
      if (this.sees) this.lostSaid = false;
      else if (this.aggro && this.lostT >= 1.5 && !this.lostSaid) {
        this.lostSaid = true;
        barks.say(this, 'lost');
      }
      if (this.sees) this.aggro = true;
    }
    this.lostT = this.sees ? 0 : this.lostT + dt;
    if (this.aggro && this.lostT > 6) this.aggro = false;
    this.stagger = Math.max(0, this.stagger - dt);
    this.dodgeCool -= dt;
    this.dropCool -= dt;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.immuneFlash = Math.max(0, this.immuneFlash - dt * 5);
    this.timer -= dt;
    const px = this.pos.x, py = this.pos.y, pz = this.pos.z;

    // roll aside when the player lines up a shot
    if (this.aggro && this.sees && this.stagger <= 0 && this.dodgeCool <= 0 && (this.state === 'engage' || this.state === 'windup' || this.state === 'patrol') && aimedAt(this.world, this.pos, 0.996) && Math.random() < dt * 3) this.startRoll(player);

    switch (this.state) {
      case 'patrol':
      case 'engage':
      case 'windup':
        this.updateCrawl(dt, player);
        break;
      case 'roll':
        this.updateRoll(dt);
        break;
      case 'fall':
        this.updateFall(dt);
        break;
      case 'drop':
      case 'hang':
      case 'climbUp':
        this.updateThread(dt, player);
        break;
    }
    if (this.dead) return;
    if (this.pos.y < this.home.y - 30) return this.vanish();
    this.speed = Math.hypot(this.pos.x - px, this.pos.y - py, this.pos.z - pz) / Math.max(dt, 1e-3);
    if (touchesPlayer(player, this.pos, 0.85)) player.damage(1, 'spider');
    this.orient(dt);
    this.animate(dt);
    this.voice.update(this.dist, Math.min(1, this.speed / 3), 0.9 + Math.min(this.speed, 8) * 0.05);
  }

  updateCrawl(dt, player) {
    let speed = SPIDER.patrol;
    const dir = _v;
    if (this.state === 'patrol') {
      if (this.aggro) this.state = 'engage';
      if (this.timer <= 0) {
        this.timer = rnd(1.5, 3.5);
        dir.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1));
        this.heading.copy(this.tangent(dir));
      }
      dir.copy(this.heading);
    } else {
      if (!this.aggro) {
        this.state = 'patrol';
        this.timer = 0;
      }
      // keep 7–14 m off, circling (strafe flips every few seconds or when it can't go on)
      speed = SPIDER.run;
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafeT = rnd(1.4, 3);
        this.strafe *= -1;
      }
      const to = this.tangent(_b.subVectors(player.pos, this.pos));
      dir.crossVectors(this.n, to).multiplyScalar(this.strafe);
      const hd = this.dist;
      if (hd > 14) dir.addScaledVector(to, 1.2);
      else if (hd < 7) dir.addScaledVector(to, -1);
      this.tangent(dir);
      this.heading.copy(dir);
      // spit: hiss and glow, then fire
      if (this.state === 'windup') {
        speed *= 0.3;
        if (this.timer <= 0) this.spit(player);
      } else if (this.sees && this.stagger <= 0) {
        this.fireTimer -= dt;
        if (this.fireTimer <= 0 && !director.request(this, SPIDER.windup + 0.4)) this.fireTimer = rnd(0.25, 0.5);
        else if (this.fireTimer <= 0) {
          this.state = 'windup';
          this.timer = SPIDER.windup;
          sfx('spider_hiss', 0.7 * falloff(this.dist, 4, 30), { rate: 1.3 });
        }
      }
      // from a ceiling, drop on a thread when the player walks underneath
      if (this.state === 'engage' && this.n.y < -0.7 && this.dropCool <= 0 && this.sees) {
        const hd2 = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
        if (hd2 < 6 && player.pos.y < this.pos.y - 2) return this.startDrop();
      }
    }
    // every so often it makes for the nearest wall or column and runs a few meters up it
    this.climbT -= dt;
    if (this.onFloor && !this.seek && this.climbT <= 0) {
      this.climbT = rnd(5, 9);
      this.seek = this.findWall();
      this.seekT = 4;
      this.seekTop = this.pos.y + rnd(2, 3.5);
    }
    if (this.seek) {
      this.seekT -= dt;
      if (this.onFloor) dir.copy(this.seek);
      else if (this.n.y > -0.5 && this.pos.y < this.seekTop) dir.copy(this.tangent(_b.copy(UP)));
      else this.seek = null;
      if (this.seekT <= 0) this.seek = null;
    }
    // a long way from home: head back
    if (this.pos.distanceTo(this.home) > this.leash) {
      const back = this.tangent(_b.subVectors(this.home, this.pos));
      dir.lerp(back, 0.7);
      this.tangent(dir);
      this.heading.copy(dir);
    }
    if (this.stagger > 0) speed *= 0.2;
    const r = this.crawl(dir, speed * dt);
    if (r === 'stuck') {
      this.strafe *= -1;
      this.heading.applyAxisAngle(this.n, rnd(1.6, 3.6));
      this.tangent(this.heading);
      this.timer = Math.min(this.timer, rnd(1, 2));
    } else if (r !== 'ok') sfx('spider_land', 0.3 * falloff(this.dist, 3, 18));
  }

  spit(player) {
    this.state = 'engage';
    this.fireTimer = this.fireInterval * rnd(0.8, 1.2);
    // from the mouth, aimed (with gravity compensation, no lead) at the player's chest
    const mouth = _a.copy(this.face).multiplyScalar(0.7).add(this.pos);
    _b.copy(player.pos).y += player.eye - 0.35;
    const target = _b.copy(director.aim(this, mouth, _b)); // (first spit from off screen goes wide)
    const t = mouth.distanceTo(target) / SPIDER.spitSpeed;
    const v = _s.subVectors(target, mouth).normalize().multiplyScalar(SPIDER.spitSpeed);
    v.y += 0.5 * SPIDER.spitGravity * t;
    new Glob(this.world, mouth, v, this.color, { radius: 0.2, gravity: SPIDER.spitGravity, cause: 'acid spit', life: 4 });
    sfx('spider_spit', 0.8 * falloff(this.dist, 4, 40));
    this.world.fx.burst(mouth, COLORS[this.color].hex, { count: 6, speed: 3, life: 0.3, size: 0.12, gravity: 6 });
  }

  // the action roll: a sideways hop off the floor (a fast scuttle on a wall), tumbling over
  startRoll(player) {
    if (this.dodgeCool > 0 || this.stagger > 0) return;
    if (this.state === 'windup') director.release(this); // (the spit is called off)
    this.dodgeCool = rnd(1.3, 2.1);
    const view = this.tangent(_b.subVectors(this.pos, player.pos));
    const side = _s.crossVectors(this.n, view).normalize();
    // roll toward the side with room
    let sign = Math.random() < 0.5 ? -1 : 1;
    const probe = this.world.raycast(this.pos, _a.copy(side).multiplyScalar(sign), 3.5, { meshes: false });
    if (probe && this.onFloor) sign = -sign;
    this.rollDir = side.clone().multiplyScalar(sign);
    this.rollSign = sign;
    this.state = 'roll';
    this.timer = SPIDER.roll;
    if (this.onFloor) {
      this.vel.copy(this.rollDir).multiplyScalar(9).addScaledVector(UP, 5);
      this.airborne = true;
    } else this.airborne = false;
    if (this.thread.visible) this.thread.visible = false;
    sfx('spider_leap', 0.7 * falloff(this.dist, 4, 30));
    esfx('hydraulic_hiss', this.pos, 0.6, 1.5); // the legs kick off
    esfx('robot_effort', this.pos, 0.5, 1.6);
    barks.say(this, 'roll');
  }

  updateRoll(dt) {
    this.roll = (1 - Math.max(0, this.timer) / SPIDER.roll) * Math.PI * 2 * -this.rollSign;
    if (this.airborne) {
      this.vel.y -= GRAVITY * 1.4 * dt;
      _v.copy(this.vel).multiplyScalar(dt);
      const blocked = moveSafe(this.world, this.pos, _v, 0.3);
      if (blocked.x) this.vel.x = 0;
      if (blocked.z) this.vel.z = 0;
      if (this.vel.y < 0) {
        const g = groundBelow(this.world, this.pos, 0, SPIDER.H + 0.05);
        if (g || blocked.y) {
          if (g) this.pos.y = g.point.y + SPIDER.H;
          this.endRoll();
        }
      }
      if (this.timer < -1.5) this.state = 'fall';
    } else {
      const r = this.crawl(this.rollDir, 10 * dt);
      if (r !== 'ok') this.rollDir.copy(this.heading);
      if (this.timer <= 0) this.endRoll();
    }
  }

  endRoll() {
    this.roll = 0;
    this.state = this.aggro ? 'engage' : 'patrol';
    if (this.airborne) this.n.set(0, 1, 0); // (a scuttle along a wall stays on the wall)
    this.vel.set(0, 0, 0);
    this.strafe = -this.strafe;
    sfx('spider_land', 0.4 * falloff(this.dist, 3, 20));
    esfx('hydraulic_land', this.pos, 0.35, 1.6);
  }

  // knocked off a wall or ceiling (or off its thread): drop to the floor
  startFall() {
    if (this.state === 'windup' || this.windupT > 0) director.release(this);
    this.windupT = 0;
    this.state = 'fall';
    this.thread.visible = false;
    this.vel.copy(this.n).multiplyScalar(1.5);
  }

  updateFall(dt) {
    this.vel.y -= GRAVITY * dt;
    _v.copy(this.vel).multiplyScalar(dt);
    const blocked = moveSafe(this.world, this.pos, _v, 0.3);
    if (blocked.x) this.vel.x = 0;
    if (blocked.z) this.vel.z = 0;
    this.roll += dt * 9;
    if (this.vel.y < 0) {
      const g = groundBelow(this.world, this.pos, 0, SPIDER.H + 0.05);
      if (g || blocked.y) {
        if (g) this.pos.y = g.point.y + SPIDER.H;
        this.n.set(0, 1, 0);
        this.roll = 0;
        this.vel.set(0, 0, 0);
        this.state = this.aggro ? 'engage' : 'patrol';
        this.stagger = Math.max(this.stagger, 0.4);
        this.world.fx.burst(_a.copy(this.pos).setY(this.pos.y - SPIDER.H), 0x8a9a7a, { count: 10, speed: 3, life: 0.5, size: 0.2, gravity: 6 });
        sfx('spider_land', 0.7 * falloff(this.dist, 3, 25));
      }
    }
  }

  // ---- the thread drop: down from the ceiling to hang above the player, then back up ----
  startDrop() {
    this.state = 'drop';
    this.anchor.copy(this.pos).addScaledVector(this.n, -SPIDER.H);
    const g = groundBelow(this.world, this.pos, -0.5, 30);
    this.hangY = g ? Math.max(g.point.y + 2.5, this.pos.y - 8) : this.pos.y - 3;
    this.hangY = Math.min(this.hangY, this.pos.y - 1);
    this.n.set(0, 1, 0);
    this.thread.visible = true;
    this.fireTimer = Math.min(this.fireTimer, 0.9);
    sfx('spider_leap', 0.6 * falloff(this.dist, 4, 30), { rate: 0.8 });
  }

  updateThread(dt, player) {
    if (this.state === 'drop') {
      this.pos.y = Math.max(this.hangY, this.pos.y - 7 * dt);
      if (this.pos.y <= this.hangY) {
        this.state = 'hang';
        this.timer = rnd(3.5, 4.5);
        this.vel.set(0, 0, 0);
      }
    } else if (this.state === 'hang') {
      // sway on the thread, spit from above; aimed at, it lets go and drops
      this.pos.x = this.anchor.x + Math.sin(this.t * 1.6) * 0.25;
      this.pos.z = this.anchor.z + Math.cos(this.t * 1.3) * 0.2;
      if (this.windupT > 0) {
        this.windupT -= dt;
        if (this.windupT <= 0) {
          this.spit(player);
          this.state = 'hang';
        }
      } else if (this.sees && this.stagger <= 0) {
        this.fireTimer -= dt;
        if (this.fireTimer <= 0 && !director.request(this, SPIDER.windup + 0.4)) this.fireTimer = rnd(0.25, 0.5);
        else if (this.fireTimer <= 0) {
          this.windupT = SPIDER.windup;
          sfx('spider_hiss', 0.7 * falloff(this.dist, 4, 30), { rate: 1.3 });
        }
      }
      if (this.dodgeCool <= 0 && aimedAt(this.world, this.pos, 0.996) && Math.random() < dt * 1.5) {
        this.dodgeCool = 2;
        return this.startFall();
      }
      if (this.timer <= 0) this.state = 'climbUp';
    } else {
      this.pos.lerp(_v.copy(this.anchor).y -= SPIDER.H, Math.min(1, dt * 3));
      if (this.pos.distanceTo(_v) < 0.15) {
        this.pos.copy(_v);
        this.n.set(0, -1, 0);
        this.thread.visible = false;
        this.state = this.aggro ? 'engage' : 'patrol';
        this.dropCool = 7;
      }
    }
    // the thread from the anchor down to the body
    const len = Math.max(0.01, this.anchor.y - this.pos.y - 0.25);
    this.thread.position.copy(this.pos).y += 0.25;
    this.thread.scale.set(1, len, 1);
  }

  onHit(color, hit) {
    if (this.dead) return undefined;
    this.aggro = true;
    if (color !== this.color) {
      this.immuneFlash = 1;
      if (this.state === 'engage' || this.state === 'patrol') this.startRoll(this.world.game.player);
      return 'immune';
    }
    this.hp--;
    this.flash = 1;
    this.stagger = SPIDER.stagger;
    this.fireTimer = Math.max(this.fireTimer, 0.6);
    if (this.state === 'windup' || this.windupT > 0) director.release(this);
    if (this.state === 'windup') this.state = 'engage';
    this.windupT = 0;
    const p = hit?.point ?? this.pos;
    hitSparks(this.world, hit, p, this.color);
    sfx('critter_hit', Math.max(0.5, falloff(this.dist, 6, 40)));
    if (this.hp <= 0) {
      this.die();
      barks.died(this);
      return 'kill';
    }
    esfx('robot_pain_light', this.pos, 0.8, 1.4);
    barks.say(this, 'hit');
    // a hit can knock it off a wall, the ceiling or its thread
    if (this.state === 'hang' || this.state === 'drop' || this.state === 'climbUp' || (!this.onFloor && this.state !== 'fall' && Math.random() < 0.3)) this.startFall();
    return 'hit';
  }

  die() {
    this.dead = true;
    this.world.removeHittable(this.group);
    blast(this.world, this.pos, this.color, 0.9);
    sfx('critter_die', Math.max(0.3, falloff(this.dist, 6, 60)));
    const player = this.world.game.player;
    player.shake = Math.max(player.shake, 0.1 + 0.2 * falloff(this.dist, 4, 25));
    // fling the body and a few legs (built for the occasion from the shared leg geometry)
    this.group.updateMatrixWorld(true);
    const G = spiderGeometry(), bits = [...this.parts];
    for (let i = 0; i < 6; i++) {
      const leg = new THREE.Mesh(G.seg, this.darkMat);
      leg.scale.set(1, 0.45, 1);
      leg.position.set(rnd(-0.4, 0.4), 0, rnd(-0.4, 0.4));
      leg.rotation.z = Math.PI / 2;
      this.body.add(leg);
      bits.push(leg);
    }
    this.metalMat.emissive.setRGB(0.5, 0.16, 0.03);
    this.glowMat.color.setRGB(0.4, 0.1, 0.08);
    new Debris(this.world, bits, { from: this.pos, speed: 7, mats: [this.metalMat, this.darkMat, this.mossMat, this.glowMat] });
    this.onDeath?.(this);
    this.dispose(false);
  }

  vanish() {
    this.dead = true;
    this.onDeath?.(this);
    this.dispose();
  }

  // turn the body to stand on its surface, facing the player when engaged
  orient(dt, snap = false) {
    const engaged = this.aggro && (this.state === 'engage' || this.state === 'windup' || this.state === 'hang' || this.state === 'drop');
    const up = this.state === 'fall' || this.state === 'drop' || this.state === 'hang' || this.state === 'climbUp' || (this.state === 'roll' && this.airborne) ? UP : this.n;
    if (engaged) _v.subVectors(this.world.game.player.pos, this.pos);
    else if (this.state === 'roll') _v.copy(this.face); // hold its facing through a roll, so the tumble reads sideways
    else _v.copy(this.heading);
    _v.addScaledVector(up, -_v.dot(up));
    if (_v.lengthSq() < 1e-4) _v.copy(this.face);
    _v.addScaledVector(up, -_v.dot(up)).normalize();
    if (!Number.isFinite(_v.x) || _v.lengthSq() < 0.5) _v.copy(this.tangent(_v.set(0.3, 0.2, 1)));
    this.face.copy(_v);
    // basis: y = up, z = back (the model looks down -z)
    _b.copy(_v).negate();
    _s.crossVectors(up, _b).normalize();
    _m.makeBasis(_s, up, _b);
    _q.setFromRotationMatrix(_m);
    if (snap) this.group.quaternion.copy(_q);
    else this.group.quaternion.slerp(_q, Math.min(1, dt * 12));
    this.group.position.copy(this.pos);
  }

  // legs (a gait while it moves, curled up in the air), the body roll, the glowing sac and eyes
  animate(dt) {
    const air = this.state === 'fall' || this.state === 'drop' || this.state === 'hang' || this.state === 'climbUp' || (this.state === 'roll' && this.airborne);
    const move = Math.min(1, this.speed / 3);
    const H = SPIDER.H / SPIDER.S; // (leg points are in the scaled body's space)
    const gait = this.t * (8 + this.speed * 2.2);
    for (let i = 0; i < 8; i++) {
      const L = HIPS[i];
      const hip = _a.set(L.x, 0.02, L.z);
      const ph = gait + ((i % 2) ^ (L.s > 0 ? 1 : 0)) * Math.PI;
      const knee = _b.copy(hip).addScaledVector(L.dir, 0.4);
      knee.y += 0.34;
      const foot = _s.copy(hip).addScaledVector(L.dir, air ? 0.42 : 0.82);
      if (air) {
        foot.y = -0.2 + Math.sin(this.t * 14 + i) * 0.05;
        knee.y += 0.05;
      } else {
        foot.y = -H;
        foot.z += Math.sin(ph) * 0.2 * move;
        foot.y += Math.max(0, Math.cos(ph)) * 0.14 * move;
      }
      knee.z += Math.sin(ph) * 0.08 * move;
      this.setSeg(i * 2, hip, knee);
      this.setSeg(i * 2 + 1, knee, foot);
    }
    this.legs.instanceMatrix.needsUpdate = true;
    // a servo tick per leg set swinging through (rate-limited across every spider)
    const tick = Math.sin(gait) >= 0 ? 1 : -1;
    if (tick !== this.tickSign) {
      this.tickSign = tick;
      if (!air && move > 0.15 && this.dist < 14) esfx('servo_tick', this.pos, 0.4 + 0.6 * move, 1.1 + Math.random() * 0.2);
    }
    // dodge roll / tumble around its long axis, a jolt when hit
    this.body.rotation.z = this.roll;
    this.body.rotation.x = this.stagger > 0 ? Math.sin(this.t * 50) * 0.08 : 0;
    this.body.position.y = air ? 0 : Math.sin(this.t * 16) * 0.012 * move;
    // abdomen sac swells and glows while it gathers a spit
    const wind = this.state === 'windup' ? 1 - Math.max(0, this.timer) / SPIDER.windup : this.windupT > 0 ? 1 - this.windupT / SPIDER.windup : 0;
    this.sac.scale.setScalar(1 + wind * 0.45 + Math.sin(this.t * 3) * 0.04);
    const shifting = this.palette.length > 1 && this.cycleTimer < 0.45 && Math.sin(this.t * 45) > 0;
    const col = shifting ? this.palette[(this.colorIdx + 1) % this.palette.length] : this.color;
    tint(this.sacMat, col, 0.8 + wind * 2.2);
    if (this.flash > 0) this.glowMat.color.setRGB(3, 3, 3);
    else if (this.immuneFlash > 0) this.glowMat.color.setRGB(0.7, 0.7, 0.8);
    else {
      tint(this.glowMat, col, 2.4);
      this.metalMat.emissive.copy(_c.set(COLORS[col].hex)).multiplyScalar(0.06 + wind * 0.1);
    }
  }

  setSeg(i, a, b) {
    _v.subVectors(b, a);
    const len = _v.length();
    _v.divideScalar(len || 1);
    _q.setFromUnitVectors(UP, _v);
    _m.compose(_mid.addVectors(a, b).multiplyScalar(0.5), _q, _scale.set(1, len, 1));
    this.legs.setMatrixAt(i, _m);
  }

  dispose(full = true) {
    this.dead = true;
    this.voice.stop();
    this.world.removeHittable(this.group);
    this.world.remove(this);
    this.world.scene.remove(this.group);
    this.world.scene.remove(this.thread);
    this.legs.dispose();
    this.sacMat.dispose();
    this.threadMat.dispose();
    if (full) for (const m of [this.metalMat, this.darkMat, this.mossMat, this.glowMat]) m.dispose();
  }
}
const _scale = new THREE.Vector3();
const _mid = new THREE.Vector3();
