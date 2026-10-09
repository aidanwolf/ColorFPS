// The combat director: keeps fights intense but readable.
//  - Attack tokens: an enemy must hold a token to fire or lunge. Only `tokens` attackers act at once (the
//    rest keep moving and threatening), so a crowd never unloads on you all together, and an encounter
//    can dial the pressure up or down with setIntensity().
//  - Fair warning from off screen: the first shot an enemy fires from outside your view deliberately
//    misses, close enough to see and hear, so it gives away its position before it can hurt you.
import * as THREE from 'three';

const _f = new THREE.Frustum(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _side = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_TOKENS = 2;

class Director {
  constructor() {
    this.game = null;
    this.tokens = DEFAULT_TOKENS;
    this.holders = new Map(); // enemy -> seconds left on its token
    this.onGrant = null; // (enemy, holders) when a token is granted
  }

  attach(game) {
    this.game = game;
  }

  // How many enemies may attack at once (encounters raise it for a climax, puzzles lower it).
  setIntensity(n = DEFAULT_TOKENS) {
    this.tokens = Math.max(1, n);
  }

  // Ask to attack. Returns true if `enemy` may fire / lunge now; it keeps the token for `hold` seconds
  // (cover its wind-up and the shot). Call release() early if the attack is cancelled. An enraged enemy
  // (entities/rage.js) pushes in: it may take one token past the cap.
  request(enemy, hold = 0.8) {
    if (this.holders.has(enemy)) return true;
    if (this.holders.size >= this.tokens + (enemy.rage?.on ? 1 : 0)) return false;
    this.holders.set(enemy, hold);
    this.onGrant?.(enemy, this.holders.size); // combat/barks.js: "Flank it!" / "Pinning it down!"
    return true;
  }

  release(enemy) {
    this.holders.delete(enemy);
  }

  update(dt) {
    for (const [e, t] of this.holders) {
      if (t - dt <= 0 || e.dead || e.alive === false) this.holders.delete(e);
      else this.holders.set(e, t - dt);
    }
  }

  // Is a point inside the player's view?
  onScreen(p) {
    const cam = this.game?.camera;
    if (!cam) return true;
    _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _f.setFromProjectionMatrix(_m);
    return _f.containsPoint(p);
  }

  // Where `enemy` (shooting from `from`) should aim at `target`: the target itself, except for its first
  // shot from off screen, which is pulled ~2 m wide of you so it whizzes past as a warning. Returns a new
  // vector. The warning re-arms after the enemy has been out of action (or seen) for a while.
  aim(enemy, from, target) {
    const out = target.clone();
    const now = performance.now() / 1000;
    if (enemy._warnedAt && now - enemy._warnedAt > 8) enemy._warnedAt = 0;
    if (this.onScreen(from)) {
      enemy._warnedAt = enemy._warnedAt || now; // seen: no warning owed
      return out;
    }
    if (enemy._warnedAt) return out;
    enemy._warnedAt = now;
    _v.subVectors(target, from).normalize();
    _side.crossVectors(_v, UP);
    if (_side.lengthSq() < 1e-4) _side.set(1, 0, 0);
    _side.normalize().multiplyScalar((Math.random() < 0.5 ? -1 : 1) * (1.8 + Math.random() * 0.6));
    return out.add(_side).addScaledVector(UP, 0.6);
  }
}

export const director = new Director();
