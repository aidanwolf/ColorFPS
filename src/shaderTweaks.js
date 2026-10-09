// Shader chunk tweaks that make every lit program cheaper to compile without changing what it draws.
// Imported by main.js before anything is compiled.
import * as THREE from 'three';

// Point lights: three unrolls its point-light loop, so every lit program carried a copy of the point-light
// code per light (ten: world.js keeps a pool of ten real lights). A plain loop instead does the same math
// in a program a fraction of the size, which links (and, in software GL, JITs) much faster. Unrolling is
// only needed for the per-light shadow-map lookup, and this game has no shadow maps.
{
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  const head = '#pragma unroll_loop_start\n\tfor ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {';
  const a = chunk.indexOf(head);
  const b = chunk.indexOf('#pragma unroll_loop_end', a);
  const shadow = /\t\t#if defined\( USE_SHADOWMAP \) && \( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS \)[\s\S]*?#endif\n/;
  const body = a < 0 || b < 0 ? '' : chunk.slice(a + '#pragma unroll_loop_start\n'.length, b);
  if (body && shadow.test(body)) {
    THREE.ShaderChunk.lights_fragment_begin = chunk.slice(0, a) + body.replace(shadow, '') + chunk.slice(b + '#pragma unroll_loop_end'.length);
  } else console.warn('[chroma] lights_fragment_begin changed: point lights left unrolled');
}
