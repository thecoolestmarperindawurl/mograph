#!/usr/bin/env node
// mograph CLI — lint | sheet | render | catalog. Output is deliberately terse (it is read by an agent).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { normalize, catalog } from './schema.mjs';
import { STYLES, synth, detectBeat } from './audio.mjs';
import { probe, prepClip, prepVoices, mixAudio, ttsEngines, CACHE } from './media.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const die = m => { console.error('ERR ' + m); process.exit(1); };
// first run: install the two npm dependencies into the skill folder (works the same on Windows, macOS, Linux)
let triedInstall = false;
const need = (names, hint) => {
  for (const n of names) try { return require(n); } catch {}
  if (!triedInstall && !process.env.MOGRAPH_NO_INSTALL) {
    triedInstall = true;
    console.log('installing mograph dependencies (first run, ~10s)…');
    const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund', '--no-update-notifier', '--loglevel=error'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status === 0) for (const n of names) try { return require(n); } catch {}
  }
  if (hint === '') throw new Error('missing ' + names[0]);
  die(hint);
};

const argv = process.argv.slice(2), cmd = argv[0], pos = [], opt = {};
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) opt[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[++i] : true;
  else if (a === '-o') opt.o = argv[++i];
  else pos.push(a);
}

function load(file) {
  if (!file) die('usage: mograph <lint|sheet|render> <spec.yaml> [options]');
  if (!fs.existsSync(file)) die(`spec not found: ${file}`);
  const txt = fs.readFileSync(file, 'utf8');
  let raw;
  try { raw = /\.json$/.test(file) ? JSON.parse(txt) : need(['yaml'], `missing deps — run: cd "${ROOT}" && npm install`).parse(txt); }
  catch (e) { die('cannot parse spec: ' + e.message.split('\n')[0]); }
  if (opt.size && raw && typeof raw === 'object') raw.meta = { ...(raw.meta || {}), size: opt.size };
  const r = normalize(raw), dir = path.dirname(path.resolve(file));
  if (r.spec) {
    const res = (o, k) => { if (!o[k] || /^(https?|file|data):/.test(o[k])) return; const p = path.resolve(dir, o[k]); if (!fs.existsSync(p)) r.errors.push(`file not found: ${o[k]}`); o[k] = pathToFileURL(p).href; };
    for (const s of r.spec.scenes) for (const k of ['image', 'logo', 'avatar']) if (k !== 'image' || s.type === 'image') res(s, k);
    const VID = /\.(mp4|mov|webm|m4v)$/i;
    for (const s of r.spec.scenes) {
      for (const k of ['split', 'device', 'sting']) if (s.type === k) res(s, k);
      if (s.type === 'grid' && Array.isArray(s.grid)) s.grid = s.grid.map(g => { const o = { g }; res(o, 'g'); return o.g; });
      if (s.type === 'device' && VID.test(s.device)) s.clip = fileURLToPath(s.device);
    }
    for (const s of r.spec.scenes) for (const k of s.type === 'clip' ? ['clip', 'vo'] : ['vo']) if (s[k]) { const p = path.resolve(dir, s[k]); if (!fs.existsSync(p)) r.errors.push(`file not found: ${s[k]}`); else s[k] = p; }
    res(r.spec.meta, 'mascot');
    if (r.spec.meta.audio) { r.spec.meta.audio = path.resolve(dir, r.spec.meta.audio); if (!fs.existsSync(r.spec.meta.audio)) r.errors.push(`audio not found: ${r.spec.meta.audio}`); }
  }
  return { ...r, txt, dir };
}

const ffbin = () => process.env.MOGRAPH_FFMPEG || (spawnSync('ffmpeg', ['-version']).status === 0 ? 'ffmpeg' : (() => { try { return require('ffmpeg-static'); } catch { die('ffmpeg not found — install ffmpeg or `npm i ffmpeg-static`, or set MOGRAPH_FFMPEG'); } })());
// beat grid for the engine: built-in music has an exact BPM; a user file is analysed once per run
function prepBeat(spec) {
  const m = spec.meta;
  if (m.sync === 'off' || !(m.music || m.audio)) return;
  if (m.music) m._beat = { p: 60 / (m.bpm || STYLES[m.music].bpm), o: 0 };
  else if (m.bpm) m._beat = { p: 60 / m.bpm, o: 0 };
  else { try { const d = detectBeat(m.audio, ffbin()); m._beat = { p: 60 / d.bpm, o: d.offset, conf: d.conf, alt: d.alt }; } catch (e) { console.log('WARN beat detection failed (' + e.message + ') — cuts are not synced; set meta.bpm'); return; } }
  m._beat.n = m.sync === 'beat' ? 1 : m.sync === 'bar' ? 4 : 2;
}
// footage frames + voiceover, before the engine measures timing
function prepMedia(r, fps, maxW) {
  const ff = ffbin(), sp = r.spec, notes = [];
  for (const s of sp.scenes) if (s.type === 'clip' || (s.type === 'device' && s.clip)) try { prepClip(ff, s, fps, maxW); } catch (e) { r.errors.push(e.message); }
  try { const v = prepVoices(ff, sp, r.dir); if (v) { r.voice = v; notes.push(...v.notes); } } catch (e) { r.errors.push(e.message); }
  r.warns.push(...notes);
}
async function browser() {
  const pw = need(['playwright-core', 'playwright'], `missing deps — run: cd "${ROOT}" && npm install`);
  const tries = process.env.MOGRAPH_CHROME ? [{ executablePath: process.env.MOGRAPH_CHROME }] : [{}, { channel: 'chrome' }, { channel: 'msedge' }];
  for (const o of tries) try { return await pw.chromium.launch({ ...o, args: ['--font-render-hinting=none', '--disable-lcd-text'] }); } catch {}
  die('no Chromium/Chrome found — install Google Chrome or set MOGRAPH_CHROME=/path/to/chrome');
}
async function stagePage(br, spec, scale = 1) {
  const cx = await br.newContext({ viewport: { width: spec.meta.w, height: spec.meta.h }, deviceScaleFactor: scale });
  const page = await cx.newPage();
  await page.goto(pathToFileURL(path.join(ROOT, 'engine/index.html')).href);
  const info = await page.evaluate(s => window.__mg.init(s), spec);
  return { page, info };
}
const pickScenes = (v, n) => {
  if (!v || v === true) return null;
  const set = new Set();
  for (const part of String(v).split(',')) { const [a, b = a] = part.split('-').map(Number); for (let i = a; i <= b; i++) if (i >= 1 && i <= n) set.add(i); }
  return set.size ? set : die(`--scenes "${v}" matches nothing (1–${n})`);
};
const tok = n => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));

function report(r, info) {
  const out = [];
  for (const e of r.errors) out.push('ERR  ' + e);
  if (info) {
    const m = r.spec.meta;
    for (const s of info.scenes) {
      if (s.overflow) out.push(`ERR  s${s.i} ${s.type}: content overflows the safe area even at 60% size — cut text or split the scene`);
      else if (s.fit < 0.8) out.push(`WARN s${s.i} ${s.type}: auto-shrunk to ${Math.round(s.fit * 100)}% — shorten text for legibility`);
      if (s.fixed && s.dur < s.need) out.push(`WARN s${s.i} ${s.type}: dur ${s.dur}s is shorter than its animation (${s.need}s)`);
      if (s.imgErr) out.push(`ERR  s${s.i}: image failed to load`);
    }
    if (r.voice) { const sc = r.spec.scenes.filter(x => x._vo); const snap = sc.reduce((a, x) => a + (x._vo.cues[0]?.snapped || 0), 0) / sc.length; out.push(`🎙 ${r.voice.engine} · ${sc.length} voice line(s) · ${sc.reduce((a, x) => a + x._vo.dur, 0).toFixed(1)}s speech · captions ${m.captions === false ? 'off' : `on, ${Math.round(snap * 100)}% of phrase breaks matched to pauses`}`); }
    if (info.beat) out.push(`♪ ${m.music || 'audio'} ${(60 / info.beat.p).toFixed(1)} bpm · cuts every ${info.beat.n} beat(s) = ${(info.beat.p * info.beat.n).toFixed(2)}s${info.beat.conf != null ? ` · detection confidence ${info.beat.conf}${info.beat.conf < 0.15 ? ' (LOW — check by ear or set meta.bpm)' : ''}${info.beat.alt && info.beat.alt.length ? ` · could also be ${info.beat.alt.join(' or ')} bpm — if cuts feel rushed or slow, set meta.bpm` : ''}` : ''}`);
    if (m.max && info.total > m.max) out.push(`WARN total ${info.total}s exceeds meta.max ${m.max}s — cut scenes or set pace < 1`);
  }
  for (const w of r.warns) out.push('WARN ' + w);
  const bad = out.some(l => l.startsWith('ERR'));
  if (info) {
    out.unshift(`${bad ? 'FAIL' : 'OK'} ${info.scenes.length} scenes · ${info.total}s · ${info.w}x${info.h}@${info.fps} · spec ≈${tok(Math.ceil(r.txt.length / 3.6))} tokens`,
      info.scenes.map(s => `${s.i}:${s.type} ${s.dur}s${s.fit < 1 ? ` fit${Math.round(s.fit * 100)}%` : ''}`).join(' | ') + (r.spec.meta.look ? `\nlook ${r.spec.meta.look} · seed ${r.spec.meta.seed ?? 1} · ` + info.scenes.map(s => `${s.i}:${s.anim}/${s.tr}`).join(' ') : ''));
  }
  console.log(out.join('\n'));
  return !bad;
}

async function assets(dir) {
  const ext = /\.(png|jpe?g|webp|gif|svg|mp3|wav|m4a|aac|ogg|mp4|mov|webm)$/i, rows = [], imgs = [];
  for (const f of fs.readdirSync(dir).filter(f => ext.test(f)).sort()) {
    const p = path.join(dir, f), kb = Math.round(fs.statSync(p).size / 1024);
    const pr = probe(ffbin(), p), v = pr.w ? { width: pr.w, height: pr.h } : null, isA = /\.(mp3|wav|m4a|aac|ogg)$/i.test(f), isV = /\.(mp4|mov|webm)$/i.test(f);
    let use;
    if (isA) use = `meta.audio (${pr.dur.toFixed(0)}s) — run \`beat\` to check BPM · or \`vo:\` for a recorded voice line`;
    else if (isV) use = `\`clip\` scene (${pr.dur.toFixed(1)}s${pr.audio ? ', has sound' : ''}) — trim with from/to; \`fill: true\` for full-screen footage`;
    else if (/\.svg$/i.test(f) || !v) use = 'vector: logo / mascot';
    else {
      const r = v.width / v.height, alpha = pr.alpha;
      use = alpha && Math.max(v.width, v.height) <= 1400 ? 'transparent: logo / mascot / avatar' : r >= 1.4 ? '`image` scene (wide: fills a window card — best for product shots, screenshots)' : r <= 0.8 ? '`image` scene, 9:16 only (tall)' : '`image` scene or `avatar`';
      if (v.width < 700 && !alpha) use += ' · low-res, will look soft full-width';
    }
    rows.push(`${f.padEnd(34)} ${(v ? v.width + 'x' + v.height : '-').padEnd(10)} ${String(kb).padStart(5)}KB  ${use}`);
    if (v && !isV) imgs.push({ f, p });
  }
  console.log(rows.length ? rows.join('\n') : 'no media files in ' + dir);
  if (opt.sheet && imgs.length) {
    const br = await browser(), pg = await (await br.newContext({ viewport: { width: Math.min(imgs.length, 5) * 248 + 8, height: 100 } })).newPage();
    await pg.setContent(`<body style="margin:0;padding:8px 0 0 8px;background:#111;font:600 11px system-ui;color:#ddd;display:flex;flex-wrap:wrap">${imgs.map(i => `<div style="margin:0 8px 8px 0;width:240px"><div style="padding:0 0 4px;overflow:hidden;white-space:nowrap">${i.f}</div><img src="${pathToFileURL(path.resolve(i.p)).href}" style="display:block;width:240px;height:150px;object-fit:contain;background:#222"></div>`).join('')}</body>`);
    await pg.waitForLoadState('load');
    const out = opt.o || path.join(dir, 'assets.sheet.jpg'); await pg.screenshot({ path: out, fullPage: true, type: 'jpeg', quality: 78 });
    const d = await pg.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
    console.log(`sheet → ${out} (≈${tok(Math.round((d[0] * d[1]) / 750))} image tokens to view)`); await br.close();
  }
}
async function doctor() {
  const os_ = process.platform, ok = [], bad = [];
  const hint = { darwin: { ff: 'brew install ffmpeg', chrome: 'install Google Chrome', tts: '`say` is built in; for better voices: pip3 install piper-tts' }, win32: { ff: 'winget install Gyan.FFmpeg  (or: npm i --prefix <skill dir> ffmpeg-static)', chrome: 'install Google Chrome or Microsoft Edge', tts: 'Windows speech is built in; for better voices: pip install piper-tts' }, linux: { ff: 'sudo apt install ffmpeg', chrome: 'install Google Chrome, or: npx playwright install chromium', tts: 'pip3 install piper-tts  (or: sudo apt install espeak-ng)' } }[os_] || {};
  const nv = +process.versions.node.split('.')[0];
  (nv >= 18 ? ok : bad).push(`node ${process.versions.node}${nv >= 18 ? '' : ' — need 18+'}`);
  for (const d of ['yaml', 'playwright-core']) { try { need([d], ''); ok.push(d); } catch { bad.push(`${d} missing — cd "${ROOT}" && npm install`); } }
  let ff = null; try { ff = process.env.MOGRAPH_FFMPEG || (spawnSync('ffmpeg', ['-version']).status === 0 ? 'ffmpeg' : require('ffmpeg-static')); } catch {}
  if (ff && spawnSync(ff, ['-version']).status === 0) ok.push('ffmpeg ' + (spawnSync(ff, ['-version']).stdout.toString().match(/version (\S+)/) || [])[1]); else bad.push('ffmpeg missing — ' + hint.ff);
  try { const pw = require('playwright-core'); let b = null; for (const o of process.env.MOGRAPH_CHROME ? [{ executablePath: process.env.MOGRAPH_CHROME }] : [{}, { channel: 'chrome' }, { channel: 'msedge' }]) { try { b = await pw.chromium.launch(o); break; } catch {} } if (b) { ok.push('browser ' + b.version()); await b.close(); } else bad.push('no Chrome/Edge/Chromium — ' + hint.chrome); } catch {}
  const t = ttsEngines(); (t.length ? ok : bad).push(t.length ? 'voice: ' + t.join(', ') : 'no text-to-speech (only needed for `voice:`) — ' + hint.tts);
  console.log(`${os_} · cache ${CACHE}\n` + ok.map(x => '  ok   ' + x).join('\n') + (bad.length ? '\n' + bad.map(x => '  MISS ' + x).join('\n') : ''));
  process.exitCode = bad.some(x => !/text-to-speech/.test(x)) ? 1 : 0;
}
async function main() {
  if (cmd === 'catalog') return console.log(catalog(pos[0]));
  if (cmd === 'music') {
    if (!opt.o) return console.log('mograph music --style <' + Object.keys(STYLES).join('|') + '> [--bpm N] --dur <seconds> -o track.wav\n' + Object.entries(STYLES).map(([k, v]) => `  ${k.padEnd(9)} ${v.bpm} bpm — ${v.d}`).join('\n'));
    const r = synth({ style: opt.style || 'upbeat', bpm: +opt.bpm || undefined, dur: +opt.dur || 30, out: opt.o });
    return console.log(`music → ${opt.o} · ${r.bpm} bpm · ${r.bars} bars · original synth track, free to use`);
  }
  if (cmd === 'beat') { const d = detectBeat(pos[0], ffbin()); return console.log(`${d.bpm} bpm · first beat at ${d.offset}s · confidence ${d.conf}${d.conf < 0.15 ? ' (LOW)' : ''}${d.alt.length ? ` · could also be ${d.alt.join(' or ')} bpm (other readings of the same rhythm)` : ''}`); }
  if (cmd === 'assets') return assets(pos[0] || '.');
  if (cmd === 'doctor') return doctor();
  if (!['lint', 'sheet', 'render', 'remix'].includes(cmd)) {
    return console.log('mograph <command> <spec.yaml>\n  catalog [type]                 scene types / fields (read on demand)\n  lint <spec>                    validate + measure text fit + timing (text only, no images)\n  sheet <spec> [--scenes 2,5-6] [--frames 3] [-o sheet.jpg]   contact sheet for visual QA\n  doctor                         check node, browser, ffmpeg, voice engines (prints install hints)\n  assets <dir> [--sheet]         list images/audio with size + how to use each (text; --sheet adds one thumbnail image)\n  music --style upbeat --dur 40 -o track.wav   write a built-in track · beat <audio>   detect BPM of your own file\n  remix <spec> [--looks bold,kinetic,editorial] [--seeds 1,2] [--scenes 1-4] [-o f.jpg]   one image comparing looks/seeds (rows) across scenes\n  render <spec> [--draft] [--scenes 1-3] [-o out.mp4]         render video\n  any command: --size 16:9   override meta.size (same spec, another aspect ratio)');
  }
  const r = load(pos[0]);
  if (!r.spec) { report(r, null); process.exit(1); }
  prepBeat(r.spec);
  const base = pos[0].replace(/\.(ya?ml|json)$/, '');
  const br = await browser();
  try {
    const draftR = cmd === 'render' && !!opt.draft;
    prepMedia(r, cmd === 'render' ? (draftR ? Math.min(15, r.spec.meta.fps) : r.spec.meta.fps) : 6, cmd === 'render' && !draftR ? 1280 : 640);
    if (cmd === 'lint') { const { info } = await stagePage(br, r.spec); process.exitCode = report(r, info) ? 0 : 1; return; }

    if (cmd === 'remix') {
      // rows = variants (look × seed), columns = scenes at their settled frame; one image to pick a direction from
      const { LOOKS } = await import('./schema.mjs');
      const looks = opt.looks ? String(opt.looks).split(',') : r.spec.meta.look ? [r.spec.meta.look] : ['clean', 'bold', 'kinetic', 'editorial'];
      const seeds = opt.seeds ? String(opt.seeds).split(',').map(Number) : looks.length > 1 ? [r.spec.meta.seed ?? 1] : [1, 2, 3];
      for (const l of looks) if (!LOOKS[l]) die(`unknown look "${l}" (${Object.keys(LOOKS).join(', ')})`);
      const portrait = r.spec.meta.h > r.spec.meta.w, tw = portrait ? 150 : 250, scale = tw / r.spec.meta.w;
      const want = pickScenes(opt.scenes || '1-' + Math.min(r.spec.scenes.length, portrait ? 6 : 4), r.spec.scenes.length), rows = [];
      for (const look of looks) for (const seed of seeds) {
        const sp = JSON.parse(JSON.stringify(r.spec)); Object.assign(sp.meta, { look, seed }); delete sp.meta.anim; delete sp.meta.transition; delete sp.meta.fx; delete sp.meta.bg;
        const { page, info } = await stagePage(br, sp, scale), cells = [];
        for (const s of info.scenes) {
          if (!want.has(s.i)) continue;
          await page.evaluate(x => window.__mg.seek(x), s.start + Math.min(s.need - 0.6, s.dur - 0.5));
          cells.push('data:image/jpeg;base64,' + (await page.screenshot({ type: 'jpeg', quality: 72 })).toString('base64'));
        }
        rows.push({ label: `${String.fromCharCode(65 + rows.length)} · look: ${look} · seed: ${seed}`, sub: info.scenes.filter(s => want.has(s.i)).map(s => `${s.i}:${s.anim}/${s.tr}`).join('  '), cells });
        await page.context().close();
      }
      const W0 = Math.min(1480, rows[0].cells.length * (tw + 6) + 12);
      const pg = await (await br.newContext({ viewport: { width: W0, height: 100 } })).newPage();
      await pg.setContent(`<body style="margin:0;padding:6px;background:#111;font:600 12px system-ui;color:#ddd">${rows.map(rw => `<div style="margin:0 0 8px"><div style="padding:2px 0 4px"><b style="color:#fff">${rw.label}</b> <span style="color:#999;font-weight:500">${rw.sub}</span></div><div style="display:flex;gap:6px">${rw.cells.map(src => `<img src="${src}" width="${tw}">`).join('')}</div></div>`).join('')}</body>`);
      const out = opt.o || base + '.remix.jpg';
      await pg.screenshot({ path: out, fullPage: true, type: 'jpeg', quality: 80 });
      const dim = await pg.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
      console.log(rows.map(rw => rw.label).join('\n'));
      console.log(`remix → ${out} · ${rows.length} variants × ${rows[0].cells.length} scenes · ≈${tok(Math.round((dim[0] * dim[1]) / 750))} image tokens to view. Apply the chosen row with meta.look + meta.seed (one line).`);
      return;
    }
    if (cmd === 'sheet') {
      const portrait = r.spec.meta.h > r.spec.meta.w, tw = portrait ? 288 : 480, scale = tw / r.spec.meta.w;
      const { page, info } = await stagePage(br, r.spec, scale);
      if (!report(r, info)) process.exitCode = 1;
      const want = pickScenes(opt.scenes, info.scenes.length), nf = Math.max(1, +opt.frames || 1), cells = [];
      for (const s of info.scenes) {
        if (want && !want.has(s.i)) continue;
        const lastT = s.dur - (s.i === info.scenes.length ? 0.03 : 0.45);
        for (let k = 1; k <= nf; k++) {
          const t = s.start + (k === nf ? lastT : Math.min(lastT, ((s.need - 0.8) * k) / (nf - 1 || 1)));
          await page.evaluate(x => window.__mg.seek(x), t);
          const b = await page.screenshot({ type: 'jpeg', quality: 82 });
          cells.push({ src: 'data:image/jpeg;base64,' + b.toString('base64'), label: `#${s.i} ${s.type} · ${t.toFixed(1)}s` });
        }
      }
      const cols = Math.min(cells.length, Math.floor(1480 / (tw + 8)));
      const pg = await (await br.newContext({ viewport: { width: cols * (tw + 8) + 8, height: 100 } })).newPage();
      await pg.setContent(`<body style="margin:0;padding:8px 0 0 8px;background:#111;font:600 12px system-ui;color:#ddd;display:flex;flex-wrap:wrap">${cells.map(c => `<div style="margin:0 8px 8px 0"><div style="padding:0 0 4px">${c.label}</div><img src="${c.src}" width="${tw}" style="display:block"></div>`).join('')}</body>`);
      const out = opt.o || base + '.sheet.jpg';
      await pg.screenshot({ path: out, fullPage: true, type: 'jpeg', quality: 80 });
      const dim = await pg.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
      console.log(`sheet → ${out} · ${cells.length} frames · ${dim[0]}x${dim[1]} (≈${tok(Math.round((dim[0] * dim[1]) / 750))} image tokens to view)`);
      return;
    }

    // render
    const want = pickScenes(opt.scenes, r.spec.scenes.length);
    if (want) r.spec.scenes = r.spec.scenes.filter((_, i) => want.has(i + 1));
    const draft = !!opt.draft, scale = draft ? 0.5 : 1, fps = draft ? Math.min(15, r.spec.meta.fps) : r.spec.meta.fps;
    const nW = Math.max(1, Math.min(+opt.workers || 4, os.cpus().length));
    const pages = await Promise.all(Array.from({ length: nW }, () => stagePage(br, r.spec, scale)));
    const info = pages[0].info;
    if (!report(r, info)) die('fix lint errors before rendering');
    const ff = ffbin();
    const out = opt.o || base + (draft ? '.draft.mp4' : '.mp4'), m = r.spec.meta;
    let audio = null, tmp = [];
    if (!want) {
      let mus = m.audio || null;
      if (m.music) { mus = out + '.music.wav'; tmp.push(mus); synth({ style: m.music, bpm: m.bpm, dur: info.total, out: mus }); }
      const mix = out + '.mix.wav'; tmp.push(mix);
      audio = mixAudio(ff, { music: mus, info, scenes: r.spec.scenes, volume: m.volume ?? (r.voice ? 0.55 : 0.8), out: mix });
    }
    const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      ...(audio ? ['-i', audio, '-c:a', 'aac', '-b:a', '192k', '-t', String(info.total)] : []),
      '-c:v', 'libx264', '-preset', draft ? 'veryfast' : 'medium', '-crf', draft ? '26' : '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out];
    const enc = spawn(ff, args, { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => enc.on('close', c => (c ? rej(new Error('ffmpeg exited ' + c)) : res())));
    const total = Math.round(info.total * fps), t0 = Date.now();
    for (let f = 0; f < total; f += nW) {
      const bufs = await Promise.all(pages.slice(0, Math.min(nW, total - f)).map(async ({ page }, k) => {
        await page.evaluate(x => window.__mg.seek(x), (f + k) / fps);
        return page.screenshot({ type: 'jpeg', quality: draft ? 80 : 95 });
      }));
      for (const b of bufs) if (!enc.stdin.write(b)) await new Promise(res => enc.stdin.once('drain', res));
      if (process.stdout.isTTY) process.stdout.write(`\r${f}/${total}`);
    }
    enc.stdin.end(); await done;
    for (const f of tmp) fs.rmSync(f, { force: true });
    if (process.stdout.isTTY) process.stdout.write('\r');
    console.log(`video → ${out} · ${info.total}s · ${total} frames@${fps} · ${(fs.statSync(out).size / 1e6).toFixed(1)}MB · ${((Date.now() - t0) / 1000).toFixed(0)}s render`);
  } finally { await br.close(); }
}
main().catch(e => die(e.message));
