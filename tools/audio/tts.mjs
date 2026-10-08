// Voices Wren Ashby's audio logs (tools/audio/logs.json) with ElevenLabs text-to-speech into
// public/audio/memo_XX.mp3, and writes src/story/logdata.json for the game: each log's title, duration and
// caption lines, timed from the character alignment ElevenLabs returns with the audio.
//
// Usage: ELEVENLABS_API_KEY=... node tools/audio/tts.mjs [01,02,...] [--force] [--profile steady]
//        node tools/audio/tts.mjs --captions      (no key, no audio: estimated caption timing only)
//
// The script lines carry inline audio tags like [laughs] or [whispers]. A profile with "tags": true sends
// them to the model to act; any other profile strips them. Captions never show them.
// If the model returns no timestamps (or the with-timestamps endpoint refuses it), the plain endpoint is
// used and the captions are paced evenly over the clip by length.
// Logs whose mp3 exists and whose spoken text + profile haven't changed are skipped. The key is read from
// the environment only. Behind an HTTP proxy, add NODE_USE_ENV_PROXY=1 (and NODE_EXTRA_CA_CERTS if needed).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = new URL('../../public/audio', import.meta.url).pathname;
const DATA = new URL('../../src/story/logdata.json', import.meta.url).pathname;
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const FORCE = flag('--force');
const CAPTIONS_ONLY = flag('--captions');
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--profile');
const ONLY = positional.length ? new Set(positional[0].split(',')) : null;

const { voice, logs } = JSON.parse(fs.readFileSync(new URL('./logs.json', import.meta.url)));
const PROFILE_NAME = opt('--profile') || voice.profile;
const profile = voice.profiles[PROFILE_NAME];
if (!profile) throw new Error(`unknown profile "${PROFILE_NAME}" (have: ${Object.keys(voice.profiles).join(', ')})`);
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY && !CAPTIONS_ONLY) throw new Error('ELEVENLABS_API_KEY not set (or pass --captions for timing-only data)');
const old = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA)) : [];

// [tags] out, whitespace tidied: what the captions show
const stripTags = (s) => s.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
const fileName = (id) => `memo_${id}`;

async function post(url, body, json) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) return json ? res.json() : Buffer.from(await res.arrayBuffer());
    const txt = (await res.text()).slice(0, 300);
    if (res.status === 429 || res.status >= 500) {
      console.log(`  retry ${attempt} (${res.status}) ${txt}`);
      await new Promise((r) => setTimeout(r, 4000 * attempt));
      continue;
    }
    const err = new Error(`${res.status} ${txt}`);
    err.status = res.status;
    throw err;
  }
  throw new Error('failed after retries');
}

// -> { audio: Buffer, alignment | null }
async function speak(text) {
  const base = `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}`;
  const q = '?output_format=mp3_44100_128';
  const body = { text, model_id: profile.model, voice_settings: profile.settings };
  try {
    const res = await post(`${base}/with-timestamps${q}`, body, true);
    return { audio: Buffer.from(res.audio_base64, 'base64'), alignment: res.alignment?.characters?.length ? res.alignment : null };
  } catch (e) {
    if (!e.status || e.status === 401 || e.status === 403) throw e;
    console.log(`  no timestamps (${e.message.slice(0, 120)}); falling back to plain audio, evenly paced captions`);
    return { audio: await post(base + q, body, false), alignment: null };
  }
}

function duration(file) {
  let d = NaN;
  try {
    d = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim();
  } catch {
    // no ffprobe
  }
  return Number.isFinite(d) && d > 0 ? d : (fs.statSync(file).size * 8) / 128000; // else assume 128 kbps CBR
}

// A rough spoken length for a script without audio: ~14 caption characters a second, plus a beat for
// each acted tag and between lines.
const estimate = (chunks) => chunks.reduce((s, c) => s + stripTags(c).length / 14 + (c.match(/\[[^\]]*\]/g)?.length ?? 0) * 0.5 + 0.35, 0.6);

// Caption line start times. With an alignment: where each line's opening words are spoken (searched in
// order, so it works whether or not the alignment includes the tag text). Without: the lines spread
// over the clip by length.
function timeLines(captions, align, dur) {
  const total = captions.reduce((s, c) => s + c.length + 6, 0);
  const said = align ? align.characters.join('').toLowerCase() : '';
  let cursor = 0, off = 0;
  return captions.map((text) => {
    let t = null;
    if (align) {
      // the line's first few words, allowing punctuation, spaces or [tags] between them
      const words = (text.toLowerCase().match(/[\w']+/g) || []).map((w) => w.replace(/'/g, "['\u2019]"));
      let i = -1;
      for (const n of [3, 1]) {
        if (!words.length || i >= 0) break;
        const re = new RegExp(words.slice(0, n).join("(?:[^\\w'\u2019]|\\[[^\\]]*\\])+"), 'g');
        re.lastIndex = cursor;
        i = re.exec(said)?.index ?? -1;
      }
      if (i >= 0) {
        t = align.character_start_times_seconds[i];
        cursor = i + 1;
      }
    }
    const line = { t: +(t ?? (dur * off) / total).toFixed(2), text };
    off += text.length + 6;
    return line;
  });
}

const data = [];
let failed = 0;
for (const log of logs) {
  const name = fileName(log.id), file = `${OUT}/${name}.mp3`;
  const captions = log.chunks.map(stripTags);
  const text = captions.join(' ');
  const spoken = (profile.tags ? log.chunks.map((c) => c.trim()) : captions).join(' ');
  const prev = old.find((d) => d.id === log.id);
  const entry = { id: log.id, title: log.title, where: log.where, file: name, text };
  if (CAPTIONS_ONLY) {
    // keep real timing for audio that already matches the script; estimate the rest
    if (prev && !prev.est && prev.text === text && fs.existsSync(file)) data.push({ ...prev, title: log.title, where: log.where });
    else {
      const dur = +estimate(log.chunks).toFixed(2);
      data.push({ ...entry, dur, est: true, lines: timeLines(captions, null, dur) });
    }
    continue;
  }
  const unchanged = prev && !prev.est && prev.spoken === spoken && prev.profile === PROFILE_NAME && fs.existsSync(file);
  if ((ONLY && !ONLY.has(log.id)) || (!ONLY && !FORCE && unchanged)) {
    if (prev) data.push({ ...prev, title: log.title, where: log.where });
    else {
      const dur = +estimate(log.chunks).toFixed(2);
      data.push({ ...entry, dur, est: true, lines: timeLines(captions, null, dur) });
    }
    continue;
  }
  const t0 = Date.now();
  try {
    const res = await speak(spoken);
    fs.writeFileSync(file, res.audio);
    const dur = duration(file);
    data.push({ ...entry, spoken, profile: PROFILE_NAME, dur: +dur.toFixed(2), lines: timeLines(captions, res.alignment, dur) });
    console.log(`ok   ${name} ${dur.toFixed(1)}s${res.alignment ? '' : ' (evenly paced captions)'} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name} ${e.message}`);
    if (prev) data.push(prev);
    else {
      const dur = +estimate(log.chunks).toFixed(2);
      data.push({ ...entry, dur, est: true, lines: timeLines(captions, null, dur) });
    }
  }
}
fs.writeFileSync(DATA, JSON.stringify(data, null, 1) + '\n');
if (CAPTIONS_ONLY) {
  console.log(`wrote ${data.length} logs (${data.filter((d) => d.est).length} with estimated timing)`);
} else {
  // the game only requests files listed in the manifest (avoids 404s for audio that doesn't exist yet)
  const have = fs.readdirSync(OUT).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)).sort();
  fs.writeFileSync(`${OUT}/manifest.json`, `[${have.map((n) => JSON.stringify(n)).join(', ')}]`);
  console.log(`done, ${failed} failed; manifest lists ${have.length} files`);
}
