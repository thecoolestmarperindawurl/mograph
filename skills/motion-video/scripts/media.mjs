// mograph media: probe (ffmpeg only, no ffprobe), footage → frames, voiceover (TTS or own recording) → caption cues, final audio mix.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const run = (cmd, args, o = {}) => spawnSync(cmd, args, { maxBuffer: 1 << 26, ...o });
const hash = (...a) => crypto.createHash('sha1').update(a.join('\u0000')).digest('hex').slice(0, 14);
export const CACHE = process.env.MOGRAPH_CACHE || path.join(os.homedir(), '.cache', 'mograph');

/** duration (s), width, height, hasAudio — parsed from `ffmpeg -i`, so ffprobe is not required. */
export function probe(ff, file) {
  const e = run(ff, ['-hide_banner', '-i', file]).stderr.toString();
  const d = e.match(/Duration:\s*(\d+):(\d+):([\d.]+)/), v = e.match(/Stream[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})/);
  return { dur: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0, w: v ? +v[1] : 0, h: v ? +v[2] : 0, audio: /Stream[^\n]*Audio:/.test(e), alpha: /yuva|rgba|argb|bgra|pal8|ya8|gray8a|ya16/.test(e) };
}

/** Extract frames of a footage clip once (cached). Sets s._frames (file URLs), s._fps, s._len. */
export function prepClip(ff, s, fps, maxW) {
  const st = fs.statSync(s.clip), from = +s.from || 0, info = probe(ff, s.clip);
  const len = Math.max(0.2, Math.min((s.to != null ? +s.to : info.dur) - from, info.dur - from, +s.max || 12));
  const dir = path.join(CACHE, 'clips', hash(s.clip, st.size, st.mtimeMs, from, len, fps, maxW));
  if (!fs.existsSync(path.join(dir, 'done'))) {
    fs.mkdirSync(dir, { recursive: true });
    const r = run(ff, ['-v', 'error', '-y', '-ss', String(from), '-t', String(len), '-i', s.clip, '-vf', `fps=${fps},scale='min(${maxW},iw)':-2`, '-q:v', '3', path.join(dir, '%05d.jpg')]);
    if (r.status !== 0) throw new Error('cannot read footage ' + s.clip + ': ' + r.stderr.toString().split('\n')[0]);
    fs.writeFileSync(path.join(dir, 'done'), '');
  }
  s._frames = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).sort().map(f => pathToFileURL(path.join(dir, f)).href);
  s._fps = fps; s._len = s._frames.length / fps; s._hasAudio = info.audio;
}

// ---------- voiceover ----------
const isVi = t => /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(t);
const has = (cmd, args = ['--version']) => { try { return run(cmd, args, { timeout: 15000 }).status === 0; } catch { return false; } };
const PY = process.platform === 'win32' ? 'python' : 'python3';
export function ttsEngines() {
  const e = [];
  if (has(PY, ['-c', 'import piper'])) e.push('piper');
  if (process.platform === 'darwin' && has('say', ['-v', '?'])) e.push('say');
  if (process.platform === 'win32' && has('powershell', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.Speech'])) e.push('sapi');
  if (has('espeak-ng')) e.push('espeak');
  return e;
}
const VOICES = { piper: ['vi_VN-vais1000-medium', 'en_US-lessac-medium'], say: ['Linh', 'Samantha'], espeak: ['vi', 'en-us'], sapi: ['', ''] };

function speak(engine, voice, rate, text, out, ff) {
  const tmp = out.replace(/\.wav$/, '') + (engine === 'say' ? '.src.aiff' : '.src.wav');
  if (engine === 'piper') {
    const vdir = path.join(CACHE, 'voices'), model = path.join(vdir, voice + '.onnx');
    if (!fs.existsSync(model)) {
      // remember a failed download for an hour so every lint does not wait on the network again
      const fail = model + '.failed';
      if (fs.existsSync(fail) && Date.now() - fs.statSync(fail).mtimeMs < 3600e3) throw new Error(`piper voice "${voice}" could not be downloaded recently (${fs.readFileSync(fail, 'utf8')}) — retry in an hour or delete ${fail}`);
      fs.mkdirSync(vdir, { recursive: true });
      const d = run(PY, ['-m', 'piper.download_voices', voice, '--download-dir', vdir]);
      if (!fs.existsSync(model)) { const why = d.stderr.toString().trim().split('\n').pop().slice(0, 160); fs.writeFileSync(fail, why); throw new Error(`piper voice "${voice}" not available (download failed: ${why})`); }
    }
    const r = run(PY, ['-m', 'piper', '-m', model, '-f', tmp, '--length-scale', String((1 / rate).toFixed(3))], { input: text });
    if (r.status !== 0) throw new Error('piper failed: ' + r.stderr.toString().trim().split('\n').pop());
  } else if (engine === 'say') {
    const list = run('say', ['-v', '?']).stdout.toString(), v = voice && new RegExp('^' + voice + '\\s', 'm').test(list) ? voice : '';
    const r = run('say', [...(v ? ['-v', v] : []), '-r', String(Math.round(180 * rate)), '-o', tmp, text]);
    if (r.status !== 0) throw new Error('say failed: ' + r.stderr.toString().trim());
  } else if (engine === 'sapi') {
    const ps = `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; ${voice ? `$s.SelectVoice('${voice.replace(/'/g, "''")}');` : ''} $s.Rate=${Math.round((rate - 1) * 10)}; $s.SetOutputToWaveFile('${tmp.replace(/'/g, "''")}'); $s.Speak([Console]::In.ReadToEnd()); $s.Dispose()`;
    const r = run('powershell', ['-NoProfile', '-Command', ps], { input: text });
    if (r.status !== 0) throw new Error('Windows speech failed: ' + r.stderr.toString().trim().split('\n').pop());
  } else if (engine === 'espeak') {
    const r = run('espeak-ng', ['-v', voice, '-s', String(Math.round(165 * rate)), '-w', tmp, text]);
    if (r.status !== 0) throw new Error('espeak-ng failed: ' + r.stderr.toString().trim());
  } else throw new Error('unknown tts engine ' + engine);
  // normalise: mono 44.1k, trim leading/trailing silence, even loudness
  const r = run(ff, ['-v', 'error', '-y', '-i', tmp, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', '-ac', '1', out]);
  fs.rmSync(tmp, { force: true });
  if (r.status !== 0) throw new Error('ffmpeg could not process voice: ' + r.stderr.toString().split('\n')[0]);
}

/** Split narration into caption phrases (≤ maxW words, broken at punctuation first). */
export function phrases(text, maxW = 7) {
  const out = [];
  for (const part of String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.,!?;:…—])\s+/)) {
    const w = part.split(' ').filter(Boolean);
    const n = Math.ceil(w.length / maxW), size = Math.ceil(w.length / n);
    for (let i = 0; i < w.length; i += size) out.push(w.slice(i, i + size).join(' '));
  }
  return out;
}

/** Time each phrase: spread by character length over the speech, then snap boundaries to real pauses found by silencedetect. */
function cues(ff, wav, dur, list) {
  const e = run(ff, ['-hide_banner', '-i', wav, '-af', 'silencedetect=noise=-32dB:d=0.11', '-f', 'null', '-']).stderr.toString();
  const gaps = [], re = /silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g;
  let m; while ((m = re.exec(e))) gaps.push((+m[1] + +m[2]) / 2);
  const L = list.reduce((n, p) => n + p.length, 0);
  let acc = 0, prev = 0, snapped = 0;
  return list.map((text, i) => {
    acc += text.length;
    let b = i === list.length - 1 ? dur : (acc / L) * dur;
    if (i < list.length - 1) { const g = gaps.filter(x => Math.abs(x - b) < 0.45 && x > prev + 0.25).sort((x, y) => Math.abs(x - b) - Math.abs(y - b))[0]; if (g != null) { b = g; snapped++; } }
    const c = { a: +prev.toFixed(3), b: +b.toFixed(3), text }; prev = b; return c;
  }).map((c, _, arr) => Object.assign(c, { snapped: snapped / Math.max(1, arr.length - 1) }));
}

/** For every scene with `voice:` text, make (or reuse) the audio and caption cues. Sets s._vo = {file, dur, at, cues}. */
export function prepVoices(ff, spec, dir) {
  const m = spec.meta, list = spec.scenes.filter(s => s.voice);
  if (!list.length) return null;
  const avail = list.every(s => s.vo) ? [] : ttsEngines();
  let engine = m.tts && m.tts !== 'auto' ? m.tts : avail[0];
  if (!list.every(s => s.vo) && !engine) throw new Error('voice: no text-to-speech engine found. Install one: `pip install piper-tts` (best, any OS) · macOS has `say` built in · Linux: `apt install espeak-ng` — or record each line and set `vo: file.wav` on the scene');
  if (m.tts && m.tts !== 'auto' && !avail.includes(m.tts) && !list.every(s => s.vo)) throw new Error(`meta.tts "${m.tts}" is not installed here (found: ${avail.join(', ') || 'none'})`);
  const rate = +m.rate || 1, notes = [];
  for (const s of list) {
    const lang = isVi(s.voice) ? 0 : 1, voice = m.voice || VOICES[engine]?.[lang] || '';
    let file;
    if (s.vo) file = path.resolve(dir, s.vo);
    else {
      // auto mode: if the preferred engine fails (e.g. a piper voice cannot be downloaded), fall back to the next one
      const tries = m.tts && m.tts !== 'auto' ? [engine] : avail.slice(avail.indexOf(engine));
      for (let k = 0; k < tries.length; k++) {
        const eng = tries[k], vc = m.voice && eng === engine ? m.voice : VOICES[eng]?.[lang] || '';
        file = path.join(CACHE, 'tts', hash(eng, vc, rate, s.voice) + '.wav');
        try { if (!fs.existsSync(file)) { fs.mkdirSync(path.dirname(file), { recursive: true }); speak(eng, vc, rate, s.voice, file, ff); } if (eng !== engine) { notes.push(`${engine} failed, used ${eng} instead`); engine = eng; } break; }
        catch (e) { if (k === tries.length - 1) throw e; notes.push(`${eng}: ${e.message.split('\n')[0]}`); }
      }
    }
    const dur = probe(ff, file).dur;
    s._vo = { file, dur: +dur.toFixed(3), at: 0.2, cues: cues(ff, file, dur, phrases(s.voice, +m.capwords || 7)) };
  }
  if (engine === 'espeak') notes.push('voice uses espeak-ng (robotic). For natural speech: `pip install piper-tts`, or record lines and use `vo:`');
  return { engine: list.every(s => s.vo) ? 'recorded' : engine, notes };
}

/** Build the final soundtrack: music ducked under voice, voice lines and footage sound placed at their scene times. */
export function mixAudio(ff, { music, info, scenes, volume = 0.8, out }) {
  const ins = [], f = [], total = info.total.toFixed(3);
  let n = 0;
  const voIdx = [], clipIdx = [];
  if (music) { ins.push('-i', music); n++; }
  info.scenes.forEach((si, k) => {
    const s = scenes[k];
    if (s._vo && si.voAt != null) { ins.push('-i', s._vo.file); voIdx.push([n++, si.voAt]); }
    if (s.type === 'clip' && s.sound && s._hasAudio) { ins.push('-ss', String(+s.from || 0), '-t', String(s._len), '-i', s.clip); clipIdx.push([n++, si.start + si.lead + (si.clipAt || 0), s.sound === true ? 1 : +s.sound]); }
  });
  if (!n) return null;
  const vl = voIdx.map(([i, t], k) => { f.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${Math.round(t * 1000)}:all=1[v${k}]`); return `[v${k}]`; });
  const cl = clipIdx.map(([i, t, g], k) => { f.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${g},adelay=${Math.round(t * 1000)}:all=1[c${k}]`); return `[c${k}]`; });
  const parts = [];
  if (vl.length) { f.push(`${vl.join('')}amix=inputs=${vl.length}:normalize=0:duration=longest,apad[vo]`); }
  if (music) {
    f.push(`[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${volume}[mu]`);
    if (vl.length) { f.push('[vo]asplit=2[vo1][vo2]', '[mu][vo2]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350:makeup=1[md]'); parts.push('[md]', '[vo1]'); }
    else parts.push('[mu]');
  } else if (vl.length) parts.push('[vo]');
  parts.push(...cl);
  f.push(`${parts.join('')}amix=inputs=${parts.length}:normalize=0:duration=first,atrim=0:${total},afade=t=out:st=${Math.max(0, info.total - 1.4).toFixed(2)}:d=1.4,alimiter=limit=0.95[out]`);
  const r = run(ff, ['-v', 'error', '-y', ...ins, '-filter_complex', f.join(';'), '-map', '[out]', '-t', total, '-ar', '44100', out]);
  if (r.status !== 0) throw new Error('audio mix failed: ' + r.stderr.toString().split('\n').slice(0, 3).join(' '));
  return out;
}
