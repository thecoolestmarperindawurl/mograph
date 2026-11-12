/* mograph engine — deterministic: every frame is a pure function of time (seek). No CSS animations. */
(() => {
  const THEMES = {
    midnight: { bg: '#0a0c16', fg: '#f4f5fb', mut: '#9ba1ba', ac: '#8b7cff', ac2: '#3ddbd9', card: '#151929', line: '#2b3049' },
    paper: { bg: '#f5f2ea', fg: '#16171d', mut: '#666a78', ac: '#e4572e', ac2: '#2563eb', card: '#ffffff', line: '#dbd5c6' },
    terminal: { bg: '#07100c', fg: '#e6f5ea', mut: '#7f9c8a', ac: '#4ade80', ac2: '#facc15', card: '#0e1b14', line: '#1f3a2b' },
    meadow: { bg: '#3c8a4b', fg: '#fdf9ec', mut: '#d3e6cf', ac: '#f3e0ad', ac2: '#ffd9c7', card: '#337a41', line: '#5aa567', win: '#f5f3ed', ink: '#1d2a21', inkmut: '#6c776e', cline: '#dfdccf', chip: '#e8efe5', wac: '#2f7a3f', wac2: '#e7b53c' },
    lanhmar: { bg: '#F3F1FD', fg: '#241F45', mut: '#55507A', ac: '#FF7A45', ac2: '#6A5CFF', card: '#FFFFFF', line: '#D6CEF7', head: '#2D2FEF', kick: '#A6380D', band: '#6A5CFF', win: '#FFFFFF', ink: '#241F45', inkmut: '#55507A', cline: '#D6CEF7', chip: '#F3F1FD', wac: '#2D2FEF', wac2: '#FF7A45', whead: '#2D2FEF', wkick: '#A6380D', font: 'Montserrat' },
    sunset: { bg: '#160b1f', fg: '#fff6ee', mut: '#b9a4b8', ac: '#ff7a3d', ac2: '#b06cff', card: '#22122e', line: '#3c2350' },
  };
  const ease = {
    linear: p => p,
    in: p => p * p * p,
    out: p => 1 - Math.pow(1 - p, 3),
    out5: p => 1 - Math.pow(1 - p, 5),
    inout: p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    back: p => 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2),
  };
  let U = 40;
  let PEND = [];

  class TL {
    constructor() { this.tw = []; this.fns = []; this.lives = []; this.sorted = false; }
    add(el, props, at = 0, dur = 0.6, e = 'out') { this.tw.push({ el, props, at, dur, e }); this.sorted = false; return at + dur; }
    fn(at, dur, f, e = 'linear') { this.fns.push({ at, dur, f, e }); return at + dur; }
    live(f) { this.lives.push(f); }
    seek(t) {
      if (!this.sorted) { this.tw.sort((a, b) => a.at - b.at); this.sorted = true; }
      const st = new Map();
      for (const w of this.tw) {
        let s = st.get(w.el); if (!s) st.set(w.el, (s = {}));
        const raw = (t - w.at) / w.dur;
        for (const k in w.props) {
          const [a, b] = w.props[k];
          if (raw <= 0) { if (!(k in s)) s[k] = a; }
          else s[k] = a + (b - a) * (raw >= 1 ? 1 : ease[w.e](raw));
        }
      }
      for (const [el, s] of st) {
        if ('opacity' in s) el.style.opacity = s.opacity;
        let tr = '';
        if ('x' in s || 'y' in s) tr += `translate(${(s.x || 0) * U}px,${(s.y || 0) * U}px)`;
        if ('scale' in s) tr += ` scale(${s.scale})`;
        if ('sx' in s) tr += ` scaleX(${s.sx})`;
        if ('sy' in s) tr += ` scaleY(${s.sy})`;
        if ('rotate' in s) tr += ` rotate(${s.rotate}deg)`;
        if (tr) el.style.transform = tr;
        if ('blur' in s) el.style.filter = s.blur > 0.01 ? `blur(${(s.blur * U) / 40}px)` : 'none';
      }
      for (const f of this.fns) { const raw = (t - f.at) / f.dur; f.f(raw <= 0 ? 0 : raw >= 1 ? 1 : ease[f.e](raw)); }
      for (const f of this.lives) f(t);
    }
  }

  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const rich = s => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
  const ICON = {
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  };

  function ctx(el, tl, portrait, meta) {
    const c = {
      el, tl, portrait, rich, meta,
      h(tag, cls, html, parent) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        (parent || c.el).appendChild(e);
        return e;
      },
      // word-by-word reveal; returns end time
      words(el, text, at = 0, stagger = 0.055) {
        const out = [];
        String(text).split(/(\*[^*]+\*)/).forEach(seg => {
          if (!seg) return;
          const em = /^\*[^*]+\*$/.test(seg);
          const host = em ? el.appendChild(document.createElement('em')) : el;
          (em ? seg.slice(1, -1) : seg).split(/(\s+)/).forEach(w => {
            if (!w) return;
            if (/^\s+$/.test(w)) host.appendChild(w.includes('\n') ? document.createElement('br') : document.createTextNode(' '));
            else { const sp = document.createElement('span'); sp.className = 'w'; sp.textContent = w; host.appendChild(sp); out.push(sp); }
          });
        });
        out.forEach((sp, i) => tl.add(sp, { opacity: [0, 1], y: [0.55, 0], blur: [10, 0] }, at + i * stagger, 0.5, 'out5'));
        return at + Math.max(0, out.length - 1) * stagger + 0.5;
      },
      up(el, at, dur = 0.55, dy = 0.6) { return tl.add(el, { opacity: [0, 1], y: [dy, 0] }, at, dur, 'out5'); },
      pop(el, at, dur = 0.55) { return tl.add(el, { opacity: [0, 1], scale: [0.86, 1], y: [0.3, 0] }, at, dur, 'back'); },
      type(el, text, at, cps = 42) {
        const v = c.h('span', '', '', el), car = c.h('span', 'caret', '', el), r = c.h('span', 'rest', '', el);
        const d = Math.max(0.3, text.length / cps);
        tl.fn(at, d, p => {
          const n = Math.round(p * text.length);
          v.textContent = text.slice(0, n); r.textContent = text.slice(n);
          car.style.opacity = p > 0 && p < 1 ? 1 : 0;
        });
        return at + d;
      },
      count(el, str, at, dur = 1.1) {
        const m = String(str).match(/^([^\d-]*)(-?[\d.,]*\d)(.*)$/s);
        if (!m) { el.innerHTML = rich(str); return at; }
        const sep = m[2].includes(','), val = parseFloat(m[2].replace(/,/g, '')), dec = (m[2].split('.')[1] || '').length;
        const pre = c.h('span', 'pre', esc(m[1]), el), num = c.h('span', 'num', '', el), suf = c.h('span', 'suf', esc(m[3]), el);
        void pre; void suf;
        tl.fn(at, dur, p => {
          let s = (val * p).toFixed(dec);
          if (sep) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          num.textContent = s;
        }, 'out5');
        return at + dur;
      },
      pending(img) { PEND.push(img.decode().catch(() => {})); },
      logo(s, parent) { if (!s.logo) return 0; const im = c.h('img', 'logo', null, parent); im.src = s.logo; c.up(im, 0, 0.5, 0.4); return 0.15; },
      head(s, t = 0) {
        if (s.kicker) { c.up(c.h('div', 'kicker', rich(s.kicker)), t, 0.5, 0.4); t += 0.15; }
        if (s.title) t = c.words(c.h('h2', 'title'), s.title, t) - 0.2;
        return t;
      },
      src(s, t) { if (s.src) c.tl.add(c.h('div', 'src', rich(s.src), c.el.parentNode), { opacity: [0, 1] }, t, 0.6); },
    };
    return c;
  }
  const pair = it => { const [a, ...b] = String(it).split('|'); return [a.trim(), b.join('|').trim()]; };

  /* ---------- scene builders: (scene, ctx) => time when all entrances are done ---------- */
  const B = {
    hook(s, c) {
      c.el.classList.add('center');
      let t = c.logo(s);
      if (s.kicker) { c.up(c.h('div', 'kicker', rich(s.kicker)), 0, 0.5, 0.4); t = 0.2; }
      t = c.words(c.h('h1', 'big'), s.hook, t, 0.07);
      const bar = c.h('div', 'rule'); c.tl.add(bar, { sx: [0, 1] }, t - 0.35, 0.6, 'inout');
      if (s.sub) t = c.up(c.h('p', 'sub', rich(s.sub)), t - 0.15);
      return t;
    },
    bullets(s, c) {
      let t = c.head(s);
      const bl = c.h('div', 'bl');
      s.bullets.forEach((it, i) => {
        const [a, b] = pair(it);
        const row = c.h('div', 'bi', `<span class="n">${i + 1}</span><div><b>${rich(a)}</b>${b ? `<small>${rich(b)}</small>` : ''}</div>`, bl);
        c.tl.add(row, { opacity: [0, 1], x: [-1.2, 0] }, t + i * 0.32, 0.55, 'out5');
      });
      return t + (s.bullets.length - 1) * 0.32 + 0.55;
    },
    flow(s, c) {
      let t = c.head(s);
      const wrap = c.h('div', 'flow ' + (c.portrait ? 'v' : 'hz'));
      const rings = [];
      s.flow.forEach((it, i) => {
        if (i) {
          const cn = c.h('div', 'conn', '<i></i><span class="ah"></span>', wrap);
          c.tl.add(cn.firstChild, c.portrait ? { sy: [0, 1] } : { sx: [0, 1] }, t, 0.25, 'inout');
          c.tl.add(cn.lastChild, { opacity: [0, 1] }, t + 0.18, 0.12);
          t += 0.22;
        }
        const [a, b] = pair(it);
        const n = c.h('div', 'node', `<span class="n">${i + 1}</span><div><b>${rich(a)}</b>${b ? `<small>${rich(b)}</small>` : ''}</div><span class="ring"></span>`, wrap);
        c.pop(n, t, 0.5); rings.push(n.lastChild);
        t += 0.3;
      });
      t += 0.35;
      rings.forEach((r, i) => {
        const at = t + i * 0.3, last = i === rings.length - 1;
        c.tl.add(r, { opacity: [0, 1] }, at, 0.2);
        if (!last) c.tl.add(r, { opacity: [1, 0] }, at + 0.3, 0.4);
      });
      return t + rings.length * 0.3 + 0.2;
    },
    loop(s, c) {
      let t = c.head(s);
      const n = s.loop.length, R = 40;
      const box = c.h('div', 'loop');
      box.innerHTML = `<svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="${R}"/><circle class="arc" cx="50" cy="50" r="${R}" pathLength="100" transform="rotate(-90 50 50)"/></svg>`;
      const arc = box.querySelector('.arc'), dot = c.h('span', 'orb', '', box);
      c.tl.fn(t, 1.2, p => { arc.style.strokeDashoffset = 100 - 100 * p; }, 'inout');
      const core = c.h('div', 'core', `<span>${rich(s.center || '')}</span>`, box);
      c.pop(core, t, 0.6);
      s.loop.forEach((it, i) => {
        const a = (-90 + (i * 360) / n) * (Math.PI / 180);
        const p = c.h('div', 'lp', '', box);
        p.style.left = 50 + R * Math.cos(a) + '%'; p.style.top = 50 + R * Math.sin(a) + '%';
        c.pop(c.h('div', 'lnode', rich(it), p), t + 0.25 + i * (1 / n), 0.5);
      });
      const t0 = t + 1.2;
      c.tl.live(lt => {
        const k = Math.max(0, lt - t0), a = (-90 + k * 90) * (Math.PI / 180);
        dot.style.opacity = lt > t0 ? 1 : 0;
        dot.style.left = 50 + R * Math.cos(a) + '%'; dot.style.top = 50 + R * Math.sin(a) + '%';
      });
      return { end: t0 + 0.3, read: 2.5 };
    },
    stat(s, c) {
      c.el.classList.add('center');
      let t = 0;
      if (s.kicker) { c.up(c.h('div', 'kicker', rich(s.kicker)), 0, 0.5, 0.4); t = 0.2; }
      const big = c.h('div', 'statnum');
      c.tl.add(big, { opacity: [0, 1], scale: [0.8, 1] }, t, 0.6, 'out5');
      const e = c.count(big, s.stat, t, 1.2);
      c.tl.add(c.h('div', 'rule'), { sx: [0, 1] }, t + 0.5, 0.6, 'inout');
      if (s.label) c.up(c.h('p', 'statlabel', rich(s.label)), t + 0.6);
      c.src(s, t + 1);
      return Math.max(e, t + 1.2);
    },
    compare(s, c) {
      let t = c.head(s);
      const g = c.h('div', 'cmp');
      const L = c.h('div', 'col l', `<h3>${rich(s.compare[0])}</h3>`, g), R = c.h('div', 'col r', `<h3>${rich(s.compare[1])}</h3>`, g);
      c.tl.add(L, { opacity: [0, 1], x: [-1, 0] }, t, 0.55, 'out5');
      c.tl.add(R, { opacity: [0, 1], x: [1, 0] }, t + 0.12, 0.55, 'out5');
      t += 0.5;
      (s.rows || []).forEach((r, i) => {
        const a = c.h('div', 'cell', `<span class="ic">${ICON.x}</span><span>${rich(r[0])}</span>`, L);
        const b = c.h('div', 'cell', `<span class="ic">${ICON.check}</span><span>${rich(r[1])}</span>`, R);
        c.up(a, t + i * 0.42, 0.45, 0.4); c.up(b, t + i * 0.42 + 0.16, 0.45, 0.4);
      });
      return t + Math.max(0, (s.rows || []).length - 1) * 0.42 + 0.65;
    },
    chat(s, c) {
      let t = c.head(s);
      const box = c.h('div', 'chat');
      s.chat.forEach(line => {
        const m = String(line).match(/^([uat]):\s*([\s\S]*)$/), k = m ? m[1] : 'a', txt = m ? m[2] : String(line);
        if (k === 'u') { c.pop(c.h('div', 'msg u', rich(txt), box), t, 0.45); t += 0.8; }
        else if (k === 't') {
          const chip = c.h('div', 'msg t', `<span class="spin"></span><code>${esc(txt)}</code><span class="ok">${ICON.check}</span>`, box);
          c.up(chip, t, 0.4, 0.4);
          const sp = chip.firstChild, ok = chip.lastChild, t1 = t + 0.75;
          c.tl.live(lt => { sp.style.transform = `rotate(${lt * 420}deg)`; sp.style.opacity = lt < t1 ? 1 : 0; ok.style.opacity = lt >= t1 ? 1 : 0; });
          t = t1 + 0.3;
        } else {
          const b = c.h('div', 'msg a', '', box);
          c.up(b, t, 0.35, 0.4);
          t = c.type(b, txt, t + 0.25, 48) + 0.45;
        }
      });
      return { end: t, read: 1 };
    },
    term(s, c) {
      let t = c.head(s);
      const win = c.h('div', 'term', `<div class="bar"><i></i><i></i><i></i><span>${esc(s.name || 'agent')}</span></div><div class="body"></div>`);
      c.pop(win, t, 0.5); t += 0.45;
      const body = win.lastChild;
      s.term.forEach(line => {
        line = String(line);
        const cmd = /^\$ /.test(line), row = c.h('div', 'ln' + (cmd ? ' cmd' : ''), '', body);
        if (cmd) { row.innerHTML = '<span class="ps">$ </span>'; t = c.type(row, line.slice(2), t, 34) + 0.3; }
        else { row.innerHTML = rich(line); c.tl.add(row, { opacity: [0, 1] }, t, 0.2); t += 0.28; }
      });
      return { end: t, read: 1.2 };
    },
    quote(s, c) {
      c.h('div', 'qm', '“');
      const q = c.h('blockquote', 'q');
      let t = c.words(q, s.quote, 0.15, 0.045);
      if (s.by) t = c.up(c.h('div', 'by', rich(s.by)), t - 0.1);
      c.tl.add(c.el.firstChild, { opacity: [0, 1], scale: [0.6, 1] }, 0, 0.5, 'back');
      return t;
    },
    bars(s, c) {
      let t = c.head(s);
      const ent = Object.entries(s.bars), max = Math.max(...ent.map(e => parseFloat(e[1]) || 0)) || 1;
      const hi = s.hi != null ? String(s.hi) : ent.find(e => (parseFloat(e[1]) || 0) === max)[0];
      const box = c.h('div', 'bars');
      ent.forEach(([k, v], i) => {
        const row = c.h('div', 'bar' + (k === hi ? ' hi' : ''), `<label>${rich(k)}</label><span class="val"></span><div class="trk"><i></i></div>`, box);
        const at = t + i * 0.22, fill = row.querySelector('i'), val = row.querySelector('.val');
        c.up(row, at, 0.4, 0.3);
        c.tl.fn(at + 0.15, 0.9, p => { fill.style.width = ((parseFloat(v) || 0) / max) * 100 * p + '%'; }, 'out5');
        c.count(val, String(v) + (s.unit || ''), at + 0.15, 0.9);
      });
      c.src(s, t + 0.6);
      return t + (ent.length - 1) * 0.22 + 1.05;
    },
    clip(s, c) {
      const fill = !!s.fill;
      if (fill) c.el.classList.add('center');
      let t = fill ? 0 : c.head(s);
      const host = fill ? c.el.closest('.mg-scene') : c.el;
      const fr = c.h('div', 'frame clip' + (fill ? ' fill' : ''), '<img>', host);
      if (fill) host.insertBefore(fr, host.firstChild);
      const img = fr.firstChild, F = s._frames || [], fps = s._fps || 30;
      c.tl.add(fr, fill ? { opacity: [0, 1] } : { opacity: [0, 1], scale: [0.94, 1], y: [0.6, 0] }, t, fill ? 0.4 : 0.7, 'out5');
      if (F.length) { img.src = F[0]; c.tl.live(lt => { const k = Math.max(0, Math.min(F.length - 1, Math.floor((lt - t) * fps))); if (img._k !== k) { img._k = k; img.src = F[k]; c.pending(img); } }); }
      s._clipAt = t;
      if (fill) {
        if (s.kicker) { c.up(c.h('div', 'kicker', rich(s.kicker)), 0.3, 0.5, 0.4); t = 0.45; }
        if (s.title) t = c.words(c.h('h1', 'big sm'), s.title, Math.max(t, 0.3), 0.07);
      }
      if (s.caption) c.up(c.h('p', 'sub', rich(s.caption)), t + 0.3);
      return { end: t + 0.9, read: 0.3, min: (s._clipAt || 0) + (s._len || 0) + 0.25 };
    },
    image(s, c) {
      let t = c.head(s);
      const fr = c.h('div', 'frame', `<img src="${esc(s.image)}">`);
      c.tl.add(fr, { opacity: [0, 1], scale: [0.94, 1], y: [0.6, 0] }, t, 0.7, 'out5');
      c.tl.add(fr.firstChild, { scale: [1, 1.07] }, t, 9, 'linear');
      if (s.caption) c.up(c.h('p', 'sub', rich(s.caption)), t + 0.4);
      return t + 0.9;
    },
    cta(s, c) {
      c.el.classList.add('center');
      let t = c.words(c.h('h1', 'big sm'), s.cta, c.logo(s), 0.06);
      if (s.sub) t = c.up(c.h('p', 'sub', rich(s.sub)), t - 0.2);
      if (s.button) {
        const b = c.h('div', 'btn', `<span>${rich(s.button)}</span>`);
        c.pop(b, t - 0.1, 0.6);
        const t0 = t + 0.5; t += 0.4;
        c.tl.live(lt => { b.firstChild.style.transform = `scale(${1 + (lt > t0 ? 0.035 * Math.sin((lt - t0) * 4.2) : 0)})`; });
      }
      if (s.handle) t = c.up(c.h('div', 'handle', rich(s.handle)), t);
      return t;
    },
    profile(s, c) {
      const row = c.h('div', 'pf');
      const av = c.h('div', 'av', s.avatar ? `<img src="${esc(s.avatar)}">` : esc(String(s.profile).split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()), row);
      const tx = c.h('div', 'pft', '', row);
      c.pop(av, 0, 0.55);
      let t = 0.2;
      if (s.role) { c.up(c.h('div', 'kicker', rich(s.role), tx), t, 0.45, 0.4); t += 0.12; }
      t = c.words(c.h('div', 'pfn', '', tx), s.profile, t, 0.08);
      if (s.quote) t = c.type(c.h('div', 'pfq', '', tx), '“' + s.quote + '”', t, 30) + 0.2;
      return { end: t, read: 1.2 };
    },
    check(s, c) {
      let t = c.head(s);
      const box = c.h('div', 'ck');
      const cur = c.h('div', 'cursor', `<svg viewBox="0 0 24 24"><path d="M5 3l14 8-6.5 1.5L9 19z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>${c.meta.cursor ? `<span>${esc(c.meta.cursor)}</span>` : ''}`, box);
      const boxes = s.check.map((it, i) => {
        const [a, b] = pair(it);
        const row = c.h('div', 'cki' + (i % 2 ? ' alt' : ''), `<span class="cb">${ICON.check}</span><div><b>${rich(a)}</b>${b ? `<small>${rich(b)}</small>` : ''}</div>`, box);
        c.up(row, t + i * 0.15, 0.45, 0.4);
        return row.firstChild;
      });
      const t0 = t + boxes.length * 0.15 + 0.35, step = 0.75;
      let pts = null;
      c.tl.live(lt => {
        if (!pts) pts = boxes.map(b => { let x = b.offsetWidth * 0.55, y = b.offsetHeight * 0.55, e = b; while (e && e !== box) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; } return [x, y]; });
        const k = (lt - t0) / step, i = Math.max(0, Math.min(boxes.length - 1, Math.floor(k))), q = k - i;
        const p = ease.inout(Math.max(0, Math.min(1, q / 0.6))), a = i ? pts[i - 1] : [box.offsetWidth * 0.82, box.offsetHeight * 1.04], b = pts[i];
        const off = ease.inout(Math.max(0, Math.min(1, (k - boxes.length) / 0.7))) * box.offsetHeight * 0.22;
        cur.style.transform = `translate(${a[0] + (b[0] - a[0]) * p + off * 2.2}px,${a[1] + (b[1] - a[1]) * p + off}px) scale(${q > 0.6 && q < 0.8 ? 0.8 : 1})`;
        cur.style.opacity = lt > t0 - 0.25 ? 1 : 0;
        boxes.forEach((bx, j) => bx.classList.toggle('on', k >= j + 0.7));
      });
      return { end: t0 + boxes.length * step + 0.2, read: 1 };
    },
    clock(s, c) {
      const m = String(s.clock).match(/(\d{1,2})(?:[h:](\d{2})?)?\D+(\d{1,2})(?:[h:](\d{2})?)?/);
      const h1 = m ? +m[1] + (+m[2] || 0) / 60 : 9, h2 = m ? +m[3] + (+m[4] || 0) / 60 : h1 + 1;
      const row = c.h('div', 'clk');
      const ticks = Array.from({ length: 12 }, (_, i) => `<line class="tick" x1="50" y1="8" x2="50" y2="${i % 3 ? 11 : 15}" transform="rotate(${i * 30} 50 50)"/>`).join('');
      const face = c.h('div', 'face', `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" class="rim"/><path class="sec"/>${ticks}<line class="hh" x1="50" y1="50" x2="50" y2="27"/><line class="mh" x1="50" y1="50" x2="50" y2="15"/><circle cx="50" cy="50" r="3.2" class="hub"/></svg>`, row);
      const tx = c.h('div', 'clt', '', row), sec = face.querySelector('.sec'), hh = face.querySelector('.hh'), mh = face.querySelector('.mh');
      c.pop(face, 0, 0.55);
      const pt = (a, r) => [50 + r * Math.sin((a * Math.PI) / 180), 50 - r * Math.cos((a * Math.PI) / 180)];
      c.tl.fn(0.3, 1.5, p => {
        const h = h1 + (h2 - h1) * p, a1 = (h1 % 12) * 30, a2 = a1 + (h - h1) * 30, [x1, y1] = pt(a1, 40), [x2, y2] = pt(a2, 40);
        hh.setAttribute('transform', `rotate(${a2} 50 50)`); mh.setAttribute('transform', `rotate(${(h % 1) * 360} 50 50)`);
        sec.setAttribute('d', a2 - a1 < 0.5 ? '' : `M50 50L${x1} ${y1}A40 40 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${x2} ${y2}Z`);
      }, 'inout');
      let t = 0.35;
      if (s.kicker) { c.up(c.h('div', 'kicker', rich(s.kicker), tx), t, 0.45, 0.4); t += 0.12; }
      t = c.words(c.h('div', 'clv', '', tx), s.clock, t, 0.08);
      if (s.sub) t = c.up(c.h('div', 'sub', rich(s.sub), tx), t - 0.2);
      return Math.max(t, 1.9);
    },
    pin(s, c) {
      c.el.classList.add('center');
      const w = c.h('div', 'pinw', '<span class="rip"></span><span class="rip"></span><div class="pin"><svg viewBox="0 0 24 32"><path d="M12 0C5.4 0 0 5.2 0 11.7 0 20.5 12 32 12 32s12-11.5 12-20.3C24 5.2 18.6 0 12 0z" fill="currentColor"/><circle cx="12" cy="11.5" r="4.6" fill="#fff"/></svg></div>');
      const pin = w.lastChild, [r1, r2] = w.querySelectorAll('.rip');
      c.tl.add(pin, { opacity: [0, 1], y: [-7, 0] }, 0, 0.5, 'in'); c.tl.add(pin, { y: [0, -0.9] }, 0.5, 0.18, 'out'); c.tl.add(pin, { y: [-0.9, 0] }, 0.68, 0.2, 'in');
      for (const [r, at, sc] of [[r1, 0.5, 1], [r2, 0.72, 1.6]]) { c.tl.add(r, { opacity: [0, 0] }, 0, 0.01); c.tl.add(r, { opacity: [0.9, 0], scale: [0.2, sc] }, at, 1, 'out'); }
      let t = c.words(c.h('h2', 'title'), s.pin, 0.75, 0.07);
      if (s.sub) t = c.up(c.h('p', 'sub', rich(s.sub)), t - 0.2);
      return t;
    },
    ticket(s, c) {
      const g = c.h('div', 'tk ' + (c.portrait ? 'v' : 'hz')), L = c.h('div', 'tkl', '', g);
      let t = c.logo(s, L);
      if (s.kicker) { c.up(c.h('div', 'kicker', rich(s.kicker), L), t, 0.5, 0.4); t += 0.15; }
      t = c.words(c.h('h1', 'big', '', L), s.ticket, t, 0.1);
      const T = c.h('div', 'ticket paper', '', g), t1 = t - 0.25;
      c.tl.add(T, { opacity: [0, 1], x: [c.portrait ? 0 : 7, 0], y: [c.portrait ? 6 : 0, 0], rotate: [6, 0] }, t1, 0.85, 'out5');
      let seed = [...String(s.code || s.ticket)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
      const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
      T.innerHTML = (s.name ? `<div class="tkn">${rich(s.name)}</div>` : '') + (s.note ? `<div class="tkq">${rich(s.note)}</div>` : '')
        + '<div class="tkr">' + Object.entries(s.rows || {}).map(([k, v]) => `<div><label>${rich(k)}</label><b>${rich(v)}</b></div>`).join('') + '</div>'
        + `<div class="tkf"><span>${rich(s.code || '')}</span><i class="bc">${Array.from({ length: 30 }, () => `<u style="width:${(0.05 + rnd() * 0.16).toFixed(2)}em"></u>`).join('')}</i></div>`;
      [...T.querySelectorAll('.tkn,.tkq,.tkr>div,.tkf')].forEach((e, i) => c.up(e, t1 + 0.45 + i * 0.1, 0.45, 0.35));
      const conf = c.h('div', 'conf', '', g), cols = ['var(--ac)', 'var(--ac2)', 'var(--fg)'];
      const ps = Array.from({ length: 34 }, (_, i) => { const e = c.h('i', '', '', conf); e.style.background = cols[i % 3]; return { e, a: rnd() * 6.283, v: 5 + rnd() * 9, r: rnd() * 720 - 360, z: 0.6 + rnd() * 0.8 }; });
      c.tl.fn(t1 + 0.3, 1.8, p => { const q = ease.out5(p); for (const o of ps) { o.e.style.transform = `translate(${Math.cos(o.a) * o.v * q}em,${Math.sin(o.a) * o.v * q + 5 * p * p}em) rotate(${o.r * p}deg) scale(${o.z})`; o.e.style.opacity = p <= 0 || p >= 1 ? 0 : 1 - p * p; } });
      t = t1 + 1.3;
      if (s.pills) { const pw = c.h('div', 'pills', '', L); s.pills.forEach((x, i) => c.pop(c.h('span', '', rich(x), pw), t + i * 0.12, 0.45)); t += s.pills.length * 0.12 + 0.4; }
      return { end: t, read: 2.6 };
    },
    recap() { return { end: 1.5, read: 0.1, dur: 1.7 }; },
    raw(s, c) {
      c.el.insertAdjacentHTML('beforeend', s.raw);
      let end = 0.6;
      c.el.querySelectorAll('[data-in]').forEach(e => {
        const at = parseFloat(e.dataset.at || 0), k = e.dataset.in;
        const p = { up: { opacity: [0, 1], y: [0.7, 0] }, left: { opacity: [0, 1], x: [-1.2, 0] }, right: { opacity: [0, 1], x: [1.2, 0] }, pop: { opacity: [0, 1], scale: [0.8, 1] }, fade: { opacity: [0, 1] } }[k] || { opacity: [0, 1] };
        end = Math.max(end, c.tl.add(e, p, at, 0.6, k === 'pop' ? 'back' : 'out5'));
      });
      return end;
    },
  };

  const countWords = (v, k) => (['dur', 'image', 'raw', 'name', 'hi', 'unit', 'voice', 'vo', 'clip', 'tr', 'win', 'logo'].includes(k) || k[0] === '_' ? 0
    : typeof v === 'string' ? v.split(/\s+/).filter(Boolean).length
    : v && typeof v === 'object' ? Object.entries(v).reduce((n, [kk, vv]) => n + countWords(vv, Array.isArray(v) ? '' : kk) + (Array.isArray(v) ? 0 : 0), 0) : 0);

  let S = null;
  const WIN = new Set(['bullets', 'flow', 'loop', 'compare', 'chat', 'bars', 'image', 'clip', 'profile', 'check', 'clock']);
  const LEAD = 0.55, lerp = (a, b, p) => a + (b - a) * p;
  async function init(spec) {
    const m = spec.meta, W = m.w, H = m.h, portrait = H > W * 1.1, desk = m.style === 'desk', SP = W * 1.14, SPY = H * 1.12;
    const lay = m.layout || 'row', gc = Math.ceil(Math.sqrt(spec.scenes.length));
    const place = i => lay === 'column' ? [0, i * SPY] : lay === 'zigzag' ? [i * SP * 0.8, (i % 2) * SPY * 0.75]
      : lay === 'grid' ? [((Math.floor(i / gc) % 2) ? gc - 1 - (i % gc) : i % gc) * SP, Math.floor(i / gc) * SPY] : [i * SP, 0];
    U = portrait ? W / 21 : Math.min(W, H) / 23;
    const stage = document.getElementById('stage');
    stage.innerHTML = ''; stage.className = portrait ? 'port' : H < W * 0.9 ? 'land' : 'square'; PEND = [];
    stage.style.cssText = `width:${W}px;height:${H}px;font-size:${U}px`;
    const t0 = typeof m.theme === 'object' && m.theme ? { ...THEMES[m.theme.base || 'midnight'], ...m.theme } : THEMES[m.theme] || THEMES.midnight;
    const th = { win: t0.card, ink: t0.fg, inkmut: t0.mut, cline: t0.line, chip: `color-mix(in srgb,${t0.fg} 7%,transparent)`, wac: t0.ac, wac2: t0.ac2, head: t0.fg, kick: t0.ac2, band: t0.ac, ...t0 };
    th.whead = th.whead || th.ink; th.wkick = th.wkick || th.wac2;
    if (typeof m.theme === 'string') stage.classList.add('th-' + m.theme); else if (m.theme && m.theme.base) stage.classList.add('th-' + m.theme.base);
    for (const k of ['bg', 'fg', 'mut', 'ac', 'ac2', 'card', 'line', 'win', 'ink', 'inkmut', 'cline', 'chip', 'wac', 'wac2', 'head', 'kick', 'band', 'whead', 'wkick']) stage.style.setProperty('--' + k, th[k]);
    stage.style.setProperty('--font', (th.font ? `"${th.font}",` : '') + '"Inter","Montserrat","Be Vietnam Pro",system-ui,-apple-system,"Segoe UI",sans-serif');
    stage.style.setProperty('--pt', (portrait ? 0.11 : 0.08) * H + 'px');
    stage.style.setProperty('--pb', (portrait ? 0.15 : 0.1) * H + 'px');
    stage.style.setProperty('--px', (portrait ? 0.075 : 0.07) * W + 'px');

    const bgk = m.bg || 'glow', bg = document.createElement('div');
    bg.className = 'mg-bg';
    bg.innerHTML = (bgk === 'grid' ? '<div class="grid"></div>' : '') + (bgk === 'dots' ? '<div class="dots"></div>' : '') + (bgk !== 'plain' ? '<div class="blob b1"></div><div class="blob b2"></div>' : '');
    stage.appendChild(bg);
    const blobs = [...bg.querySelectorAll('.blob')];

    let world = null, blur = null, mascot = null;
    if (desk) {
      const view = document.createElement('div'); view.className = 'mg-view';
      world = document.createElement('div'); world.className = 'mg-world';
      view.appendChild(world); stage.appendChild(view);
      stage.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute"><filter id="mgblur" x="-5%" width="110%" y="-5%" height="110%"><feGaussianBlur stdDeviation="0 0"/></filter></svg>');
      blur = { view, fe: stage.querySelector('feGaussianBlur') };
    }

    const scenes = spec.scenes.map((s, i) => {
      const el = document.createElement('section'); el.className = 'mg-scene t-' + s.type; el.style.display = 'block';
      const cbox = document.createElement('div'); cbox.className = 'mg-c';
      const inner = document.createElement('div'); inner.className = 'mg-i';
      let slot = null, frame = null;
      if (desk) { const [px, py] = place(i, spec.scenes.length); slot = document.createElement('div'); slot.className = 'mg-slot'; slot.style.cssText = `left:${px}px;top:${py}px;width:${W}px;height:${H}px`; slot._p = [px, py]; world.appendChild(slot); slot.appendChild(el); }
      else stage.appendChild(el);
      if (desk && WIN.has(s.type) && !s.fill) {
        frame = document.createElement('div'); frame.className = 'window paper';
        frame.innerHTML = `<div class="wbar"><i></i><i></i><i></i><span>${rich(s.win || '')}</span></div><div class="wbody"></div>`;
        frame.lastChild.appendChild(inner); cbox.appendChild(frame);
      } else cbox.appendChild(inner);
      el.appendChild(cbox);
      const tl = new TL(), r = B[s.type](s, ctx(inner, tl, portrait, m));
      if (!portrait && ['image', 'clip', 'loop'].includes(s.type) && !s.fill && inner.querySelector(':scope>.title,:scope>.kicker,:scope>.sub')) inner.classList.add('sp');
      const end = typeof r === 'number' ? r : r.end;
      const words = countWords(s, '');
      const read = (typeof r === 'object' && r.read) || Math.min(3.2, Math.max(1, words * 0.2 - end * 0.5));
      const last = i === spec.scenes.length - 1, lead = desk && i ? LEAD : 0;
      let auto = (r.dur || Math.min(10, Math.max(2.4, end + read * (m.pace || 1) + (last ? 0.9 : 0.4)))) + lead;
      if (r.min) auto = Math.max(auto, r.min + lead);
      const vo = s._vo || null;
      if (vo) auto = Math.max(auto, lead + vo.at + vo.dur + (last ? 0.9 : 0.35));
      return { el, cbox, inner, slot, frame, tl, type: s.type, end, lead, vo, tr: s.tr || m.transition || 'fade', dur: s.dur != null ? +s.dur : Math.round(auto * 10) / 10, fixed: s.dur != null, last };
    });

    if (desk && m.mascot) { mascot = document.createElement('img'); mascot.className = 'mg-mascot'; mascot.src = m.mascot; world.appendChild(mascot); }
    if (m.brand) { const b = document.createElement('div'); b.className = 'mg-brand'; b.innerHTML = rich(m.brand); stage.appendChild(b); }
    let marq = null;
    if (m.marquee) { marq = document.createElement('div'); marq.className = 'mg-marq'; marq.innerHTML = '<div>' + `<span>${rich(m.marquee)}</span>`.repeat(12) + '</div>'; stage.appendChild(marq); }
    let cap = null;
    if (m.captions !== false && scenes.some(x => x.vo && x.vo.cues && x.vo.cues.length)) { cap = document.createElement('div'); cap.className = 'mg-cap'; stage.appendChild(cap); }
    let wipe = null;
    if (!desk && scenes.some(x => x.tr === 'wipe')) { wipe = document.createElement('div'); wipe.className = 'mg-wipe'; wipe.innerHTML = '<i></i><b></b>'; stage.appendChild(wipe); }
    let prog = null;
    if (m.progress) { prog = document.createElement('div'); prog.className = 'mg-prog'; prog.innerHTML = '<i></i>'; stage.appendChild(prog); }

    await Promise.all([...document.fonts].map(f => f.load().catch(() => {})));
    await document.fonts.ready;
    await Promise.all([...stage.querySelectorAll('img')].map(im => im.decode().catch(() => { im.dataset.err = 1; })));

    // auto-fit: shrink a scene's type scale until its content fits the safe area
    const over = sc => (sc.frame || sc.inner).getBoundingClientRect().height > sc.cbox.clientHeight + 1 || sc.inner.scrollWidth > sc.inner.clientWidth + 1 || [...sc.inner.querySelectorAll('h1,h2,.tkl')].some(e => e.scrollWidth > e.clientWidth + 1);
    let start = 0;
    const bt = m._beat || null;
    const info = scenes.map((sc, i) => {
      let k = 1;
      while (over(sc) && k > 0.6) { k = Math.round((k - 0.04) * 100) / 100; sc.el.style.fontSize = U * k + 'px'; }
      sc.fit = k; sc.overflow = over(sc);
      // beat sync: push this scene's end so the cut (slides) or the middle of the camera whip (desk) lands on the beat grid
      if (bt && !sc.fixed) {
        const nx = scenes[i + 1], kk = desk && nx ? (nx.type === 'recap' ? 0.55 : 0.34) : 0, g = bt.p * bt.n;
        sc.dur = Math.round((Math.ceil((start + sc.dur + kk - bt.o) / g - 1e-4) * g + bt.o - kk - start) * 1000) / 1000;
      }
      if (!desk) {
        const pv = scenes[i - 1], tin = pv ? pv.tr : null, X = W / U;
        if (tin === 'slide') sc.tl.add(sc.el, { x: [X * 0.55, 0], opacity: [0, 1] }, 0, 0.45, 'out5');
        else if (tin === 'zoom') sc.tl.add(sc.el, { scale: [0.82, 1], opacity: [0, 1] }, 0, 0.45, 'out5');
        else if (tin === 'blur') sc.tl.add(sc.el, { blur: [26, 0], opacity: [0, 1] }, 0, 0.45, 'out5');
        if (!sc.last) {
          const o = sc.tr, d = 0.38, a0 = sc.dur - d;
          if (o === 'slide') sc.tl.add(sc.el, { x: [0, -X * 0.55], opacity: [1, 0] }, a0, d, 'in');
          else if (o === 'zoom') sc.tl.add(sc.el, { scale: [1, 1.22], opacity: [1, 0] }, a0, d, 'in');
          else if (o === 'blur') sc.tl.add(sc.el, { blur: [0, 26], opacity: [1, 0] }, a0, d, 'in');
          else if (o !== 'wipe' && o !== 'cut') sc.tl.add(sc.el, { opacity: [1, 0], y: [0, -0.7] }, a0, d, 'in');
        }
      }
      sc.start = start; start += sc.dur;
      return { i: i + 1, type: sc.type, start: +sc.start.toFixed(3), lead: sc.lead, clipAt: spec.scenes[i]._clipAt, voAt: sc.vo ? +(sc.start + sc.lead + sc.vo.at).toFixed(3) : null, dur: sc.dur, need: +(sc.end + sc.lead + 0.8).toFixed(1), fit: k, overflow: sc.overflow, fixed: sc.fixed, imgErr: !!sc.el.querySelector('img[data-err]') };
    });

    if (desk) {
      const sr = stage.getBoundingClientRect();
      scenes.forEach((sc, i) => {
        const r = (sc.frame || sc.inner).getBoundingClientRect();
        sc.cam = sc.frame ? { x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2 - 0.5 * U, z: Math.max(1, Math.min(1.7, (0.8 * W) / r.width, (0.68 * H) / r.height)) } : { x: sc.slot._p[0] + W / 2, y: sc.slot._p[1] + H / 2, z: 1 };
        sc.perch = [r.left - sr.left + r.width * (sc.frame ? 0.12 : 0.5), r.top - sr.top - (sc.frame ? 0 : 1.1 * U)];
      });
      scenes.forEach((sc, i) => {
        if (sc.type !== 'recap') return;
        const wins = scenes.slice(0, i).filter(x => x.frame && !x.gone);
        if (!wins.length) { sc.cam = scenes[Math.max(0, i - 1)].cam; sc.perch = scenes[Math.max(0, i - 1)].perch; return; }
        const xs = wins.map(x => x.cam.x), ys = wins.map(x => x.cam.y), lo = Math.min(...xs), hi = Math.max(...xs), mid = (lo + hi) / 2;
        const ylo = Math.min(...ys), yhi = Math.max(...ys), my = (ylo + yhi) / 2;
        sc.cam = { x: mid, y: my, z: Math.min(1, W / (hi - lo + W), H / (yhi - ylo + H)) * 0.94 };
        sc.perch = [mid, my - H * 0.18]; sc.move = 1.1; sc.recap = true;
        wins.forEach((x, k) => { x.gone = true; sc.tl.add(x.slot, { x: [0, (mid - x.cam.x) / U], y: [0, (my - x.cam.y) / U], scale: [1, 0.5], opacity: [1, 0] }, 0.75 + k * 0.06, 0.5, 'in'); });
      });
    }
    S = { scenes, total: start, blobs, prog, W, H, desk, world, blur, mascot, marq, cap, wipe, mw: marq ? marq.querySelector('span').getBoundingClientRect().width : 0, beat: bt && m.pulse !== false ? bt : null, bg };
    await seek(0);
    return { total: +start.toFixed(2), w: W, h: H, fps: m.fps, scenes: info, beat: bt };
  }

  // camera zoom while a scene holds: slow push-in; recap zooms back in as cards collapse
  const holdZ = (sc, lt) => (sc.recap ? lerp(sc.cam.z, 0.85, ease.inout(Math.max(0, Math.min(1, (lt - LEAD - 0.75) / 0.7)))) : sc.cam.z * (1 + 0.03 * Math.min(1, lt / sc.dur)));

  function seek(t) {
    const { scenes, total, blobs, prog, W, H } = S;
    const ph = S.beat ? (((t - S.beat.o) / S.beat.p) % 1 + 1) % 1 : 0, pulse = S.beat ? Math.exp(-ph * 5.5) : 0;
    if (S.desk) {
      let ai = scenes.findIndex(sc => t < sc.start + sc.dur); if (ai < 0) ai = scenes.length - 1;
      scenes.forEach(sc => sc.tl.seek(t - sc.start - sc.lead));
      const sc = scenes[ai], a = ai ? scenes[ai - 1] : sc, lt = t - sc.start, q = ai ? Math.min(1, lt / (sc.move || 0.75)) : 1, p = ease.inout(q);
      const x = lerp(a.cam.x, sc.cam.x, p), y = lerp(a.cam.y, sc.cam.y, p);
      const z = lerp(ai ? holdZ(a, a.dur) : sc.cam.z, holdZ(sc, lt), p) * (1 - 0.1 * Math.sin(Math.PI * p)) * (1 + 0.014 * pulse);
      S.world.style.transform = `translate(${W / 2 - x * z}px,${H / 2 - y * z}px) scale(${z})`;
      const bw = Math.sin(Math.PI * q) * 0.55 * U, bx = bw * Math.abs(sc.cam.x - a.cam.x) / W, by = bw * Math.abs(sc.cam.y - a.cam.y) / H;
      S.blur.fe.setAttribute('stdDeviation', `${bx.toFixed(1)} ${by.toFixed(1)}`);
      S.blur.view.style.filter = bx + by > 0.6 ? 'url(#mgblur)' : 'none';
      if (S.mascot) {
        const hop = Math.sin(Math.PI * p) * (ai ? 3 * U : 0) + Math.abs(Math.sin(t * 3.4)) * 0.14 * U;
        S.mascot.style.transform = `translate(${lerp(a.perch[0], sc.perch[0], p)}px,${lerp(a.perch[1], sc.perch[1], p) - hop}px) translate(-50%,-97%)`;
      }
    } else scenes.forEach(sc => {
      const on = t >= sc.start && (t < sc.start + sc.dur || sc.last);
      sc.el.style.display = on ? 'block' : 'none';
      if (on) sc.tl.seek(t - sc.start);
    });
    if (blobs[0]) blobs[0].style.transform = `translate(${(-0.45 + 0.12 * Math.sin(t * 0.35)) * W}px,${(-0.25 + 0.08 * Math.cos(t * 0.3)) * H}px)`;
    if (blobs[1]) blobs[1].style.transform = `translate(${(0.35 + 0.12 * Math.cos(t * 0.28)) * W}px,${(0.55 + 0.07 * Math.sin(t * 0.33)) * H}px)`;
    if (S.beat && !S.desk) S.bg.style.transform = `scale(${1 + 0.035 * pulse})`;
    if (S.marq) S.marq.firstChild.style.transform = `translateX(${-((t * 2.4 * U) % S.mw)}px)`;
    if (prog) prog.firstChild.style.width = Math.min(100, (t / total) * 100) + '%';
    if (S.cap) captions(t);
    if (S.wipe) {
      let v = null;
      for (let i = 0; i < scenes.length - 1; i++) { const sc = scenes[i], T = sc.start + sc.dur; if (sc.tr === 'wipe' && Math.abs(t - T) < 0.36) v = t < T ? -100 + 100 * ease.inout((t - T + 0.36) / 0.36) : 100 * ease.inout((t - T) / 0.36); }
      S.wipe.style.display = v == null ? 'none' : 'block';
      if (v != null) S.wipe.style.transform = `translateX(${v.toFixed(2)}%)`;
    }
    const pend = PEND; PEND = [];
    return pend.length ? Promise.all(pend) : undefined;
  }

  // captions: phrase cues from the voiceover, current word highlighted (word times are spread by length inside each cue)
  function captions(t) {
    const sc = S.scenes.find(x => x.vo && t >= x.start && t < x.start + x.dur);
    let cue = null, lt = 0;
    if (sc) { lt = t - sc.start - sc.lead - sc.vo.at; cue = sc.vo.cues.find(c => lt >= c.a - 0.05 && lt < c.b + 0.25); }
    if (!cue) { S.cap.style.opacity = 0; return; }
    if (S.cap._c !== cue) {
      S.cap._c = cue;
      const ws = cue.text.split(/\s+/).filter(Boolean), L = ws.reduce((n, w) => n + w.length + 1, 0);
      let acc = 0; cue.w = ws.map(w => { const a = cue.a + (cue.b - cue.a) * (acc / L); acc += w.length + 1; return a; });
      S.cap.innerHTML = '<span>' + ws.map(w => `<i>${esc(w)}</i>`).join(' ') + '</span>';
    }
    S.cap.style.opacity = Math.min(1, (lt - cue.a + 0.05) / 0.12, (cue.b + 0.25 - lt) / 0.12);
    [...S.cap.firstChild.children].forEach((e, k) => e.classList.toggle('on', lt >= cue.w[k]));
  }

  window.__mg = { init, seek, themes: Object.keys(THEMES) };
})();
