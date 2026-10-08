// World container: static box geometry (merged per material), collision solids, entities,
// trigger volumes, enemy projectiles and the shared ray-cast used for shots and sight lines.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxGeo, mat } from './materials.js';
import { Fx } from './fx.js';

const _v = new THREE.Vector3();
const _ray = new THREE.Raycaster();

export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.solids = [];
    this.entities = [];
    this.hitTargets = [];
    this.triggers = [];
    this.projectiles = [];
    this.staticParts = new Map();
    this.staticGroup = new THREE.Group();
    this.scene.add(this.staticGroup);
    this.fx = new Fx(this.scene);
    this.time = 0;
  }

  // ---------- static geometry ----------
  box(x1, y1, z1, x2, y2, z2, kind = 'wall', zone = 'red', opts = {}) {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    const minZ = Math.min(z1, z2), maxZ = Math.max(z1, z2);
    const w = maxX - minX, h = maxY - minY, d = maxZ - minZ;
    if (w <= 0.001 || h <= 0.001 || d <= 0.001) return null;
    const m = mat(kind, zone);
    const geo = boxGeo(w, h, d, opts.uv ?? 0.5).translate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    if (!this.staticParts.has(m)) this.staticParts.set(m, []);
    this.staticParts.get(m).push(geo);
    if (opts.solid === false) return null;
    return this.addSolid(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ), {
      static: true,
      hazard: opts.hazard,
      kind, // floor material, used for footstep sounds
    });
  }

  deco(x1, y1, z1, x2, y2, z2, kind, zone) {
    return this.box(x1, y1, z1, x2, y2, z2, kind, zone, { solid: false });
  }

  // Merge everything added with box()/deco() into one mesh per material.
  finalize() {
    for (const [m, geos] of this.staticParts) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, m);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.staticGroup.add(mesh);
    }
    this.staticParts.clear();
  }

  addSolid(min, max, props = {}) {
    const s = { min, max, enabled: true, ...props };
    this.solids.push(s);
    return s;
  }

  // ---------- entities ----------
  add(entity) {
    this.entities.push(entity);
    return entity;
  }

  remove(entity) {
    const i = this.entities.indexOf(entity);
    if (i >= 0) this.entities.splice(i, 1);
  }

  addHittable(obj) {
    this.hitTargets.push(obj);
  }

  removeHittable(obj) {
    const i = this.hitTargets.indexOf(obj);
    if (i >= 0) this.hitTargets.splice(i, 1);
  }

  trigger(min, max, onEnter, { once = true, onExit = null } = {}) {
    const t = { min: new THREE.Vector3(...min), max: new THREE.Vector3(...max), onEnter, onExit, once, fired: false, inside: false, enabled: true };
    this.triggers.push(t);
    return t;
  }

  // ---------- ray casting ----------
  // Returns the closest hit among solids (boxes), hittable meshes and enemy projectiles.
  raycast(origin, dir, far = 200, { projectiles = false, meshes = true } = {}) {
    let best = null;
    let bestT = far;
    for (const s of this.solids) {
      if (!s.enabled || s.noShot) continue;
      const r = rayBox(origin, dir, s.min, s.max, bestT);
      if (r) {
        bestT = r.t;
        best = { t: r.t, normal: r.normal, solid: s, entity: s.entity || null, part: s.part || null };
      }
    }
    if (meshes && this.hitTargets.length) {
      _ray.set(origin, dir);
      _ray.camera = this.game.camera;
      // entities animate during update, so refresh their world matrices before testing against them
      for (const o of this.hitTargets) o.updateMatrixWorld(true);
      _ray.far = bestT;
      const hits = _ray.intersectObjects(this.hitTargets, true);
      for (const h of hits) {
        // three's raycaster ignores visibility, so skip anything hidden (e.g. a broken shield)
        let hidden = false;
        for (let a = h.object; a; a = a.parent) if (!a.visible) hidden = true;
        if (hidden) continue;
        let o = h.object;
        while (o && !o.userData.hit) o = o.parent;
        if (!o) continue;
        if (o.userData.noHit) continue;
        bestT = h.distance;
        const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : dir.clone().negate();
        best = { t: h.distance, normal: n, entity: o.userData.hit, part: o.userData.part || null, object: h.object };
        break;
      }
    }
    if (projectiles) {
      for (const p of this.projectiles) {
        if (!p.alive || !p.shootable) continue;
        const t = raySphere(origin, dir, p.pos, p.hitRadius);
        if (t !== null && t < bestT) {
          bestT = t;
          best = { t, normal: dir.clone().negate(), entity: p, part: null };
        }
      }
    }
    if (best) best.point = origin.clone().addScaledVector(dir, best.t);
    return best;
  }

  lineOfSight(a, b) {
    _v.subVectors(b, a);
    const len = _v.length();
    _v.divideScalar(len);
    const hit = this.raycast(a, _v, len, { meshes: false });
    return !hit;
  }

  pointInSolid(p, pad = 0) {
    for (const s of this.solids) {
      if (!s.enabled || s.noShot) continue;
      if (p.x > s.min.x - pad && p.x < s.max.x + pad && p.y > s.min.y - pad && p.y < s.max.y + pad && p.z > s.min.z - pad && p.z < s.max.z + pad) return s;
    }
    return null;
  }

  // ---------- update ----------
  update(dt, player) {
    this.time += dt;
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (e.update) e.update(dt, player);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt, player);
      if (!p.alive) {
        p.dispose();
        this.projectiles.splice(i, 1);
      }
    }
    const pb = player.bounds();
    for (const t of this.triggers) {
      if (!t.enabled || (t.once && t.fired)) continue;
      const inside = boxOverlap(pb.min, pb.max, t.min, t.max);
      if (inside && !t.inside) {
        t.fired = true;
        t.onEnter?.(player);
      } else if (!inside && t.inside) {
        t.onExit?.(player);
      }
      t.inside = inside;
    }
    this.fx.update(dt);
  }
}

export function boxOverlap(amin, amax, bmin, bmax) {
  return amin.x < bmax.x && amax.x > bmin.x && amin.y < bmax.y && amax.y > bmin.y && amin.z < bmax.z && amax.z > bmin.z;
}

// Slab test. Returns { t, normal } for the entry point, or null.
export function rayBox(o, d, min, max, far) {
  let tmin = 0, tmax = far, axis = -1, sign = 0;
  for (let a = 0; a < 3; a++) {
    const k = a === 0 ? 'x' : a === 1 ? 'y' : 'z';
    const od = d[k], oo = o[k];
    if (Math.abs(od) < 1e-9) {
      if (oo < min[k] || oo > max[k]) return null;
      continue;
    }
    let t1 = (min[k] - oo) / od, t2 = (max[k] - oo) / od;
    let s = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      s = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      axis = a;
      sign = s;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (axis < 0) return null; // origin is inside the box
  const normal = new THREE.Vector3();
  normal.setComponent(axis, sign);
  return { t: tmin, normal };
}

export function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}
