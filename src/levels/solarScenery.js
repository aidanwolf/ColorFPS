// SOLAR SCENERY — the Lumen's sun-farm round Sunscorch Mesa: photovoltaic arrays on steel gantries (glossy,
// and they really reflect shots), endless solar farms receding to the horizon on the desert beyond the
// playable world, and giant solar windmills turning slowly in the haze. Everything far off is a handful of
// instanced meshes that skip World culling (they're shown only while you're in Solar or the Hub).
//
//   const sc = solarScenery(W, game, { visible: (p) => bool })
//   sc.farm({ x1, z1, x2, z2, y, rowGap, colGap, w, h, tilt, yaw })      a far solar farm (instanced rows)
//   sc.turbine([x, y, z], { height, blade, yaw, speed })                  a giant solar windmill
//   sc.ground(x1, z1, x2, z2, y)                                          the far desert floor
//   sc.mesa(x1, z1, x2, z2, top)                                          a distant mesa silhouette
//   new PVArray(W, { x1, z1, x2, z2, y, rows, cols, w, h, tilt, yaw, post, hittable })  a near array on gantries
//   sc.finish()                                                            builds the instanced farm meshes
import * as THREE from 'three';
import { pvTexture } from '../entities/sunlight.js';

const ID_Q = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    // (the sun's directional light lays a moving glint across these as you walk)
    pv: new THREE.MeshStandardMaterial({ map: pvTexture(), color: 0xffffff, metalness: 0.6, roughness: 0.22, emissive: 0x081226 }),
    pvBack: new THREE.MeshStandardMaterial({ color: 0x6a6a70, metalness: 0.7, roughness: 0.5 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8a8478, metalness: 0.75, roughness: 0.4 }),
    tower: new THREE.MeshStandardMaterial({ color: 0xd8d0c0, metalness: 0.35, roughness: 0.55 }),
    sand: new THREE.MeshStandardMaterial({ color: 0xb08a58, roughness: 1, metalness: 0 }),
    mesa: new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 1, flatShading: true }),
    beacon: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.25, 0.15).multiplyScalar(2.2) }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc650).multiplyScalar(1.8) }),
  };
  return MATS;
}

// one PV panel: a thin slab, the cells on top (+y), its frame and back below
const panelGeo = (w, h) => {
  const g = new THREE.BoxGeometry(w, 0.08, h);
  return g;
};

export function solarScenery(W, game, { visible }) {
  const M = mats();
  const far = []; // every far mesh: shown only while `visible(player.pos)`
  const farms = [];
  const rotors = [];
  const beacons = [];
  const add = (o) => {
    o.userData.noCull = true;
    W.scene.add(o);
    far.push(o);
    return o;
  };

  function farm({ x1, z1, x2, z2, y, rowGap = 9, colGap = 4.6, w = 4.2, h = 2.6, tilt = 0.5, yaw = 0, jitter = 0 }) {
    farms.push({ x1, z1, x2, z2, y, rowGap, colGap, w, h, tilt, yaw, jitter });
  }

  function finish() {
    // count, then fill one panel mesh and one post mesh for all the farms together
    const items = [];
    for (const f of farms) {
      const xa = Math.min(f.x1, f.x2), xb = Math.max(f.x1, f.x2), za = Math.min(f.z1, f.z2), zb = Math.max(f.z1, f.z2);
      for (let z = za; z <= zb; z += f.rowGap)
        for (let x = xa; x <= xb; x += f.colGap) items.push([x + (Math.random() - 0.5) * f.jitter, f.y, z, f]);
    }
    if (!items.length) return;
    const pv = new THREE.InstancedMesh(panelGeo(1, 1), [M.pvBack, M.pvBack, M.pv, M.pvBack, M.pvBack, M.pvBack], items.length);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 1, 0.18), M.steel, items.length);
    items.forEach(([x, y, z, f], i) => {
      // panels face the sun (west, tipped up): yaw turns the row
      _e.set(-f.tilt, f.yaw, 0, 'YXZ');
      _q.setFromEuler(_e);
      pv.setMatrixAt(i, _m.compose(_p.set(x, y + 1.6, z), _q, _s.set(f.w, 1, f.h)));
      posts.setMatrixAt(i, _m.compose(_p.set(x, y + 0.8, z), _q.identity(), _s.set(1, 1.6, 1)));
    });
    pv.computeBoundingSphere();
    posts.computeBoundingSphere();
    add(pv);
    add(posts);
  }

  // A giant solar windmill: a tapering white tower, a nacelle, and three long blades clad in solar cells.
  function turbine([x, y, z], { height = 110, blade = 52, yaw = Math.PI / 2, speed = 0.12, phase = Math.random() * 6 } = {}) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 4.2, height, 12), M.tower);
    tower.position.y = height / 2;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 4, 12), M.steel);
    base.position.y = 2;
    const nac = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 14), M.tower);
    nac.position.set(0, height + 2, 2);
    const rotor = new THREE.Group();
    rotor.position.set(0, height + 2, -5.5);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), M.tower);
    hub.scale.z = 1.4;
    rotor.add(hub);
    for (let k = 0; k < 3; k++) {
      const arm = new THREE.Group();
      arm.rotation.z = (k / 3) * Math.PI * 2;
      // the blade: a long, slightly tapering slab, the cells on its sun side
      const bl = new THREE.Mesh(new THREE.BoxGeometry(5.5, blade, 0.6), [M.pvBack, M.pvBack, M.pvBack, M.pvBack, M.pv, M.pv]);
      bl.position.y = blade / 2 + 2.5;
      bl.rotation.y = 0.25;
      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.9, blade + 2, 0.9), M.steel);
      spar.position.y = blade / 2 + 2;
      arm.add(spar, bl);
      rotor.add(arm);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), M.beacon);
    lamp.position.set(0, height + 5, 6);
    g.add(tower, base, nac, rotor, lamp);
    add(g);
    rotors.push({ rotor, speed, phase });
    beacons.push(lamp);
    return g;
  }

  function ground(x1, z1, x2, z2, y) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(x2 - x1), Math.abs(z2 - z1)), M.sand);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
    add(m);
    return m;
  }

  function mesa(x1, z1, x2, z2, top, base = -12) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x2 - x1), top - base, Math.abs(z2 - z1)), M.mesa);
    m.position.set((x1 + x2) / 2, (top + base) / 2, (z1 + z2) / 2);
    add(m);
    // a cap a little narrower
    const c = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x2 - x1) * 0.8, 4, Math.abs(z2 - z1) * 0.8), M.mesa);
    c.position.set((x1 + x2) / 2, top + 2, (z1 + z2) / 2);
    add(c);
  }

  let t = 0, shown = true;
  W.add({
    update(dt, player) {
      t += dt;
      const want = visible(player.pos);
      if (want !== shown) {
        shown = want;
        for (const o of far) o.visible = want;
      }
      if (!want) return;
      for (const r of rotors) r.rotor.rotation.z = r.phase + t * r.speed;
      const blink = Math.sin(t * 2.2) > 0.6 ? 2.2 : 0.25;
      M.beacon.color.setRGB(1.0, 0.25, 0.15).multiplyScalar(blink);
    },
  });

  return { farm, turbine, ground, mesa, finish, mats: M };
}

// A big photovoltaic array on steel gantries, close enough to shoot: rows × cols of glossy panels tilted
// toward the sun. hittable: shots (and SunBeams) glance off the cells like off a mirror.
export class PVArray {
  constructor(W, { x1, z1, x2, z2, y, rows = 2, cols = 6, w = 3.2, h = 2.2, tilt = 0.55, yaw = Math.PI / 2, post = 3.2, hittable = true }) {
    const M = mats();
    this.world = W;
    const items = [];
    const xa = Math.min(x1, x2), xb = Math.max(x1, x2), za = Math.min(z1, z2), zb = Math.max(z1, z2);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const x = rows > 1 ? xa + ((xb - xa) * r) / (rows - 1) : (xa + xb) / 2;
        const z = cols > 1 ? za + ((zb - za) * c) / (cols - 1) : (za + zb) / 2;
        items.push([x, z]);
      }
    this.count = items.length;
    this.mesh = new THREE.InstancedMesh(panelGeo(1, 1), [M.pvBack, M.pvBack, M.pv, M.pvBack, M.pvBack, M.pvBack], items.length);
    this.normals = [];
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 1, 0.3), M.steel, items.length * 2);
    const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.25, 0.25), M.steel, rows);
    _e.set(-tilt, yaw, 0, 'YXZ');
    _q.setFromEuler(_e);
    const n = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);
    items.forEach(([x, z], i) => {
      this.mesh.setMatrixAt(i, _m.compose(_p.set(x, y + post, z), _q, _s.set(w, 1, h)));
      this.normals.push(n.clone());
      // two legs, the back one longer (the panel leans toward the sun)
      for (const [k, s] of [[0, -1], [1, 1]]) {
        const off = _p.set(0, 0, s * h * 0.35).applyQuaternion(_q);
        const top = y + post + off.y;
        posts.setMatrixAt(i * 2 + k, _m.compose(_p.set(x + off.x, (y + top) / 2, z + off.z), ID_Q, _s.set(1, top - y, 1)));
      }
    });
    // a long girder under each row
    for (let r = 0; r < rows; r++) {
      const x = rows > 1 ? xa + ((xb - xa) * r) / (rows - 1) : (xa + xb) / 2;
      const along = Math.abs(Math.sin(yaw)) > 0.7; // panels facing ±x: rows run along z
      const len = along ? zb - za + h : xb - xa + w;
      beams.setMatrixAt(r, _m.compose(_p.set(along ? x : (xa + xb) / 2, y + post - 0.5, along ? (za + zb) / 2 : z1), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), along ? Math.PI / 2 : 0), _s.set(len, 1, 1)));
    }
    for (const m of [this.mesh, posts, beams]) {
      m.computeBoundingSphere();
      m.computeBoundingBox?.();
      W.scene.add(m);
    }
    this.flash = 0;
    if (hittable) {
      this.mesh.userData.hit = this;
      this.mesh.userData.beamRadius = Math.hypot(xb - xa, zb - za) / 2 + 4;
      this.mesh.position.set(0, 0, 0);
      W.addHittable(this.mesh);
    }
  }

  // a shot strikes a panel: the cells are glass over silicon — it glances off like off a mirror
  reflects(hit) {
    const i = hit?.object === this.mesh ? hit.instanceId : undefined;
    if (i === undefined) return false;
    const n = this.normals[i];
    if (hit.dir && hit.dir.dot(n) > 0) return false; // from beneath: the frame
    hit.normal = n.clone();
    return true;
  }

  onHit(color, hit) {
    return this.reflects(hit) ? 'mirror' : 'hit';
  }

  onBeam(dt, hit) {
    return this.reflects(hit) ? 'mirror' : 'hit';
  }
}
