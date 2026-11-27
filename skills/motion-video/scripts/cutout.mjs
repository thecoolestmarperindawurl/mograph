// Background removal for cutout scenes: an IS-Net / U²-Net ONNX model (from rembg's releases) runs in the
// engine's own Chromium through onnxruntime-web, so no Python or native add-on is needed. Results are cached.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { CACHE, ensurePkg } from './media.mjs';

export const MODELS = {
  quality: { file: 'isnet-general-use.onnx', size: 1024, mean: [0.5, 0.5, 0.5], std: [1, 1, 1] },
  fast: { file: 'u2netp.onnx', size: 320, mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
  person: { file: 'u2net_human_seg.onnx', size: 320, mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
};
const REL = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/';

function download(url, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = out + '.part';
  const r = spawnSync('curl', ['-fsSL', '--retry', '2', '-o', tmp, url], { stdio: 'ignore' });
  if (r.status !== 0 || !fs.existsSync(tmp) || fs.statSync(tmp).size < 1e5) throw new Error('could not download ' + url + ' (needs curl and network access to github.com)');
  fs.renameSync(tmp, out);
}
function ortDir() { return path.join(ensurePkg('onnxruntime-web', '1.31.1', 'installing onnxruntime-web for cutouts (first time only)…'), 'dist'); }
/** Cut out every requested image; returns a map srcPath -> cached PNG path. */
export async function cutouts(br, root, jobs) {
  const todo = [], done = new Map(), dup = [];
  for (const j of jobs) {
    const st = fs.statSync(j.src), key = crypto.createHash('sha1').update([j.src, st.size, st.mtimeMs, j.model, j.bw ? 1 : 0, j.full ? 'full' : ''].join('|')).digest('hex').slice(0, 14);
    const out = path.join(CACHE, 'cutout', key + '.png');
    if (fs.existsSync(out)) done.set(j.id, out); else if (todo.some(x => x.out === out)) dup.push({ id: j.id, out }); else todo.push({ ...j, out });
  }
  if (!todo.length) return done;
  const dist = ortDir(), files = new Map();
  for (const j of todo) {
    const m = MODELS[j.model] || MODELS.quality, mp = path.join(CACHE, 'models', m.file);
    if (!fs.existsSync(mp)) { console.error(`downloading cutout model ${m.file} (first time only)…`); download(REL + m.file, mp); }
    files.set('/model/' + m.file, mp);
  }
  // a tiny local server: onnxruntime-web fetches its wasm, which file:// pages cannot do
  const srv = http.createServer((q, s) => {
    const u = decodeURIComponent(q.url.split('?')[0]);
    let f = u.startsWith('/ort/') ? path.join(dist, path.basename(u)) : files.get(u);
    if (u === '/') { s.writeHead(200, { 'content-type': 'text/html' }); return s.end('<!doctype html><script src="/ort/ort.min.js"></script>'); }
    if (!f || !fs.existsSync(f)) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'content-type': f.endsWith('.wasm') ? 'application/wasm' : f.endsWith('.js') || f.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream' });
    fs.createReadStream(f).pipe(s);
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const page = await (await br.newContext()).newPage();
    await page.goto(base + '/');
    for (const j of todo) {
      const m = MODELS[j.model] || MODELS.quality, img = '/img/' + j.id + path.extname(j.src);
      files.set(img, j.src);
      const t0 = Date.now();
      const png = await page.evaluate(async ({ img, model, m, bw, full }) => {
        ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = '/ort/';
        window._s = window._s || {}; const sess = window._s[model] || (window._s[model] = await ort.InferenceSession.create(model));
        const im = new Image(); im.src = img; await im.decode();
        const W = im.naturalWidth, H = im.naturalHeight, S = m.size;
        const c = new OffscreenCanvas(S, S), g = c.getContext('2d'); g.drawImage(im, 0, 0, S, S);
        const px = g.getImageData(0, 0, S, S).data, inp = new Float32Array(3 * S * S);
        let mx = 1; for (let i = 0; i < px.length; i += 4) mx = Math.max(mx, px[i], px[i + 1], px[i + 2]);
        for (let i = 0, p = 0; p < S * S; i += 4, p++) for (let ch = 0; ch < 3; ch++) inp[ch * S * S + p] = (px[i + ch] / mx - m.mean[ch]) / m.std[ch];
        const res = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', inp, [1, 3, S, S]) });
        const o = res[sess.outputNames[0]].data; let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < S * S; i++) { lo = Math.min(lo, o[i]); hi = Math.max(hi, o[i]); }
        const mc = new OffscreenCanvas(S, S), mg = mc.getContext('2d'), md = mg.createImageData(S, S);
        for (let i = 0; i < S * S; i++) { const a = Math.round(((o[i] - lo) / (hi - lo || 1)) * 255); md.data[i * 4 + 3] = a; }
        mg.putImageData(md, 0, 0);
        const out = new OffscreenCanvas(W, H), og = out.getContext('2d');
        og.drawImage(mc, 0, 0, W, H); og.globalCompositeOperation = 'source-in'; if (bw) og.filter = 'grayscale(1) contrast(1.12)'; og.drawImage(im, 0, 0);
        // trim to the subject's bounding box (+2% margin) so layouts can place it tightly
        const a = full ? null : og.getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = 0, y1 = 0;
        if (!full) for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (a[(y * W + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        // full = keep the whole frame (video mattes must line up pixel-for-pixel with the footage)
        if (x1 <= x0 || full) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
        const mgn = Math.round(Math.max(W, H) * 0.02); x0 = Math.max(0, x0 - mgn); y0 = Math.max(0, y0 - mgn); x1 = Math.min(W - 1, x1 + mgn); y1 = Math.min(H - 1, y1 + mgn);
        const cr = new OffscreenCanvas(x1 - x0 + 1, y1 - y0 + 1); cr.getContext('2d').drawImage(out, -x0, -y0);
        const blob = await cr.convertToBlob({ type: 'image/png' }), buf = new Uint8Array(await blob.arrayBuffer());
        let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
        return btoa(s);
      }, { img, model: '/model/' + m.file, m, bw: !!j.bw, full: !!j.full });
      fs.mkdirSync(path.dirname(j.out), { recursive: true });
      fs.writeFileSync(j.out, Buffer.from(png, 'base64'));
      if (!j.full) console.error(`cutout → ${path.basename(j.src)} (${j.model || 'quality'}, ${((Date.now() - t0) / 1000).toFixed(1)}s, cached)`);
      done.set(j.id, j.out);
    }
    await page.context().close();
  } finally { srv.close(); }
  for (const d of dup) done.set(d.id, d.out);
  return done;
}
export const fileUrl = p => pathToFileURL(p).href;
