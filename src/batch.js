// Automatic batching: once the level is built, the meshes the levels and entities added to the scene (dressing,
// props, trims, multi-part enemies and gadgets; W.box geometry is merged separately by World.finalize) are
// drawn as merged meshes, one per material, instead of one draw call per part:
//  - static things (nothing holds them): one merged mesh per material per area, culled with the area like
//    the W.box geometry (each copy in it still comes and goes with its object's distance / size culling);
//  - things that move (entities, shootables, anything seen to change): one merged mesh per material per
//    rigid part of the object, which follows that part's transform, visibility and culling every frame.
//
// Nothing has to be tagged. Each original mesh stays where it was in the scene graph, so code that holds it
// keeps working; it's only moved to a layer no camera draws while its copy in a merged mesh draws for it.
// Just before every render (after three has updated the matrices) each merged mesh about to be drawn checks
// its originals: if one has moved relative to the part it was merged into, been hidden, removed, or had its
// material, geometry or render order swapped, its copy collapses out of the merged mesh and the original
// draws itself again, in that same frame. Then the object is re-merged around what was seen to change
// (a spinning rotor becomes its own part; a mesh whose material gets swapped stays on its own).
// Changing a shared material (an aftermath fading a color, a hit flash, an emissive pulse) needs nothing:
// the merged mesh uses that very material.
//
// Only what's safe is merged: built-in mesh materials without shader hooks (so nothing reads object-space
// positions), opaque or additive-without-depth-write blending (both look the same in any draw order),
// no morphs, skins or instancing, nothing mirrored.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { regionOf } from './levels/regions.js';

export const HIDE_LAYER = 31; // originals a merged mesh draws for live here (no camera renders it)
const MAX_VERTS = 20000; // a mesh this big is worth its own draw call; don't copy it
const MAX_REBUILDS = 8; // re-merges per object before it's left as it is
const REBUILDS_PER_FRAME = 4;
const KEEP_ATTRS = ['position', 'normal', 'uv', 'uv1', 'uv2', 'color', 'tangent'];
const MATERIAL_TYPES = new Set(['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshBasicMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial', 'MeshToonMaterial', 'MeshMatcapMaterial', 'MeshNormalMaterial']);
const defaultCompile = THREE.Material.prototype.onBeforeCompile;
const defaultBeforeRender = THREE.Object3D.prototype.onBeforeRender;
const defaultAfterRender = THREE.Object3D.prototype.onAfterRender;
const _s = new THREE.Sphere(), _inv = new THREE.Matrix4();

function materialOk(m) {
  if (!m || Array.isArray(m) || !MATERIAL_TYPES.has(m.type) || m.onBeforeCompile !== defaultCompile || m.userData.noBatch) return false;
  if (!m.transparent) return true;
  return m.blending === THREE.AdditiveBlending && !m.depthWrite;
}

function geometrySig(g) {
  if (!g || !g.isBufferGeometry || !g.attributes.position) return null;
  if (g.morphAttributes && Object.keys(g.morphAttributes).length) return null;
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return null;
  if (g.attributes.position.count > MAX_VERTS) return null;
  const parts = [];
  for (const name of Object.keys(g.attributes).sort()) {
    if (!KEEP_ATTRS.includes(name)) continue;
    const a = g.attributes[name];
    if (a.isInterleavedBufferAttribute || a.isInstancedBufferAttribute) return null;
    parts.push(`${name}${a.itemSize}${a.normalized ? 'n' : ''}${a.array.constructor.name}`);
  }
  return (g.index ? 'i:' : 'n:') + parts.join(',');
}

// Object3Ds the entities hold (their own fields, and arrays / plain objects a couple of levels down).
function entityRefs(entities) {
  const out = new Set(), seen = new Set();
  const visit = (v, depth) => {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (v.isObject3D) return void out.add(v);
    if (depth > 2 || v.isMaterial || v.isBufferGeometry || v.isTexture || v.isVector3 || v.isColor || ArrayBuffer.isView(v)) return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1);
      return;
    }
    const proto = Object.getPrototypeOf(v);
    if (depth > 0 && proto !== Object.prototype && proto !== null && typeof v.update !== 'function') return;
    for (const k of Object.keys(v)) if (!['world', 'W', 'game', 'scene', 'player', 'B'].includes(k)) visit(v[k], depth + 1);
  };
  for (const e of entities) visit(e, 0);
  return out;
}

const visibleNow = (n) => (n.userData.wantVisible ? n.userData.wantVisible() : n.visible);

export class Batcher {
  constructor(world) {
    this.world = world;
    world.batcher = this;
    this.batches = [];
    this.boundary = new WeakSet(); // nodes seen to move or blink: each is a part of its own
    this.volatile = new WeakSet(); // meshes seen to swap material / geometry: never merged again
    this.objectBatches = new Map(); // top-level object -> its merged meshes
    this.staticSrcs = new Map(); // top-level object -> [batch, src] of its meshes in the per-area meshes
    this.queue = new Set(); // objects to re-merge
    this.rebuilds = new Map();
    this.stats = { sources: 0, staticBatches: 0, objectBatches: 0, killed: 0, rebuilt: 0 };
  }

  // Merge what can be merged (skip: top-level objects to leave alone). Call before World.setupCulling.
  build(skip = []) {
    const W = this.world, scene = W.scene;
    const refs = entityRefs(W.entities);
    const hitRoots = new Set(W.hitTargets);
    const groups = new Map();
    const box = new THREE.Box3(), sphere = new THREE.Sphere();
    scene.updateMatrixWorld(true);
    for (const top of [...scene.children]) {
      if (top === W.staticGroup || top === W.batchGroup || top.isCamera || top.isLight || !top.visible || skip.includes(top) || top.userData.noBatch) continue;
      let moving = refs.has(top) || hitRoots.has(top) || !!top.userData.noCull;
      top.traverse((c) => {
        if (c.userData.hit || hitRoots.has(c)) moving = true;
      });
      if (moving) {
        this.buildObject(top);
        continue;
      }
      box.setFromObject(top);
      if (box.isEmpty()) continue;
      box.getBoundingSphere(sphere);
      const region = regionOf(sphere.center); // where World.cull would put it, so the area culls it the same way
      // additive glows are drawn sorted by their origin among the other see-through things (glass, haze):
      // merged per object they keep about the same place in that order; merged per area they wouldn't
      this.buildObject(top, (o) => o.material.transparent);
      const walk = (o) => {
        if (!o.visible || o.userData.noBatch) return;
        const sig = this.mergeable(o);
        if (sig && !o.material.transparent) {
          const key = `${o.material.uuid}|${region}|${o.renderOrder}|${o.frustumCulled ? 1 : 0}|${sig}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push({ o, top, base: scene, rel: o.matrixWorld, region });
        }
        for (const c of o.children) walk(c);
      };
      walk(top);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const b = this.merge(list, null, list[0].region);
      if (b) for (const s of b.srcs) {
        if (!this.staticSrcs.has(s.top)) this.staticSrcs.set(s.top, []);
        this.staticSrcs.get(s.top).push([b, s]);
      }
    }
  }

  // The material/geometry signature if this mesh can be merged at all, else null.
  mergeable(o) {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh || this.volatile.has(o)) return null;
    if (o.layers.mask !== 1 || o.onBeforeRender !== defaultBeforeRender || o.onAfterRender !== defaultAfterRender) return null;
    if (!materialOk(o.material)) return null;
    return geometrySig(o.geometry);
  }

  // Merge one moving object's meshes: one merged mesh per material per rigid part. A part's base is the
  // nearest node above (or at) the mesh that has been seen to move or blink, else the object itself.
  buildObject(top, only = null) {
    const groups = new Map();
    const walk = (o) => {
      if (o.userData.noBatch) return;
      const sig = this.mergeable(o);
      if (sig && (!only || only(o))) {
        let base = o, ok = true;
        while (base !== top && !this.boundary.has(base)) {
          if (!base.visible) ok = false; // hidden below its base: leave it be
          base = base.parent;
        }
        if (ok && base !== o) {
          const det = base.matrixWorld.determinant();
          if (Math.abs(det) > 1e-12) {
            const rel = new THREE.Matrix4().multiplyMatrices(_inv.copy(base.matrixWorld).invert(), o.matrixWorld);
            const key = `${base.id}|${o.material.uuid}|${o.renderOrder}|${o.frustumCulled ? 1 : 0}|${sig}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push({ o, top, base, rel });
          }
        }
      }
      for (const c of o.children) walk(c);
    };
    walk(top);
    const list = [];
    for (const g of groups.values()) if (g.length > 1) {
      const b = this.merge(g, g[0].base, null);
      if (b) list.push(b);
    }
    this.objectBatches.set(top, list);
  }

  merge(list, base, region) {
    const geos = [], srcs = [];
    let start = 0;
    for (const { o, rel, top, base: b } of list) {
      if (rel.determinant() <= 1e-12) continue; // mirrored (the winding would flip) or flattened
      const g = o.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!KEEP_ATTRS.includes(name)) g.deleteAttribute(name);
      g.applyMatrix4(rel);
      geos.push(g);
      const count = g.attributes.position.count;
      // the nodes from the mesh up to (not including) its base, with their local matrices as they are now
      const chain = [];
      for (let n = o; n && n !== b; n = n.parent) chain.push({ n, parent: n.parent, m: n.matrix.elements.slice() });
      const col = o.geometry.attributes.color;
      srcs.push({ o, top, start, count, alive: true, hidden: false, rec: undefined, chain, material: o.material, geometry: o.geometry, renderOrder: o.renderOrder, pv: o.geometry.attributes.position.version, cv: col ? col.version : -1 });
      start += count;
    }
    if (srcs.length < 2) return null;
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) return null;
    merged.computeBoundingSphere();
    const first = srcs[0].o;
    const mesh = new THREE.Mesh(merged, first.material);
    mesh.name = 'batch';
    mesh.renderOrder = first.renderOrder;
    mesh.frustumCulled = first.frustumCulled;
    mesh.matrixAutoUpdate = false;
    mesh.raycast = () => {}; // shots test the originals
    mesh.userData.noBatch = true;
    if (base) {
      // follows its part: sync() copies the part's world matrix and visibility each frame
      mesh.matrixWorldAutoUpdate = false;
      mesh.userData.noCull = true;
      this.world.scene.add(mesh);
      this.stats.objectBatches++;
    } else {
      mesh.userData.region = region;
      this.world.batchGroup.add(mesh);
      mesh.updateMatrixWorld(true);
      this.stats.staticBatches++;
    }
    for (const s of srcs) s.o.layers.set(HIDE_LAYER);
    // per-area meshes keep each original's own distance / size culling: a culled original's copy is
    // collapsed and restored from these positions when it comes back
    const orig = base ? null : merged.attributes.position.array.slice();
    const b = { mesh, base, top: srcs[0].top, srcs, alive: srcs.length, orig };
    this.batches.push(b);
    this.stats.sources += srcs.length;
    return b;
  }

  // Just before each render (World's hook, after occlusion): re-merge objects that changed, place the object
  // batches, and let any original that changed draw itself again. Only merged meshes about to be drawn are
  // checked (an original that changed out of sight is caught as soon as its batch is in sight again).
  sync(frustum) {
    const scene = this.world.scene;
    if (this.queue.size) {
      let n = 0;
      for (const top of this.queue) {
        this.queue.delete(top);
        this.rebuildObject(top);
        if (++n >= REBUILDS_PER_FRAME) break;
      }
      this.batches = this.batches.filter((b) => b.alive > 0);
    }
    for (const b of this.batches) {
      if (b.alive <= 0) continue;
      const mesh = b.mesh;
      if (b.base) {
        mesh.visible = this.shown(b.base, b.top, scene);
        if (!mesh.visible) continue;
        mesh.matrixWorld.copy(b.base.matrixWorld);
      } else if (!mesh.visible) continue;
      if (mesh.frustumCulled) {
        _s.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
        if (!frustum.intersectsSphere(_s)) continue;
      }
      for (const s of b.srcs) {
        if (!s.alive) continue;
        if (b.orig) {
          // drawn only while its object isn't culled (World.updateCulling: too far or too small)
          if (s.rec === undefined) s.rec = this.world.cullRecs?.get(s.top) || null;
          const show = !s.rec || !s.rec.culled;
          if (show === s.hidden) this.setShown(b, s, show);
        }
        this.check(b, s);
      }
    }
  }

  // Collapse a copy to a point (zero-area triangles draw nothing) or put it back.
  setShown(b, s, show) {
    s.hidden = !show;
    const pos = b.mesh.geometry.attributes.position, a = pos.array, i0 = s.start * 3, n = s.count * 3;
    if (show) a.set(b.orig.subarray(i0, i0 + n), i0);
    else for (let i = i0 + 3; i < i0 + n; i += 3) {
      a[i] = a[i0];
      a[i + 1] = a[i0 + 1];
      a[i + 2] = a[i0 + 2];
    }
    pos.addUpdateRange(i0, n);
    pos.needsUpdate = true;
  }

  // Is this part drawn: it and everything above it visible (the top object's visibility includes culling)?
  shown(base, top, scene) {
    if (top.parent !== scene || !top.visible) return false;
    for (let n = base; n !== top; n = n.parent) if (!n || !n.visible) return false;
    return true;
  }

  check(b, s) {
    const o = s.o;
    if (o.material !== s.material || o.geometry !== s.geometry || o.renderOrder !== s.renderOrder) return this.kill(b, s, null);
    const g = o.geometry.attributes;
    if (g.position.version !== s.pv || (g.color ? g.color.version : -1) !== s.cv) return this.kill(b, s, null);
    for (const c of s.chain) {
      const n = c.n;
      if (n.parent !== c.parent) return this.kill(b, s, null);
      // (in the per-area meshes, a top object's own visibility folds in culling: ask what the game set)
      if (!visibleNow(n)) return this.kill(b, s, n);
      const e = n.matrix.elements, m = c.m;
      for (let i = 0; i < 16; i++) if (e[i] !== m[i]) return this.kill(b, s, n);
    }
    if (!b.base && s.top.parent !== this.world.scene) return this.kill(b, s, null);
  }

  // Take one original out of its merged mesh. node: the node seen to move or blink (it becomes a part of its
  // own when the object is re-merged); none means the mesh itself changed (it stays on its own).
  kill(b, s, node) {
    this.collapse(b, s);
    this.stats.killed++;
    if (node) this.boundary.add(node);
    else this.volatile.add(s.o);
    const count = this.rebuilds.get(s.top) || 0;
    if (node && count < MAX_REBUILDS) this.queue.add(s.top);
  }

  collapse(b, s) {
    s.alive = false;
    s.o.layers.set(0);
    if (!s.hidden) this.setShown(b, s, false);
    if (--b.alive <= 0) this.drop(b);
  }

  drop(b) {
    b.alive = 0;
    b.mesh.removeFromParent();
    b.mesh.geometry.dispose();
  }

  // Re-merge one object around what has been seen to change (it leaves the per-area meshes for good).
  rebuildObject(top) {
    this.rebuilds.set(top, (this.rebuilds.get(top) || 0) + 1);
    this.stats.rebuilt++;
    for (const b of this.objectBatches.get(top) || []) {
      if (b.alive <= 0) continue;
      for (const s of b.srcs) if (s.alive) s.o.layers.set(0);
      this.drop(b);
    }
    for (const [b, s] of this.staticSrcs.get(top) || []) if (s.alive && b.alive > 0) this.collapse(b, s);
    this.staticSrcs.delete(top);
    if (top.parent === this.world.scene) this.buildObject(top);
    else this.objectBatches.delete(top);
  }
}
