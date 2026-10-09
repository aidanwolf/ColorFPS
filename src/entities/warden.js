// Warden drone: a heavy drone whose core (color B) sits inside an energy shield (color A). Break the
// shield with A (it cracks a little more with every hit), then switch and kill the core with B before
// the shield regenerates a few seconds later. It lobs slow seeker orbs in the core's color (shoot them
// with B or outrun them), each telegraphed by the core swelling.
import * as THREE from 'three';
import { Orb } from './drone.js';
import { audio } from '../audio.js';
import { COLORS } from '../colors.js';
import { Enemy, Parts, MAT, moveSafe, converge, falloff, hexOf, sfx } from './enemyKit.js';
import { esfx } from './enemySfx.js';
import { barks } from '../combat/barks.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _a = new THREE.Vector3();
const R = 1.55; // shield radius
const REFORM = 0.9; // seconds of telegraph before the shield comes back

const shieldShader = {
  vertexShader: `
    varying vec3 vN;
    varying vec3 vView;
    varying vec3 vLocal;
    void main() {
      vLocal = position;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vView = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uCrack;
    uniform float uFlash;
    uniform vec3 uHit;
    uniform float uHitT;
    varying vec3 vN;
    varying vec3 vView;
    varying vec3 vLocal;
    float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    void main() {
      vec3 n = normalize(vN);
      float rim = pow(1.0 - abs(dot(n, normalize(vView))), 2.2);
      // hex-ish cells from a 3D grid on the sphere
      vec3 q = vLocal * 2.4;
      vec3 f = abs(fract(q) - 0.5);
      float edge = smoothstep(0.42, 0.5, max(max(f.x, f.y), f.z));
      // cracks: cell edges that light up and break up as the shield takes hits
      float h = hash(floor(q));
      float crack = edge * step(1.0 - uCrack, h) * (0.6 + 0.4 * sin(uTime * 30.0 + h * 50.0));
      float broken = step(1.0 - uCrack * 0.55, hash(floor(q) + 7.0)); // dark missing cells
      float scan = 0.5 + 0.5 * sin(vLocal.y * 9.0 - uTime * 4.0);
      // a ripple ring spreading from the last impact
      float d = distance(normalize(vLocal), normalize(uHit));
      float ripple = smoothstep(0.12, 0.0, abs(d - uHitT * 2.2)) * max(0.0, 1.0 - uHitT * 1.6);
      float a = 0.1 + rim * 0.75 + edge * 0.22 + scan * 0.05 + crack * 1.2 + ripple * 0.9;
      a *= 1.0 - broken * 0.75;
      vec3 col = uColor * (0.7 + rim * 1.4 + edge * 0.8) + vec3(1.0) * (crack * 1.4 + uFlash + ripple * 0.8);
      gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    }`,
};

export class Warden extends Enemy {
  // shield: color A (breaks the shield), core: color B (kills). color: [A, B] works too.
  constructor(world, { pos, shield = null, core = null, color = null, shieldHp = 5, coreHp = 4, regen = 3.6, range = 36, fireInterval = 3.4, orbit = 2.5, aggro = false, onDeath = null }) {
    const pair = Array.isArray(color) ? color : [color ?? 0, color ?? 1];
    shield ??= pair[0];
    core ??= pair[1];
    super(world, { pos, color: shield, hp: coreHp, range, aggro, onDeath });
    this.shieldColor = shield;
    this.coreColor = core;
    this.shieldMax = shieldHp;
    this.shieldHp = shieldHp;
    this.regen = regen;
    this.shieldDown = 0; // seconds left with the shield down (0 = up)
    this.fireInterval = fireInterval;
    this.fireTimer = 1.5 + Math.random();
    this.windup = 0;
    this.orbit = orbit;
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.hitT = 9;

    // the core: a glowing sphere caged in armored bands
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mats.push(this.coreMat);
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), this.coreMat);
    this.body.add(this.core);
    const cage = new Parts();
    for (let i = 0; i < 3; i++) cage.add(MAT.shell, new THREE.TorusGeometry(0.62, 0.07, 6, 20), [0, 0, 0], [i === 0 ? Math.PI / 2 : 0, i === 2 ? Math.PI / 2 : 0, 0]);
    // armored pods top and bottom, and four fins that carry the core's color
    cage.add(this.armor, new THREE.CylinderGeometry(0.32, 0.5, 0.35, 8), [0, 0.78, 0]);
    cage.add(this.armor, new THREE.CylinderGeometry(0.5, 0.32, 0.35, 8), [0, -0.78, 0]);
    cage.add(MAT.dark, new THREE.ConeGeometry(0.2, 0.5, 6), [0, -1.15, 0], [Math.PI, 0, 0]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      cage.add(MAT.dark, new THREE.BoxGeometry(0.12, 0.9, 0.5), [Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95], [0, -a, 0]);
      cage.add(this.glow, new THREE.BoxGeometry(0.05, 0.75, 0.06), [Math.cos(a) * 1.02, 0, Math.sin(a) * 1.02], [0, -a, 0]);
    }
    this.cage = new THREE.Group();
    cage.build(this.cage);
    this.body.add(this.cage);
    // the shield bubble
    this.shieldMat = new THREE.ShaderMaterial({
      ...shieldShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(hexOf(shield)) }, uTime: { value: 0 }, uCrack: { value: 0 }, uFlash: { value: 0 }, uHit: { value: new THREE.Vector3(0, 0, 1) }, uHitT: { value: 9 } },
    });
    this.mats.push(this.shieldMat);
    this.shield = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 3), this.shieldMat);
    this.group.add(this.shield);
    this.hum = audio.createLoop('drone_hum', { rate: 0.7 });
    this.register();
  }

  applyColor() {
    this.armor.emissive.set(hexOf(this.coreColor)).multiplyScalar(0.16);
    this.glow.color.set(hexOf(this.coreColor)).multiplyScalar(1.8);
    this.coreMat.color.set(hexOf(this.coreColor)).multiplyScalar(this.shieldDown > 0 ? 2 : 1.4);
  }

  get shieldUp() {
    return this.shieldDown <= 0;
  }

  update(dt, player) {
    if (!this.tick(dt, player)) {
      this.group.position.copy(this.pos).y += Math.sin(this.t * 1.4) * 0.3;
      return this.updateHum(0.7);
    }
    const fx = this.world.fx;
    this.shieldMat.uniforms.uTime.value += dt;
    this.hitT += dt;
    this.shieldMat.uniforms.uHitT.value = this.hitT;
    this.shieldMat.uniforms.uFlash.value = Math.max(0, this.shieldMat.uniforms.uFlash.value - dt * 4);
    // shield down: count back up, with a converging telegraph before it snaps back on
    if (this.shieldDown > 0) {
      const before = this.shieldDown;
      this.shieldDown -= dt;
      if (before > REFORM && this.shieldDown <= REFORM) {
        sfx('warden_shield_up', { gain: 0.6 }, 'barrier_reform', { gain: 0.6, rate: 0.8 });
        barks.say(this, 'reload'); // "Shield regenerating."
      }
      if (this.shieldDown <= REFORM && Math.random() < dt * 40) converge(fx, this.pos, hexOf(this.shieldColor), { count: 3, radius: R * 1.8, time: 0.4, size: 0.06 });
      if (this.shieldDown <= 0) this.raiseShield();
    }
    // weave around home like the drones, heavier; drift back from the player if too close
    const o = this.aggro ? this.orbit + 1 : this.orbit * 0.6;
    const target = _v.set(this.home.x + Math.sin(this.t * 0.6) * o, this.home.y + Math.sin(this.t * 1.2) * 0.5, this.home.z + Math.sin(this.t * 1.2) * o * 0.5);
    _d.subVectors(target, this.pos).multiplyScalar(Math.min(1, dt * 1.4));
    if (this.dist < 6) _d.add(_a.subVectors(this.pos, this.eye).setY(0).normalize().multiplyScalar(dt * 3));
    _d.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-3 * dt));
    moveSafe(this.world, this.pos, _d, 0.95); // (pads over 1 m skip the solid grid: keep it under)
    this.group.position.copy(this.pos);
    // face the player
    if (this.aggro) {
      this.body.lookAt(this.eye);
    }
    this.cage.rotation.z += dt * (this.shieldUp ? 0.6 : 3);
    this.core.rotation.y += dt * 2;
    // attack: the core swells (and the fins brighten) for a moment, then a slow seeker orb in its color
    const exposed = this.shieldDown > 0;
    if (this.sees && this.ready && !exposed) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0.75 && !this.windup) {
        this.windup = 1;
        sfx('turret_charge', { gain: 0.45, rate: 0.8 }, 'charge_up', { gain: 0.35, rate: 0.9 });
        barks.say(this, 'suppress');
      }
      if (this.fireTimer <= 0) {
        this.fireTimer = this.fireInterval * (0.85 + Math.random() * 0.3) * this.rage.cool;
        this.windup = 0;
        this.fire();
      }
    }
    const swell = this.windup ? 1 + (0.75 - Math.max(0, this.fireTimer)) * 0.9 : 1;
    this.core.scale.setScalar(swell * (exposed ? 1 + Math.sin(this.t * 14) * 0.08 : 1));
    if (this.windup && Math.random() < dt * 25) converge(fx, this.pos, hexOf(this.coreColor), { count: 2, radius: 1.2, time: 0.35 });
    // glow
    if (this.flash > 0) this.coreMat.color.setRGB(3, 3, 3);
    else this.coreMat.color.set(hexOf(this.coreColor)).multiplyScalar(exposed ? 1.9 + Math.sin(this.t * 14) * 0.5 : 1.4 + (swell - 1) * 1.5);
    if (this.immuneFlash > 0 && !exposed) this.shieldMat.uniforms.uFlash.value = Math.max(this.shieldMat.uniforms.uFlash.value, 0.15);
    // core sparks while it's exposed
    if (exposed && Math.random() < dt * 10) fx.sparks(this.pos, _a.randomDirection(), hexOf(this.coreColor), { count: 3, speed: 5, spread: 0.5, life: 0.3 });
    this.updateHum(0.7 + (exposed ? 0.3 : 0) + (swell - 1) * 0.4, 0.35, 4, 32);
  }

  fire() {
    const dir = _d.subVectors(this.aimPoint(this.game.player, _a), this.pos).normalize();
    const start = this.pos.clone().addScaledVector(dir, R + 0.4);
    new Orb(this.world, start, dir.clone().multiplyScalar(7.5), this.coreColor, { radius: 0.42, homing: 0.85, life: 5.5 });
    this.world.fx.flash(start, hexOf(this.coreColor), { size: 1, life: 0.12 });
    audio.enemyShoot();
  }

  onHit(color, hit) {
    if (this.dead || this.gone) return undefined;
    this.aggro = true;
    if (this.shieldUp) {
      // anything that strikes us while the shield is up hits the shield
      this.hitT = 0;
      if (hit?.point) this.shieldMat.uniforms.uHit.value.copy(hit.point).sub(this.pos);
      if (color !== this.shieldColor) {
        this.immuneFlash = 1;
        this.rage.wrong(hit);
        return 'immune';
      }
      this.shieldHp--;
      this.shieldMat.uniforms.uCrack.value = 1 - this.shieldHp / this.shieldMax;
      this.shieldMat.uniforms.uFlash.value = 0.6;
      const p = hit?.point ?? this.pos;
      this.world.fx.burst(p, hexOf(this.shieldColor), { count: 14, speed: 6, life: 0.35, size: 0.22, gravity: 2 });
      this.world.fx.ring(p, _a.subVectors(p, this.pos).normalize(), hexOf(this.shieldColor), { size: 0.2, end: 1.2, life: 0.3, thick: 0.12 });
      const g = Math.max(0.5, falloff(this.dist, 6, 40));
      sfx('warden_shield_hit', { gain: 0.6 * g, vary: 0.1 }, 'glass_hit', { gain: 0.6 * g, rate: 0.7 + (1 - this.shieldHp / this.shieldMax) * 0.4 });
      this.knock.addScaledVector(this.shotDir(hit), 1.2);
      if (this.shieldHp <= 0) this.breakShield(hit);
      return this.shieldHp <= 0 ? 'kill' : 'hit';
    }
    if (color !== this.coreColor) {
      this.immuneFlash = 1;
      this.rage.wrong(hit);
      return 'immune';
    }
    this.knock.addScaledVector(this.shotDir(hit), 2.5);
    return this.damage(hit, 1);
  }

  breakShield(hit) {
    this.shieldDown = this.regen + REFORM;
    this.shield.visible = false;
    this.color = this.coreColor;
    this.windup = 0;
    this.fireTimer = Math.max(this.fireTimer, 1.2);
    const fx = this.world.fx;
    const c = new THREE.Color(hexOf(this.shieldColor));
    for (let j = 0, n = fx.budget(60); j < n; j++) {
      _a.randomDirection();
      const p = _v.copy(this.pos).addScaledVector(_a, R);
      _a.multiplyScalar(4 + Math.random() * 6);
      const i = fx.shard(p, _a.x, _a.y + 2, _a.z, c, 1.3, 0.7 + Math.random() * 0.6, 0.06 + Math.random() * 0.08, 2.2);
      fx.grav[i] = 10;
    }
    fx.ring(this.pos, null, hexOf(this.shieldColor), { size: R, end: R * 3, life: 0.4, thick: 0.1, k: 1.6 });
    fx.flash(this.pos, hexOf(this.shieldColor), { size: R * 2, life: 0.15 });
    sfx('warden_shield_break', { gain: 0.9 }, 'shield_break', { gain: 0.9 });
    esfx('robot_pain_light', this.pos, 1, 0.7);
    barks.say(this, 'hit'); // (its own shield: "Structural integrity falling.")
    // the first time, spell out what to do
    if (!Warden.taught) {
      Warden.taught = true;
      this.game.hud.message(`Shield down! Hit the core with <b style="color:${COLORS[this.coreColor].css}">${COLORS[this.coreColor].name}</b>`, 2.2);
    }
  }

  raiseShield() {
    this.shieldDown = 0;
    this.shieldHp = this.shieldMax;
    this.shield.visible = true;
    this.color = this.shieldColor;
    this.shieldMat.uniforms.uCrack.value = 0;
    this.shieldMat.uniforms.uFlash.value = 1;
    this.world.fx.ring(this.pos, null, hexOf(this.shieldColor), { size: R * 2.2, end: R, life: 0.3, thick: 0.1 });
  }

  die(hit, dir) {
    this.dead = true;
    this.color = this.coreColor;
    this.explode({ scale: 1.5, chunks: 9, vel: dir ? dir.clone().multiplyScalar(4) : null, shake: 0.4 });
  }
}
