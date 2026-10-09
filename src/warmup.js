// Shader warm-up in the background. A cold start used to compile every program in the game before the
// first frame (~230 of them, most of the wait); now the first frames compile only what they draw (the
// title's view, the Continue preview, the spot you start at) and this queue compiles everything else
// behind the title screen: every material in the scene (hidden and culled ones included), the view
// model, and one of each enemy the arenas will summon (staged at startup, then taken straight back out).
//
// Nearest the player first, a few programs at a time. Each batch is fenced (or, with
// KHR_parallel_shader_compile, polled) before the next goes out, so the GPU never has more than one
// batch to link: a frame never waits behind a long queue of links, and by the time anything is first
// drawn its program is ready. Programs are compiled against the composer's buffer, not the canvas (the
// output color space and tone mapping differ, so canvas programs would leave the real ones to compile on
// first sight).
const DRAWABLE = (o) => o.isMesh || o.isPoints || o.isLine || o.isSprite;
const BATCH = 4; // objects per renderer.compile call (each call walks the scene's lights once)

// what else (besides the material) makes three build a different program for an object
function variant(o) {
  const g = o.geometry, a = g?.attributes || {}, morph = g?.morphAttributes || {};
  let k = (o.isInstancedMesh ? 'I' + (o.instanceColor ? 'c' : '') + (o.morphTexture ? 'm' : '') : '') + (o.isBatchedMesh ? 'B' : '') + (o.isSkinnedMesh ? 'S' : '') + (o.isPoints ? 'P' : '') + (o.isLine ? 'L' : '') + (o.isSprite ? 's' : '');
  for (const n in a) k += ',' + n + a[n].itemSize;
  for (const n in morph) k += ',m' + n + morph[n].length;
  return k;
}

export class Warmup {
  // target(): the render target the programs are for (the composer's buffer)
  constructor(renderer, target) {
    this.renderer = renderer;
    this.target = target;
    this.jobs = []; // { o, camera, scene, d }
    this.seen = new Set();
    this.i = 0;
    this.pending = null; // the batch in flight: a fence, or (parallel compile) its programs
    this.parallel = renderer.extensions.has('KHR_parallel_shader_compile');
    this.gl = renderer.getContext();
    this.t0 = performance.now();
    this.made = 0;
  }

  // Queue every drawable under root, compiled as part of `scene` (its lights, fog and environment) for
  // `camera`, ordered by distance from `focus` (null: before everything else).
  add(root, camera, scene, focus) {
    root.updateMatrixWorld(true);
    const c = { x: 0, y: 0, z: 0 };
    root.traverse((o) => {
      if (!DRAWABLE(o) || !o.material) return;
      const v = variant(o);
      let fresh = false;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        const k = m.id + v;
        if (!this.seen.has(k)) {
          this.seen.add(k);
          fresh = true;
        }
      }
      if (!fresh) return;
      let d = -1;
      if (focus) {
        const e = o.matrixWorld.elements, s = o.geometry?.boundingSphere;
        c.x = e[12];
        c.y = e[13];
        c.z = e[14];
        if (s) {
          const { x, y, z } = s.center;
          c.x += e[0] * x + e[4] * y + e[8] * z;
          c.y += e[1] * x + e[5] * y + e[9] * z;
          c.z += e[2] * x + e[6] * y + e[10] * z;
        }
        d = Math.hypot(c.x - focus.x, c.y - focus.y, c.z - focus.z) - (s ? s.radius : 0);
      }
      this.jobs.push({ o, camera, scene, d });
    });
  }

  // after the last add: nearest first
  start() {
    this.jobs.sort((a, b) => a.d - b.d);
  }

  get done() {
    return this.i >= this.jobs.length && !this.pending;
  }

  // Send the next batch (up to `budget` new programs) once the last one has linked. Returns false when
  // everything is compiled.
  step(budget) {
    if (this.pending) {
      if (!this.settled()) return true;
      this.pending = null;
    }
    if (this.i >= this.jobs.length) {
      if (this.jobs.length) {
        this.stats = { programs: this.made, objects: this.jobs.length, ms: Math.round(performance.now() - this.t0) };
        this.jobs = []; // (lets the staged enemies go)
        this.seen.clear();
      }
      return false;
    }
    const r = this.renderer, list = r.info.programs, before = list.length, t0 = performance.now();
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.target());
    const batch = [];
    const proxy = { traverse: (fn) => batch.forEach(fn), traverseVisible() {} };
    while (this.i < this.jobs.length && list.length - before < budget && performance.now() - t0 < 8) {
      const first = this.jobs[this.i];
      batch.length = 0;
      while (this.i < this.jobs.length && batch.length < BATCH && this.jobs[this.i].scene === first.scene) batch.push(this.jobs[this.i++].o);
      r.compile(proxy, first.camera, first.scene);
    }
    r.setRenderTarget(prev);
    const made = list.slice(before);
    this.made += made.length;
    if (made.length) this.pending = this.parallel ? made : this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    return true;
  }

  settled() {
    if (this.parallel) return this.pending.every((p) => p.isReady());
    const gl = this.gl;
    if (gl.getSyncParameter(this.pending, gl.SYNC_STATUS) !== gl.SIGNALED) return false;
    gl.deleteSync(this.pending);
    return true;
  }
}

