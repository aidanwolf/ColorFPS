// VERDANT AMBUSHES — an Encounter whose enemies come out of the swamp, the trees and the walls instead of spawn
// portals (verdantSwamp.js, verdantRuin.js). See SwampAmbush below.
import * as THREE from 'three';
import { audio } from '../audio.js';
import { Encounter, spawnEnemy } from '../entities/combat.js';

const WATER_Y = 1.6; // (the swamp's surface: verdantSwamp.js WATER_Y)

// ---------------------------------------------------------------- ambushes from the trees and the water
// An Encounter whose enemies don't come out of spawn portals: `from: 'water'` bursts one out of the swamp (a
// slime springs from under the surface onto the bank at `to`), 'tree' drops one out of the canopy (a slime falls
// from `drop` m up; a spider clings under the branch above its pos and comes down on a thread), 'vent' throws one
// out of a wall vent along `vel`. No portal: a splash, a shower of leaves, a cough of spores.
export class SwampAmbush extends Encounter {
  spawn(spec) {
    const { from = 'portal' } = spec;
    if (from === 'portal') return super.spawn(spec);
    const { from: _f, to = null, drop = 0, vel = null, ...rest } = spec;
    const e = spawnEnemy(this.world, { aggro: true, ...rest });
    if (!e) return;
    this.live.push(e);
    this.waveEnemies.push(e);
    emerge(this.world, this.game, e, { from, to, drop, vel, pos: spec.pos });
  }
}

const _t = new THREE.Vector3();
export function emerge(W, game, e, { from, to = null, drop = 0, vel = null, pos }) {
  const fx = W.fx, cam = game.camera.position;
  const p = new THREE.Vector3(...pos);
  const d = p.distanceTo(cam), g = Math.max(0.25, Math.min(1, 1.4 - d / 30));
  e.aggro = true;
  if (from === 'water') {
    const s = p.clone().setY(WATER_Y + 0.05);
    fx.splash?.(s, 9);
    fx.ring(s, new THREE.Vector3(0, 1, 0), 0x6a8a4a, { size: 0.4, end: 3.2, life: 0.6, k: 1 });
    fx.burst(s, 0x2a3a1e, { count: 26, speed: 6, life: 0.9, size: 0.2, gravity: 14 });
    audio.sample(audio.sfxOr('swamp_burst', 'leviathan_splash'), { gain: 0.8 * g, rate: 1.4, vary: 0.1 });
    if (e.vel && e.state !== undefined && e.stage) {
      // a slime: up out of the water in an arc onto the bank
      e.pos.copy(s).y -= 0.4;
      const tgt = to ? _t.set(...to) : _t.copy(game.player.pos);
      const T = 0.85;
      e.vel.set((tgt.x - e.pos.x) / T, 0, (tgt.z - e.pos.z) / T);
      e.vel.y = (tgt.y + 0.5 - e.pos.y) / T + 10 * T;
      e.state = 'leap';
      e.squashV = 6;
    }
  } else if (from === 'tree') {
    const top = p.clone().setY(p.y + (drop || 8));
    fx.burst(top, 0x3a6a2a, { count: 30, speed: 4, life: 1.4, size: 0.18, gravity: 3, drag: 2 });
    audio.sample(audio.sfxOr('leaf_rustle', 'vine_whip'), { gain: 0.7 * g, vary: 0.15 });
    if (e.vel && e.stage) {
      e.pos.copy(top);
      e.vel.set(0, -2, 0);
      e.state = 'leap';
    }
  } else if (from === 'vent') {
    fx.burst(p, 0x3dff7a, { count: 20, speed: 5, life: 0.6, size: 0.2, gravity: 8 });
    audio.sample(audio.sfxOr('vent_gush', 'slime_splat'), { gain: 0.8 * g, rate: 0.8, vary: 0.1 });
    if (e.vel && e.stage) {
      e.pos.copy(p);
      if (vel) e.vel.set(...vel);
      e.state = 'leap';
      e.squashV = 6;
    }
  }
}

