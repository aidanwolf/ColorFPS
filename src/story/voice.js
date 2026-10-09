// Wren's voice as a ghost hears it: her memo playback goes through this chain instead of a clean EQ.
//
//   input ─ old-recording band (HP 230 · presence +4 dB @ 1.9 kHz · LP 5.2 kHz) ─ warm saturation with a
//           little bit-crush grit ─┬─ tape warble (a short delay wobbling at 0.55 Hz + 5.7 Hz flutter) ─┐
//                                  ├─ a detuned double (a slower, deeper chorus delay), quieter ────────┤
//                                  └─ a ghost an octave down (a two-tap Doppler pitch shifter), low ────┤
//                                                                                                       │
//            pre-delay (her words arrive PRE seconds late, so ...) ◀────────────────────────────────────┘
//                 │                ... a thin whisper of the undelayed input reaches the reverb FIRST: a pre-echo
//                 ▼
//              gate (glitch dropouts) ─┬─ dry ─────────────────────────────────────────────┐
//                                      ├─ long dark reverb (procedural 4.5 s IR, darkening) ─┤
//                                      ├─ a low-passed feedback echo (340 ms) ────────────────┼─ level ─ out
//                                      └─ stutter (a 75 ms loop, opened only while glitching) ┘
//
// glitch(dur): the hologram glitched: her voice drops out and stutters for dur seconds, in sync.
// Built per AudioContext (works in an OfflineAudioContext too, which is how its loudness was matched to the
// old field-recorder EQ: see LEVEL in recorder.js).
const PRE = 0.15;

function biquad(ctx, type, f, q = 0.7, gain = 0) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  b.gain.value = gain;
  return b;
}
function gainNode(ctx, v) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}
function lfo(ctx, hz, depth, target, type = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = hz;
  const g = gainNode(ctx, depth);
  o.connect(g).connect(target);
  o.start();
  return o;
}

// warm saturation with a little stepped grit (a quarter of a 6-bit quantize mixed in)
function crushCurve() {
  const N = 2048, c = new Float32Array(N), k = 2.2, n = Math.tanh(k);
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1;
    const y = Math.tanh(k * x) / n;
    c[i] = 0.78 * y + 0.22 * (Math.round(y * 24) / 24);
  }
  return c;
}

// A long, dark, slowly blooming tail: stereo noise decaying over rt60, low-passed harder as it decays.
function darkImpulse(ctx, len = 4.5, rt60 = 4.2) {
  const sr = ctx.sampleRate, n = Math.floor(len * sr);
  const buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    let seed = ch ? 7919 : 104729;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      seed = (seed * 16807) % 2147483647;
      const white = (seed / 2147483647) * 2 - 1;
      // the cutoff falls from bright to dark over the first couple of seconds
      const a = 0.08 + 0.55 * Math.exp(-t / 0.9);
      lp += a * (white - lp);
      const env = Math.exp((-6.9 * t) / rt60) * Math.min(1, t / 0.12) * (t < 0.035 ? 0 : 1);
      d[i] = lp * env;
    }
    // unit energy, so the send and return gains say how loud the tail is against her dry voice
    let e = 0;
    for (let i = 0; i < n; i++) e += d[i] * d[i];
    const k = 1 / Math.sqrt(e);
    for (let i = 0; i < n; i++) d[i] *= k;
  }
  return buf;
}

// An octave down: two delay taps whose delay ramps up at half speed (Doppler), cross-faded (sin²) so each
// tap is silent as its ramp wraps.
function octaveDown(ctx, input, out) {
  const W = 0.09, T = 2 * W, sr = ctx.sampleRate, n = Math.floor(T * sr);
  const ramp = ctx.createBuffer(1, n, sr), fade = ctx.createBuffer(1, n, sr);
  const r = ramp.getChannelData(0), f = fade.getChannelData(0);
  for (let i = 0; i < n; i++) {
    r[i] = i / n;
    f[i] = Math.sin((Math.PI * i) / n) ** 2;
  }
  const t0 = ctx.currentTime + 0.02;
  for (let k = 0; k < 2; k++) {
    const d = ctx.createDelay(1);
    d.delayTime.value = 0.005;
    const rs = ctx.createBufferSource();
    rs.buffer = ramp;
    rs.loop = true;
    const rg = gainNode(ctx, W);
    rs.connect(rg).connect(d.delayTime);
    const fs = ctx.createBufferSource();
    fs.buffer = fade;
    fs.loop = true;
    const g = gainNode(ctx, 0);
    fs.connect(g.gain);
    input.connect(d).connect(g).connect(out);
    rs.start(t0, (k * T) / 2);
    fs.start(t0, (k * T) / 2);
  }
}

export function ghostVoice(ctx, out, level = 1) {
  const input = ctx.createGain();
  // the old-recording band and its grit
  const band = biquad(ctx, 'highpass', 230, 0.7);
  const pres = biquad(ctx, 'peaking', 1900, 0.9, 4);
  const lp = biquad(ctx, 'lowpass', 5200, 0.6);
  const sat = ctx.createWaveShaper();
  sat.curve = crushCurve();
  sat.oversample = '2x';
  const pre = gainNode(ctx, 0.5);
  input.connect(band).connect(pres).connect(lp).connect(pre).connect(sat);

  // her words land PRE late (so the whisper below can come first)
  const late = ctx.createDelay(1);
  late.delayTime.value = PRE;
  // tape warble on the main voice
  const warble = ctx.createDelay(0.1);
  warble.delayTime.value = 0.012;
  lfo(ctx, 0.55, 0.0018, warble.delayTime);
  lfo(ctx, 5.7, 0.00028, warble.delayTime);
  sat.connect(warble).connect(late);
  // a detuned double, slower and deeper
  const dbl = ctx.createDelay(0.1);
  dbl.delayTime.value = 0.024;
  lfo(ctx, 0.31, 0.0045, dbl.delayTime, 'triangle');
  const dblG = gainNode(ctx, 0.34);
  sat.connect(dbl).connect(biquad(ctx, 'lowpass', 3200, 0.5)).connect(dblG).connect(late);
  // the ghost an octave down, quietly underneath
  const oct = gainNode(ctx, 1);
  octaveDown(ctx, sat, oct);
  const octG = gainNode(ctx, 0.3);
  oct.connect(biquad(ctx, 'lowpass', 1300, 0.6)).connect(octG).connect(late);

  // the gate the glitches pull down, and what it feeds
  const gate = gainNode(ctx, 1);
  late.connect(gate);
  const mix = gainNode(ctx, 1);
  const dry = gainNode(ctx, 0.92);
  gate.connect(dry).connect(mix);
  const verb = ctx.createConvolver();
  verb.buffer = darkImpulse(ctx);
  const send = gainNode(ctx, 0.5);
  const wet = gainNode(ctx, 0.62);
  gate.connect(send).connect(verb).connect(wet).connect(mix);
  // a low-passed echo, fed back
  const echo = ctx.createDelay(1);
  echo.delayTime.value = 0.34;
  const fb = gainNode(ctx, 0.36);
  const eLp = biquad(ctx, 'lowpass', 2000, 0.5);
  gate.connect(echo).connect(eLp).connect(fb).connect(echo);
  const echoG = gainNode(ctx, 0.2);
  eLp.connect(echoG).connect(mix);
  echoG.connect(send);
  // the pre-echo: a thin, airy whisper of her words, undelayed, straight into the reverb
  const whisper = biquad(ctx, 'highpass', 2400, 0.6);
  const wG = gainNode(ctx, 0.42);
  input.connect(whisper).connect(wG).connect(verb);
  // stutter: a short loop on what's playing, opened only during a glitch
  const st = ctx.createDelay(0.2);
  st.delayTime.value = 0.075;
  const stFb = gainNode(ctx, 0.72);
  late.connect(st).connect(stFb).connect(st);
  const stG = gainNode(ctx, 0);
  st.connect(stG).connect(mix);

  const lvl = gainNode(ctx, level);
  mix.connect(lvl).connect(out);

  return {
    input,
    level: lvl,
    parts: { dry, wet, echoG, octG, dblG, wG, stG }, // (for measuring)
    glitch(dur) {
      const t = ctx.currentTime;
      const g = gate.gain, s = stG.gain;
      g.cancelScheduledValues(t);
      s.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.06, t + 0.012);
      g.setValueAtTime(0.06, t + dur);
      g.linearRampToValueAtTime(1, t + dur + 0.035);
      s.setValueAtTime(s.value, t);
      s.linearRampToValueAtTime(0.85, t + 0.01);
      s.setValueAtTime(0.85, t + dur);
      s.linearRampToValueAtTime(0, t + dur + 0.06);
    },
  };
}
