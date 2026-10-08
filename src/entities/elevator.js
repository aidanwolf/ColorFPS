// A powered lift: a solid platform that runs once along a path of waypoints, accelerating and braking
// smoothly, at a speed that can change along the way (a number, or a function of the distance travelled).
// Riders stick to it because it publishes solid.delta every update, like MovingPlatform (Player.update
// adds its ground's delta before moving, and entities update before the player).
// Start it from code (start / arm) or with a trigger volume; hold(true) brakes it to a stop mid-run
// (power failures, ambushes); reset() puts it back at the start and re-arms its trigger.
import * as THREE from 'three';
import { boxGeo, mat } from '../materials.js';
import { audio } from '../audio.js';

const _p = new THREE.Vector3();

export class Elevator {
  // min/max: the platform box at the start. path: offsets of the following waypoints from the start.
  // speed: m/s, or (dist, len) => m/s. trigger: { min, max } arms it when the player walks in; delay is
  // the countdown between arming and moving. Callbacks: onArm, onStart, onArrive, onReset (each gets this).
  constructor(world, { min, max, path, speed = 2, accel = 1.5, decel = 1.5, delay = 0, trigger = null, zone = 'red', kind = 'plat', sound = true, onArm = null, onStart = null, onArrive = null, onReset = null }) {
    this.world = world;
    this.size = new THREE.Vector3(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    this.points = [new THREE.Vector3(...min)];
    for (const o of path) this.points.push(new THREE.Vector3(...min).add(new THREE.Vector3(...o)));
    this.segs = [];
    this.len = 0;
    for (let i = 1; i < this.points.length; i++) {
      const l = this.points[i].distanceTo(this.points[i - 1]);
      this.segs.push(l);
      this.len += l;
    }
    this.speed = speed;
    this.accel = accel;
    this.decel = decel;
    this.delay = delay;
    this.sound = sound;
    this.onArm = onArm;
    this.onStart = onStart;
    this.onArrive = onArrive;
    this.onReset = onReset;
    this.state = 'idle'; // idle → armed (counting down) → moving → arrived
    this.dist = 0;
    this.v = 0;
    this.held = false;
    this.timer = 0;
    this.cur = this.points[0].clone();

    this.mesh = new THREE.Group(); // origin at the platform's min corner; levels may add their own dressing
    const body = new THREE.Mesh(boxGeo(this.size.x, this.size.y, this.size.z), mat(kind, zone));
    body.position.copy(this.size).multiplyScalar(0.5);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(this.size.x + 0.04, 0.08, this.size.z + 0.04), mat('trimWhite'));
    glow.position.set(this.size.x / 2, this.size.y - 0.1, this.size.z / 2);
    this.mesh.add(body, glow);
    this.mesh.position.copy(this.cur);
    world.scene.add(this.mesh);
    this.solid = world.addSolid(this.cur.clone(), this.cur.clone().add(this.size), { delta: new THREE.Vector3(), moving: true, kind: 'metal' });
    if (trigger) this.trigger = world.trigger(trigger.min, trigger.max, () => this.arm());
    // the motor hum; silent until the sample exists and the lift moves
    this.loop = sound && audio.createLoop ? audio.createLoop('elevator_loop', { gain: 0 }) : null;
    world.add(this);
  }

  // top surface height, handy for scripting events along a vertical ride
  get top() {
    return this.cur.y + this.size.y;
  }

  get progress() {
    return this.len ? this.dist / this.len : 1;
  }

  arm() {
    if (this.state !== 'idle') return;
    this.state = 'armed';
    this.timer = this.delay;
    this.onArm?.(this);
    if (this.delay <= 0) this.start();
  }

  start() {
    if (this.state === 'moving' || this.state === 'arrived') return;
    this.state = 'moving';
    if (this.sound) audio.sample('elevator_start', { gain: 0.9, vary: 0 });
    this.onStart?.(this);
  }

  // brake to a stop where it is (true) or carry on (false)
  hold(on) {
    this.held = on;
  }

  reset() {
    this.state = 'idle';
    this.dist = 0;
    this.v = 0;
    this.held = false;
    this.place(this.points[0]);
    this.solid.delta.set(0, 0, 0); // a teleport, not a move: don't drag anyone along
    if (this.trigger) {
      this.trigger.fired = false;
      this.trigger.inside = false;
    }
    this.loop?.setGain(0);
    this.onReset?.(this);
  }

  pointAt(d, out) {
    let i = 0;
    while (i < this.segs.length - 1 && d > this.segs[i]) d -= this.segs[i++];
    const k = this.segs[i] ? Math.min(1, d / this.segs[i]) : 1;
    return out.lerpVectors(this.points[i], this.points[i + 1], k);
  }

  place(p) {
    this.cur.copy(p);
    this.solid.min.copy(p);
    this.solid.max.copy(p).add(this.size);
    this.mesh.position.copy(p);
  }

  update(dt) {
    const delta = this.solid.delta.set(0, 0, 0);
    if (this.state === 'armed') {
      this.timer -= dt;
      if (this.timer <= 0) this.start();
    }
    if (this.state !== 'moving') return;
    const left = this.len - this.dist;
    let target = this.held ? 0 : typeof this.speed === 'function' ? this.speed(this.dist, this.len) : this.speed;
    // brake so it settles exactly at the last waypoint
    if (!this.held) target = Math.min(target, Math.max(0.25, Math.sqrt(2 * this.decel * left)));
    this.v = this.v < target ? Math.min(target, this.v + this.accel * dt) : Math.max(target, this.v - this.decel * dt);
    this.dist = Math.min(this.len, this.dist + this.v * dt);
    this.pointAt(this.dist, _p);
    delta.subVectors(_p, this.cur);
    this.place(_p);
    this.loop?.setGain(Math.min(1, this.v / 1.6) * 0.7);
    if (this.loop) this.loop.setRate(0.85 + Math.min(0.4, this.v * 0.15));
    if (this.dist >= this.len) {
      this.state = 'arrived';
      this.v = 0;
      this.loop?.setGain(0);
      if (this.sound) audio.sample('elevator_stop', { gain: 0.9, vary: 0 });
      this.onArrive?.(this);
    }
  }
}
