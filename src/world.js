// World container: static box geometry (merged per material), collision solids, entities,
// trigger volumes, enemy projectiles and the shared ray-cast used for shots and sight lines.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxGeo, mat } from './materials.js';
import { Fx } from './fx.js';
import { regionOf, VISIBLE_FROM } from './levels/regions.js';
import { liquidMaterial, liquidSurface } from './liquid.js';
import { audio } from './audio.js';
import { WetSurfaces } from './wet.js';

const _v = new THREE.Vector3();
const _ray = new THREE.Raycaster();
_ray.layers.enableAll(); // meshes a batch draws for (batch.js) sit on another layer but still take shots
const GRID_CELL = 8;
const GRID_MARGIN = 1;
const POOL_SIZE = 10; // real point lights shared by every placed light (see updateLights)
const CULL_SIZE = 1 / 45; // objects smaller than this (radius / distance) aren't drawn
const SHOOT_KEEP = 60; // ...except shootable things nearer than this (m), which stay drawn however small
// occlusion culling (World.occlude): the OCC_COUNT biggest-looking faces of static boxes at least this big
const OCC_COUNT = 48;
const OCC_MIN_AREA = 12; // m², the box's biggest face
const OCC_MIN_SIDE = 1.5; // m, both sides of a face used
const OCC_RANGE = 160; // m
const OCC_MIN_SCORE = 0.002; // ~ steradians covered
const OCC_PAD = 1.15; // bounding spheres grow by this for the test
const AX = ['x', 'y', 'z'];
const OCC_MATERIALS = new Set(['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshBasicMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial']);
const _e = new THREE.Vector3(), _c3 = new THREE.Vector3(), _m4 = new THREE.Matrix4();
const _frustum = new THREE.Frustum(), _s = new THREE.Sphere(), _b3 = new THREE.Box3();

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
    this.batchGroup = new THREE.Group(); // batch.js: merged copies of static meshes, one per material per area
    this.batchGroup.userData.noCull = true;
    this.scene.add(this.batchGroup);
    this.fx = new Fx(this.scene);
    this.wet = new WetSurfaces(this); // puddles from the water cannon, shock water (wet.js)
    this.time = 0;
    // Placed lights are virtual: a fixed pool of real PointLights is handed to whichever are nearest the
    // camera. Every lit pixel loops over every real light, and changing their count recompiles every
    // shader, so the count stays constant no matter how many lights the levels place.
    this.cullRecs = new WeakMap(); // object -> its culling record (batch.js reads it)
    this.occFaces = [];
    this.occludedNow = [];
    this.occPlanes = Array.from({ length: OCC_COUNT }, () => ({
      face: new THREE.Plane(),
      sides: [0, 1, 2, 3].map(() => new THREE.Plane()),
      corners: [0, 1, 2, 3].map(() => new THREE.Vector3()),
    }));
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
      this.cull(o, box, sphere);
    }
    // Occluders: the big static boxes (walls, floors, mesas). Each frame the few that cover the most of
    // the view hide whatever lies wholly behind one of them (see occlude).
    this.occluders = [];
    for (const s of this.solids) {
      if (!s.static || !s.drawn) continue;
      const dx = s.max.x - s.min.x, dy = s.max.y - s.min.y, dz = s.max.z - s.min.z;
      if (Math.max(dx * dy, dy * dz, dx * dz) >= OCC_MIN_AREA) this.occluders.push(s);
    }
    const prev = this.scene.onBeforeRender;
    this.scene.onBeforeRender = (renderer, scene, camera, ...rest) => {
      prev.call(scene, renderer, scene, camera, ...rest);
      _frustum.setFromProjectionMatrix(_m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      this.occlude(camera);
      this.batcher?.sync(_frustum); // (batch.js) merged meshes follow their objects, after occlusion
    };
    // occlusion only applies while drawing: game code reading `visible` between frames never sees it
    const prevAfter = this.scene.onAfterRender;
    this.scene.onAfterRender = (...a) => {
      prevAfter.apply(this.scene, a);
      for (const rec of this.occludedNow) rec.occluded = false;
      this.occludedNow.length = 0;
    };
  }

  // Put one more object (e.g. a restocked drone) under culling.
  cull(o, box = new THREE.Box3(), sphere = new THREE.Sphere()) {
    box.setFromObject(o);
    if (box.isEmpty()) return;
    box.getBoundingSphere(sphere);
    // bounds relative to the object's position, so moving things (drones, lifts) stay correct
    // shootable things (targets, orbs, enemies) within SHOOT_KEEP aren't dropped for being small on screen:
    // a switch you can see and aim at mustn't vanish at 25 m
    let shootable = false, xray = false;
    o.traverse((c) => {
      if (c.userData.hit) shootable = true;
      // drawn over walls (depthTest off): occlusion mustn't hide it
      for (const m of Array.isArray(c.material) ? c.material : c.material ? [c.material] : []) if (!m.depthTest) xray = true;
    });
    const rec = { o, off: sphere.center.clone().sub(o.position), r: sphere.radius, region: regionOf(sphere.center), culled: false, occluded: false, shootable, xray, q0: o.quaternion.clone(), s0: o.scale.clone() };
    let want = o.visible;
    Object.defineProperty(o, 'visible', { get: () => want && !rec.culled && !rec.occluded, set: (v) => (want = v), configurable: true });
    o.userData.wantVisible = () => want; // visibility as the game set it, ignoring culling (for raycasts)
    this.cullList.push(rec);
    this.cullRecs.set(o, rec);
  }

  updateCulling(camPos, far) {
    const seen = (this.drawnRegions = VISIBLE_FROM[regionOf(camPos)]);
    // (only our merged meshes: the Bonus Round SDK adds its own objects under this group too)
    for (const m of this.staticGroup.children) if (m.userData.region) m.visible = seen.has(m.userData.region);
    for (const m of this.batchGroup.children) m.visible = seen.has(m.userData.region);
    for (const rec of this.cullList || []) {
      const d = _v.copy(rec.o.position).add(rec.off).distanceTo(camPos) - rec.r;
      rec.region = regionOf(_v); // things move between areas (bosses, lifts, elevators): keep it current
      if (!seen.has(rec.region)) {
        rec.culled = true;
        continue;
      }
      rec.culled = d > far || (d > 0 && rec.r / (d + rec.r) < CULL_SIZE && !(rec.shootable && d < SHOOT_KEEP));
    }
  }

  // Occlusion culling, run just before each render (after the camera has moved for the frame): picks the
  // OCC_COUNT static boxes whose camera-facing faces look biggest, and hides every culled object whose
  // bounding sphere lies wholly inside the shadow one of those faces casts from the eye. A face of an
  // opaque box hides everything behind it, so this only drops things the depth test would have hidden.
  occlude(camera) {
    const list = this.cullList;
    if (!list) return;
    for (const rec of this.occludedNow) rec.occluded = false;
    this.occludedNow.length = 0;
    if (camera !== this.game.camera) return;
    const E = _e.setFromMatrixPosition(camera.matrixWorld);
    const seen = this.drawnRegions; // the areas whose static meshes updateCulling left drawn
    if (!seen || !this.staticGroup.visible || this.staticGroup.parent !== this.scene) return; // (a Bonus Round hides it)
    // choose the faces: score ~ the solid angle they cover
    const faces = this.occFaces;
    let n = 0;
    const R2 = OCC_RANGE * OCC_RANGE;
    for (const s of this.occluders) {
      const mn = s.min, mx = s.max;
      const ox = Math.max(mn.x - E.x, 0, E.x - mx.x), oy = Math.max(mn.y - E.y, 0, E.y - mx.y), oz = Math.max(mn.z - E.z, 0, E.z - mx.z);
      if (ox * ox + oy * oy + oz * oz > R2) continue;
      const m = s.drawn.m;
      if (!seen.has(s.drawn.region) || !OCC_MATERIALS.has(m.type) || m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || m.transparent || !m.visible || !m.depthWrite || !m.colorWrite || m.alphaTest > 0 || m.side === THREE.BackSide) continue;
      _b3.min.copy(mn);
      _b3.max.copy(mx);
      if (!_frustum.intersectsBox(_b3)) continue; // off screen: it can't hide anything on screen
      for (let a = 0; a < 3; a++) {
        const k = AX[a], ku = AX[(a + 1) % 3], kv = AX[(a + 2) % 3];
        let c;
        if (E[k] > mx[k] + 0.01) c = mx[k];
        else if (E[k] < mn[k] - 0.01) c = mn[k];
        else continue;
        const du = mx[ku] - mn[ku], dv = mx[kv] - mn[kv];
        if (du < OCC_MIN_SIDE || dv < OCC_MIN_SIDE) continue;
        const h = Math.abs(E[k] - c);
        const pu = Math.max(mn[ku] - E[ku], 0, E[ku] - mx[ku]), pv = Math.max(mn[kv] - E[kv], 0, E[kv] - mx[kv]);
        const d2 = h * h + pu * pu + pv * pv;
        if (d2 > R2 || d2 < 0.04) continue; // (right up against it the near plane could clip it)
        const score = (du * dv * h) / Math.pow(d2 + 1, 1.5);
        if (score < OCC_MIN_SCORE) continue;
        if (n < OCC_COUNT) {
          faces[n++] = { s, a, c, score };
        } else {
          let lo = 0;
          for (let i = 1; i < n; i++) if (faces[i].score < faces[lo].score) lo = i;
          if (score > faces[lo].score) faces[lo] = { s, a, c, score };
        }
      }
    }
    if (!n) return;
    // each face's shadow: its own plane plus a plane through the eye and each edge (normals point inward)
    const planes = this.occPlanes;
    for (let f = 0; f < n; f++) {
      const { s, a, c } = faces[f];
      const k = AX[a], ku = AX[(a + 1) % 3], kv = AX[(a + 2) % 3];
      const P = planes[f];
      // far side of the face plane: away from the eye
      const sgn = E[k] > c ? -1 : 1;
      P.face.normal.set(0, 0, 0).setComponent(a, sgn);
      P.face.constant = -sgn * c;
      const corners = P.corners;
      corners[0].setComponent(a, c).setComponent((a + 1) % 3, s.min[ku]).setComponent((a + 2) % 3, s.min[kv]);
      corners[1].setComponent(a, c).setComponent((a + 1) % 3, s.max[ku]).setComponent((a + 2) % 3, s.min[kv]);
      corners[2].setComponent(a, c).setComponent((a + 1) % 3, s.max[ku]).setComponent((a + 2) % 3, s.max[kv]);
      corners[3].setComponent(a, c).setComponent((a + 1) % 3, s.min[ku]).setComponent((a + 2) % 3, s.max[kv]);
      _c3.addVectors(corners[0], corners[2]).multiplyScalar(0.5); // the face's centre: inside every side plane
      for (let i = 0; i < 4; i++) {
        const pl = P.sides[i];
        pl.setFromCoplanarPoints(E, corners[i], corners[(i + 1) % 4]);
        if (pl.distanceToPoint(_c3) < 0) pl.negate();
      }
    }
    for (const rec of list) {
      if (rec.culled || rec.xray) continue;
      const o = rec.o;
      if (!o.visible) continue; // hidden anyway
      _s.center.copy(o.position).add(rec.off);
      _s.radius = rec.r;
      if (!_frustum.intersectsSphere(_s)) continue; // off screen: three skips it anyway
      let r = rec.r * OCC_PAD + 0.2; // a little slack for parts that swing past their bounds
      if (!o.quaternion.equals(rec.q0) || !o.scale.equals(rec.s0)) {
        // turned or scaled since its bounds were taken: a sphere round its origin that holds them any way round
        const k = Math.max(Math.abs(o.scale.x / rec.s0.x), Math.abs(o.scale.y / rec.s0.y), Math.abs(o.scale.z / rec.s0.z));
        if (!(k < 1e6)) continue;
        r = (rec.off.length() + r) * k;
        _s.center.copy(o.position);
      }
      for (let f = 0; f < n; f++) {
        const P = planes[f];
        if (P.face.distanceToPoint(_s.center) < r) continue;
        if (P.sides[0].distanceToPoint(_s.center) < r || P.sides[1].distanceToPoint(_s.center) < r) continue;
        if (P.sides[2].distanceToPoint(_s.center) < r || P.sides[3].distanceToPoint(_s.center) < r) continue;
        rec.occluded = true;
        this.occludedNow.push(rec);
        break;
      }
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
    const m = kind === 'acid' ? liquidMaterial(zone, false) : mat(kind, zone);
    if (kind === 'acid') liquidSurface(this, minX, minZ, maxX, maxZ, maxY, zone);
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
      drawn: { m, region }, // how it's drawn (for occlusion culling: an opaque box hides what's behind it)
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
  // (The held weapons cast many rays a frame: they pass pre-filtered `solids` / `targets` lists and
  // `fresh` once they've refreshed the hittables' matrices themselves this frame; see weapons/rays.js.)
  raycast(origin, dir, far = 200, { projectiles = false, meshes = true, solids = this.solids, targets = this.hitTargets, fresh = false } = {}) {
    let best = null;
    let bestT = far;
    for (const s of solids) {
      if (!s.enabled || s.noShot) continue;
      const r = rayBox(origin, dir, s.min, s.max, bestT);
      if (r) {
        bestT = r.t;
        best = { t: r.t, normal: r.normal, solid: s, entity: s.entity || null, part: s.part || null };
      }
    }
    if (meshes && targets.length) {
      _ray.set(origin, dir);
      _ray.camera = this.game.camera;
      // entities animate during update, so refresh their world matrices before testing against them
      if (!fresh) for (const o of targets) o.updateMatrixWorld(true);
      _ray.far = bestT;
      const hits = _ray.intersectObjects(targets, true);
      for (const h of hits) {
        // three's raycaster ignores visibility, so skip anything hidden (e.g. a broken shield)
        let hidden = false;
        // (culling doesn't count: a shot still hits something the camera merely isn't drawing)
        for (let a = h.object; a; a = a.parent) if (!(a.userData.wantVisible ? a.userData.wantVisible() : a.visible)) hidden = true;
        if (hidden) continue;
        let o = h.object;
        while (o && !o.userData.hit) o = o.parent;
        if (!o) continue;
        if (o.userData.noHit) continue;
        bestT = h.distance;
        const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : dir.clone().negate();
        best = { t: h.distance, normal: n, entity: o.userData.hit, part: o.userData.part || null, object: h.object, face: h.face };
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
    this.updateLiquidFx(dt, player);
    this.wet.update(dt, player);
    this.fx.update(dt);
  }
}

// Bubbles and spatter on the hazard liquids near the player (see liquid.js for the surfaces).
World.prototype.updateLiquidFx = function (dt, player) {
  if (!this.liquids) return;
  this.bubbleT = (this.bubbleT || 0) - dt;
  if (this.bubbleT > 0) return;
  this.bubbleT = 0.07;
  const near = this.liquids.filter((L) => player.pos.x > L.min.x - 30 && player.pos.x < L.max.x + 30 && player.pos.z > L.min.z - 30 && player.pos.z < L.max.z + 30 && Math.abs(player.pos.y - L.max.y) < 40);
  if (!near.length) return;
  const L = near[Math.floor(Math.random() * near.length)];
  // a spot on the surface, favouring the part near the player
  const px = Math.min(L.max.x, Math.max(L.min.x, player.pos.x + (Math.random() - 0.5) * 36));
  const pz = Math.min(L.max.z, Math.max(L.min.z, player.pos.z + (Math.random() - 0.5) * 36));
  const p = _v.set(px, L.max.y + 0.1, pz), fx = this.fx;
  const dist = p.distanceTo(player.pos);
  if (L.style === 0) {
    // lava: a fat bubble bursts, flinging embers, sometimes with a deep blorp
    fx.ring(p, UP, 0xff7a1a, { size: 0.15, end: 1.4, life: 0.5, k: 1.2 });
    for (let i = 0; i < 6; i++) fx.ember(p, (Math.random() - 0.5) * 3, 2 + Math.random() * 4, (Math.random() - 0.5) * 3, 0xff8a2a, 0.9 + Math.random() * 0.6, 0.12);
    if (dist < 18 && Math.random() < 0.35) audio.sample('lava_bubble', { gain: 0.5 * (1 - dist / 18), vary: 0.2 });
  } else if (L.style === 1) {
    // quicksand: a slow sigh of dust where the sand slumps
    if (Math.random() < 0.5) fx.puff(p, 0, 0.4, 0, _c.set(0x8a6a40), 0.5, 1.6, 0.6, 3);
  } else if (L.style === 2) {
    fx.ring(p, UP, 0x5dff6a, { size: 0.1, end: 0.9, life: 0.45, k: 1.1 });
    for (let i = 0; i < 3; i++) fx.ember(p, (Math.random() - 0.5) * 1.2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 1.2, 0x7dff8a, 0.6, 0.08);
  } else if (Math.random() < 0.4) {
    fx.ring(p, UP, 0x6ab8ff, { size: 0.1, end: 1.2, life: 0.8, k: 0.8 });
  }
};
const UP = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

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
