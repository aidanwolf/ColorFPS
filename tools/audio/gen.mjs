// Generates the game's music and sound effects with ElevenLabs into public/audio/.
// Usage: ELEVENLABS_API_KEY=... node tools/audio/gen.mjs [name,name,...]
// Existing files are skipped, so it's safe to re-run. The key is read from the environment only.
// Behind an HTTP proxy, add NODE_USE_ENV_PROXY=1 (and NODE_EXTRA_CA_CERTS if the proxy needs a CA).
import fs from 'node:fs';
const KEY = process.env.ELEVENLABS_API_KEY;
const OUT = new URL('../../public/audio', import.meta.url).pathname;
const ONLY = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
fs.mkdirSync(OUT, { recursive: true });
if (!KEY) throw new Error('ELEVENLABS_API_KEY not set');
const SFX = JSON.parse(fs.readFileSync(new URL('./sfx.json', import.meta.url)));
const MUSIC = JSON.parse(fs.readFileSync(new URL('./music.json', import.meta.url)));

async function post(url, body) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const txt = (await res.text()).slice(0, 300);
    if (res.status === 429 || res.status >= 500) { console.log(`  retry ${attempt} (${res.status}) ${txt}`); await new Promise((r) => setTimeout(r, 4000 * attempt)); continue; }
    throw new Error(`${res.status} ${txt}`);
  }
  throw new Error('failed after retries');
}

const jobs = [];
for (const [name, s] of Object.entries(SFX)) jobs.push({ name, kind: 'sfx', run: () => post('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', { text: s.text, duration_seconds: s.dur, prompt_influence: s.influence ?? 0.5, loop: !!s.loop }) });
for (const [name, m] of Object.entries(MUSIC)) jobs.push({ name, kind: 'music', run: () => post('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', { prompt: m.prompt, music_length_ms: m.ms, model_id: 'music_v1', force_instrumental: true }) });

const todo = jobs.filter((j) => (!ONLY || ONLY.has(j.name)) && !fs.existsSync(`${OUT}/${j.name}.mp3`));
console.log(`${todo.length} to generate`);
let i = 0, failed = 0;
async function worker() {
  while (i < todo.length) {
    const j = todo[i++];
    const t0 = Date.now();
    try {
      const buf = await j.run();
      fs.writeFileSync(`${OUT}/${j.name}.mp3`, buf);
      console.log(`ok   ${j.kind.padEnd(5)} ${j.name.padEnd(16)} ${(buf.length / 1024).toFixed(0)}KB ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e) { failed++; console.log(`FAIL ${j.kind.padEnd(5)} ${j.name.padEnd(16)} ${e.message}`); }
  }
}
await Promise.all([worker(), worker(), worker()]);
console.log(`done, ${failed} failed`);
