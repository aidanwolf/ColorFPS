// AZURE — the habitat kit: the pieces the drowned harvest station's undersea modules are built from
// (used by azure.js and its modules). Every breathable space registers an AIR box (cut out of the ocean
// by azureOcean.oceanVolumes), so the sea stops at its hull, its glass and its doorways.
//   glassTube   an aquarium corridor: an arched glass tube on ribbed frames, caustics on its floor
//   glassPod    a room with glass walls and a glass roof (an observation gallery)
//   dome        a half-ellipsoid of glass on ribs over a room (visual; the room's walls hold the sea)
//   membrane    the shimmering pressure field across an open doorway onto the sea
//   moonPool    a hole in a floor down to the sea, with steps up out of it
//   airBell     an inverted cup of trapped air hanging in the open sea, with a ledge and a checkpoint
//   bubbleVent  a column of bubbles off the sea floor: hold your head in it to refill your air
//   beacons     pulsing lights along a swim route (cyan: the way on; gold: air)
//   Airlock     a chamber that floods and drains for whichever side you come from
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Checkpoint } from '../entities/misc.js';
import { waterSurface } from '../liquid.js';
import { audio } from '../audio.js';
import { AIR_MAX } from '../player.js';
import { addCaustics, SEA_Y } from './azureOcean.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const _p = V(0, 0, 0), _q = V(0, 0, 0);
audio.manifest?.then(() => audio.prefetch(['hydraulic_hiss', 'titan_steam', 'door_slam', 'elevator_start', 'lava_bubble', 'glass_hit', 'airlock_cycle', 'gasp', 'bubble_vent']));

export function makeHabitat(B, { zone, airs }) {
  const { W, game } = B;
  const box = (x1, y1, z1, x2, y2, z2, kind = 'wall') => W.box(x1, y1, z1, x2, y2, z2, kind, zone);
  const deco = (x1, y1, z1, x2, y2, z2, kind = 'glow3') => W.deco(x1, y1, z1, x2, y2, z2, kind, zone);
  const air = (min, max) => airs.push([min, max]);
  // ---- shared materials (few, merged)
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.25, depthWrite: false, side: THREE.DoubleSide, emissive: 0x0a3348, emissiveIntensity: 0.35, envMapIntensity: 1.6 });
  // (a fresnel sheen: the glass shows at grazing angles, clear face-on)
  glassMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);
      diffuseColor.a = clamp(diffuseColor.a + fres * 0.45, 0.0, 0.8);
      outgoingLight += vec3(0.25, 0.55, 0.6) * fres * 0.5;
      #include <opaque_fragment>`);
  };
  const ribMat = addCaustics(new THREE.MeshStandardMaterial({ color: 0x3d5560, metalness: 0.85, roughness: 0.32 }), 0.8);
  const rustMat = addCaustics(new THREE.MeshStandardMaterial({ color: 0x6a3a26, metalness: 0.6, roughness: 0.62 }), 0.8);
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8ff0ff).multiplyScalar(1.6) });
  const warmMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc870).multiplyScalar(1.5) });
  const geos = { glass: [], rib: [], rust: [], lamp: [], warm: [] };
  const put = (k, g) => geos[k].push(g.index ? g.toNonIndexed() : g);

  // ---- an arched glass tube along x or z between a1 and a2 (centre line c), floor top y, w wide, h tall
  function glassTube({ axis = 'x', a1, a2, c, y, w = 3, h = 3.4, ribEvery = 2.2, ends = true }) {
    const lo = Math.min(a1, a2), hi = Math.max(a1, a2), len = hi - lo, r = w / 2, side = h - r;
    const X = axis === 'x';
    const at = (u, v, s) => (X ? V(lo + s, y + v, c + u) : V(c + u, y + v, lo + s)); // u across, v up, s along
    // floor, and the solids: two walls and a roof (glass: shots stop on it)
    if (X) {
      box(lo, y - 0.6, c - r - 0.2, hi, y, c + r + 0.2, 'floor');
      W.addSolid(V(lo, y, c - r - 0.2), V(hi, y + h, c - r), { static: true, glass: true });
      W.addSolid(V(lo, y, c + r), V(hi, y + h, c + r + 0.2), { static: true, glass: true });
      W.addSolid(V(lo, y + h - 0.05, c - r), V(hi, y + h + 0.2, c + r), { static: true, glass: true });
      air([lo, y - 0.6, c - r - 0.2], [hi, y + h + 0.3, c + r + 0.2]);
      deco(lo, y + 0.005, c - r + 0.15, hi, y + 0.02, c - r + 0.25);
      deco(lo, y + 0.005, c + r - 0.25, hi, y + 0.02, c + r - 0.15);
    } else {
      box(c - r - 0.2, y - 0.6, lo, c + r + 0.2, y, hi, 'floor');
      W.addSolid(V(c - r - 0.2, y, lo), V(c - r, y + h, hi), { static: true, glass: true });
      W.addSolid(V(c + r, y, lo), V(c + r + 0.2, y + h, hi), { static: true, glass: true });
      W.addSolid(V(c - r, y + h - 0.05, lo), V(c + r, y + h + 0.2, hi), { static: true, glass: true });
      air([c - r - 0.2, y - 0.6, lo], [c + r + 0.2, y + h + 0.3, hi]);
      deco(c - r + 0.15, y + 0.005, lo, c - r + 0.25, y + 0.02, hi);
      deco(c + r - 0.25, y + 0.005, lo, c + r - 0.15, y + 0.02, hi);
    }
    // the arch's profile: straight sides, then a half circle over the top
    const prof = [];
    for (let k = 0; k <= 3; k++) prof.push([-r, (side * k) / 3]);
    for (let k = 1; k < 12; k++) {
      const a = Math.PI - (k / 12) * Math.PI;
      prof.push([Math.cos(a) * r, side + Math.sin(a) * r]);
    }
    for (let k = 3; k >= 0; k--) prof.push([r, (side * k) / 3]);
    // the glass skin: quads between the profile at s = 0 and s = len
    const pos = [];
    for (let i = 0; i < prof.length - 1; i++) {
      const [u0, v0] = prof[i], [u1, v1] = prof[i + 1];
      const A = at(u0, v0, 0), Bq = at(u1, v1, 0), C = at(u1, v1, len), D = at(u0, v0, len);
      pos.push(...A.toArray(), ...Bq.toArray(), ...C.toArray(), ...A.toArray(), ...C.toArray(), ...D.toArray());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    put('glass', g);
    // ribs: an arch of steel every ribEvery m, a lamp strip along the crown
    const n = Math.max(1, Math.round(len / ribEvery));
    for (let k = 0; k <= n; k++) {
      const s = (k / n) * len;
      const pts = prof.map(([u, v]) => at(u * 1.02, v + (v > side ? 0.02 : 0), s));
      put('rib', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, k === 0 || k === n ? (ends ? 0.14 : 0.09) : 0.07, 5));
    }
    const crown = [at(0, h - 0.06, 0.2), at(0, h - 0.06, len - 0.2)];
    put('lamp', new THREE.CylinderGeometry(0.035, 0.035, crown[0].distanceTo(crown[1]), 5).applyMatrix4(new THREE.Matrix4().lookAt(crown[0], crown[1], UP).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))).translate(...crown[0].clone().add(crown[1]).multiplyScalar(0.5).toArray()));
    // a rusty footing under each end frame
    for (const s of [0, len]) {
      const p = at(0, -0.6, s);
      put('rust', new THREE.BoxGeometry(X ? 0.6 : w + 0.8, 0.8, X ? w + 0.8 : 0.6).translate(p.x, p.y - 0.4, p.z));
    }
  }

  // ---- a glass-walled room: interior x1..x2, z1..z2 (z1 < z2), floor top y, h tall. glass: which walls
  // are glass ('n','s','e','w') plus 'roof'; openings on walls: { n: [{ c, w, h }], ... } (c along the wall)
  function glassPod({ x1, x2, z1, z2, y, h, glass = ['n', 's', 'e', 'w', 'roof'], open = {}, floor = true, roof = true, skip = [] }) {
    if (floor) box(x1 - 0.3, y - 1, z1 - 0.3, x2 + 0.3, y, z2 + 0.3, 'floor');
    air([x1 - 0.3, y - 1, z1 - 0.3], [x2 + 0.3, y + h + 0.6, z2 + 0.3]);
    const wall = (face) => {
      const isGlass = glass.includes(face);
      const X = face === 'n' || face === 's';
      const fixed = face === 'n' ? z1 : face === 's' ? z2 : face === 'w' ? x1 : x2;
      const a = X ? x1 : z1, b = X ? x2 : z2;
      const gaps = (open[face] || []).map((o) => [o.c - o.w / 2, o.c + o.w / 2, o.h ?? 3]).sort((p, q) => p[0] - q[0]);
      const segs = [];
      let s = a;
      for (const [g0, g1, gh] of gaps) {
        segs.push([s, g0, 0, h]);
        if (gh < h) segs.push([g0, g1, gh, h]);
        s = g1;
      }
      segs.push([s, b, 0, h]);
      const t0 = face === 'n' || face === 'w' ? fixed - 0.3 : fixed, t1 = t0 + 0.3;
      for (const [s0, s1, v0, v1] of segs) {
        if (s1 - s0 < 0.01) continue;
        if (isGlass && v0 === 0) {
          // a glass pane in a steel frame: the solid, the pane, the frame posts every ~2.5 m
          const mn = X ? V(s0, y, t0) : V(t0, y, s0), mx = X ? V(s1, y + h, t1) : V(t1, y + h, s1);
          W.addSolid(mn, mx, { static: true, glass: true });
          const pane = new THREE.PlaneGeometry(s1 - s0, h - 0.5);
          if (!X) pane.rotateY(Math.PI / 2);
          pane.translate(X ? (s0 + s1) / 2 : (t0 + t1) / 2, y + 0.25 + (h - 0.5) / 2, X ? (t0 + t1) / 2 : (s0 + s1) / 2);
          put('glass', pane);
          const posts = Math.max(1, Math.round((s1 - s0) / 2.5));
          for (let k = 0; k <= posts; k++) {
            const u = s0 + ((s1 - s0) * k) / posts;
            put('rib', (X ? new THREE.BoxGeometry(0.16, h, 0.36) : new THREE.BoxGeometry(0.36, h, 0.16)).translate(X ? u : (t0 + t1) / 2, y + h / 2, X ? (t0 + t1) / 2 : u));
          }
          for (const vv of [0.12, h - 0.12]) put('rib', (X ? new THREE.BoxGeometry(s1 - s0, 0.24, 0.4) : new THREE.BoxGeometry(0.4, 0.24, s1 - s0)).translate(X ? (s0 + s1) / 2 : (t0 + t1) / 2, y + vv, X ? (t0 + t1) / 2 : (s0 + s1) / 2));
        } else if (X) box(s0, y + v0, t0, s1, y + v1, t1);
        else box(t0, y + v0, s0, t1, y + v1, s1);
      }
    };
    for (const f of ['n', 's', 'e', 'w']) if (!skip.includes(f)) wall(f);
    if (!roof) return;
    if (glass.includes('roof')) {
      W.addSolid(V(x1 - 0.3, y + h, z1 - 0.3), V(x2 + 0.3, y + h + 0.3, z2 + 0.3), { static: true, glass: true });
      put('glass', new THREE.PlaneGeometry(x2 - x1, z2 - z1).rotateX(-Math.PI / 2).translate((x1 + x2) / 2, y + h + 0.15, (z1 + z2) / 2));
      for (let x = x1; x <= x2 + 0.01; x += (x2 - x1) / Math.max(1, Math.round((x2 - x1) / 2.5))) put('rib', new THREE.BoxGeometry(0.16, 0.3, z2 - z1 + 0.6).translate(x, y + h + 0.15, (z1 + z2) / 2));
    } else box(x1 - 0.3, y + h, z1 - 0.3, x2 + 0.3, y + h + 0.5, z2 + 0.3, 'ceil');
  }

  // ---- a glass dome (visual) over the rectangle x1..x2, z1..z2 springing from y0, rising h
  function dome({ x1, x2, z1, z2, y0, h, ribs = 12, rings = 4 }) {
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, rx = (x2 - x1) / 2, rz = (z2 - z1) / 2;
    const g = new THREE.SphereGeometry(1, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(rx, h, rz).translate(cx, y0, cz);
    put('glass', g);
    for (let k = 0; k < ribs; k++) {
      const a = (k / ribs) * Math.PI * 2, pts = [];
      for (let i = 0; i <= 10; i++) {
        const e = (i / 10) * (Math.PI / 2);
        pts.push(V(cx + Math.cos(a) * Math.cos(e) * rx * 1.005, y0 + Math.sin(e) * h * 1.005, cz + Math.sin(a) * Math.cos(e) * rz * 1.005));
      }
      put('rib', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.12, 5));
    }
    for (let i = 0; i < rings; i++) {
      const e = (i / rings) * (Math.PI / 2), pts = [];
      for (let k = 0; k <= 32; k++) {
        const a = (k / 32) * Math.PI * 2;
        pts.push(V(cx + Math.cos(a) * Math.cos(e) * rx * 1.005, y0 + Math.sin(e) * h * 1.005, cz + Math.sin(a) * Math.cos(e) * rz * 1.005));
      }
      put(i === 0 ? 'rust' : 'rib', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 64, i === 0 ? 0.3 : 0.1, 5, true));
    }
    put('lamp', new THREE.SphereGeometry(0.6, 10, 6).translate(cx, y0 + h - 0.2, cz));
  }

  // ---- the pressure membrane over an open doorway: a shimmering sheet of held-back sea
  const memMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uT; varying vec3 vW; varying vec2 vUv;
      void main(){
        float r = sin(vW.x * 3.1 + vW.y * 2.3 + uT * 2.0) * sin(vW.z * 2.7 - vW.y * 1.7 + uT * 1.6);
        float edge = smoothstep(0.12, 0.0, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
        float a = 0.16 + 0.1 * r + edge * 0.5;
        gl_FragColor = vec4(vec3(0.35, 0.85, 1.0) * (0.7 + 0.5 * r + edge), a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const membranes = [];
  function membrane(min, max) {
    const a = V(...min), b = V(...max), s = V().subVectors(b, a);
    const geo = s.x < s.z ? new THREE.PlaneGeometry(s.z, s.y).rotateY(Math.PI / 2) : new THREE.PlaneGeometry(s.x, s.y);
    const m = new THREE.Mesh(geo, memMat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.renderOrder = 3;
    m.raycast = () => {};
    W.scene.add(m);
    membranes.push(m);
    // a glowing frame round it
    const t = 0.12;
    if (s.x < s.z) {
      deco(a.x - 0.1, b.y, a.z - t, a.x + 0.1, b.y + t, b.z + t);
      deco(a.x - 0.1, a.y, a.z - t, a.x + 0.1, b.y, a.z);
      deco(a.x - 0.1, a.y, b.z, a.x + 0.1, b.y, b.z + t);
    } else {
      deco(a.x - t, b.y, a.z - 0.1, b.x + t, b.y + t, a.z + 0.1);
      deco(a.x - t, a.y, a.z - 0.1, a.x, b.y, a.z + 0.1);
      deco(b.x, a.y, a.z - 0.1, b.x + t, b.y, a.z + 0.1);
    }
    return m;
  }

  // ---- steps up out of a pool: n blocks, rising 0.4 a step toward the floor edge point (x, z), going out
  // into the water along (dx, dz), w wide (the top step 0.4 under the floor)
  function steps(x, z, dx, dz, top, w = 2, n = 4, d = 0.6) {
    for (let k = 0; k < n; k++) {
      const a = d * k, b = d * (k + 1);
      const px1 = dx ? x + dx * a : x - w / 2, px2 = dx ? x + dx * b : x + w / 2;
      const pz1 = dz ? z + dz * a : z - w / 2, pz2 = dz ? z + dz * b : z + w / 2;
      box(Math.min(px1, px2), top - 0.4 * (k + 1) - 0.3, Math.min(pz1, pz2), Math.max(px1, px2), top - 0.4 * (k + 1), Math.max(pz1, pz2), 'plat');
    }
  }

  // ---- a moon pool: a hole x1..x2, z1..z2 in a floor (top floorY, slab 1 m) open to the sea below, its
  // water standing 0.2 under the floor; steps climb out on the `stepSide` ('-x','+x','-z','+z')
  function moonPool({ x1, x2, z1, z2, floorY, stepSide = '-x' }) {
    const surf = floorY - 0.2;
    const w = B.water([x1, floorY - 1.05, z1], [x2, surf, z2], { surface: true });
    w.top = surf;
    // a hazard collar and a lit frame
    deco(x1 - 0.5, floorY, z1 - 0.5, x2 + 0.5, floorY + 0.02, z1, 'hazard');
    deco(x1 - 0.5, floorY, z2, x2 + 0.5, floorY + 0.02, z2 + 0.5, 'hazard');
    deco(x1 - 0.5, floorY, z1, x1, floorY + 0.02, z2, 'hazard');
    deco(x2, floorY, z1, x2 + 0.5, floorY + 0.02, z2, 'hazard');
    deco(x1 - 0.06, floorY - 1, z1 - 0.06, x2 + 0.06, floorY - 0.9, z1);
    deco(x1 - 0.06, floorY - 1, z2, x2 + 0.06, floorY - 0.9, z2 + 0.06);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, ww = stepSide.endsWith('x') ? z2 - z1 - 0.2 : x2 - x1 - 0.2;
    if (stepSide === '-x') steps(x1, cz, 1, 0, floorY, ww);
    else if (stepSide === '+x') steps(x2, cz, -1, 0, floorY, ww);
    else if (stepSide === '-z') steps(cx, z1, 0, 1, floorY, ww);
    else steps(cx, z2, 0, -1, floorY, ww);
    return w;
  }

  // ---- air: bells, vents, and the routes between them
  const refills = []; // { kind: 'vent'|'bell', p, r, y1, y2 }
  // an air bell: a steel cup (interior 3.2 x 3.2) whose roof is at `top`, its pocket 2.2 m deep, a grated
  // ledge inside at the waterline with a checkpoint; a gold beacon and light under it
  function airBell(x, top, z, { checkpoint = true, yaw = 0 } = {}) {
    const r = 1.6, skirt = 3.2, surf = top - 2.2;
    box(x - r - 0.3, top, z - r - 0.3, x + r + 0.3, top + 0.4, z + r + 0.3, 'metal');
    for (const [a, b, c, d] of [[x - r - 0.3, z - r - 0.3, x + r + 0.3, z - r], [x - r - 0.3, z + r, x + r + 0.3, z + r + 0.3], [x - r - 0.3, z - r, x - r, z + r], [x + r, z - r, x + r + 0.3, z + r]]) box(a, top - skirt, b, c, top, d, 'metal');
    deco(x - r - 0.32, top - skirt - 0.1, z - r - 0.32, x + r + 0.32, top - skirt, z + r + 0.32, 'glow1');
    // the ledge (a grate along one side, at the waterline) and its checkpoint
    box(x - r, surf - 0.3, z - r, x + r, surf, z - r + 1.1, 'grate');
    air([x - r, top - skirt, z - r], [x + r, top, z + r]);
    const w = B.water([x - r, top - skirt, z - r], [x + r, surf, z + r], { surface: true });
    w.top = surf;
    if (checkpoint) new Checkpoint(W, game, { pos: [x, surf, z - r + 0.55], yaw, size: [3, 2.2, 1.1] });
    put('warm', new THREE.SphereGeometry(0.22, 8, 6).translate(x, top - 0.3, z));
    // a cable up toward the surface it hangs from
    put('rib', new THREE.CylinderGeometry(0.06, 0.06, Math.max(1, SEA_Y - top), 5).translate(x, (top + SEA_Y) / 2 + 0.2, z));
    beacon(x, top - skirt - 0.6, z, 0, true, 0.3);
    refills.push({ kind: 'bell', p: V(x, surf, z), r });
    return w;
  }
  // a bubble vent on the sea floor at (x, y, z): its column rises `h` m
  const vents = [];
  function bubbleVent(x, y, z, h = 14) {
    vents.push({ p: V(x, y, z), h });
    refills.push({ kind: 'vent', p: V(x, y, z), r: 1.4, h });
    put('rust', new THREE.CylinderGeometry(0.7, 1.1, 0.8, 8).translate(x, y + 0.4, z));
    put('warm', new THREE.TorusGeometry(0.75, 0.08, 5, 12).rotateX(Math.PI / 2).translate(x, y + 0.82, z));
    beacon(x, y + 2.2, z, 0, true, 0.25);
  }
  // route beacons: octahedra along a polyline, a pulse running toward its end
  const marks = [];
  function beacon(x, y, z, along = 0, gold = false, r = 0.16) {
    marks.push({ x, y, z, along, gold, r });
  }
  function trail(pts, { step = 2.4, along = 0, gold = false, r = 0.16 } = {}) {
    let s = along;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = V(...pts[i]), b = V(...pts[i + 1]), len = a.distanceTo(b);
      for (let d = i ? step / 2 : 0; d < len; d += step) {
        _p.copy(a).lerp(b, d / len);
        beacon(_p.x, _p.y, _p.z, s + d, gold, r);
      }
      s += len;
    }
    return s;
  }

  // ---- finalize: merge the static meshes, build the beacons and the vents' bubbles, run the clocks
  function finalize() {
    const keyMat = { glass: glassMat, rib: ribMat, rust: rustMat, lamp: lampMat, warm: warmMat };
    for (const [k, list] of Object.entries(geos)) {
      // (per ~80 m cluster, so distance culling still works)
      const clusters = new Map();
      for (const g of list) {
        g.computeBoundingSphere();
        const c = g.boundingSphere.center, key = Math.floor(c.x / 80) + ':' + Math.floor(c.y / 40) + ':' + Math.floor(c.z / 80);
        if (!clusters.has(key)) clusters.set(key, []);
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
        if (!g.attributes.normal) g.computeVertexNormals();
        clusters.get(key).push(g);
      }
      for (const gl of clusters.values()) {
        const merged = mergeGeometries(gl, false);
        gl.forEach((g) => g.dispose());
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, keyMat[k]);
        mesh.matrixAutoUpdate = false;
        mesh.raycast = () => {};
        if (k === 'glass') mesh.renderOrder = 2;
        W.scene.add(mesh);
      }
    }
    // beacons: one instanced draw, pulsing along their routes
    const mGeo = new THREE.OctahedronGeometry(1, 0);
    const bm = new THREE.InstancedMesh(mGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), Math.max(1, marks.length));
    const m4 = new THREE.Matrix4(), col = new THREE.Color(), cyan = new THREE.Color(0x6fe6ff), gold = new THREE.Color(0xffc870), s3 = V(1, 1, 1), qI = new THREE.Quaternion();
    marks.forEach((k, i) => bm.setMatrixAt(i, m4.compose(_p.set(k.x, k.y, k.z), qI, s3.setScalar(k.r))));
    bm.count = marks.length;
    bm.userData.noCull = true;
    bm.raycast = () => {};
    W.scene.add(bm);
    // bubbles: points rising up every vent's column (one draw)
    const PER = 40, n = vents.length * PER;
    let bub = null;
    if (n) {
      const pos = new Float32Array(n * 3), seed = new Float32Array(n);
      vents.forEach((v, j) => {
        for (let i = 0; i < PER; i++) {
          const k = j * PER + i;
          pos[k * 3] = v.p.x;
          pos[k * 3 + 1] = v.p.y + 0.8;
          pos[k * 3 + 2] = v.p.z;
          seed[k] = Math.random() * 100 + j * 0.001;
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      g.setAttribute('aH', new THREE.BufferAttribute(new Float32Array(n).map((_, k) => vents[Math.floor(k / PER)].h), 1));
      const bmat = new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uScale: { value: 300 } },
        vertexShader: `uniform float uT, uScale; attribute float aSeed, aH; varying float vA;
          void main(){
            float ph = fract(uT * (0.18 + fract(aSeed * 1.7) * 0.12) + fract(aSeed * 0.37));
            vec3 p = position + vec3(sin(uT * 2.0 + aSeed) * 0.35 * ph, ph * aH, cos(uT * 1.7 + aSeed * 3.0) * 0.35 * ph);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = clamp((0.09 + 0.1 * fract(aSeed * 5.3)) * uScale / max(-mv.z, 0.1), 1.0, 14.0);
            vA = smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.8, 1.0, ph)) * (1.0 - smoothstep(30.0, 60.0, -mv.z));
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); float ring = smoothstep(0.5, 0.36, r) * (0.35 + smoothstep(0.2, 0.42, r)); gl_FragColor = vec4(vec3(0.8, 0.97, 1.0) * ring * vA, ring * vA * 0.8); }`,
        transparent: true, depthWrite: false,
      });
      bub = new THREE.Points(g, bmat);
      bub.frustumCulled = false;
      bub.userData.noCull = true;
      bub.raycast = () => {};
      W.scene.add(bub);
    }
    let t = 0, gulpT = 0, ventLoop = null, ventGain = 0;
    W.add({
      update(dt, player) {
        t += dt;
        memMat.uniforms.uT.value = t;
        if (bub) {
          bub.material.uniforms.uT.value = t;
          bub.material.uniforms.uScale.value = game.renderer.domElement.height / 2;
        }
        if (player.pos.x < 26) return;
        // the beacons pulse along their routes
        let near = 99;
        marks.forEach((k, i) => {
          const wave = Math.pow(Math.max(0, Math.sin((k.along / 7 - t * 1.3) * Math.PI)), 6);
          col.copy(k.gold ? gold : cyan).multiplyScalar(k.gold ? 0.9 + 0.5 * Math.sin(t * 3 + i) : 0.35 + 1.3 * wave);
          bm.setColorAt(i, col);
        });
        if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
        // a head in a vent's bubble column breathes from it
        const eyeY = player.pos.y + player.eye;
        for (const r of refills) {
          if (r.kind !== 'vent') continue;
          const dx = player.pos.x - r.p.x, dz = player.pos.z - r.p.z, d = Math.hypot(dx, dz);
          near = Math.min(near, Math.hypot(d, Math.max(0, r.p.y - eyeY, eyeY - r.p.y - r.h)));
          if (player.headUnder && d < r.r && eyeY > r.p.y && eyeY < r.p.y + r.h) {
            player.air = Math.min(AIR_MAX, player.air + dt * 6);
            if ((gulpT -= dt) <= 0) {
              gulpT = 0.7;
              W.fx.bubbles?.(_q.set(player.pos.x, eyeY, player.pos.z), 4);
            }
          }
        }
        // the vents' bubbling (a stand-in until bubble_vent exists)
        const want = near < 18 ? 0.35 * (1 - near / 18) : 0;
        ventGain += (want - ventGain) * Math.min(1, dt * 3);
        if (!ventLoop && ventGain > 0.01) ventLoop = audio.createLoop(audio.sfxOr('bubble_vent', 'lava_bubble'), { gain: 0, rate: audio.available?.has('bubble_vent') ? 1 : 0.55 });
        ventLoop?.setGain(ventGain);
      },
    });
  }

  return { box, deco, air, glassTube, glassPod, dome, membrane, steps, moonPool, airBell, bubbleVent, beacon, trail, finalize, glassMat, ribMat, rustMat, refills };
}

// ================================================================== the AIRLOCK
// A chamber (interior min..max) with an outer door onto the sea and an inner door into the habitat, on
// opposite faces ('-x','+x','-z','+z' for the outer one). It floods and drains to serve whichever side you
// come from: swim in from the sea and it shuts behind you and drains (a hiss, then air), walk in from
// inside toward the sea door and it floods and opens. Both doors are never open at once.
export class Airlock {
  constructor(B, { min, max, outer = '-x', zone = 'blue', airs, onDrained = null, startDry = false }) {
    const { W, game } = B;
    this.W = W;
    this.game = game;
    this.min = V(...min);
    this.max = V(...max);
    this.outer = outer;
    this.onDrained = onDrained;
    const [x1, y1, z1] = min, [x2, y2, z2] = max;
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, dw = 2.2, dh = 3.0, T = 0.35;
    const alongX = outer.endsWith('x');
    // shell: floor, roof, the two side walls, and the two door walls with their openings
    W.box(x1 - T, y1 - 0.6, z1 - T, x2 + T, y1, z2 + T, 'floor', zone);
    W.box(x1 - T, y2, z1 - T, x2 + T, y2 + 0.4, z2 + T, 'metal', zone);
    const doorWall = (fixed, sign) => {
      if (alongX) {
        const a = sign < 0 ? fixed - T : fixed, b = a + T;
        W.box(a, y1, z1 - T, b, y2, cz - dw / 2, 'metal', zone);
        W.box(a, y1, cz + dw / 2, b, y2, z2 + T, 'metal', zone);
        W.box(a, y1 + dh, cz - dw / 2, b, y2, cz + dw / 2, 'metal', zone);
        W.deco(a - 0.02, y1 + dh, cz - dw / 2 - 0.1, b + 0.02, y1 + dh + 0.1, cz + dw / 2 + 0.1, 'glow1', zone);
        return [[a, y1, cz - dw / 2], [b, y1 + dh, cz + dw / 2]];
      }
      const a = sign < 0 ? fixed - T : fixed, b = a + T;
      W.box(x1 - T, y1, a, cx - dw / 2, y2, b, 'metal', zone);
      W.box(cx + dw / 2, y1, a, x2 + T, y2, b, 'metal', zone);
      W.box(cx - dw / 2, y1 + dh, a, cx + dw / 2, y2, b, 'metal', zone);
      W.deco(cx - dw / 2 - 0.1, y1 + dh, a - 0.02, cx + dw / 2 + 0.1, y1 + dh + 0.1, b + 0.02, 'glow1', zone);
      return [[cx - dw / 2, y1, a], [cx + dw / 2, y1 + dh, b]];
    };
    let outerD, innerD;
    if (alongX) {
      const lo = doorWall(x1, -1), hi = doorWall(x2, 1);
      [outerD, innerD] = outer === '-x' ? [lo, hi] : [hi, lo];
      W.box(x1, y1, z1 - T, x2, y2, z1, 'metal', zone);
      W.box(x1, y1, z2, x2, y2, z2 + T, 'metal', zone);
    } else {
      const lo = doorWall(z1, -1), hi = doorWall(z2, 1);
      [outerD, innerD] = outer === '-z' ? [lo, hi] : [hi, lo];
      W.box(x1 - T, y1, z1, x1, y2, z2, 'metal', zone);
      W.box(x2, y1, z1, x2 + T, y2, z2, 'metal', zone);
    }
    this.outerDoor = B.seal(outerD[0], outerD[1], { zone });
    this.innerDoor = B.seal(innerD[0], innerD[1], { zone, closed: true });
    this.outerC = V(...outerD[0]).add(V(...outerD[1])).multiplyScalar(0.5);
    this.innerC = V(...innerD[0]).add(V(...innerD[1])).multiplyScalar(0.5);
    // a pulsing warning lamp over each door, and the chamber's own water
    airs.push([[x1, y1 - 0.6, z1], [x2, y2 + 0.4, z2]]);
    this.y1 = y1;
    this.y2 = y2;
    this.level = startDry ? y1 - 0.3 : y2 + 0.4;
    this.water = B.water([x1, y1 - 0.3, z1], [x2, this.level, z2], { surface: false });
    this.water.top = this.level;
    this.surf = waterSurface(W, x1, z1, x2, z2, 0);
    this.surf.matrixAutoUpdate = true;
    this.surf.position.y = this.level;
    this.surf.visible = false;
    this.lamp = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.15 : 0.9, 0.18, alongX ? 0.9 : 0.15), new THREE.MeshBasicMaterial({ color: 0xffb040 }));
    this.lamp.position.set(this.innerC.x, y1 + dh + 0.45, this.innerC.z);
    W.scene.add(this.lamp);
    this.state = startDry ? 'dry' : 'wet';
    if (startDry) {
      this.outerDoor.close(true);
      this.innerDoor.open(true);
    }
    this.t = 0;
    this.inT = 0;
    this.drainedOnce = false;
    W.add(this);
  }

  inside(p) {
    return p.x > this.min.x && p.x < this.max.x && p.z > this.min.z && p.z < this.max.z && p.y > this.min.y - 0.5 && p.y < this.max.y;
  }

  cycle(to) {
    this.state = to === 'dry' ? 'draining' : 'flooding';
    this.t = 0;
    if (to === 'dry') this.outerDoor.close();
    else this.innerDoor.close();
    audio.sample('door_slam', { gain: 0.6, vary: 0.05, rate: 0.8 });
  }

  setLevel(y) {
    this.level = y;
    this.water.max.y = Math.max(this.y1 - 0.29, y);
    this.water.top = this.water.max.y;
    this.surf.position.y = y;
    this.surf.visible = y > this.y1 && y < this.y2 + 0.1;
  }

  update(dt, player) {
    const p = player.pos;
    const inn = this.inside(p);
    this.inT = inn ? this.inT + dt : 0;
    this.t += dt;
    const dOut = this.outerC.distanceTo(p), dIn = this.innerC.distanceTo(p);
    switch (this.state) {
      case 'wet':
        // swum in from the sea (or waiting empty while you come back to it from inside)
        if ((inn && this.inT > 0.35 && dOut > 1.0) || (!inn && dIn < 6 && dIn < dOut && !player.swimming)) this.cycle('dry');
        break;
      case 'dry':
        if ((inn && dOut < 1.6) || (!inn && player.swimming && dOut < 7 && dOut < dIn)) this.cycle('wet');
        break;
      case 'draining': {
        if (this.t < 0.6) break; // (the door slides shut)
        if (this.t < 0.7) {
          audio.sample(audio.sfxOr('airlock_cycle', 'hydraulic_hiss'), { gain: 0.9, vary: 0 });
          audio.sample('titan_steam', { gain: 0.35, vary: 0.05, delay: 0.3 });
        }
        const k = Math.min(1, (this.t - 0.6) / 3.0);
        this.setLevel(this.y2 + 0.4 - k * (this.y2 + 0.7 - this.y1));
        if (inn && Math.random() < dt * 20) this.W.fx.bubbles?.(_p.set(this.min.x + Math.random() * (this.max.x - this.min.x), this.level - 0.3, this.min.z + Math.random() * (this.max.z - this.min.z)), 2);
        if (k >= 1) {
          this.state = 'dry';
          this.innerDoor.open();
          audio.sample('elevator_start', { gain: 0.5, vary: 0, rate: 1.3 });
          if (inn) {
            // a gasp of air
            if (!audio.sample(audio.sfxOr('gasp', ''), { gain: 0.9, vary: 0.04 })) audio.noise({ dur: 0.5, gain: 0.25, freq: 1400, f2: 700, type: 'bandpass', q: 0.7 });
            player.air = AIR_MAX;
          }
          if (!this.drainedOnce && inn) {
            this.drainedOnce = true;
            this.onDrained?.();
          }
        }
        break;
      }
      case 'flooding': {
        if (this.t < 0.6) break;
        if (this.t < 0.7) audio.sample('hydraulic_hiss', { gain: 0.7, vary: 0, rate: 0.8 });
        const k = Math.min(1, (this.t - 0.6) / 2.4);
        this.setLevel(this.y1 - 0.3 + k * (this.y2 + 0.7 - this.y1));
        if (k >= 1) {
          this.state = 'wet';
          this.outerDoor.open();
        }
        break;
      }
    }
    this.lamp.material.color.setHex(this.state === 'dry' ? 0x50ff90 : this.state === 'wet' ? 0x4ac8ff : Math.sin(this.t * 14) > 0 ? 0xffb040 : 0x302010);
  }

  reset() {
    // (a respawn inside: drained and open to the habitat)
    if (this.state === 'dry' || this.state === 'wet') return;
    this.state = 'dry';
    this.setLevel(this.y1 - 0.3);
    this.outerDoor.close(true);
    this.innerDoor.open(true);
  }
}
