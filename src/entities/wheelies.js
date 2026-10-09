// WHEELIES: props on castors you can shove about (the Atrium camp's office chairs, wheeled whiteboards, carts).
// Each is a cheap kinematic body on the floor: a few circles in its own frame, a velocity, a spin. Walk into one
// and it's pushed ahead of you (its speed matched to yours along the push), then rolls on and slows; an
// off-centre push turns it (chairs swivel freely). Bodies bump off the world's solids (at prop height), off
// each other and off a few no-go rectangles (the sunken dais, the lift pits), and stop the player only when
// they're jammed. Shots knock them rolling too (a noCollide proxy box carries the hit). A looping castor
// rattle (filtered noise, amplitude-modulated) follows the fastest one; a clunk plays on hard bumps.
// A body far from home that nobody is looking at drifts back home, so none can block a door for good.
// Drawn as one InstancedMesh per material per kind.
import * as THREE from 'three';
import { audio } from '../audio.js';

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _f = new THREE.Vector3();
const PR = 0.35; // the player's radius
const rnd = (a, b) => a + Math.random() * (b - a);

export class Wheelies {
  // floor: the floor height they roll on · blocks: [{ x1, z1, x2, z2 }] where they may never go · zone: their area
  constructor(W, { floor, blocks = [], zone = 'hub' }) {
    this.W = W;
    this.floor = floor;
    this.blocks = blocks;
    this.zone = zone;
    this.kinds = new Map();
    this.bodies = [];
    this.voice = null;
    this._cs = [];
    this._pc = [];
    this._ca = [];
    this._cb = [];
    W.add(this);
  }

  // parts: Map(material → geometry, in the body's frame, its base at y 0) · circles: [[x, z, r]] · h: height
  kind(name, parts, { circles, h = 1, mass = 1, swivel = 0.5, friction = 2.2 }) {
    this.kinds.set(name, { name, parts, circles, h, mass, swivel, friction, bodies: [], meshes: [] });
  }

  add(kind, x, z, yaw = 0) {
    const K = this.kinds.get(kind);
    const b = { K, i: K.bodies.length, x, z, yaw, vx: 0, vz: 0, w: 0, home: [x, z, yaw], away: 0, moved: true, scrape: 0 };
    K.bodies.push(b);
    this.bodies.push(b);
    // a proxy box for shots (walking passes through it: the body handles the player itself)
    const r = Math.max(...K.circles.map(([cx, cz, cr]) => Math.hypot(cx, cz) + cr));
    b.r = r;
    b.solid = this.W.addSolid(new THREE.Vector3(), new THREE.Vector3(), { noCollide: true, kind: 'metal', entity: { onHit: (c, hit) => this.shot(b, hit) } });
    this.place(b);
    return b;
  }

  build() {
    for (const K of this.kinds.values()) {
      for (const [mat, geo] of K.parts) {
        const mesh = new THREE.InstancedMesh(geo, mat, K.bodies.length);
        mesh.frustumCulled = false; // (they roll about: World's culling can't keep their bounds)
        mesh.userData.noCull = true;
        mesh.name = 'wheelie_' + K.name;
        K.meshes.push(mesh);
        this.W.scene.add(mesh);
      }
      for (const b of K.bodies) this.draw(b);
    }
  }

  draw(b) {
    _m.compose(_v.set(b.x, this.floor, b.z), _q.setFromAxisAngle(_f.set(0, 1, 0), b.yaw), _s);
    for (const mesh of b.K.meshes) {
      mesh.setMatrixAt(b.i, _m);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // the shot proxy follows the body
  place(b) {
    const s = b.solid, r = b.r;
    s.min.set(b.x - r, this.floor, b.z - r);
    s.max.set(b.x + r, this.floor + b.K.h, b.z + r);
  }

  shot(b, hit) {
    const d = hit?.dir || _v.set(0, 0, 1);
    const k = (hit?.kind === 'blast' ? 5 : 2.4) / b.K.mass;
    b.vx += d.x * k;
    b.vz += d.z * k;
    b.w += rnd(-3, 3) * b.K.swivel;
    b.moved = true;
    return 'hit';
  }

  // world circle centres of a body's circles
  circles(b, out) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    out.length = 0;
    for (const [lx, lz, r] of b.K.circles) out.push([b.x + lx * c + lz * s, b.z - lx * s + lz * c, r]);
    return out;
  }

  // push the body out of everything it overlaps; returns the hardest impact speed
  resolve(b) {
    const W = this.W, y1 = this.floor + 0.08, y2 = this.floor + Math.min(0.9, b.K.h);
    let hard = 0;
    const cs = this.circles(b, this._cs);
    const test = (x1, z1, x2, z2, k) => {
      const [cx, cz, r] = cs[k];
      const px = Math.max(x1, Math.min(cx, x2)), pz = Math.max(z1, Math.min(cz, z2));
      let dx = cx - px, dz = cz - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) return;
      let d = Math.sqrt(d2);
      if (d < 1e-5) {
        // centre inside the box: out the nearest side
        const o = [cx - x1, x2 - cx, cz - z1, z2 - cz], m = Math.min(...o), j = o.indexOf(m);
        dx = j === 0 ? -1 : j === 1 ? 1 : 0;
        dz = j === 2 ? -1 : j === 3 ? 1 : 0;
        d = -m;
      } else {
        dx /= d;
        dz /= d;
      }
      const pen = r - d;
      b.x += dx * pen;
      b.z += dz * pen;
      for (const c of cs) {
        c[0] += dx * pen;
        c[1] += dz * pen;
      }
      const vn = b.vx * dx + b.vz * dz;
      if (vn < 0) {
        hard = Math.max(hard, -vn);
        b.vx -= 1.35 * vn * dx;
        b.vz -= 1.35 * vn * dz;
        b.w += (Math.random() - 0.5) * -vn * 2 * b.K.swivel;
      }
    };
    for (let k = 0; k < cs.length; k++) {
      const [cx, cz] = cs[k];
      _v.set(cx, y1, cz);
      const cell = W.gridFor(_v) || [];
      for (const list of [cell, W.loose]) {
        for (const s of list) {
          if (!s.enabled || s.noCollide || s.max.y < y1 || s.min.y > y2) continue;
          test(s.min.x, s.min.z, s.max.x, s.max.z, k);
        }
      }
      for (const r of this.blocks) test(r.x1, r.z1, r.x2, r.z2, k);
    }
    return hard;
  }

  update(dt, player) {
    if (!this.bodies.length) return;
    const W = this.W;
    const here = W.drawnRegions ? W.drawnRegions.has(this.zone) : true;
    for (const K of this.kinds.values()) for (const m of K.meshes) m.visible = here;
    dt = Math.min(dt, 1 / 30);
    const cam = W.game.camera;
    cam.getWorldDirection(_f);
    // the player, where they're about to be this frame
    const onFloor = Math.abs(player.pos.y - this.floor) < 0.4 && !player.dead;
    const px = player.pos.x + player.vel.x * dt, pz = player.pos.z + player.vel.z * dt;
    let loud = 0, loudB = null, bump = 0, bumpB = null;
    for (const b of this.bodies) {
      const K = b.K;
      const ox = b.x, oz = b.z, oyaw = b.yaw;
      // the player shoves it
      if (onFloor && Math.abs(px - b.x) < b.r + PR && Math.abs(pz - b.z) < b.r + PR) {
        const cs = this.circles(b, this._pc);
        for (const [cx, cz, r] of cs) {
          let dx = cx - px, dz = cz - pz;
          const d = Math.hypot(dx, dz);
          if (d >= r + PR || d < 1e-5) continue;
          dx /= d;
          dz /= d;
          const pen = r + PR - d;
          b.x += dx * pen;
          b.z += dz * pen;
          // match the player's speed along the push (a touch more, so it leads)
          const pv = (player.vel.x * dx + player.vel.z * dz) * 1.08, bv = b.vx * dx + b.vz * dz;
          if (pv > bv) {
            b.vx += (pv - bv) * dx / Math.sqrt(K.mass);
            b.vz += (pv - bv) * dz / Math.sqrt(K.mass);
          }
          // an off-centre push turns it
          const lx = cx - b.x, lz = cz - b.z;
          b.w += (lx * dz - lz * dx) * -pen * 30 * (0.4 + K.swivel);
          b.w += (lx * (player.vel.z) - lz * player.vel.x) * -0.02 * K.swivel;
        }
      }
      // roll, slow down
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 1e-3) {
        const drop = Math.min(sp, (K.friction * sp + 0.6) * dt);
        b.vx -= (b.vx / sp) * drop;
        b.vz -= (b.vz / sp) * drop;
      } else b.vx = b.vz = 0;
      if (sp > 6) {
        b.vx *= 6 / sp;
        b.vz *= 6 / sp;
      }
      b.w *= Math.exp(-3 * dt);
      if (Math.abs(b.w) > 8) b.w = Math.sign(b.w) * 8;
      if (Math.abs(b.w) < 0.01) b.w = 0;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.yaw += b.w * dt;
      // at rest and untouched: nothing to resolve (it was already clear where it stopped)
      const idle = b.x === ox && b.z === oz && b.yaw === oyaw && !b.moved;
      b.moved = false;
      if (!idle) {
        const hard = this.resolve(b);
        if (hard > bump) {
          bump = hard;
          bumpB = b;
        }
        // still overlapping the player after the world pushed back: it's jammed; the player stops instead
        if (onFloor) {
          const cs = this.circles(b, this._pc);
          for (const [cx, cz, r] of cs) {
            const dx = player.pos.x - cx, dz = player.pos.z - cz, d = Math.hypot(dx, dz);
            if (d >= r + PR - 0.02 || d < 1e-5) continue;
            const pen = r + PR - d, nx = player.pos.x + (dx / d) * pen, nz = player.pos.z + (dz / d) * pen;
            if (player.fits(nx, player.pos.y + 0.02, nz, player.height)) {
              player.pos.x = nx;
              player.pos.z = nz;
            }
          }
        }
      }
      const moved = Math.abs(b.x - ox) + Math.abs(b.z - oz) + Math.abs(b.yaw - oyaw);
      const speed = Math.hypot(b.x - ox, b.z - oz) / dt + Math.abs(b.yaw - oyaw) * 0.3 / dt;
      b.scrape = speed;
      if (speed > loud) {
        loud = speed;
        loudB = b;
      }
      // home: far from it, out of sight and out of the way for a while → back where it was put
      const dh = Math.hypot(b.x - b.home[0], b.z - b.home[1]);
      if (dh > 2.5) {
        _v.set(b.x - cam.position.x, 0, b.z - cam.position.z);
        const dist = _v.length();
        const seen = dist < 40 && _v.dot(_f) > dist * 0.35;
        b.away = seen || dist < 5 ? 0 : b.away + dt;
        if (b.away > 6 && this.free(b)) {
          b.x = b.home[0];
          b.z = b.home[1];
          b.yaw = b.home[2];
          b.vx = b.vz = b.w = 0;
          b.away = 0;
          this.draw(b);
          this.place(b);
          continue;
        }
      } else b.away = 0;
      if (moved > 1e-5) {
        this.draw(b);
        this.place(b);
      }
    }
    // bodies bump each other: split the overlap, trade the closing speed
    const A = this._ca, Bc = this._cb;
    for (let i = 0; i < this.bodies.length; i++) {
      const a = this.bodies[i];
      for (let j = i + 1; j < this.bodies.length; j++) {
        const o = this.bodies[j];
        if (Math.abs(a.x - o.x) > a.r + o.r || Math.abs(a.z - o.z) > a.r + o.r) continue;
        this.circles(a, A);
        this.circles(o, Bc);
        let hit = false;
        for (const [ax, az, ar] of A)
          for (const [bx, bz, br] of Bc) {
            let dx = bx - ax, dz = bz - az;
            const d = Math.hypot(dx, dz);
            if (d >= ar + br || d < 1e-5) continue;
            dx /= d;
            dz /= d;
            const pen = (ar + br - d) / 2;
            a.x -= dx * pen;
            a.z -= dz * pen;
            o.x += dx * pen;
            o.z += dz * pen;
            const rel = (o.vx - a.vx) * dx + (o.vz - a.vz) * dz;
            if (rel < 0) {
              const imp = -rel * 0.6;
              a.vx -= dx * imp;
              a.vz -= dz * imp;
              o.vx += dx * imp;
              o.vz += dz * imp;
              if (-rel > bump) {
                bump = -rel;
                bumpB = a;
              }
            }
            hit = true;
          }
        if (hit) {
          this.resolve(a);
          this.resolve(o);
          this.draw(a);
          this.draw(o);
          this.place(a);
          this.place(o);
        }
      }
    }
    this.sound(loud, loudB, bump, bumpB, here);
  }

  // is its home spot clear of the player and the other bodies?
  free(b) {
    const [hx, hz] = b.home, P = this.W.game.player.pos;
    if (Math.hypot(P.x - hx, P.z - hz) < b.r + 1) return false;
    return !this.bodies.some((o) => o !== b && Math.hypot(o.x - hx, o.z - hz) < o.r + b.r);
  }

  // ---------------------------------------------------------------- the castor rattle
  sound(speed, b, bump, bumpB, here) {
    const ctx = audio.ctx;
    if (!ctx || !audio.noiseBuf || !audio.loopBus) return;
    if (!this.voice) {
      // noise → band-pass (the scrape) + low-pass (the rumble) → a gain the rattle LFO wobbles → level → pan
      const src = ctx.createBufferSource();
      src.buffer = audio.noiseBuf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 1.3;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 220;
      const lpg = ctx.createGain();
      lpg.gain.value = 2.2;
      const am = ctx.createGain();
      am.gain.value = 0.55;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 18;
      const depth = ctx.createGain();
      depth.gain.value = 0.4;
      lfo.connect(depth).connect(am.gain);
      const level = ctx.createGain();
      level.gain.value = 0;
      const pan = ctx.createStereoPanner();
      src.connect(bp).connect(am);
      src.connect(lp).connect(lpg).connect(am);
      am.connect(level).connect(pan).connect(audio.loopBus);
      src.start();
      lfo.start();
      this.voice = { bp, lfo, level, pan, g: 0 };
    }
    const V = this.voice, t = ctx.currentTime;
    let g = 0;
    if (here && b && speed > 0.15) {
      _v.set(b.x, this.floor + 0.3, b.z);
      const d = audio.distTo(_v);
      g = Math.min(1, speed / 3) * 0.32 * Math.pow(Math.max(0, 1 - d / 24), 2);
      V.bp.frequency.setTargetAtTime(500 + Math.min(speed, 5) * 320, t, 0.05);
      V.lfo.frequency.setTargetAtTime(9 + Math.min(speed, 5) * 7 + Math.random() * 3, t, 0.05);
      V.pan.pan.setTargetAtTime(audio.panOf(_v), t, 0.05);
    }
    if (Math.abs(g - V.g) > 0.004) {
      V.g = g;
      V.level.gain.setTargetAtTime(g, t, 0.06);
    }
    // a clunk on a hard bump
    if (here && bump > 0.9 && bumpB && (this.lastBump === undefined || t - this.lastBump > 0.12)) {
      this.lastBump = t;
      _v.set(bumpB.x, this.floor + 0.3, bumpB.z);
      const k = Math.min(1, bump / 4) * Math.pow(Math.max(0, 1 - audio.distTo(_v) / 26), 2);
      if (k > 0.01) {
        audio.tone({ type: 'triangle', f: 170 + Math.random() * 40, f2: 70, dur: 0.11, gain: 0.22 * k });
        audio.noise({ dur: 0.07, gain: 0.22 * k, freq: 1200, q: 0.9 });
        audio.at('step_metal1', _v, { gain: 0.45 * k + 0.1, rate: rnd(1.5, 1.9), near: 2, far: 26, key: 'wheelie_bump', gap: 0.08 });
      }
    }
  }
}
