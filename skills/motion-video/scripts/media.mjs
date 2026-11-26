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
  s._fps = fps; s._len = s._frames.length / fps; s._hasAudio = info.audio; s._w = info.w; s._h = info.h;
}

// ---------- voiceover ----------
const isVi = t => /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i.test(t);
const has = (cmd, args = ['--version']) => { try { return run(cmd, args, { timeout: 15000 }).status === 0; } catch { return false; } };
const PY = process.platform === 'win32' ? 'python' : 'python3';
export function ttsEngines() {
  const e = [];
  if (has(PY, ['-c', 'import edge_tts'])) e.push('edge');
  if (has(PY, ['-c', 'import piper'])) e.push('piper');
  if (process.platform === 'darwin' && has('say', ['-v', '?'])) e.push('say');
  if (process.platform === 'win32' && has('powershell', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.Speech'])) e.push('sapi');
  if (has('espeak-ng')) e.push('espeak');
  return e;
}
// edge default: HoaiMy (owner's pick, natural Vietnamese); it says English names the Vietnamese way, so use `say:` or meta.voice en-US-AndrewMultilingualNeural when names matter
const VOICES = { edge: ['vi-VN-HoaiMyNeural', 'en-US-AvaMultilingualNeural'], piper: ['vi_VN-vais1000-medium', 'en_US-lessac-medium'], say: ['Linh', 'Samantha'], espeak: ['vi', 'en-us'], sapi: ['', ''] };

function speak(engine, voice, rate, text, out, ff) {
  const tmp = out.replace(/\.wav$/, '') + (engine === 'say' ? '.src.aiff' : engine === 'edge' ? '.src.mp3' : '.src.wav');
  if (engine === 'piper') {
    const vdir = path.join(CACHE, 'voices'), model = path.join(vdir, voice + '.onnx');
    if (!fs.existsSync(model)) {
      // remember a failed download for an hour so every lint does not wait on the network again
      const fail = model + '.failed';
      if (fs.existsSync(fail) && Date.now() - fs.statSync(fail).mtimeMs < 3600e3) throw new Error(`piper voice "${voice}" could not be downloaded recently (${fs.readFileSync(fail, 'utf8')}) — retry in an hour or delete ${fail}`);
      fs.mkdirSync(vdir, { recursive: true });
      const d = run(PY, ['-m', 'piper.download_voices', voice, '--download-dir', vdir]);
      // Hugging Face blocked/unreachable: the same voices are re-published as GitHub release assets by sherpa-onnx
      if (!fs.existsSync(model)) {
        const tb = path.join(vdir, voice + '.tar.bz2');
        const g = run('curl', ['-sfL', '-m', '600', '-o', tb, `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-${voice}.tar.bz2`]);
        if (g.status === 0 && run('tar', ['xjf', tb, '-C', vdir]).status === 0) {
          const sub = path.join(vdir, 'vits-piper-' + voice);
          for (const f of [voice + '.onnx', voice + '.onnx.json']) if (fs.existsSync(path.join(sub, f))) fs.renameSync(path.join(sub, f), path.join(vdir, f));
          fs.rmSync(sub, { recursive: true, force: true });
        }
        fs.rmSync(tb, { force: true });
      }
      if (!fs.existsSync(model)) { const why = d.stderr.toString().trim().split('\n').pop().slice(0, 160); fs.writeFileSync(fail, why); throw new Error(`piper voice "${voice}" not available (download failed: ${why})`); }
    }
    const r = run(PY, ['-m', 'piper', '-m', model, '-f', tmp, '--length-scale', String((1 / rate).toFixed(3))], { input: text, env: { ...process.env, PYTHONUTF8: '1' } }); // Windows: stdin defaults to cp1252 and mangles Vietnamese
    if (r.status !== 0) throw new Error('piper failed: ' + r.stderr.toString().trim().split('\n').pop());
  } else if (engine === 'say') {
    const list = run('say', ['-v', '?']).stdout.toString(), v = voice && new RegExp('^' + voice + '\\s', 'm').test(list) ? voice : '';
    const r = run('say', [...(v ? ['-v', v] : []), '-r', String(Math.round(180 * rate)), '-o', tmp, text]);
    if (r.status !== 0) throw new Error('say failed: ' + r.stderr.toString().trim());
  } else if (engine === 'sapi') {
    const ps = `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; ${voice ? `$s.SelectVoice('${voice.replace(/'/g, "''")}');` : ''} $s.Rate=${Math.round((rate - 1) * 10)}; $s.SetOutputToWaveFile('${tmp.replace(/'/g, "''")}'); $s.Speak([Console]::In.ReadToEnd()); $s.Dispose()`;
    const r = run('powershell', ['-NoProfile', '-Command', ps], { input: text });
    if (r.status !== 0) throw new Error('Windows speech failed: ' + r.stderr.toString().trim().split('\n').pop());
  } else if (engine === 'edge') {
    // Microsoft neural voices through edge-tts (online, no API key): reads English tool names inside Vietnamese far better than piper
    const pct = Math.round((rate - 1) * 100), args = ['-m', 'edge_tts', '--voice', voice, `--rate=${pct < 0 ? '' : '+'}${pct}%`, '--text', text, '--write-media', tmp];
    const ok = () => fs.existsSync(tmp) && fs.statSync(tmp).size > 1000;
    let r;
    for (let k = 0; k < 5 && !ok(); k++) { // the free endpoint now and then answers with no audio: wait and retry
      if (k) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000 * k);
      r = run(PY, args, { env: { ...process.env, PYTHONUTF8: '1' }, timeout: 60000 });
    }
    if (!ok()) throw new Error('edge-tts gave no audio (it needs internet): ' + String(r?.stderr || '').trim().split('\n').pop());
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
  if (!list.every(s => s.vo) && !engine) throw new Error('voice: no text-to-speech engine found. Install one: `pip install edge-tts` (natural Microsoft voices, needs internet) or `pip install piper-tts` (offline) · macOS has `say` built in · Linux: `apt install espeak-ng` — or record each line and set `vo: file.wav` on the scene');
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
        // `say:` = what the engine reads (respell names it gets wrong); `voice:` stays the caption text
        const spoken = s.say || s.voice;
        file = path.join(CACHE, 'tts', hash(eng, vc, rate, spoken) + '.wav');
        try { if (!fs.existsSync(file)) { fs.mkdirSync(path.dirname(file), { recursive: true }); speak(eng, vc, rate, spoken, file, ff); } if (eng !== engine) { notes.push(`${engine} failed, used ${eng} instead`); engine = eng; } break; }
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
export function mixAudio(ff, { music, info, scenes, volume = 0.8, out, lufs = -14, aroll = null }) {
  const ins = [], f = [], total = info.total.toFixed(3);
  let n = 0;
  const voIdx = [], clipIdx = [];
  if (music) { ins.push('-i', music); n++; }
  if (aroll) { ins.push('-i', aroll); voIdx.push([n++, 0]); }
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
  f.push(`${parts.join('')}amix=inputs=${parts.length}:normalize=0:duration=first,atrim=0:${total},afade=t=out:st=${Math.max(0, info.total - 1.4).toFixed(2)}:d=1.4,loudnorm=I=${lufs}:TP=-1.5:LRA=11,aresample=48000,alimiter=limit=0.89[out]`);
  const r = run(ff, ['-v', 'error', '-y', ...ins, '-filter_complex', f.join(';'), '-map', '[out]', '-t', total, '-ar', '48000', out]);
  if (r.status !== 0) throw new Error('audio mix failed: ' + r.stderr.toString().split('\n').slice(0, 3).join(' '));
  return out;
}

/** Write an .srt caption file from the voice cues (absolute times). */
export function writeSrt(info, scenes, out) {
  const ts = t => { const ms = Math.max(0, Math.round(t * 1000)), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
  const rows = (info.gcap || []).map(c => [c.a, c.b, c.text]);
  info.scenes.forEach((si, k) => { const v = scenes[k]._vo; if (!v || si.voAt == null) return; for (const c of v.cues) rows.push([si.voAt + c.a, si.voAt + c.b + 0.15, c.text]); });
  if (!rows.length) return null;
  rows.sort((x, y) => x[0] - y[0]); rows.forEach((r, i) => { if (rows[i + 1] && r[1] > rows[i + 1][0] - 0.02) r[1] = rows[i + 1][0] - 0.02; });
  fs.writeFileSync(out, rows.map(([a, b, t], i) => `${i + 1}\n${ts(a)} --> ${ts(b)}\n${t}\n`).join('\n'));
  return rows.length;
}

/** Extra deliverables from the finished MP4: a looping GIF, a WebM, a cover thumbnail. */
export function extras(ff, mp4, { gif, webm, thumb, thumbAt = 1.5 }) {
  const done = [], base = mp4.replace(/\.mp4$/i, '');
  if (thumb) { const o = base + '.thumb.jpg'; if (run(ff, ['-v', 'error', '-y', '-ss', String(thumbAt), '-i', mp4, '-frames:v', '1', '-q:v', '2', o]).status === 0) done.push(o); }
  if (gif) { const o = base + '.gif'; if (run(ff, ['-v', 'error', '-y', '-i', mp4, '-vf', 'fps=15,scale=480:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0', o]).status === 0) done.push(o); }
  if (webm) { const o = base + '.webm'; if (run(ff, ['-v', 'error', '-y', '-i', mp4, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-c:a', 'libopus', '-b:a', '128k', o]).status === 0) done.push(o); }
  return done;
}

// ---------- Manim (optional): render a user/agent-written Scene to MP4, then treat it like footage ----------
export function manimCmd() {
  if (process.env.MOGRAPH_MANIM) return [process.env.MOGRAPH_MANIM];
  if (has('manim', ['--version'])) return ['manim'];
  if (has(PY, ['-c', 'import manim'])) return [PY, '-m', 'manim'];
  return null;
}
export function prepManim(ff, s, { w, h, fps, colors }) {
  const cmd = manimCmd();
  if (!cmd) throw new Error('manim scene: Manim is not installed. Install it in a virtualenv (`pip install manim`, needs pango; see docs.manim.community) and set MOGRAPH_MANIM=/path/to/venv/bin/manim — or use a bars/stat/flow scene instead');
  const src = fs.readFileSync(s.manim, 'utf8'), cls = s.scene || (src.match(/class\s+(\w+)\s*\(\s*\w*Scene\s*\)/) || [])[1];
  if (!cls) throw new Error(`manim scene: no Scene class found in ${s.manim} (set scene: ClassName)`);
  const dir = path.join(CACHE, 'manim', hash(src, cls, w, h, fps, JSON.stringify(colors)));
  const out = path.join(dir, 'out.mp4');
  if (!fs.existsSync(out)) {
    fs.mkdirSync(dir, { recursive: true });
    const cfg = path.join(dir, 'manim.cfg');
    fs.writeFileSync(cfg, `[CLI]\nbackground_color = ${colors.bg}\n`);
    const r = run(cmd[0], [...cmd.slice(1), 'render', '--config_file', cfg, '--disable_caching', '--fps', String(fps), '-r', `${w},${h}`, '--media_dir', path.join(dir, 'media'), '-o', 'scene', s.manim, cls],
      { cwd: path.dirname(s.manim), env: { ...process.env, MOGRAPH_BG: colors.bg, MOGRAPH_FG: colors.fg, MOGRAPH_AC: colors.ac, MOGRAPH_AC2: colors.ac2 }, timeout: 600000 });
    const made = r.status === 0 ? findFile(path.join(dir, 'media'), 'scene.mp4') : null;
    if (!made) throw new Error('manim render failed: ' + (r.stderr || '').toString().trim().split('\n').slice(-3).join(' | ').slice(0, 300));
    fs.renameSync(made, out);
  }
  s.clip = out;
}
function findFile(dir, name) { if (!fs.existsSync(dir)) return null; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { const f = findFile(p, name); if (f) return f; } else if (e.name === name) return p; } return null; }

/** Optional npm packages live in their own folder under the cache, so installing one never prunes another. */
export function ensurePkg(name, version, note) {
  const dir = path.join(CACHE, 'npm', name.replace(/[@/]/g, '_') + '@' + version), pkg = path.join(dir, 'node_modules', name);
  if (fs.existsSync(path.join(pkg, 'package.json'))) return pkg;
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(path.join(dir, 'package.json'))) fs.writeFileSync(path.join(dir, 'package.json'), '{"private":true}');
  if (note) console.error(note);
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund', '--no-update-notifier', '--loglevel=error', `${name}@${version}`], { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' });
  if (r.status !== 0 || !fs.existsSync(path.join(pkg, 'package.json'))) throw new Error(`could not install ${name}@${version}`);
  return pkg;
}

// ---------- A-roll: real footage + real voice as the timeline ----------
const nrm = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const tsec = x => { const m = String(x).trim().replace(',', '.').match(/(?:(\d+):)?(\d+):([\d.]+)/); return m ? (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] : NaN; };
/** Parse .srt / .vtt / whisper-style .json into [{a, b, text}] (absolute seconds). */
export function readTranscript(file) {
  const txt = fs.readFileSync(file, 'utf8');
  if (/\.json$/i.test(file)) {
    const j = JSON.parse(txt), segs = j.segments || j;
    const words = segs.flatMap(s => s.words ? s.words.map(w => ({ a: +w.start, b: +w.end, text: String(w.word).trim() })) : [{ a: +s.start, b: +s.end, text: String(s.text).trim() }]);
    return words.filter(w => w.text);
  }
  const out = [];
  for (const blk of txt.replace(/\r/g, '').split(/\n\s*\n/)) {
    const ln = blk.split('\n'), i = ln.findIndex(l => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = ln[i].split('-->').map(x => tsec(x.split(/\s+/).filter(Boolean)[0] || x));
    const text = ln.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (text && a >= 0 && b > a) out.push({ a, b, text });
  }
  return out;
}
// spread a segment's time over its words (proportional to length) → word list
const toWords = segs => segs.flatMap(s => { const w = s.text.split(/\s+/).filter(Boolean); if (w.length === 1) return [s]; const L = w.reduce((n, x) => n + x.length + 1, 0); let acc = 0; return w.map(x => { const a = s.a + (acc / L) * (s.b - s.a); acc += x.length + 1; return { a, b: s.a + (acc / L) * (s.b - s.a), text: x }; }); });

/**
 * meta.aroll: extract the footage frames, read/align the transcript, resolve each scene's `at:` (seconds or a spoken
 * phrase) into fixed durations so cuts follow the speech. Sets meta._aroll {frames, fps, len}, meta._gcap (caption cues).
 */
export function prepAroll(ff, spec, fps, maxW, notes) {
  const m = spec.meta, src = { clip: m._arollSrc || m.aroll, max: 3600 };
  prepClip(ff, src, fps, maxW);
  m._aroll = { frames: src._frames, fps, len: src._len, audio: src._hasAudio, w: src._w || 16, h: src._h || 9 };
  if (!src._hasAudio) notes.push('aroll has no sound track — add meta.audio or voice lines');
  let words = null;
  if (m.transcript) {
    if (/\.txt$/i.test(m.transcript)) {
      // plain script: align its phrases to the pauses in the real speech (approximate; an .srt is exact)
      const wav = path.join(CACHE, 'clips', hash(m.aroll, fs.statSync(m.aroll).size, 'wav') + '.wav');
      if (!fs.existsSync(wav)) run(ff, ['-v', 'error', '-y', '-i', m.aroll, '-vn', '-ac', '1', '-ar', '16000', wav]);
      const e = run(ff, ['-hide_banner', '-i', wav, '-af', 'silencedetect=noise=-32dB:d=0.25', '-f', 'null', '-']).stderr.toString();
      const st = e.match(/silence_end: ([\d.]+)/), en = [...e.matchAll(/silence_start: ([\d.]+)/g)].pop();
      const a0 = st && +e.match(/silence_start: ([\d.]+)/)[1] < 0.05 ? +st[1] : 0, a1 = en && +en[1] > src._len - 2 ? +en[1] : src._len;
      const list = phrases(fs.readFileSync(m.transcript, 'utf8').replace(/\s+/g, ' ').trim(), 4);
      words = toWords(cues(ff, wav, a1 - a0, list).map(c => ({ a: c.a + a0, b: c.b + a0, text: c.text })));
      notes.push(`transcript: script aligned to speech pauses (approximate) — export an .srt from CapCut or run \`mograph transcribe\` for exact timing`);
    } else words = toWords(readTranscript(m.transcript));
    if (!words.length) notes.push('transcript: no lines found');
  }
  // captions: group words into short lines (capwords), break on pauses and sentence ends
  if (words && words.length && m.captions !== false) {
    const max = +m.capwords || 4, cap = [];
    let cur = null;
    for (const w of words) {
      if (cur && (cur.n >= max || w.a - cur.b > 0.45 || /[.!?…]$/.test(cur.text))) { cap.push(cur); cur = null; }
      if (!cur) cur = { a: w.a, b: w.b, text: w.text, n: 1 }; else { cur.text += ' ' + w.text; cur.b = w.b; cur.n++; }
    }
    if (cur) cap.push(cur);
    cap.forEach((c, i) => { if (cap[i + 1]) c.b = Math.min(c.b + 0.25, cap[i + 1].a); });
    m._gcap = cap.map(({ a, b, text }) => ({ a: +a.toFixed(3), b: +b.toFixed(3), text }));
  }
  // timeline: scene starts from `at:`; durations fill the gaps; the video is as long as the footage
  const nw = words ? words.map(w => nrm(w.text)) : [];
  const findPhrase = (ph, from) => {
    const q = nrm(ph).split(' ');
    for (let i = 0; i + q.length <= nw.length; i++) if (words[i].a >= from - 0.05 && q.every((x, k) => nw[i + k] === x || (k === q.length - 1 && nw[i + k].startsWith(x)))) return words[i].a;
    return null;
  };
  const L = src._len, starts = [];
  let prev = 0;
  spec.scenes.forEach((s, i) => {
    let t = null;
    if (i === 0) t = 0;
    else if (typeof s.at === 'number' || (s.at != null && !isNaN(+s.at))) t = +s.at;
    else if (s.at != null) { if (!words) throw new Error(`s${i + 1}: at "${s.at}" is a phrase — needs meta.transcript (.srt/.vtt/.json/.txt)`); t = findPhrase(s.at, prev); if (t == null) throw new Error(`s${i + 1}: phrase "${s.at}" not found in the transcript after ${prev.toFixed(1)}s`); t = Math.max(prev + 0.5, t - 0.08); }
    starts.push(t); if (t != null) prev = t;
  });
  // scenes without `at`: use their dur after the previous start, else share the gap evenly
  for (let i = 1; i < starts.length; i++) if (starts[i] == null) {
    let j = i; while (j < starts.length && starts[j] == null) j++;
    const a = starts[i - 1], b = j < starts.length ? starts[j] : L;
    for (let k = i; k < j; k++) starts[k] = spec.scenes[k - 1].dur && k === i ? a + +spec.scenes[k - 1].dur : a + ((b - a) * (k - i + 1)) / (j - i + 1);
  }
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : L, d = end - starts[i];
    if (!(d >= 0.4)) throw new Error(`s${i + 1}: starts at ${starts[i].toFixed(2)}s but the next cut is at ${end.toFixed(2)}s — check at: order`);
    spec.scenes[i].dur = Math.round(d * 1000) / 1000; spec.scenes[i]._at = starts[i];
  }
  return m._aroll;
}

/** Speech-to-text with word timestamps via faster-whisper (pip install faster-whisper; model downloads once from Hugging Face). */
export function transcribe(ff, file, { lang, model = 'small', out }) {
  const wav = path.join(CACHE, 'clips', hash(file, fs.statSync(file).size, 'wav') + '.wav');
  fs.mkdirSync(path.dirname(wav), { recursive: true });
  if (!fs.existsSync(wav)) { const r = run(ff, ['-v', 'error', '-y', '-i', file, '-vn', '-ac', '1', '-ar', '16000', wav]); if (r.status) throw new Error('cannot read audio of ' + file); }
  const py = `import json,sys
from faster_whisper import WhisperModel
m=WhisperModel(sys.argv[2],device="auto",compute_type="int8")
segs,_=m.transcribe(sys.argv[1],language=(sys.argv[3] or None),word_timestamps=True,vad_filter=True)
json.dump({"segments":[{"start":s.start,"end":s.end,"text":s.text,"words":[{"start":w.start,"end":w.end,"word":w.word} for w in s.words]} for s in segs]},open(sys.argv[4],"w",encoding="utf8"),ensure_ascii=False)`;
  const r = run(PY, ['-c', py, wav, model, lang || '', out], { stdio: ['ignore', 'inherit', 'pipe'] });
  if (r.status !== 0) {
    const err = (r.stderr || '').toString();
    if (/No module named/.test(err)) throw new Error('faster-whisper is not installed: `pip install faster-whisper` — or export subtitles (.srt) from CapCut/Premiere/YouTube and use that as meta.transcript');
    throw new Error('transcribe failed: ' + err.split('\n').filter(Boolean).slice(-2).join(' '));
  }
  return readTranscript(out).length;
}

/** Jump cut: drop pauses longer than `gap` seconds from a talking video (keeps `pad` s of air around speech). */
export function jumpcut(ff, file, out, { gap = 0.45, pad = 0.12, noise = -32 }) {
  const info = probe(ff, file);
  const e = run(ff, ['-hide_banner', '-i', file, '-vn', '-af', `silencedetect=noise=${noise}dB:d=${gap}`, '-f', 'null', '-']).stderr.toString();
  const sil = [], re = /silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g;
  let m; while ((m = re.exec(e))) sil.push([+m[1] + pad, +m[2] - pad]);
  const keep = []; let t = 0;
  for (const [a, b] of sil) { if (b - a < 0.05) continue; if (a > t + 0.05) keep.push([t, a]); t = b; }
  if (info.dur > t + 0.05) keep.push([t, info.dur]);
  if (!sil.length) { fs.copyFileSync(file, out); return { cuts: 0, before: info.dur, after: info.dur }; }
  const sel = keep.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join('+');
  const r = run(ff, ['-v', 'error', '-y', '-i', file, '-vf', `select='${sel}',setpts=N/FRAME_RATE/TB`, '-af', `aselect='${sel}',asetpts=N/SR/TB`, '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-c:a', 'aac', '-b:a', '192k', out]);
  if (r.status) throw new Error('jumpcut failed: ' + r.stderr.toString().split('\n')[0]);
  return { cuts: keep.length - 1, before: info.dur, after: keep.reduce((n, [a, b]) => n + b - a, 0) };
}
