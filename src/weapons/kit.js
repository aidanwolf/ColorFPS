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
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

// a tube along a list of [x, y, z] points
export function tube(points, radius, segments = 24, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, segments, radius, radial, false);
}

// a lathe whose profile runs along the barrel: [radius, z] pairs, back (+z) first
export function lathe(profile, segments = 16) {
  const geo = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, -z)), segments);
  geo.rotateX(-Math.PI / 2); // lathe axis y → barrel axis; +y (the profile's −z) becomes −z
  return geo;
}

// weather a geometry: nudge every vertex by a hash of where it is, so coincident vertices (seams,
// cap rims) move together and the surface stays closed; flat shading then reads as hewn stone or ice
export function rough(geo, amount, seed = 1) {
  const pos = geo.attributes.position;
  const h = (x, y, z, k) => {
    const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + k * 19.3 + seed * 3.1) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  };
  for (let i = 0; i < pos.count; i++) {
    const x = Math.round(pos.getX(i) * 1e4) / 1e4;
    const y = Math.round(pos.getY(i) * 1e4) / 1e4;
    const z = Math.round(pos.getZ(i) * 1e4) / 1e4;
    pos.setXYZ(i, x + h(x, y, z, 1) * amount, y + h(x, y, z, 2) * amount, z + h(x, y, z, 3) * amount);
  }
  geo.computeVertexNormals();
  return geo;
}

export const CYL_Z = [Math.PI / 2, 0, 0]; // rotation that lays a cylinder along the barrel
