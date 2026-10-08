// World container: static box geometry (merged per material), collision solids, entities,
// trigger volumes, enemy projectiles and the shared ray-cast used for shots and sight lines.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxGeo, mat } from './materials.js';
import { Fx } from './fx.js';
import { regionOf, VISIBLE_FROM } from './levels/regions.js';

const _v = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const GRID_CELL = 8;
const GRID_MARGIN = 1;
const POOL_SIZE = 10;
const CULL_SIZE = 1 / 45; // objects smaller than this (radius / distance) aren't drawn // real point lights shared by every placed light (see updateLights)

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
    // Placed lights are virtual: a fixed pool of real PointLights is handed to whichever are nearest the
    // camera. Every lit pixel loops over every real light, and changing their count recompiles every
    // shader, so the count stays constant no matter how many lights the levels place.
    this.virtualLights = [];
    this.lightPool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 1, 1.5);
      this.scene.add(l);
      this.lightPool.push({ light: l, owner: null, weight: 0 });
    }
  }

  // Distance/size culling for everything the levels added to the scene. All the worlds share one scene,
  // and from any spot most of the others are in front of the camera: anything farther than the fog, or
  // too small on screen to matter, isn't drawn. Each object keeps its own visibility (code that hides a
  // collected pickup or a dead drone still works): `visible` reads as wanted-and-not-culled.
  setupCulling(skip = []) {
    this.cullList = [];
    const box = new THREE.Box3(), sphere = new THREE.Sphere();
    for (const o of this.scene.children) {
      if (o === this.staticGroup || o.isCamera || o.isLight || o.userData.noCull || skip.includes(o)) continue;
      box.setFromObject(o);
      if (box.isEmpty()) continue;
      box.getBoundingSphere(sphere);
      // bounds relative to the object's position, so moving things (drones, lifts) stay correct
      const rec = { o, off: sphere.center.clone().sub(o.position), r: sphere.radius, region: regionOf(sphere.center), culled: false };
      let want = o.visible;
      Object.defineProperty(o, 'visible', { get: () => want && !rec.culled, set: (v) => (want = v), configurable: true });
      this.cullList.push(rec);
    }
  }

  updateCulling(camPos, far) {
    const seen = VISIBLE_FROM[regionOf(camPos)];
    // (only our merged meshes: the Bonus Round SDK adds its own objects under this group too)
    for (const m of this.staticGroup.children) if (m.userData.region) m.visible = seen.has(m.userData.region);
    for (const rec of this.cullList || []) {
      if (!seen.has(rec.region)) {
        rec.culled = true;
        continue;
      }
      const d = _v.copy(rec.o.position).add(rec.off).distanceTo(camPos) - rec.r;
      rec.culled = d > far || (d > 0 && rec.r / (d + rec.r) < CULL_SIZE);
    }
  }

  // A light that behaves like a PointLight for level code (position, color, intensity, distance, decay)
  // but only shines while it holds one of the pooled real lights.
  addLight(color, intensity = 30, distance = 30, decay = 1.5) {
    const v = { position: new THREE.Vector3(), color: new THREE.Color(color), intensity, distance, decay, slot: null };
    this.virtualLights.push(v);
    return v;
  }

  // Give the pool to the lights that matter most from where the camera is, fading them in and out.
  updateLights(camPos, dt) {
    const want = [];
    for (const v of this.virtualLights) {
      if (v.intensity <= 0) continue;
      const score = v.position.distanceTo(camPos) - v.distance;
      if (score < 50) want.push([score, v]);
    }
    want.sort((a, b) => a[0] - b[0]);
    const chosen = new Set(want.slice(0, POOL_SIZE).map((w) => w[1]));
    const fade = Math.min(1, dt * 4);
    for (const s of this.lightPool) {
      if (s.owner && !chosen.has(s.owner)) {
        s.weight -= fade;
        if (s.weight <= 0) {
          s.owner.slot = null;
          s.owner = null;
          s.weight = 0;
        }
      } else if (s.owner) s.weight = Math.min(1, s.weight + fade);
    }
    for (const v of chosen) {
      if (v.slot) continue;
      const s = this.lightPool.find((p) => !p.owner);
      if (!s) break;
      s.owner = v;
      v.slot = s;
      s.weight = dt === Infinity ? 1 : 0;
    }
    for (const s of this.lightPool) {
      const l = s.light;
      if (!s.owner) {
        l.intensity = 0;
        continue;
      }
      const v = s.owner;
      l.position.copy(v.position);
      l.color.copy(v.color);
      l.distance = v.distance;
      l.decay = v.decay;
      l.intensity = v.intensity * s.weight;
    }
  }

  // ---------- static geometry ----------
  box(x1, y1, z1, x2, y2, z2, kind = 'wall', zone = 'red', opts = {}) {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    const minZ = Math.min(z1, z2), maxZ = Math.max(z1, z2);
    const w = maxX - minX, h = maxY - minY, d = maxZ - minZ;
    if (w <= 0.001 || h <= 0.001 || d <= 0.001) return null;
    const m = mat(kind, zone);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    const geo = boxGeo(w, h, d, opts.uv ?? 0.5).translate(cx, cy, cz);
    // merged per material *and* per area (regions.js), so whole worlds can be culled
    const region = regionOf(_v.set(cx, cy, cz));
    const key = m.uuid + ':' + region;
    if (!this.staticParts.has(key)) this.staticParts.set(key, { m, region, geos: [] });
    this.staticParts.get(key).geos.push(geo);
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

  // Merge everything added with box()/deco() into one mesh per material per area.
  finalize() {
    for (const { m, region, geos } of this.staticParts.values()) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, m);
      mesh.userData.region = region;
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

  // Static boxes never move, so they're bucketed into an xz grid (rebuilt whenever solids are added);
  // everything else (barriers, platforms, doors) is checked directly. Cells include a GRID_MARGIN border,
  // so a lookup in the point's own cell is exact for pads up to that margin.
  gridFor(p) {
    if (this.gridCount !== this.solids.length) {
      this.gridCount = this.solids.length;
      this.grid = new Map();
      this.loose = [];
      for (const s of this.solids) {
        if (!s.static) {
          this.loose.push(s);
          continue;
        }
        const x0 = Math.floor((s.min.x - GRID_MARGIN) / GRID_CELL), x1 = Math.floor((s.max.x + GRID_MARGIN) / GRID_CELL);
        const z0 = Math.floor((s.min.z - GRID_MARGIN) / GRID_CELL), z1 = Math.floor((s.max.z + GRID_MARGIN) / GRID_CELL);
        for (let x = x0; x <= x1; x++)
          for (let z = z0; z <= z1; z++) {
            const k = x * 4096 + z;
            if (!this.grid.has(k)) this.grid.set(k, []);
            this.grid.get(k).push(s);
          }
      }
    }
    return this.grid.get(Math.floor(p.x / GRID_CELL) * 4096 + Math.floor(p.z / GRID_CELL));
  }

  pointInSolid(p, pad = 0) {
    if (pad <= GRID_MARGIN) {
      const cell = this.gridFor(p);
      return (cell && this.solidAt(cell, p, pad)) || this.solidAt(this.loose, p, pad);
    }
    return this.solidAt(this.solids, p, pad);
  }

  solidAt(list, p, pad) {
    for (const s of list) {
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
