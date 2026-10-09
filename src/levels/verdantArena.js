// THE THORNMAW'S COURTYARD — Verdant's mini-boss arena: a ruined, overgrown temple courtyard (~44×44 m)
// open to the sky. The Thornmaw (entities/verdantBoss.js) is rooted on a bramble-ringed island in a sludge
// moat at the center; above it hangs THE VERDANT HEART, the world's power source (the jungle's harvested
// life force, a seed-pod reactor on root cables), shielded while its guardian lives. Corner towers (4.2 m)
// are reached by jump pads; four dodge pads in the floor ring vault you over the sweeping thorn root.
// Walk in through the entry and the gates seal behind you; beat the Thornmaw, then shoot the exposed
// Heart with GREEN to shut the world's engine down, which opens the gates again.
//
// buildVerdantArena(B, { center: [x, y, z], size = 44, entry = 's', exit = 'n', colors, onDefeated })
//   center: the courtyard floor's center (floor top at y). entry/exit: wall sides ('n' -z, 's' +z, 'e' +x,
//   'w' -x), each a 3 m × 3.2 m opening at the wall's center whose outside face is at size/2 + 1.2 from
//   the center. The entry gets an 8 m vestibule (with the checkpoint) beyond that face: connect your
//   corridor to its far end (returned as entryPos). Returns { boss, heart, entryPos, exitPos, reset }.
//   The footprint is size + 2.4 m square (walls), plus the vestibule.
import * as THREE from 'three';
import { COLORS, GREEN } from '../colors.js';
import { audio } from '../audio.js';
import { boxGeo } from '../materials.js';
import { JumpPad, Checkpoint } from '../entities/misc.js';
import { Thornmaw, THORNMAW_SOUNDS } from '../entities/verdantBoss.js';

const WT = 1.2; // wall thickness
const WH = 10; // wall height
const DOOR_W = 3;
const DOOR_H = 3.2;
const MOAT_IN = 5.5; // island half-size
const MOAT_OUT = 9.5; // floor ring starts here
const TOWER_TOP = 4.2;
const VEST = 8; // entry vestibule length

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A stone slab that drops to seal a doorway (slams) and grinds back up into the wall to open.
class Gate {
  constructor(W, { min, max, mat }) {
    this.W = W;
    this.min = new THREE.Vector3(...min);
    this.max = new THREE.Vector3(...max);
    const size = new THREE.Vector3().subVectors(this.max, this.min);
    this.h = size.y;
    this.group = new THREE.Group();
    const slab = new THREE.Mesh(boxGeo(size.x, size.y, size.z, 0.5), mat);
    slab.position.y = size.y / 2;
    this.glyphMat = new THREE.MeshBasicMaterial({ color: 0x404040 });
    const alongX = size.x > size.z;
    const gw = alongX ? size.x * 0.6 : size.x + 0.04, gd = alongX ? size.z + 0.04 : size.z * 0.6;
    const g1 = new THREE.Mesh(new THREE.BoxGeometry(gw, 0.12, gd), this.glyphMat);
    g1.position.y = size.y * 0.55;
    const g2 = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.12 : gw, size.y * 0.5, alongX ? gd : 0.12), this.glyphMat);
    g2.position.y = size.y * 0.55;
    this.group.add(slab, g1, g2);
    this.group.position.set((this.min.x + this.max.x) / 2, this.min.y, (this.min.z + this.max.z) / 2);
    W.scene.add(this.group);
    this.solid = W.addSolid(this.min.clone(), this.max.clone(), { kind: 'rock' });
    this.solid.enabled = false;
    this.closed = false;
    this.k = 0; // 0 open (up in the wall) .. 1 closed
    this.apply();
    W.add(this);
  }

  set(closed, instant = false) {
    if (closed === this.closed && !instant) return;
    this.closed = closed;
    if (instant) this.k = closed ? 1 : 0;
    this.solid.enabled = closed;
    if (!instant) audio.sample(closed ? 'door_slam' : 'door_open', { gain: 0.9, rate: closed ? 0.8 : 0.7 }) || audio.door();
    this.apply();
  }

  apply() {
    this.group.position.y = this.min.y + (1 - this.k) * (this.h + 0.1);
    this.glyphMat.color.set(this.closed ? 0xffc95a : 0x3a4a30).multiplyScalar(this.closed ? 2 : 1);
  }

  update(dt) {
    const target = this.closed ? 1 : 0;
    if (this.k === target) return;
    const was = this.k;
    this.k = this.closed ? Math.min(1, this.k + dt / 0.28) : Math.max(0, this.k - dt / 1.4);
    this.apply();
    if (this.closed && this.k === 1 && was < 1) {
      const c = new THREE.Vector3((this.min.x + this.max.x) / 2, this.min.y + 0.1, (this.min.z + this.max.z) / 2);
      this.W.fx.burst(c, 0x8a8a70, { count: 40, speed: 6, life: 0.8, size: 0.6, gravity: 6, mode: 'puff' });
      const p = this.W.game.player;
      if (p.pos.distanceTo(c) < 16) p.shake = Math.max(p.shake, 0.4);
    }
    if (!this.closed && Math.random() < dt * 20) this.W.fx.edgeDust(this.min.x, this.max.x, this.group.position.y, this.min.z, this.max.z);
  }
}

// THE VERDANT HEART: the world's power source, a seed-pod reactor of roots and light. Shielded while the
// Thornmaw lives; afterwards it takes `color` hits until it convulses and goes dark.
class VerdantHeart {
  constructor(W, game, { pos, color, cables, fadeMats, onShutdown }) {
    this.W = W;
    this.game = game;
    this.color = color;
    this.pos = new THREE.Vector3(...pos);
    this.fadeMats = fadeMats; // [{ mat, from: Color }] arena glows that die with the Heart
    this.onShutdown = onShutdown;
    this.maxHp = 24;
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.group.userData.noCull = true;
    W.scene.add(this.group);
    const tag = (o, part) => ((o.userData.hit = this), (o.userData.part = part), o);
    // the pod: a glowing gnarled seed, caged in bark ribs, roots trailing from its base
    this.podMat = new THREE.MeshStandardMaterial({ color: 0x1a5a2a, emissive: 0x3dff7a, emissiveIntensity: 1.0, roughness: 0.4, flatShading: true });
    const podGeo = new THREE.IcosahedronGeometry(2.6, 3);
    const p = podGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.07 * Math.sin(x * 3 + y * 2) * Math.cos(z * 2.6 - y) + 0.05 * Math.sin(Math.atan2(z, x) * 8);
      p.setXYZ(i, x * n, y * n * 1.3, z * n);
    }
    podGeo.computeVertexNormals();
    this.pod = tag(new THREE.Mesh(podGeo, this.podMat), 'pod');
    this.group.add(this.pod);
    this.ribMat = new THREE.MeshStandardMaterial({ color: 0x4a4026, roughness: 1, flatShading: true });
    for (let i = 0; i < 6; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(2.75, 0.22, 5, 24, Math.PI), this.ribMat);
      rib.rotation.set(0, (i / 6) * Math.PI, Math.PI / 2);
      rib.scale.set(1.32, 1, 1);
      rib.raycast = () => {};
      this.group.add(rib);
    }
    // the cables it hangs from and the light-veins draining down into the Thornmaw
    this.veinMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dff7a).multiplyScalar(1.8) });
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 7, 1);
    const link = (a, b, r, m) => {
      const mesh = new THREE.Mesh(cyl, m);
      const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
      mesh.position.copy(A).add(Bv).multiplyScalar(0.5).sub(this.pos);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bv.clone().sub(A).normalize());
      mesh.scale.set(r, A.distanceTo(Bv), r);
      mesh.raycast = () => {};
      this.group.add(mesh);
    };
    for (const c of cables) {
      // thick bark cable with a thin light vein running along it
      link([this.pos.x, this.pos.y + 1.5, this.pos.z], c, 0.55, this.ribMat);
      link([this.pos.x, this.pos.y + 1.5, this.pos.z], [c[0], c[1] + 0.5, c[2]], 0.14, this.veinMat);
    }
    const base = this.pos.y - 3.2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      link([this.pos.x + Math.cos(a) * 0.8, base, this.pos.z + Math.sin(a) * 0.8], [this.pos.x + Math.cos(a) * 2.8, pos[1] - 12.3, this.pos.z + Math.sin(a) * 2.8], 0.06, this.veinMat);
    }
    // the shield: a hex-lattice bubble
    this.shieldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbfffd8).multiplyScalar(1.2), wireframe: true, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
    this.shieldFill = new THREE.MeshBasicMaterial({ color: 0x3dff7a, transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.shield = new THREE.Group();
    this.shield.add(new THREE.Mesh(new THREE.IcosahedronGeometry(4.6, 2), this.shieldMat), new THREE.Mesh(new THREE.IcosahedronGeometry(4.55, 3), this.shieldFill));
    tag(this.shield, 'shield');
    this.group.add(this.shield);
    this.light = W.addLight(0x3dff7a, 8, 26, 1.5);
    this.light.position.copy(this.pos);
    W.addHittable(this.group);
    this.reset();
    W.add(this);
  }

  reset() {
    this.state = 'shielded';
    this.dropIn = 0;
    this.hp = this.maxHp;
    this.t = 0;
    this.flash = 0;
    this.shield.visible = true;
    this.shield.scale.setScalar(1);
    this.paint(1);
  }

  // k: 1 alive .. 0 dark
  paint(k) {
    this.podMat.emissiveIntensity = 1.0 * k + this.flash * 1.5;
    this.podMat.emissive.set(0x3dff7a).lerp(new THREE.Color(0x203018), 1 - k);
    this.podMat.color.set(0x1a5a2a).lerp(new THREE.Color(0x2e2a20), 1 - k);
    this.veinMat.color.set(0x3dff7a).multiplyScalar(1.3 * k + 0.05);
    for (const f of this.fadeMats) f.mat.color.copy(f.from).multiplyScalar(Math.max(0.04, k));
    this.light.intensity = 8 * k;
  }

  dropShield() {
    if (this.state !== 'shielded') return;
    this.state = 'open';
    this.shield.visible = false;
    this.W.fx.burst(this.pos, 0xbfffd8, { count: 140, speed: 14, life: 1.2, size: 0.5, gravity: 2, mode: 'shard' });
    this.W.fx.ring(this.pos, null, 0x3dff7a, { size: 2, end: 14, life: 0.7 });
    audio.shieldBreak();
  }

  onHit(color, hit) {
    if (this.state === 'shielded') return hit.part === 'shield' ? 'shield' : 'world';
    if (this.state !== 'open') return 'world';
    if (color !== this.color) return 'immune';
    this.hp--;
    this.flash = 1;
    audio.bossCoreHit();
    this.W.fx.burst(hit.point, 0x3dff7a, { count: 10, speed: 5, life: 0.5, size: 0.4, gravity: 3 });
    if (this.hp <= 0) this.shutdown();
    return 'hit';
  }

  shutdown() {
    this.state = 'dying';
    this.t = 0;
    audio.sample('hydra_death', { gain: 0.8, rate: 0.6 }) || audio.bossPhase();
    this.game.player.shake = Math.max(this.game.player.shake, 0.6);
    this.game.hud.message('The Verdant Heart convulses — the jungle\'s stolen light drains away...', 4);
  }

  // dark for good (beaten earlier, or the world's engine was already shut down)
  setDead() {
    this.state = 'dead';
    this.dropIn = 0;
    this.shield.visible = false;
    this.flash = 0;
    this.paint(0);
    this.group.scale.set(0.9, 0.8, 0.9);
  }

  update(dt) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    if (this.dropIn > 0 && (this.dropIn -= dt) <= 0) {
      this.dropShield();
      this.game.hud.message(`The Verdant Heart's shield is down — shoot it with <b style="color:${COLORS[this.color].css}">${COLORS[this.color].name}</b> to shut down this world's engine!`, 7);
    }
    const fx = this.W.fx;
    if (this.state === 'shielded' || this.state === 'open') {
      const beat = Math.pow(Math.max(0, Math.sin(this.t * 2.6)), 6);
      this.group.scale.setScalar(1 + beat * 0.04);
      this.pod.rotation.y += dt * 0.15;
      this.shield.rotation.y -= dt * 0.2;
      this.shieldMat.opacity = 0.25 + 0.08 * Math.sin(this.t * 3);
      this.paint(this.state === 'open' ? 0.75 + beat * 0.25 + (this.hp / this.maxHp) * 0.1 : 1);
      // motes of life drifting up the cables into it
      if (Math.random() < dt * 6 && this.game.player.pos.distanceToSquared(this.pos) < 60 * 60) {
        const a = Math.random() * 6.28;
        fx.ember(new THREE.Vector3(this.pos.x + Math.cos(a) * 3, this.pos.y - 3, this.pos.z + Math.sin(a) * 3), 0, 1.5, 0, 0x7dff8a, 1.2, 0.12);
      }
    } else if (this.state === 'dying') {
      // it convulses, the light drains out of the roots and the arena's glow dies with it
      const T = this.t, k = Math.max(0, 1 - T / 3.6);
      const j = (1 - T / 4.2) * 0.12;
      this.group.scale.set(1 + (Math.random() - 0.5) * j, 1 + (Math.random() - 0.5) * j, 1 + (Math.random() - 0.5) * j);
      const flicker = Math.random() < 0.15 ? 0.4 : 1;
      this.paint(k * flicker);
      if (Math.random() < dt * 14) fx.burst(this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 4)), 0x7dff8a, { count: 12, speed: 4, life: 1.6 * k + 0.3, size: 0.35, gravity: 6 });
      if (T > 4.2) {
        this.setDead();
        fx.burst(this.pos, 0x3dff7a, { count: 160, speed: 9, life: 2.4, size: 0.4, gravity: 7 });
        fx.burst(this.pos, 0x6a6a50, { count: 40, speed: 4, life: 2.5, size: 2.2, gravity: -0.2, mode: 'puff' });
        audio.explode(true);
        this.game.player.shake = Math.max(this.game.player.shake, 0.8);
        this.onShutdown?.();
      }
    }
  }
}

export function buildVerdantArena(B, { center, size = 44, entry = 's', exit = 'n', colors = [0, 1, 2], reactorColor = GREEN, world: worldName = 'verdant', onDefeated = null } = {}) {
  const { W, game } = B;
  const [cx, cy, cz] = center;
  const H = size / 2;
  const TI = H - 6; // corner towers occupy |x|, |z| > TI
  const rand = mulberry32(44021);
  const R = (a, b) => a + (b - a) * rand();
  const doorSides = new Set([entry, exit]);

  // ---------------------------------------------------------------- materials (few: merged per material)
  const stoneTex = canvasTex(128, (g, s) => {
    g.fillStyle = '#6c705c';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const v = 70 + Math.random() * 60;
      g.fillStyle = `rgba(${v},${v + 6},${v - 10},0.12)`;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    // ashlar courses with offset joints
    g.fillStyle = 'rgba(20,24,16,0.75)';
    for (let r = 0; r < 4; r++) {
      g.fillRect(0, r * 32, s, 3);
      const off = r % 2 ? 0 : 32;
      for (let x = off; x < s + 64; x += 64) g.fillRect(x % s, r * 32, 3, 32);
    }
    // moss creeping down from the joints
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(${50 + Math.random() * 30},${100 + Math.random() * 50},${40 + Math.random() * 20},${0.35 + Math.random() * 0.35})`;
      const x = Math.random() * s, y = Math.floor(Math.random() * 4) * 32 + 2;
      g.fillRect(x, y, 3 + Math.random() * 10, 2 + Math.random() * 7);
    }
  });
  const floorTex = canvasTex(128, (g, s) => {
    g.fillStyle = '#5f6450';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 3000; i++) {
      const v = 60 + Math.random() * 60;
      g.fillStyle = `rgba(${v},${v + 4},${v - 8},0.12)`;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    // flagstones with grass in the cracks
    g.strokeStyle = 'rgba(40,80,30,0.9)';
    g.lineWidth = 3;
    for (const [x, y, w, h] of [[0, 0, 70, 50], [70, 0, 58, 64], [0, 50, 44, 78], [44, 50, 26, 40], [70, 64, 58, 64], [44, 90, 26, 38]]) g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${40 + Math.random() * 30},${90 + Math.random() * 50},${30 + Math.random() * 20},0.4)`;
      g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 6, 2 + Math.random() * 4);
    }
  });
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0xc0c8b0, roughness: 1 });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, color: 0xb4bca4, roughness: 1 });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x3c7028, roughness: 1, flatShading: true });
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x24501f, roughness: 1, flatShading: true });
  const thornMat = new THREE.MeshStandardMaterial({ color: 0xd8cfa8, roughness: 0.6, flatShading: true });
  const GLOW = new THREE.Color(0x3dff7a).multiplyScalar(1.05), CAP = new THREE.Color(0x5dffc8).multiplyScalar(1.0);
  const glowMat = new THREE.MeshBasicMaterial({ color: GLOW.clone() }); // glyphs and the floor's light-veins
  const capMat = new THREE.MeshBasicMaterial({ color: CAP.clone() }); // glowing mushrooms
  const lists = new Map([[stoneMat, []], [floorMat, []], [mossMat, []], [vineMat, []], [thornMat, []], [glowMat, []], [capMat, []]]);
  const put = (m, geo, x, y, z) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.translate(x, y, z);
    lists.get(m).push(g);
  };

  // ---------------------------------------------------------------- local-space helpers (relative to center)
  const box = (m, x1, y1, z1, x2, y2, z2, { solid = true, kind = 'rock', hazard = null, uv = 0.25 } = {}) => {
    const ax = Math.min(x1, x2), bx = Math.max(x1, x2), ay = Math.min(y1, y2), by = Math.max(y1, y2), az = Math.min(z1, z2), bz = Math.max(z1, z2);
    if (bx - ax < 0.001 || by - ay < 0.001 || bz - az < 0.001) return null;
    put(m, boxGeo(bx - ax, by - ay, bz - az, uv), cx + (ax + bx) / 2, cy + (ay + by) / 2, cz + (az + bz) / 2);
    if (!solid) return null;
    return W.addSolid(new THREE.Vector3(cx + ax, cy + ay, cz + az), new THREE.Vector3(cx + bx, cy + by, cz + bz), { static: true, kind, hazard });
  };
  // a box given in a wall side's frame: a = along the wall, d = depth outward from the center
  const sideXZ = (side, a, d) => (side === 's' ? [a, d] : side === 'n' ? [a, -d] : side === 'e' ? [d, a] : [-d, a]);
  const sideBox = (side, m, a1, a2, d1, d2, y1, y2, opts) => {
    const [x1, z1] = sideXZ(side, a1, d1), [x2, z2] = sideXZ(side, a2, d2);
    return box(m, x1, y1, z1, x2, y2, z2, opts);
  };
  const worldOf = (side, a, d, y = 0) => {
    const [x, z] = sideXZ(side, a, d);
    return [cx + x, cy + y, cz + z];
  };

  // ---------------------------------------------------------------- floor ring, moat and island
  const FB = -2.6; // everything solid reaches down to here
  box(floorMat, -H, FB, -H, H, 0, -MOAT_OUT, { uv: 0.22 });
  box(floorMat, -H, FB, MOAT_OUT, H, 0, H, { uv: 0.22 });
  box(floorMat, -H, FB, -MOAT_OUT, -MOAT_OUT, 0, MOAT_OUT, { uv: 0.22 });
  box(floorMat, MOAT_OUT, FB, -MOAT_OUT, H, 0, MOAT_OUT, { uv: 0.22 });
  // a mossy lip around the moat with a glowing carved rim
  for (const s of ['n', 's', 'e', 'w']) {
    sideBox(s, stoneMat, -MOAT_OUT - 0.6, MOAT_OUT + 0.6, MOAT_OUT, MOAT_OUT + 0.6, 0, 0.22, { kind: 'rock' });
    sideBox(s, glowMat, -MOAT_OUT, MOAT_OUT, MOAT_OUT - 0.02, MOAT_OUT + 0.02, -0.25, -0.15, { solid: false });
  }
  // the sludge (Verdant's toxic liquid look, with the usual hazard)
  const acid = (x1, z1, x2, z2) => W.box(cx + x1, cy + FB, cz + z1, cx + x2, cy - 0.6, cz + z2, 'acid', 'green', { hazard: 'acid' });
  acid(-MOAT_OUT, -MOAT_OUT, MOAT_OUT, -MOAT_IN);
  acid(-MOAT_OUT, MOAT_IN, MOAT_OUT, MOAT_OUT);
  acid(-MOAT_OUT, -MOAT_IN, -MOAT_IN, MOAT_IN);
  acid(MOAT_IN, -MOAT_IN, MOAT_OUT, MOAT_IN);
  // the island, ringed with a bramble hedge (thorns kill: nobody stands next to the bulb)
  box(stoneMat, -MOAT_IN, FB, -MOAT_IN, MOAT_IN, 0.3, MOAT_IN);
  box(mossMat, -MOAT_IN + 0.1, 0.3, -MOAT_IN + 0.1, MOAT_IN - 0.1, 0.36, MOAT_IN - 0.1, { solid: false });
  const BR = 0.95;
  for (const s of ['n', 's', 'e', 'w']) sideBox(s, vineMat, -MOAT_IN, MOAT_IN, MOAT_IN - BR, MOAT_IN, 0.3, 0.9, { solid: false });
  for (const [x1, z1, x2, z2] of [[-MOAT_IN, -MOAT_IN, MOAT_IN, -MOAT_IN + BR], [-MOAT_IN, MOAT_IN - BR, MOAT_IN, MOAT_IN], [-MOAT_IN, -MOAT_IN + BR, -MOAT_IN + BR, MOAT_IN - BR], [MOAT_IN - BR, -MOAT_IN + BR, MOAT_IN, MOAT_IN - BR]])
    W.addSolid(new THREE.Vector3(cx + x1, cy + 0.3, cz + z1), new THREE.Vector3(cx + x2, cy + 1.5, cz + z2), { static: true, hazard: 'spike', kind: 'grass' });
  const thorn = new THREE.ConeGeometry(0.13, 0.9, 5);
  for (let i = 0; i < 120; i++) {
    const t = rand() * 4, u = R(-MOAT_IN, MOAT_IN), w = R(MOAT_IN - BR, MOAT_IN);
    const [x, z] = t < 1 ? [u, w] : t < 2 ? [u, -w] : t < 3 ? [w, u] : [-w, u];
    const g = thorn.clone();
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.sign(x) * (Math.abs(x) > Math.abs(z) ? 1 : 0) + R(-0.4, 0.4), R(0.5, 1.4), Math.sign(z) * (Math.abs(z) >= Math.abs(x) ? 1 : 0) + R(-0.4, 0.4)).normalize()));
    put(thornMat, g, cx + x, cy + R(0.6, 1.1), cz + z);
    if (i % 3 === 0) put(vineMat, new THREE.IcosahedronGeometry(R(0.35, 0.6), 0), cx + x, cy + R(0.7, 1.0), cz + z);
  }

  // ---------------------------------------------------------------- walls
  for (const s of ['n', 's', 'e', 'w']) {
    const door = doorSides.has(s);
    const A1 = -H - WT, A2 = H + WT;
    if (door) {
      sideBox(s, stoneMat, A1, -DOOR_W / 2, H, H + WT, 0, WH);
      sideBox(s, stoneMat, DOOR_W / 2, A2, H, H + WT, 0, WH);
      sideBox(s, stoneMat, -DOOR_W / 2, DOOR_W / 2, H, H + WT, DOOR_H, WH);
      // a carved portal: flanking pillars and a lintel with a glyph band (inner face)
      for (const a of [-1, 1]) sideBox(s, stoneMat, a * (DOOR_W / 2), a * (DOOR_W / 2 + 1.1), H - 0.6, H, 0, DOOR_H + 1.2);
      sideBox(s, stoneMat, -DOOR_W / 2 - 1.3, DOOR_W / 2 + 1.3, H - 0.7, H, DOOR_H, DOOR_H + 1.4);
      sideBox(s, glowMat, -DOOR_W / 2 - 1.0, DOOR_W / 2 + 1.0, H - 0.72, H - 0.68, DOOR_H + 0.6, DOOR_H + 0.75, { solid: false });
    } else sideBox(s, stoneMat, A1, A2, H, H + WT, 0, WH);
    // pilasters, a glyph band, ragged crenellations and hanging vines
    for (const a of [-11, -6.5, 6.5, 11]) {
      if (door && Math.abs(a) < 4) continue;
      sideBox(s, stoneMat, a - 0.6, a + 0.6, H - 0.45, H, 0, WH - 0.6);
      sideBox(s, stoneMat, a - 0.8, a + 0.8, H - 0.6, H, WH - 1.4, WH - 0.6);
    }
    const bands = door ? [[-TI, -DOOR_W / 2 - 1.4], [DOOR_W / 2 + 1.4, TI]] : [[-TI, TI]];
    for (const [a1, a2] of bands) sideBox(s, glowMat, a1, a2, H - 0.05, H + 0.02, 6.2, 6.32, { solid: false });
    for (let a = A1; a < A2 - 0.5; ) {
      const w = R(1.2, 2.6), hgt = R(0.4, 1.8);
      if (rand() > 0.25) sideBox(s, stoneMat, a, Math.min(A2, a + w), H, H + WT, WH, WH + hgt, { solid: false });
      a += w + R(0.1, 0.9);
    }
    for (let i = 0; i < 22; i++) {
      const a = R(-H + 0.5, H - 0.5);
      if (door && Math.abs(a) < DOOR_W / 2 + 0.3) continue;
      const len = R(1.5, 6.5);
      sideBox(s, vineMat, a - 0.05, a + 0.05, H - 0.12, H - 0.02, WH - len, WH + 0.2, { solid: false });
    }
    // the courtyard is open-air: nobody climbs out over the wall tops
    const [x1, z1] = sideXZ(s, A1, H), [x2, z2] = sideXZ(s, A2, H + WT);
    B.blocker([cx + Math.min(x1, x2), cy + WH - 2, cz + Math.min(z1, z2)], [cx + Math.max(x1, x2), cy + 45, cz + Math.max(z1, z2)]);
  }
  // a lid on top so jump-pad arcs can't sail over the wall line
  B.blocker([cx - H - WT, cy + 40, cz - H - WT], [cx + H + WT, cy + 41, cz + H + WT]);

  // ---------------------------------------------------------------- corner towers (ruined, mossy)
  const columnTops = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x1 = sx * TI, x2 = sx * H, z1 = sz * TI, z2 = sz * H;
      box(stoneMat, x1, 0, z1, x2, TOWER_TOP - 0.15, z2);
      box(mossMat, x1 - sx * 0.05, TOWER_TOP - 0.15, z1 - sz * 0.05, x2, TOWER_TOP, z2, { kind: 'grass' });
      // stepped plinth course, a carved glyph band and a broken column at the outer corner
      box(stoneMat, x1 - sx * 0.35, 0, z1 - sz * 0.35, x2, 0.8, z2);
      box(glowMat, x1 - sx * 0.03, 2.2, z1 - sz * 0.03, x2, 2.32, z2, { solid: false });
      const kx = sx * (H - 1.4), kz = sz * (H - 1.4), ch = R(6.5, 9);
      box(stoneMat, kx - 0.8, TOWER_TOP, kz - 0.8, kx + 0.8, TOWER_TOP + ch, kz + 0.8);
      box(stoneMat, kx - 1.05, TOWER_TOP + ch - 0.4, kz - 1.05, kx + 1.05, TOWER_TOP + ch, kz + 1.05);
      columnTops.push([cx + kx, cy + TOWER_TOP + ch, cz + kz]);
      // fallen blocks on top (cover from nothing, but they read as ruins) and vines down the inner faces
      box(stoneMat, sx * (TI + 1.2), TOWER_TOP, sz * (TI + 3.2), sx * (TI + 2.4), TOWER_TOP + 0.7, sz * (TI + 4.4));
      for (let i = 0; i < 8; i++) {
        const along = R(TI + 0.3, H - 0.3), len = R(1, 3.5);
        if (i % 2) box(vineMat, sx * along - 0.05, TOWER_TOP - len, sz * TI - sz * 0.06 - 0.03, sx * along + 0.05, TOWER_TOP, sz * TI - sz * 0.06 + 0.03, { solid: false });
        else box(vineMat, sx * TI - sx * 0.06 - 0.03, TOWER_TOP - len, sz * along - 0.05, sx * TI - sx * 0.06 + 0.03, TOWER_TOP, sz * along + 0.05, { solid: false });
      }
      // jump pad up onto the tower (from the floor beside the wall), and a dodge pad in the floor ring
      new JumpPad(W, { pos: [cx + sx * (TI - 4.5), cy, cz + sz * (H - 2.6)], power: 15, push: [sx * 8, 0, 0], color: 0x7dff8a });
      new JumpPad(W, { pos: [cx + sx * 12.6, cy, cz + sz * 12.6], power: 17, color: 0x7dff8a });
    }

  // ---------------------------------------------------------------- floor dressing
  // moss patches, light-veins creeping in from the walls toward the moat (they die with the Heart),
  // glowing mushrooms along the wall bases
  for (let i = 0; i < 40; i++) {
    const x = R(-H + 1, H - 1), z = R(-H + 1, H - 1);
    if (Math.max(Math.abs(x), Math.abs(z)) < MOAT_OUT + 1) continue;
    if (Math.abs(x) > TI && Math.abs(z) > TI) continue;
    box(mossMat, x - R(0.4, 1.6), 0, z - R(0.4, 1.6), x + R(0.4, 1.6), 0.025, z + R(0.4, 1.6), { solid: false });
  }
  for (const s of ['n', 's', 'e', 'w'])
    for (const a0 of [-8.5, 3.5, 12.5]) {
      let a = a0 + R(-1, 1), d = H - 0.3;
      while (d > MOAT_OUT + 0.6) {
        const nd = Math.max(MOAT_OUT + 0.6, d - R(1.2, 2.6)), na = a + R(-1.3, 1.3);
        const [x1, z1] = sideXZ(s, a, d), [x2, z2] = sideXZ(s, na, nd);
        const len = Math.hypot(x2 - x1, z2 - z1);
        const g = new THREE.BoxGeometry(0.09, 0.04, len);
        g.rotateY(Math.atan2(x2 - x1, z2 - z1));
        put(glowMat, g, cx + (x1 + x2) / 2, cy + 0.03, cz + (z1 + z2) / 2);
        a = na;
        d = nd;
      }
    }
  const shroomStalk = new THREE.CylinderGeometry(0.05, 0.08, 0.5, 5), shroomCap = new THREE.SphereGeometry(0.3, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  for (let i = 0; i < 60; i++) {
    const s = ['n', 's', 'e', 'w'][i % 4], a = R(-TI + 0.5, TI - 0.5), d = R(H - 1.2, H - 0.3), k = R(0.5, 1.3);
    if (doorSides.has(s) && Math.abs(a) < DOOR_W / 2 + 1.4) continue;
    const [x, z] = sideXZ(s, a, d);
    put(vineMat, shroomStalk.clone().scale(k, k, k), cx + x, cy + 0.25 * k, cz + z);
    put(capMat, shroomCap.clone().scale(k, k, k), cx + x, cy + 0.48 * k, cz + z);
  }

  // ---------------------------------------------------------------- entry vestibule and the gates
  const vest = (side) => {
    const d1 = H + WT, d2 = H + WT + VEST;
    sideBox(side, floorMat, -1.5 - 0.5, 1.5 + 0.5, d1, d2, -1, 0);
    sideBox(side, stoneMat, -1.5 - 0.5, -1.5, d1, d2, 0, DOOR_H + 0.5);
    sideBox(side, stoneMat, 1.5, 1.5 + 0.5, d1, d2, 0, DOOR_H + 0.5);
    sideBox(side, stoneMat, -2, 2, d1, d2, DOOR_H, DOOR_H + 0.5);
    for (const a of [-1.5, 1.5]) sideBox(side, glowMat, a - 0.03, a + 0.03, d1, d2, 0.02, 0.1, { solid: false });
    for (let i = 0; i < 6; i++) {
      const a = R(-1.4, 1.4), d = d1 + R(0.5, VEST - 0.5);
      sideBox(side, vineMat, a - 0.04, a + 0.04, d, d + 0.08, DOOR_H - R(0.4, 1.4), DOOR_H, { solid: false });
    }
  };
  vest(entry);
  const gate = (side) => {
    const [x1, z1] = sideXZ(side, -DOOR_W / 2, H + 0.1), [x2, z2] = sideXZ(side, DOOR_W / 2, H + WT - 0.1);
    return new Gate(W, { min: [cx + Math.min(x1, x2), cy, cz + Math.min(z1, z2)], max: [cx + Math.max(x1, x2), cy + DOOR_H, cz + Math.max(z1, z2)], mat: stoneMat });
  };
  const entryGate = gate(entry), exitGate = gate(exit);
  const yawFacing = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }; // looking into the courtyard
  const cpPos = worldOf(entry, 0, H + WT + 3.5);
  new Checkpoint(W, game, { pos: cpPos, yaw: yawFacing[entry], size: [3, 3, 2], name: 'THE VERDANT HEART' });

  // ---------------------------------------------------------------- merge the dressing
  for (const [m, geos] of lists) {
    if (!geos.length) continue;
    const merged = mergeAll(geos);
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, m);
    mesh.matrixAutoUpdate = false;
    W.scene.add(mesh);
  }
  B.light(cx, cy + 1.2, cz, 0x5dff6a, 6, 22); // the moat's glow

  // ---------------------------------------------------------------- the boss and the power source
  let heart = null;
  const boss = new Thornmaw(W, game, {
    center: new THREE.Vector3(cx, cy, cz), colors, half: H, moatOut: MOAT_OUT, towerIn: TI,
    onDefeated: () => {
      // the guardian has fallen: its charge's shield drops and the Heart is open to the shutdown
      game.setMusic('music_green');
      game.hud.zoneTitle('THE THORNMAW', 'WITHERED', '#3dff7a');
      game.guardianBeaten?.(worldName);
      entryGate.set(false); // the way back stays open; the exit waits for the Heart
      heart.dropIn = 1.8; // (game time) then the shield shatters
    },
  });
  const glows = [glowMat, capMat].map((mat) => ({ mat, from: mat.color.clone() }));
  heart = new VerdantHeart(W, game, {
    pos: [cx, cy + 17.5, cz],
    color: reactorColor,
    cables: columnTops,
    fadeMats: glows,
    onShutdown: () => {
      game.shutDownWorld?.(worldName);
      powerDown();
      game.hud.zoneTitle('EMERALD HOLLOW', 'ENGINE SHUT DOWN', '#3dff7a', 4);
      onDefeated?.();
    },
  });

  let isDown = false;
  function powerDown() {
    isDown = true;
    entryGate.set(false);
    exitGate.set(false);
  }
  // already shut down (a save): no boss, a dead Heart, open gates
  function applyDown() {
    if (!boss.defeated) boss.setDefeated();
    heart.setDead();
    isDown = true;
    entryGate.set(false, true);
    exitGate.set(false, true);
  }

  function reset() {
    if (isDown || game.isWorldDown?.(worldName)) return applyDown();
    if (boss.defeated) return entryGate.set(false, true); // beaten, Heart still running: the exit waits for it
    boss.stop();
    heart.reset();
    entryGate.set(false, true);
    exitGate.set(true, true);
    if (game.musicTrack === 'music_miniboss') game.setMusic('music_green');
  }
  exitGate.set(true, true);
  if (game.isWorldDown?.(worldName)) applyDown();
  // the save is restored after the level is built, so look again once the game is running
  W.add({ update: () => !isDown && game.isWorldDown?.(worldName) && applyDown() });
  B.onRespawn(reset);

  // walking in seals the gates and wakes it
  const start = () => {
    if (boss.state !== 'dormant' || isDown || game.isWorldDown?.(worldName)) return;
    entryGate.set(true);
    exitGate.set(true);
    game.setMusic('music_miniboss');
    game.hud.zoneTitle('GUARDIAN OF THE VERDANT HEART', 'THE THORNMAW', '#3dff7a');
    boss.start();
  };
  const [ia, ib] = [worldOf(entry, -4, H - 7, 0), worldOf(entry, 4, H - 1.5, 4)];
  W.trigger([Math.min(ia[0], ib[0]), cy, Math.min(ia[2], ib[2])], [Math.max(ia[0], ib[0]), cy + 4, Math.max(ia[2], ib[2])], start, { once: false });
  // fetch the fight's sounds on the way in
  const [va, vb] = [worldOf(entry, -1.5, H + WT, 0), worldOf(entry, 1.5, H + WT + VEST, 0)];
  W.trigger([Math.min(va[0], vb[0]), cy, Math.min(va[2], vb[2])], [Math.max(va[0], vb[0]), cy + 3, Math.max(va[2], vb[2])], () => audio.prefetch(THORNMAW_SOUNDS));

  return {
    boss,
    heart,
    entryPos: worldOf(entry, 0, H + WT + VEST),
    exitPos: worldOf(exit, 0, H + WT),
    checkpoint: cpPos,
    reset,
    setDefeated: applyDown,
  };
}

// Merge non-indexed geometries (position/normal/uv) into one.
function mergeAll(geos) {
  const total = geos.reduce((n, g) => n + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]]) {
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of geos) {
      const a = g.attributes[name];
      if (a) arr.set(a.array, o);
      o += g.attributes.position.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}
