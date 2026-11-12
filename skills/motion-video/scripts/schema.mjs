// Single source of truth for the spec: used by `lint` (validation) and `catalog` (on-demand docs).
// main: shape of the value under the type key. str | list | pair | map
import { STYLES } from './audio.mjs';
export const SCENES = {
  hook: { d: 'Big opening/section headline, centered.', main: 'str', max: 14, f: { kicker: 'small label above', sub: 'one supporting line' }, ex: '- hook: "AI Agent *không phải* chatbot"\n  sub: Nó tự lập kế hoạch và hành động' },
  bullets: { d: 'Title + staggered numbered cards. Item "Label|detail" adds a muted second line.', main: 'list', items: [2, 5], f: { title: '', kicker: '' }, ex: '- bullets: [Hiểu mục tiêu, "Dùng tool|search, code, API", Tự kiểm tra]\n  title: Agent làm được gì' },
  flow: { d: 'Linear pipeline of nodes with arrows (vertical on portrait, horizontal on landscape). Item "Label|detail".', main: 'list', items: [2, 5], f: { title: '', kicker: '' }, ex: '- flow: [Mục tiêu, Kế hoạch, Hành động, Kết quả]\n  title: Cách agent chạy' },
  loop: { d: 'Cycle diagram: nodes on a ring around a center label, orbiting dot. Keep node labels ≤3 words.', main: 'list', items: [3, 6], f: { center: 'label in the middle', title: '', kicker: '' }, ex: '- loop: [Suy nghĩ, Hành động, Quan sát]\n  center: Agent' },
  stat: { d: 'One giant count-up number. Value like "73%", "3.5x", "$1,200". ALWAYS give src for real data.', main: 'str', f: { label: 'what the number means', src: 'source line, e.g. "Nguồn: …, 2026"', kicker: '' }, ex: '- stat: "3 thành phần"\n  label: Model, tools và vòng lặp' },
  compare: { d: 'Two columns A vs B (right column is the highlighted "winner"). rows: list of [left, right].', main: 'pair', f: { rows: 'list of [left,right], 2–4 rows', title: '', kicker: '' }, req: ['rows'], ex: '- compare: [Chatbot, AI Agent]\n  rows: [[Trả lời câu hỏi, Hoàn thành công việc], [Chờ lệnh, Tự lên kế hoạch]]' },
  chat: { d: 'Chat UI. Prefix each line: "u:" user bubble, "a:" agent (typed out), "t:" tool-call chip.', main: 'list', items: [1, 6], f: { title: '', kicker: '' }, ex: '- chat: ["u: Đặt lịch họp thứ 6", "t: calendar.find_slot()", "a: Đã đặt 14:00 thứ 6."]' },
  term: { d: 'Terminal window. Lines starting with "$ " are typed; others print as output.', main: 'list', items: [1, 8], f: { name: 'window title', title: '', kicker: '' }, ex: '- term: ["$ claude \\"fix the failing test\\"", "Reading tests…", "✓ 12 passed"]' },
  quote: { d: 'Pull quote.', main: 'str', max: 30, f: { by: 'attribution' }, ex: '- quote: "Agent là model dùng tool trong một vòng lặp"\n  by: …' },
  bars: { d: 'Horizontal bar chart from a map label→number. Largest bar highlighted (override with hi).', main: 'map', items: [2, 6], f: { title: '', unit: 'suffix e.g. "%"', hi: 'label to highlight', src: 'source line (required for real data)', kicker: '' }, ex: '- bars: {Nhóm A: 42, Nhóm B: 68}\n  unit: "%"\n  src: "Nguồn: …"' },
  clip: { d: 'Video footage (mp4/mov/webm) playing inside the card. from/to trim seconds; sound: true (or 0–1) mixes its audio; fill: true = full-screen footage with title over it. Scene lasts at least the clip length.', main: 'str', f: { title: '', caption: '', kicker: '', from: 'start second', to: 'end second', sound: 'true or volume 0–1', fill: 'true = full-bleed background', max: 'cap clip length, default 12' }, ex: '- clip: assets/demo.mp4\n  from: 2\n  to: 8\n  title: Xem thực tế' },
  image: { d: 'Framed image/screenshot with slow zoom. Path relative to the spec file.', main: 'str', f: { title: '', caption: '', kicker: '' }, ex: '- image: assets/screenshot.png\n  caption: Giao diện thực tế' },
  cta: { d: 'Closing call to action, centered.', main: 'str', max: 12, f: { sub: '', button: 'pill button label', handle: '@account / url' }, ex: '- cta: Follow để học *AI Agent* mỗi ngày\n  button: Follow\n  handle: "@kenh"' },
  profile: { d: 'Person card: avatar (initials or image) + name + typed quote.', main: 'str', f: { role: 'small label above the name', quote: 'typed out', avatar: 'image path (else initials)' }, ex: '- profile: Hưng Kescy\n  role: Diễn giả\n  quote: Cái gì máy làm tốt thì người đừng làm' },
  check: { d: 'Checklist that a cursor ticks one by one. Item "Label|detail". meta.cursor sets the cursor name tag.', main: 'list', items: [1, 5], f: { title: '', kicker: '' }, ex: '- check: ["Thế nào là 1 Skill tốt?", "6 bước giải quyết vấn đề|Nâng cao"]\n  title: Đi làm với AI' },
  clock: { d: 'Analog clock sweeping a time range, e.g. "14h–18h" or "9:00-11:30".', main: 'str', f: { sub: 'date line', kicker: '' }, ex: '- clock: 14h–18h\n  sub: "Thứ Bảy, 17/10"' },
  pin: { d: 'Map pin drops with ripple + place name, centered.', main: 'str', f: { sub: 'address' }, ex: '- pin: BAMOS Coffee Ngô Tất Tố\n  sub: 60 Ngô Tất Tố, TP. HCM' },
  ticket: { d: 'Finale: big title + ticket/summary card with barcode and confetti. rows: map label→value.', main: 'str', max: 8, f: { kicker: '', name: 'ticket headline', note: 'muted line under it', rows: 'map label→value, 2–4', pills: 'list of short tags under the title', code: 'footer text', logo: 'image path' }, ex: '- ticket: "Đi làm với *AI*"\n  kicker: Vé mời · Workshop\n  name: Hưng Kescy\n  rows: {Thời gian: 14h–18h, Ngày: "Thứ Bảy, 17/10"}\n  code: KES × SG' },
  recap: { d: 'desk style only: camera zooms out over all previous window cards, then they collapse together. Value: true. Put it right before the finale.', main: 'any', f: {}, ex: '- recap: true' },
  raw: { d: 'Escape hatch: custom HTML (use only when no type fits). Children with data-in="up|left|right|pop|fade" data-at="0.4" animate in. Sizes in em. Costs tokens — avoid.', main: 'str', f: {}, ex: '- raw: \'<h2 class="title" data-in="up">Custom</h2>\'\n  dur: 3' },
};
export const META = {
  size: '9:16 (default) | 16:9 | 1:1 | 4:5 | WxH',
  fps: '30 default',
  theme: 'midnight (default) | paper | terminal | sunset | meadow | lanhmar, or {base, bg, fg, mut, ac, ac2, card, line, font}',
  bg: 'glow (default) | grid | dots | plain',
  pace: 'reading-time multiplier, 1 default; 0.8 = faster cuts',
  brand: 'watermark text at the bottom, e.g. "@handle"',
  progress: 'true = progress bar on top',
  music: 'built-in royalty-free track: ' + Object.keys(STYLES).join(' | ') + ' (generated to the video length, exact BPM)',
  audio: 'path to your own music/voiceover file (BPM is auto-detected; use music OR audio)',
  bpm: 'override tempo (music: change speed; audio: fix a wrong detection)',
  sync: 'cuts land on the beat grid: half (default, every 2 beats) | beat | bar | off',
  volume: 'music volume 0–1, default 0.8',
  pulse: 'false = no subtle zoom pulse on each beat',
  max: 'target max seconds; lint warns when exceeded',
  style: 'slides (default: one scene per cut) | desk (scenes are window cards on one canvas; camera whip-pans between them)',
  mascot: 'desk only: image path of a character that perches on the active card and hops along',
  marquee: 'text for a scrolling band on top, e.g. "LANHMAR ★ DIGITAL MARKETER ★"',
  transition: 'slides only: fade (default) | slide | zoom | blur | wipe | cut (per scene: tr)',
  layout: 'desk only: row (default) | column | grid | zigzag — how cards sit on the canvas, so the camera moves in 2D',
  tts: 'voice engine: auto (default) | piper | say | sapi | espeak',
  voice: 'voice name for the engine (piper e.g. vi_VN-vais1000-medium, say e.g. Linh)',
  rate: 'speech speed, 1 default',
  captions: 'false = no on-screen captions for voice lines',
  capwords: 'max words per caption line, 7 default',
  cursor: 'name tag on the cursor in `check` scenes, e.g. "Bạn"',
};
const COMMON = ['dur', 'win', 'logo', 'voice', 'vo', 'tr'];
const SIZES = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350] };
const wc = s => String(s).split(/\s+/).filter(Boolean).length;

/** Validates + normalizes. Returns {spec, errors, warns}. */
export function normalize(raw) {
  const errors = [], warns = [];
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.scenes)) return { errors: ['spec must have a `scenes` list'], warns, spec: null };
  const meta = { size: '9:16', fps: 30, ...(raw.meta || {}) };
  for (const k of Object.keys(meta)) if (!(k in META)) errors.push(`meta: unknown key "${k}" (allowed: ${Object.keys(META).join(', ')})`);
  const sz = SIZES[meta.size] || (String(meta.size).match(/^(\d+)x(\d+)$/) || []).slice(1).map(Number);
  if (sz.length !== 2) errors.push(`meta.size "${meta.size}" invalid`); else[meta.w, meta.h] = sz;
  if (meta.w % 2 || meta.h % 2) errors.push('meta.size: width and height must be even');
  if (meta.music && !STYLES[meta.music]) errors.push(`meta.music "${meta.music}" unknown (${Object.keys(STYLES).join(', ')})`);
  if (meta.transition && !['fade', 'slide', 'zoom', 'blur', 'wipe', 'cut'].includes(meta.transition)) errors.push('meta.transition must be fade|slide|zoom|blur|wipe|cut');
  if (meta.layout && !['row', 'column', 'grid', 'zigzag'].includes(meta.layout)) errors.push('meta.layout must be row|column|grid|zigzag');
  if (meta.music && meta.audio) errors.push('meta: use music OR audio, not both');
  if (meta.mascot && meta.style !== 'desk') warns.push('meta.mascot is only shown with style: desk');
  const scenes = raw.scenes.map((s, i) => {
    const id = `s${i + 1}`;
    if (!s || typeof s !== 'object') { errors.push(`${id}: must be a map`); return null; }
    const types = Object.keys(s).slice(0, 1).filter(k => k in SCENES);
    if (types.length !== 1) { errors.push(`${id}: first key must be the scene type (${Object.keys(SCENES).join('|')}), got [${Object.keys(s).join(', ')}]`); return null; }
    const type = types[0], def = SCENES[type], v = s[type];
    for (const k of Object.keys(s)) if (k !== type && !(k in def.f) && !COMMON.includes(k)) errors.push(`${id} ${type}: unknown field "${k}" (allowed: ${[...Object.keys(def.f), ...COMMON].join(', ')})`);
    for (const k of def.req || []) if (s[k] == null) errors.push(`${id} ${type}: missing "${k}"`);
    const isList = Array.isArray(v), n = isList ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0;
    if (def.main === 'str' && (typeof v === 'object' || v == null)) errors.push(`${id} ${type}: value must be text`);
    if (def.main === 'list' && !isList) errors.push(`${id} ${type}: value must be a list`);
    if (def.main === 'pair' && !(isList && n === 2)) errors.push(`${id} ${type}: value must be [left, right]`);
    if (def.main === 'map' && (isList || !v || typeof v !== 'object')) errors.push(`${id} ${type}: value must be a map label→number`);
    if (def.items && n && (n < def.items[0] || n > def.items[1])) warns.push(`${id} ${type}: ${n} items, best with ${def.items[0]}–${def.items[1]} (split the scene)`);
    if (def.max && typeof v === 'string' && wc(v) > def.max) warns.push(`${id} ${type}: ${wc(v)} words, keep ≤${def.max}`);
    if (type === 'compare' && Array.isArray(s.rows) && s.rows.some(r => !Array.isArray(r) || r.length !== 2)) errors.push(`${id} compare: each row must be [left, right]`);
    if ((type === 'stat' || type === 'bars') && !s.src) warns.push(`${id} ${type}: no src — add a source line if this is real data`);
    if (type === 'recap' && meta.style !== 'desk') errors.push(`${id} recap: needs meta.style: desk`);
    if (s.tr && !['fade', 'slide', 'zoom', 'blur', 'wipe', 'cut'].includes(s.tr)) errors.push(`${id}: tr must be fade|slide|zoom|blur|wipe|cut`);
    if (s.vo && !s.voice) errors.push(`${id}: vo needs the matching voice: text (used for captions)`);
    if (s.dur != null && !(+s.dur > 0)) errors.push(`${id}: dur must be a positive number`);
    return { ...s, type };
  });
  return { spec: errors.length ? null : { meta, scenes }, errors, warns };
}

export function catalog(type) {
  if (type && SCENES[type]) {
    const d = SCENES[type];
    return `${type} (${d.main}) — ${d.d}\nfields: ${Object.entries(d.f).map(([k, v]) => k + (v ? ` (${v})` : '')).join('; ') || '—'}; dur (seconds, optional — auto if omitted); win (window title, desk style); logo (image, hook/cta/ticket); voice (narration text → speech + captions); vo (your recording of that line); tr (transition out of this scene)\n${d.ex}`;
  }
  return 'SCENE TYPES (first key = type; `mograph catalog <type>` for fields + example)\n'
    + Object.entries(SCENES).map(([k, d]) => `  ${k.padEnd(8)} ${d.d}`).join('\n')
    + '\nMETA\n' + Object.entries(META).map(([k, d]) => `  ${k.padEnd(8)} ${d}`).join('\n')
    + '\nTEXT: *word* = accent color. "Label|detail" = two-line item. Omit dur → auto-timed from text length.';
}
