---
name: motion-video
description: Create or edit motion graphic videos (explainers, shorts/reels/TikTok, product and website intros, event invites, AI-agent content) from a compact YAML spec rendered to MP4 by the bundled mograph engine, with background music and cuts synced to the beat. Use when the user asks for a motion graphic / kinetic typography / explainer / promo video, wants to turn a script, post or web page into a video, or wants to revise a video made with mograph. Trigger on "motion graphic", "video explainer", "làm video", "dựng video", "edit video motion", "video giới thiệu".
---

# motion-video

You write a short YAML **spec**; the engine owns layout, animation, timing and beat sync. Never write HTML/CSS/JS or
animation code for a video — that burns tokens and breaks consistency.

CLI: `node <dir of this SKILL.md>/scripts/mograph.mjs` (below: `mg`). First run on a machine: `npm install --prefix <dir of this SKILL.md>`.
Needs Node 18+, Google Chrome (or `MOGRAPH_CHROME`), ffmpeg.

## Workflow — 7 steps, in order. Each step is the cheapest check that can catch its problem.

1. **Script (chat only, no files).** Agree with the user: goal, audience, ratio, then hook → 3–8 beats → CTA. One idea per scene.
   Every number and claim must come from the user or a source you read; `stat`/`bars` need a `src` line. No source → no number.
2. **Pick assets.** `mg assets <folder>` lists each image/audio with size and what it suits — text only. Choose from the list;
   add `--sheet` (one thumbnail image) only if names and sizes are not enough. Do not Read image files one by one.
   Wide product shots/screenshots → `image` scene. Transparent PNG/SVG → `logo`, `mascot`, `avatar`.
3. **Pick motion.** Choose the style, then one scene type per beat from the table below.
4. **Write `<name>.yaml`.** Omit `dur` (auto-timed). `mg catalog <type>` only for a type whose fields you are unsure of.
5. **Add music.** `music: upbeat | chill | drive` (built-in, original, exact BPM) or `audio: path` (user's file, BPM auto-detected).
   Cuts and camera moves then snap to the beat grid automatically — never hand-tune `dur` for sync.
6. **`mg lint <spec>`** (text). Fix every ERR/WARN, repeat until `OK`. Check the `♪` line: if detection confidence is LOW, tell the user and set `bpm`.
7. **`mg sheet <spec>`** — ONE contact-sheet image of every scene; look once. After fixes re-check only what changed
   (`--scenes 3,5`). A `recap` frame looks empty in the sheet — that is its end state, not a bug. `sheet` and `render` re-run lint themselves.
   Then **`mg render <spec>`** → MP4 (`--draft` for a quick preview, `--size 16:9` for another ratio).

Revisions: Edit the specific YAML lines (never rewrite the file) → lint → `sheet --scenes N` → render.
Do not read rendered frames or the video back; do not open engine source unless fixing the engine. You cannot hear audio — say so, and let the user judge the music.

## Step 3 — which motion for which content

| The beat is about… | Scene type | Why |
|---|---|---|
| Opening line, section title | `hook` | word-by-word reveal |
| A product / screenshot / photo | `image` (+ `title`, `kicker`, `caption`) | image dominates the card, slow zoom |
| One number | `stat` (+ `src`) | count-up |
| Comparing numbers | `bars` (+ `src`) | bars grow |
| Steps in order | `flow` | nodes + arrows, sequential glow |
| A repeating cycle, or parts around a core | `loop` | ring + orbiting dot |
| A vs B | `compare` | two columns, right side wins |
| A conversation with an AI / tool use | `chat` | typed reply, tool chips |
| A command-line demo | `term` | typed commands |
| A list of points | `bullets` · `check` (cursor ticks them) | stagger |
| A person | `profile` | avatar + typed quote |
| Time / place of an event | `clock` · `pin` | clock sweep · pin drop |
| A saying | `quote` | |
| Ending | `cta` · `ticket` (summary card + confetti) | |

Style (`meta.style`): `slides` — one scene per cut; talking-point explainers, data stories. `desk` — every scene is a window card on one
canvas, camera whip-pans between them; product/website tours, invites, announcements. In `desk`, add `win: title` per card,
end with `recap: true` (zoom out, cards collapse) then `ticket` or `cta`.
Music: `upbeat` product intros/explainers · `chill` personal/storytelling · `drive` launches. Never two scenes of the same type in a row
unless it is a product series.

## Spec cheatsheet

```yaml
meta: {size: "9:16", style: desk, theme: midnight, music: upbeat, brand: "@handle", max: 45}
scenes:
  - hook: "AI Agent *không phải* chatbot"      # *word* = accent; first key = scene type
    kicker: AI Agent 101
    sub: Chatbot trả lời. Agent hoàn thành công việc.
  - image: assets/product.jpg                   # path relative to the spec
    kicker: Công cụ online
    title: Tên sản phẩm
    caption: Một câu lợi ích
    win: Sản phẩm
  - stat: "5"
    label: công cụ miễn phí
    src: "Nguồn: tên trang, ngày"
  - flow: [Mục tiêu, "Kế hoạch|dòng phụ", Hành động]   # "Label|detail" = two-line item
  - loop: [Suy nghĩ, Hành động, Quan sát]
    center: Agent
  - compare: [Chatbot, AI Agent]
    rows: [[Trả lời, Hành động], [Chờ lệnh, Tự lập kế hoạch]]
  - chat: ["u: câu hỏi", "t: tool_call()", "a: câu trả lời"]
  - check: [Việc một, "Việc hai|ghi chú"]
  - recap: true
  - ticket: "Ghé *website*"                     # all optional: kicker, name, note, rows {label: value}, pills [..], code, logo: path
    rows: {Website: example.com}
```

- `size`: 9:16 · 16:9 · 1:1 · 4:5. `theme`: midnight · paper · terminal · sunset · meadow · lanhmar, or a brand map
  `{base: paper, bg: "#fff", ac: "#7c3aed", ac2: "#f97316", font: Montserrat}`. `bg`: glow · grid · dots · plain.
- `max: 45` = target length in seconds (lint warns above it). `pace: 0.7` = faster cuts. `sync: half` (default, cut every 2 beats) · `beat` · `bar` · `off`. `volume: 0.8`. `pulse: false` removes the beat zoom.
- `marquee: "TEXT ★ TEXT ★"` scrolling band. `mascot: path` (desk) hops between cards. `cursor: Name` tags the `check` cursor.
- Other types: `bullets`, `term`, `bars`, `quote`, `profile`, `clock`, `pin`, `cta`, `raw` (custom HTML — last resort, tell the user).

## Writing rules that decide quality

- Hook ≤ 8 words with one `*accent*`. Titles ≤ 6 words. Items ≤ 6 words; detail goes after `|`. Kicker ≤ 3 words.
- 3–4 items per scene; split rather than shrink. `fitNN%` under 80 in lint = too much text — cut words.
- Shorts 20–45s, 5–9 scenes; product tours up to 60s. Open with `hook`, end with `cta`/`ticket`.
- Show, don't list: prefer `image`, `flow`, `loop`, `compare`, `chat` over `bullets`.

## Token budget (keep a whole video inside a small plan)

One pass = this file once + spec (~300–700 tokens) + lint text + one sheet image (~1–3k). To stay there: no engine source,
no per-file image reads, no full-file rewrites, no re-viewing unchanged scenes, no rendered-frame reads, at most 2 full sheets per video.
