// Music for mograph: (1) synth() writes an original, royalty-free backing track at an exact BPM,
// (2) detectBeat() estimates BPM + first-beat offset of a user-supplied audio file.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const SR = 44100, mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export const STYLES = {
  upbeat: { bpm: 112, d: 'bright pop-electronic, plucked arps — product intros, explainers', chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bass: [33, 29, 36, 31] },
  chill: { bpm: 86, d: 'lo-fi, soft keys — personal brand, storytelling', chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], bass: [41, 40, 38, 36] },
  drive: { bpm: 124, d: 'four-on-the-floor, energetic — launches, announcements', chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], bass: [38, 34, 41, 36] },
};

export function synth({ style = 'upbeat', bpm, dur, out }) {
  const st = STYLES[style]; if (!st) throw new Error(`unknown music style "${style}" (${Object.keys(STYLES).join(', ')})`);
  bpm = bpm || st.bpm;
  const spb = 60 / bpm, N = Math.ceil((dur + 0.05) * SR);
  const bus = () => [new Float32Array(N), new Float32Array(N)];
  const D = bus(), M = bus(), duck = new Float32Array(N).fill(1);
  let seed = 20261111; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 2147483648) - 1; };
  const add = (b, t0, len, fn, pan = 0) => {
    const a = Math.floor(t0 * SR), n = Math.floor(len * SR), gl = Math.cos(((pan + 1) * Math.PI) / 4) * 1.414, gr = Math.sin(((pan + 1) * Math.PI) / 4) * 1.414;
    for (let i = 0; i < n && a + i < N; i++) { const v = fn(i / SR); b[0][a + i] += v * gl; b[1][a + i] += v * gr; }
  };
  const kick = (t0, amp = 0.95) => {
    add(D, t0, 0.38, t => Math.sin(2 * Math.PI * (46 * t + (115 / 30) * (1 - Math.exp(-30 * t)))) * Math.exp(-t * 8.5) * amp);
    const a = Math.floor(t0 * SR); for (let i = 0; i < 0.3 * SR && a + i < N; i++) duck[a + i] = Math.min(duck[a + i], 1 - 0.5 * Math.exp((-i / SR) * 9));
  };
  const noise = (t0, len, decay, amp, k, pan = 0) => { let lp = 0; add(D, t0, len, t => { const n = rnd(); lp += k * (n - lp); return (n - lp) * Math.exp(-t * decay) * amp; }, pan); };
  const snare = t0 => { noise(t0, 0.22, 20, 0.34, 0.22); add(D, t0, 0.12, t => Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 30) * 0.22); };
  const hat = (t0, amp, pan = 0.25) => noise(t0, 0.06, 75, amp, 0.75, pan);
  const bass = (t0, len, m, amp = 0.3) => { const f = mtof(m); add(M, t0, len, t => (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) + 0.12 * Math.sin(6 * Math.PI * f * t)) * Math.min(1, t / 0.006) * Math.exp(-t * 3.2) * Math.min(1, (len - t) / 0.02) * amp); };
  const pluck = (t0, m, amp, pan, slow = 1) => { const f = mtof(m); add(M, t0, 0.9 * slow, t => { let v = 0; for (let h = 1; h <= 6; h++) v += (Math.sin(2 * Math.PI * h * f * t) / h) * Math.exp((-t * (3 + h * 2.4)) / slow); return v * Math.min(1, t / 0.004) * amp; }, pan); };
  const pad = (t0, len, notes, amp) => notes.forEach((m, j) => { const f = mtof(m); add(M, t0, len + 0.3, t => (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 1.004 * t)) * Math.min(1, t / 0.18) * Math.min(1, Math.max(0, (len + 0.3 - t) / 0.3)) * amp, j % 2 ? 0.35 : -0.35); });

  const bars = Math.ceil(dur / (4 * spb));
  for (let b = 0; b < bars; b++) {
    const T = b * 4 * spb, ch = st.chords[b % 4], root = st.bass[b % 4], full = b >= 2, B = x => T + x * spb;
    if (style === 'upbeat') {
      kick(B(0)); kick(B(2)); if (b % 2) kick(B(2.5), 0.7);
      if (full) { snare(B(1)); snare(B(3)); }
      for (let i = 0; i < 8; i++) { hat(B(i / 2), i % 2 ? 0.07 : 0.11); bass(B(i / 2), spb * 0.45, root + (i % 2 ? 12 : 0), i % 2 ? 0.2 : 0.3); }
      if (full) for (let i = 0; i < 8; i++) pluck(B(i / 2), ch[[0, 1, 2, 1, 0, 2, 1, 2][i]] + 12, 0.11, i % 2 ? 0.45 : -0.45);
      pad(T, 4 * spb, ch, 0.04);
    } else if (style === 'chill') {
      kick(B(0), 0.85); kick(B(2.5), 0.7); snare(B(1)); snare(B(3));
      for (let i = 0; i < 8; i++) hat(B(i / 2 + (i % 2 ? 0.09 : 0)), i % 2 ? 0.05 : 0.08);
      bass(B(0), spb * 1.4, root, 0.32); bass(B(2.5), spb * 1.2, root, 0.26);
      ch.forEach((m, j) => { pluck(B(0) + j * 0.012, m + 12, 0.075, j % 2 ? 0.3 : -0.3, 2.2); pluck(B(1.5) + j * 0.012, m + 12, 0.06, j % 2 ? 0.3 : -0.3, 2); });
      pad(T, 4 * spb, ch, 0.05);
    } else {
      for (let i = 0; i < 4; i++) { kick(B(i)); hat(B(i + 0.5), 0.13); bass(B(i + 0.5), spb * 0.42, root, 0.3); }
      if (full) { snare(B(1)); snare(B(3)); for (let i = 0; i < 16; i++) pluck(B(i / 4), ch[i % ch.length] + 12 + (i % 8 > 5 ? 12 : 0), 0.06, i % 2 ? 0.5 : -0.5, 0.6); }
      ch.forEach((m, j) => { pluck(B(0), m + 12, 0.09, j % 2 ? 0.2 : -0.2, 1.4); pluck(B(2.75), m + 12, 0.07, j % 2 ? 0.2 : -0.2, 1.2); });
      pad(T, 4 * spb, ch, 0.03);
    }
  }
  // master: sidechain, soft clip, fades
  const buf = Buffer.alloc(44 + N * 4), fo = Math.min(1.6, dur / 3);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    const t = i / SR, g = Math.min(1, t / 0.01) * Math.min(1, Math.max(0, (dur - t) / fo));
    for (let c = 0; c < 2; c++) buf.writeInt16LE(Math.round(Math.tanh((D[c][i] + M[c][i] * duck[i]) * 1.15) * 0.82 * g * 32767), 44 + i * 4 + c * 2);
  }
  fs.writeFileSync(out, buf);
  return { bpm, offset: 0, bars };
}

/** Estimate tempo + first-beat offset. Returns {bpm, offset, conf (0–1)}. Half/double-time errors are possible: override with meta.bpm. */
export function detectBeat(file, ff = 'ffmpeg') {
  const r = spawnSync(ff, ['-v', 'error', '-i', file, '-t', '150', '-f', 's16le', '-ac', '1', '-ar', '11025', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0 || !r.stdout.length) throw new Error('cannot decode audio: ' + file);
  const pcm = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length >> 1), hop = 110, h = hop / 11025, F = Math.floor(pcm.length / hop);
  const on = new Float32Array(F); let prev = 0, mean = 0;
  for (let i = 0; i < F; i++) { let e = 0; for (let j = 0; j < hop; j++) { const v = pcm[i * hop + j] / 32768; e += v * v; } const l = Math.log(1 + e * 50); on[i] = Math.max(0, l - prev); prev = l; mean += on[i]; }
  mean /= F; for (let i = 0; i < F; i++) on[i] = Math.max(0, on[i] - mean);
  let best = 0, p0 = 0, tot = 0;
  for (let lag = Math.round(60 / 190 / h); lag <= Math.round(60 / 62 / h); lag++) {
    let s = 0; for (let i = lag; i < F; i++) s += on[i] * on[i - lag];
    const bpm = 60 / (lag * h); s *= Math.exp(-0.5 * Math.pow(Math.log2(bpm / 112) / 0.75, 2)); tot += s;
    if (s > best) { best = s; p0 = lag; }
  }
  let sc = 0, P = p0, PH = 0;
  for (let p = p0 * 0.97; p <= p0 * 1.03; p += 0.005) for (let ph = 0; ph < p; ph += 0.5) {
    let s = 0; for (let x = ph; x < F - 1; x += p) s += on[Math.round(x)];
    if (s > sc) { sc = s; P = p; PH = ph; }
  }
  const n = Math.round(60 / 62 / h) - Math.round(60 / 190 / h) + 1;
  return { bpm: +(60 / (P * h)).toFixed(2), offset: +Math.max(0, PH * h - 0.012).toFixed(3), conf: +Math.min(1, best / (tot / n) / 8).toFixed(2) };
}
