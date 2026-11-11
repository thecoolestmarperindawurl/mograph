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

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const die = m => { console.error('ERR ' + m); process.exit(1); };
const need = (names, hint) => { for (const n of names) try { return require(n); } catch {} die(hint); };

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
  try { raw = /\.json$/.test(file) ? JSON.parse(txt) : need(['yaml'], `missing deps — run: npm install --prefix "${ROOT}"`).parse(txt); }
  catch (e) { die('cannot parse spec: ' + e.message.split('\n')[0]); }
  if (opt.size && raw && typeof raw === 'object') raw.meta = { ...(raw.meta || {}), size: opt.size };
  const r = normalize(raw), dir = path.dirname(path.resolve(file));
  if (r.spec) {
    const res = (o, k) => { if (!o[k] || /^(https?|file|data):/.test(o[k])) return; const p = path.resolve(dir, o[k]); if (!fs.existsSync(p)) r.errors.push(`file not found: ${o[k]}`); o[k] = pathToFileURL(p).href; };
    for (const s of r.spec.scenes) for (const k of ['image', 'logo', 'avatar']) if (k !== 'image' || s.type === 'image') res(s, k);
    res(r.spec.meta, 'mascot');
    if (r.spec.meta.audio) { r.spec.meta.audio = path.resolve(dir, r.spec.meta.audio); if (!fs.existsSync(r.spec.meta.audio)) r.errors.push(`audio not found: ${r.spec.meta.audio}`); }
  }
  return { ...r, txt };
}

const ffbin = () => process.env.MOGRAPH_FFMPEG || (spawnSync('ffmpeg', ['-version']).status === 0 ? 'ffmpeg' : (() => { try { return require('ffmpeg-static'); } catch { die('ffmpeg not found — install ffmpeg or `npm i ffmpeg-static`, or set MOGRAPH_FFMPEG'); } })());
// beat grid for the engine: built-in music has an exact BPM; a user file is analysed once per run
function prepBeat(spec) {
  const m = spec.meta;
  if (m.sync === 'off' || !(m.music || m.audio)) return;
  if (m.music) m._beat = { p: 60 / (m.bpm || STYLES[m.music].bpm), o: 0 };
  else if (m.bpm) m._beat = { p: 60 / m.bpm, o: 0 };
  else { try { const d = detectBeat(m.audio, ffbin()); m._beat = { p: 60 / d.bpm, o: d.offset, conf: d.conf }; } catch (e) { console.log('WARN beat detection failed (' + e.message + ') — cuts are not synced; set meta.bpm'); return; } }
  m._beat.n = m.sync === 'beat' ? 1 : m.sync === 'bar' ? 4 : 2;
}
async function browser() {
  const pw = need(['playwright-core', 'playwright'], `missing deps — run: npm install --prefix "${ROOT}"`);
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
    if (info.beat) out.push(`♪ ${m.music || 'audio'} ${(60 / info.beat.p).toFixed(1)} bpm · cuts every ${info.beat.n} beat(s) = ${(info.beat.p * info.beat.n).toFixed(2)}s${info.beat.conf != null ? ` · detection confidence ${info.beat.conf}${info.beat.conf < 0.15 ? ' (LOW — check by ear or set meta.bpm)' : ''}` : ''}`);
    if (m.max && info.total > m.max) out.push(`WARN total ${info.total}s exceeds meta.max ${m.max}s — cut scenes or set pace < 1`);
  }
  for (const w of r.warns) out.push('WARN ' + w);
  const bad = out.some(l => l.startsWith('ERR'));
  if (info) {
    out.unshift(`${bad ? 'FAIL' : 'OK'} ${info.scenes.length} scenes · ${info.total}s · ${info.w}x${info.h}@${info.fps} · spec ≈${tok(Math.ceil(r.txt.length / 3.6))} tokens`,
      info.scenes.map(s => `${s.i}:${s.type} ${s.dur}s${s.fit < 1 ? ` fit${Math.round(s.fit * 100)}%` : ''}`).join(' | '));
  }
  console.log(out.join('\n'));
  return !bad;
}

async function assets(dir) {
  const ext = /\.(png|jpe?g|webp|gif|svg|mp3|wav|m4a|aac|ogg|mp4|mov|webm)$/i, rows = [], imgs = [];
  for (const f of fs.readdirSync(dir).filter(f => ext.test(f)).sort()) {
    const p = path.join(dir, f), kb = Math.round(fs.statSync(p).size / 1024);
    const j = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,pix_fmt:format=duration', '-of', 'json', p]).stdout.toString() || '{}');
    const v = (j.streams || []).find(x => x.width), isA = /\.(mp3|wav|m4a|aac|ogg)$/i.test(f), isV = /\.(mp4|mov|webm)$/i.test(f);
    let use;
    if (isA) use = `meta.audio (${(+j.format?.duration || 0).toFixed(0)}s) — run \`beat\` to check BPM`;
    else if (isV) use = 'video footage is not supported yet — export a still frame';
    else if (/\.svg$/i.test(f) || !v) use = 'vector: logo / mascot';
    else {
      const r = v.width / v.height, alpha = /a/.test((v.pix_fmt || '').replace('gray', ''));
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
async function main() {
  if (cmd === 'catalog') return console.log(catalog(pos[0]));
  if (cmd === 'music') {
    if (!opt.o) return console.log('mograph music --style <' + Object.keys(STYLES).join('|') + '> [--bpm N] --dur <seconds> -o track.wav\n' + Object.entries(STYLES).map(([k, v]) => `  ${k.padEnd(7)} ${v.bpm} bpm — ${v.d}`).join('\n'));
    const r = synth({ style: opt.style || 'upbeat', bpm: +opt.bpm || undefined, dur: +opt.dur || 30, out: opt.o });
    return console.log(`music → ${opt.o} · ${r.bpm} bpm · ${r.bars} bars · original synth track, free to use`);
  }
  if (cmd === 'beat') { const d = detectBeat(pos[0], ffbin()); return console.log(`${d.bpm} bpm · first beat at ${d.offset}s · confidence ${d.conf}${d.conf < 0.15 ? ' (LOW)' : ''}`); }
  if (cmd === 'assets') return assets(pos[0] || '.');
  if (!['lint', 'sheet', 'render'].includes(cmd)) {
    return console.log('mograph <command> <spec.yaml>\n  catalog [type]                 scene types / fields (read on demand)\n  lint <spec>                    validate + measure text fit + timing (text only, no images)\n  sheet <spec> [--scenes 2,5-6] [--frames 3] [-o sheet.jpg]   contact sheet for visual QA\n  assets <dir> [--sheet]         list images/audio with size + how to use each (text; --sheet adds one thumbnail image)\n  music --style upbeat --dur 40 -o track.wav   write a built-in track · beat <audio>   detect BPM of your own file\n  render <spec> [--draft] [--scenes 1-3] [-o out.mp4]         render video\n  any command: --size 16:9   override meta.size (same spec, another aspect ratio)');
  }
  const r = load(pos[0]);
  if (!r.spec) { report(r, null); process.exit(1); }
  prepBeat(r.spec);
  const base = pos[0].replace(/\.(ya?ml|json)$/, '');
  const br = await browser();
  try {
    if (cmd === 'lint') { const { info } = await stagePage(br, r.spec); process.exitCode = report(r, info) ? 0 : 1; return; }

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
    let audio = !want && m.audio, tmp = null;
    if (!want && m.music) { tmp = out + '.music.wav'; synth({ style: m.music, bpm: m.bpm, dur: info.total, out: tmp }); audio = tmp; }
    const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      ...(audio ? ['-i', audio, '-af', `volume=${m.volume ?? 0.8},afade=t=out:st=${Math.max(0, info.total - 1.6).toFixed(2)}:d=1.6`, '-c:a', 'aac', '-b:a', '192k', '-t', String(info.total)] : []),
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
    if (tmp) fs.rmSync(tmp, { force: true });
    if (process.stdout.isTTY) process.stdout.write('\r');
    console.log(`video → ${out} · ${info.total}s · ${total} frames@${fps} · ${(fs.statSync(out).size / 1e6).toFixed(1)}MB · ${((Date.now() - t0) / 1000).toFixed(0)}s render`);
  } finally { await br.close(); }
}
main().catch(e => die(e.message));
