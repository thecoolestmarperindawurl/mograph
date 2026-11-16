// Optional bridge to OpenMontage (https://github.com/calesthio/OpenMontage, AGPL-3.0).
// mograph never bundles it: `mograph openmontage setup` clones a pinned commit into the cache and
// runs its tools as a separate Python program through scripts/om_bridge.py (JSON in, JSON out).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CACHE } from './media.mjs';

export const OM_REPO = 'https://github.com/calesthio/OpenMontage';
export const OM_COMMIT = 'fecb9a1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const run = (cmd, args, o = {}) => spawnSync(cmd, args, { maxBuffer: 1 << 26, ...o });
const PY = process.platform === 'win32' ? 'python' : 'python3';
export const omDir = () => process.env.OPENMONTAGE_DIR || path.join(CACHE, 'openmontage');
const venvPy = () => path.join(omDir(), '.venv-mograph', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
// light deps only: what the editing tools below import (opencv 4: OpenMontage's face fallback needs its Haar cascades)
const DEPS = ['numpy', 'pyyaml', 'pydantic>=2', 'jsonschema', 'pillow', 'requests', 'python-dotenv', 'opencv-python-headless<5'];

/** Tools mograph exposes (name → module:Class, what it is for). Any other OpenMontage tool works by module:Class. */
export const OM_TOOLS = {
  reframe: ['tools.video.auto_reframe:AutoReframe', 'landscape talking-head → 9:16 (or 1:1) with the crop following the face'],
  faces: ['tools.analysis.face_tracker:FaceTracker', 'face boxes per frame (JSON)'],
  scenes: ['tools.analysis.scene_detect:SceneDetect', 'shot boundaries of a long video (JSON) — pick b-roll / cut points'],
  enhance: ['tools.audio.audio_enhance:AudioEnhance', 'clean a recorded voice: preset clean_speech | noise_reduce | …'],
  silence: ['tools.video.silence_cutter:SilenceCutter', 'remove pauses (alternative to `mograph jumpcut`)'],
  grade: ['tools.enhancement.color_grade:ColorGrade', 'colour grade footage with a preset'],
  transcribe: ['tools.analysis.transcriber:Transcriber', 'speech → words with timestamps (faster-whisper / WhisperX)'],
};

export function omStatus() {
  if (!fs.existsSync(path.join(omDir(), 'tools'))) return null;
  return { dir: omDir(), ready: fs.existsSync(venvPy()) };
}

export function omSetup(log = console.error) {
  const dir = omDir();
  if (!fs.existsSync(path.join(dir, 'tools'))) {
    log(`cloning OpenMontage @${OM_COMMIT} (AGPL-3.0, kept outside mograph) → ${dir}`);
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    let r = run('git', ['clone', '-q', '--filter=blob:none', OM_REPO, dir], { stdio: 'inherit' });
    if (r.status) throw new Error('git clone failed — check network access to github.com, or set OPENMONTAGE_DIR to an existing checkout');
    r = run('git', ['-C', dir, 'checkout', '-q', OM_COMMIT], { stdio: 'inherit' });
    if (r.status) throw new Error('cannot check out ' + OM_COMMIT);
  }
  if (!fs.existsSync(venvPy())) {
    log('creating its Python environment (light deps, ~1 min)…');
    let r = run(PY, ['-m', 'venv', path.join(dir, '.venv-mograph')], { stdio: 'inherit' });
    if (r.status) throw new Error(`${PY} -m venv failed — install Python 3.10+`);
    r = run(venvPy(), ['-m', 'pip', 'install', '-q', '--disable-pip-version-check', ...DEPS], { stdio: 'inherit' });
    if (r.status) { fs.rmSync(path.join(dir, '.venv-mograph'), { recursive: true, force: true }); throw new Error('pip install failed'); }
  }
  return dir;
}

/** Run one OpenMontage tool. Returns { success, data, artifacts, error }. */
export function omRun(tool, inputs) {
  if (!omStatus()?.ready) throw new Error('OpenMontage is not installed — run `mograph openmontage setup` (optional add-on)');
  const target = OM_TOOLS[tool] ? OM_TOOLS[tool][0] : tool;
  if (!/^[\w.]+:\w+$/.test(target)) throw new Error(`unknown OpenMontage tool "${tool}" (${Object.keys(OM_TOOLS).join(', ')}, or module:Class)`);
  const r = run(venvPy(), ['-I', path.join(HERE, 'om_bridge.py'), omDir(), target, JSON.stringify(inputs)], { timeout: 3600e3 });
  const m = r.stdout.toString().match(/@@OM@@(.*)$/m);
  if (!m) throw new Error(`OpenMontage ${tool} crashed: ${r.stderr.toString().trim().split('\n').slice(-2).join(' ')}`);
  return JSON.parse(m[1]);
}

/** Face-following reframe of footage for one output aspect, cached. Returns the path of the reframed file (or null if not needed). */
export function reframeFor(src, w, h, probeWH) {
  const [sw, sh] = probeWH;
  if (!sw || !sh || Math.abs(Math.log((sw / sh) / (w / h))) < 0.25) return null; // aspects already close: plain cover crop is fine
  const st = fs.statSync(src), key = crypto.createHash('sha1').update([src, st.size, st.mtimeMs, w, h, OM_COMMIT].join('\0')).digest('hex').slice(0, 14);
  const out = path.join(CACHE, 'reframe', key + '.mp4');
  if (fs.existsSync(out)) return { file: out, method: 'cached' };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const res = omRun('reframe', { input_path: path.resolve(src), output_path: out, target_width: w % 2 ? w - 1 : w, target_height: h % 2 ? h - 1 : h });
  if (!res.success || !fs.existsSync(out)) throw new Error('reframe failed: ' + (res.error || 'no output'));
  return { file: out, method: res.data?.method };
}
