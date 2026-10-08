// A floating audio log: a battered handheld field recorder projecting a slowly turning hologram of its
// waveform, with a faint beam of light above it so it can be spotted from across a room. Walk into it to
// pick it up; it plays at once (see story/recorder.js) and is gone for good (remembered across reloads).
import * as THREE from 'three';

const HOLO = 0x8fe6ff; // the hologram's pale cyan, distinct from the color cores and prism trophies
const BARS = 28;
const HOVER = 1.15; // device height above the floor point it's placed on
let shared = null;

// geometry and materials every log shares (one set, however many logs are placed)
function assets() {
  if (shared) return shared;
  const holo = (opacity) => new THREE.MeshBasicMaterial({ color: new THREE.Color(HOLO).multiplyScalar(1.15), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  // a soft round glow for the halo billboard
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.25, 'rgba(160,235,255,0.35)');
  grad.addColorStop(1, 'rgba(120,220,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const beamGeo = new THREE.CylinderGeometry(0.035, 0.035, 3.2, 8, 1, true).translate(0, 1.6 + 0.55, 0);
  shared = {
    body: new THREE.MeshStandardMaterial({ color: 0x2b2e38, metalness: 0.7, roughness: 0.38 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x8a6f4a, metalness: 0.8, roughness: 0.3 }), // worn brass corners
    screen: new THREE.MeshBasicMaterial({ color: new THREE.Color(HOLO).multiplyScalar(1.3) }),
    rec: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3a3a).multiplyScalar(2) }),
    bar: holo(0.6),
    ring: holo(0.45),
    cone: holo(0.07),
    beam: holo(0.1),
    halo: new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: HOLO, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
    beamGeo,
    barGeo: new THREE.BoxGeometry(0.022, 1, 0.022).translate(0, 0.5, 0),
  };
  return shared;
}

export class AudioLog {
  // pos: the floor point it hovers over
  constructor(world, game, { id, pos }) {
    this.world = world;
    this.game = game;
    this.id = id;
    this.pos = new THREE.Vector3(pos[0], pos[1] + HOVER, pos[2]);
    this.t = Math.random() * 10;
    const A = assets();
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.bob = new THREE.Group();
    this.group.add(this.bob);

    // the recorder: a chunky handheld, tipped back, with a screen, speaker slots, a REC light and an aerial
    const dev = (this.device = new THREE.Group());
    const box = (w, h, d, m, x = 0, y = 0, z = 0) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      dev.add(b);
      return b;
    };
    box(0.3, 0.19, 0.075, A.body);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) box(0.04, 0.04, 0.085, A.trim, sx * 0.135, sy * 0.08, 0);
    box(0.15, 0.06, 0.01, A.screen, -0.04, 0.035, 0.04);
    for (let i = 0; i < 4; i++) box(0.05, 0.008, 0.01, A.trim, 0.085, 0.05 - i * 0.022, 0.04);
    this.recLight = box(0.018, 0.018, 0.01, A.rec, 0.115, -0.065, 0.04);
    const aerial = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 5), A.trim);
    aerial.position.set(-0.12, 0.17, 0);
    dev.add(aerial);
    dev.rotation.x = -0.35;
    this.bob.add(dev);

    // the hologram: a turning ring of waveform bars above the device, fed by a faint cone of light
    const holo = (this.holo = new THREE.Group());
    holo.position.y = 0.42;
    this.bars = new THREE.InstancedMesh(A.barGeo, A.bar, BARS);
    this.bars.frustumCulled = false;
    holo.add(this.bars);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.006, 4, 48), A.ring);
    ring.rotation.x = Math.PI / 2;
    const ring2 = ring.clone();
    ring2.position.y = 0.36;
    ring2.scale.setScalar(0.8);
    holo.add(ring, ring2);
    this.bob.add(holo);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.03, 0.34, 20, 1, true), A.cone);
    cone.position.y = 0.25;
    this.bob.add(cone);
    this.halo = new THREE.Sprite(A.halo);
    this.halo.scale.setScalar(0.95);
    this.halo.position.y = 0.3;
    this.bob.add(this.halo);
    // a hair-thin beacon of light straight up, so it reads from far off (and keeps it out of size culling)
    this.group.add(new THREE.Mesh(A.beamGeo, A.beam));

    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.animate(0);
    world.scene.add(this.group);
    world.add(this);
  }

  animate(dt) {
    this.t += dt;
    const t = this.t;
    this.bob.position.y = Math.sin(t * 1.6) * 0.07;
    this.bob.rotation.y += dt * 0.5;
    this.holo.rotation.y -= dt * 0.9;
    this.recLight.visible = t % 1.4 < 0.8;
    this.halo.material.opacity = 0.32 + Math.sin(t * 2.3) * 0.08;
    // a speech-like waveform: a few traveling sines, gated in and out like phrases
    const gate = 0.55 + 0.45 * Math.sin(t * 0.9) * Math.sin(t * 2.1 + 1);
    for (let i = 0; i < BARS; i++) {
      const a = (i / BARS) * Math.PI * 2;
      const h = 0.04 + gate * Math.abs(Math.sin(a * 3 + t * 5) * 0.16 + Math.sin(a * 7 - t * 8.5) * 0.09 + Math.sin(a * 2 + t * 2.6) * 0.07);
      this.v.set(Math.cos(a) * 0.26, 0.18 - h / 2, Math.sin(a) * 0.26);
      this.m4.compose(this.v, this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -a), this.s.set(1, h, 1));
      this.bars.setMatrixAt(i, this.m4);
    }
    this.bars.instanceMatrix.needsUpdate = true;
  }

  update(dt, player) {
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 1600) this.animate(dt); // only animate it when you could see it
    const dy = player.pos.y + 0.9 - this.pos.y;
    if (d2 < 1.3 && Math.abs(dy) < 1.4) this.collect();
  }

  collect() {
    this.group.visible = false;
    this.world.remove(this);
    const fx = this.world.fx;
    fx.flash(this.pos, HOLO, { size: 1.0, life: 0.2, k: 1.3, hot: 0.6 });
    fx.ring(this.pos, null, HOLO, { size: 0.25, end: 1.8, life: 0.45, thick: 0.08, k: 1.5 });
    fx.sparks(this.pos, THREE.Object3D.DEFAULT_UP, HOLO, { count: 14, speed: 6, spread: 3, life: 0.5, gravity: 2 });
    this.game.recorder.collect(this.id);
  }
}
