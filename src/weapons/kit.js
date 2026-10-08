// Shared bits for the Chroma Blaster view models.
//
// Every model module exports a builder returning:
//   root     Group added under the blaster's gun (only the shown model is visible)
//   muzzle   Object3D at the emitter tip: shots, tracers and the muzzle light start here
//   light    the muzzle light's color
//   spring   { omega, zeta }: the recoil spring (stiffness as angular frequency, damping ratio)
//   kick     { z, pitch, roll, yaw }: how far one unit of recoil pushes the gun
//   fire()            per-shot reaction (heat, flares, spins…)
//   update(dt, t, r)  idle + firing animation (t: running time, r: current recoil); returns the
//                     muzzle light's resting intensity, so each gun's own glow lights it
//
// Static parts go through a Kit, which bakes them into one mesh per material so a whole gun is
// only a handful of draw calls; moving parts are separate meshes.
//
// The family look: a few chunky bevelled forms per gun, flat-ish materials, one or two strong glows,
// the shared grip below, and the current color burning at the emitter. Model space: the bore runs
// along −z through the origin's y, +y up; the player sees the left (−x) flank, the top and the back.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// position / rotation (XYZ euler) / scale, each given as an array (or a number for a uniform scale)
function compose(pos, rot, scale) {
  _p.set(pos?.[0] || 0, pos?.[1] || 0, pos?.[2] || 0);
  _q.setFromEuler(_e.set(rot?.[0] || 0, rot?.[1] || 0, rot?.[2] || 0));
  if (typeof scale === 'number') _s.setScalar(scale);
  else _s.set(scale?.[0] ?? 1, scale?.[1] ?? 1, scale?.[2] ?? 1);
  return _m.compose(_p, _q, _s);
}

export class Kit {
  constructor() {
    this.parts = new Map(); // material → geometries
  }

  add(geo, mat, pos, rot, scale) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(compose(pos, rot, scale));
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return this;
  }

  // bake everything added so far into `parent` (one mesh per material)
  build(parent) {
    for (const [mat, geos] of this.parts) {
      const merged = mergeGeometries(geos);
      geos.forEach((g) => g.dispose());
      parent.add(new THREE.Mesh(merged, mat));
    }
    this.parts.clear();
    return parent;
  }
}

// a single (usually animated) mesh
export function part(parent, geo, mat, pos, rot, scale) {
  const mesh = new THREE.Mesh(geo, mat);
  compose(pos, rot, scale).decompose(mesh.position, mesh.quaternion, mesh.scale);
  parent.add(mesh);
  return mesh;
}

export function group(parent, pos, rot) {
  const g = new THREE.Group();
  compose(pos, rot, 1).decompose(g.position, g.quaternion, g.scale);
  parent.add(g);
  return g;
}

// unlit glow; `k` pushes the color past 1 so the tone mapper reads it as light
export function glow(hex, k = 2.4, extra = {}) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), ...extra });
}

// set a glow material's brightness, keeping it finite and bloom-safe
export function setGlow(mat, hex, k) {
  mat.color.set(hex).multiplyScalar(Number.isFinite(k) ? THREE.MathUtils.clamp(k, 0, 4) : 1);
}

// a lathe whose profile runs along the barrel: [radius, z] pairs, back (+z) first
export function lathe(profile, segments = 16) {
  const geo = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, -z)), segments);
  geo.rotateX(-Math.PI / 2); // lathe axis y → barrel axis; +y (the profile's −z) becomes −z
  return geo;
}

// a box with rounded (bevelled) edges
export function rbox(w, h, d, r = 0.014) {
  return new RoundedBoxGeometry(w, h, d, 2, r);
}

// extrude a side-view shape `width` across x, centred on it, with a small bevel so the edges catch
// the light (shape x → model z, back is +z; shape y → model y)
function extrude(shape, width, bevel) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 12 });
  geo.rotateY(-Math.PI / 2); // shape x → z, extrusion → −x
  geo.translate(width / 2 - bevel, 0, 0);
  return geo;
}

// a straight-edged side profile: [z, y] points
export function profile(points, width, bevel = 0.004) {
  return extrude(new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y))), width, bevel);
}

// a curved blade: a [z, y] start, then quadratic segments given as [cz, cy, z, y]
export function blade(start, segments, width, bevel = 0.003) {
  const shape = new THREE.Shape();
  shape.moveTo(start[0], start[1]);
  for (const [cx, cy, x, y] of segments) shape.quadraticCurveTo(cx, cy, x, y);
  return extrude(shape, width, bevel);
}

// the grip every gun shares (same shape and place, so the four read as one family)
export function grip(kit, mat) {
  kit.add(rbox(0.066, 0.17, 0.084, 0.016), mat, [0, -0.125, 0.135], [0.3, 0, 0]);
}

export const CYL_Z = [Math.PI / 2, 0, 0]; // rotation that lays a cylinder along the barrel
