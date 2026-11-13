---
name: motion-video
description: Create or edit motion graphic videos (explainers, shorts/reels/TikTok, product and website intros, event invites, AI-agent content) from a compact YAML spec rendered to MP4 by the bundled mograph engine — footage clips, voiceover with captions, background music and cuts synced to the beat. Use when the user asks for a motion graphic / kinetic typography / explainer / promo video, wants to turn a script, post or web page into a video, or wants to revise a video made with mograph. Trigger on "motion graphic", "video explainer", "làm video", "dựng video", "edit video motion", "video giới thiệu".
---

# motion-video

You write a short YAML **spec**; the engine owns layout, animation, timing and beat sync. Never write HTML/CSS/JS or
animation code for a video — that burns tokens and breaks consistency.

CLI: `node <dir of this SKILL.md>/scripts/mograph.mjs` (below: `mg`). The first command installs its npm dependencies by itself.
Needs Node 18+, Google Chrome/Edge (or `MOGRAPH_CHROME`), ffmpeg. If anything fails to start, run `mg doctor` — it prints what is missing and the install command for this OS.

## Workflow — 7 steps, in order. Each step is the cheapest check that can catch its problem.

1. **Script (chat only, no files).** Agree with the user: goal, audience, ratio, then hook → 3–8 beats → CTA. One idea per scene.
   Every number and claim must come from the user or a source you read; `stat`/`bars` need a `src` line. No source → no number.
2. **Pick assets.** `mg assets <folder>` lists each image/video/audio with size and what it suits — text only. Choose from the list;
   add `--sheet` (one thumbnail image) only if names and sizes are not enough. Do not Read image files one by one.
   Wide product shots/screenshots → `image`. Video files → `clip`. Transparent PNG/SVG → `logo`, `mascot`, `avatar`.
3. **Pick motion.** Choose the style, then one scene type per beat from the table below, then a **look** (one word, below).
   Do not hand-pick animations per scene: the look + `seed` vary them for you. To offer the user a choice, run
   `mg remix <spec>` — ONE image: rows = the spec's look + 3 contrasting looks, across the first scenes; they answer "B", you set `look`
   (and `seed`) in one Edit. `--looks a,b,c` to choose rows, `--seeds 1,2,3` for variations of the current look. If you must choose
   yourself, pick the row that fits the brief and say which; no edit is needed when it is already the spec's look/seed. Never ask for
   per-scene effects unless the user names one.
4. **Write `<name>.yaml`.** Omit `dur` (auto-timed). `mg catalog <type>` only for a type whose fields you are unsure of.
5. **Add sound.** Music: `music: upbeat | chill | cinematic | hiphop | drive` (built-in, original, exact BPM) or `audio: path`
   (user's file, BPM auto-detected). Cuts and camera moves snap to the beat grid — never hand-tune `dur` for sync.
   Voiceover (optional): `voice: "narration"` on a scene → speech + on-screen captions; the scene stretches to fit the line and music
   ducks under it. Use the user's recording with `vo: file.wav` (keep `voice:` as the caption text). One or two short sentences per scene.
6. **`mg lint <spec>`** (text). Fix every ERR/WARN, repeat until `OK`. Check the `♪` line: if confidence is LOW or it lists other possible tempos, tell the user and set `bpm` if they say the cuts feel off.
   The `🎙` line names the voice engine; if it is espeak (also the automatic fallback when a piper voice cannot be downloaded), keep going, then tell the user it sounds robotic and offer `pip install piper-tts` or recorded `vo:` files.
   Over `max`: set `pace: 0.8`, trim clips, shorten voice lines, or drop a scene. Up to ~2s over is fine — say so instead of looping.
7. **`mg sheet <spec>`** — ONE contact-sheet image of every scene; look once. After fixes re-check only what changed
   (`--scenes 3,5`). A `recap` frame looks empty in the sheet — that is its end state, not a bug. `sheet` and `render` re-run lint themselves.
   Then **`mg render <spec>`** → MP4 (`--draft` for a quick preview, `--size 16:9` for another ratio). Lint prints `⏱ render ≈ Ns`:
   if that is over ~100s, start render in the background (or with a 10-minute timeout) and wait for its completion — never poll it,
   and ignore `*.part.mp4` (the file appears under its real name only when finished).

Revisions: Edit the specific YAML lines (never rewrite the file) → lint → `sheet --scenes N` → render.
Do not read rendered frames or the video back; do not open engine source unless fixing the engine. You cannot hear audio — say so, and let the user judge the music.

## Step 3 — which motion for which content

| The beat is about… | Scene type | Why |
|---|---|---|
| Opening line, section title | `hook` | word-by-word reveal |
| Opener / hype line, a slogan broken into beats | `kinetic` (2–8 phrases ≤5 words) | full-screen type, one phrase per beat |
| Brand / logo intro or outro | `sting` (logo path + `sub`) | ring draws, rays burst, logo pops |
| A product / screenshot / photo | `image` (+ `title`, `kicker`, `caption`) · `fill: true` full-screen photo | image dominates the card, slow zoom |
| A product next to its benefits | `split` (image + `title`, `points`) | half image, half text |
| An app or website | `device` (phone/laptop mockup; tall screenshot scrolls, video plays) | looks like the real product |
| Several photos / an event | `grid` (2–6 images) | mosaic pops in |
| History, roadmap, steps with dates | `timeline` ("When|What") | line draws, milestones pop |
| Who is speaking / what this is | `lower: "Name|Role"` on any scene | lower-third bar |
| A product in action, a screen recording, b-roll | `clip` (`from`, `to`, `sound`) · `fill: true` for full-screen footage behind a title | real motion beats any animation. The scene lasts as long as the clip (whole file, max 12s) — always trim to 3–6s with `from`/`to` |
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

Looks (`meta.look`) — each sets text animations, transitions, background and overlays; `seed: 2` reshuffles:
`clean` calm/corporate · `bold` short-form social energy · `kinetic` typography-led · `glitch` tech/AI (sparingly) ·
`cinematic` slow brand story · `editorial` magazine/explainer · `playful` fun/lifestyle. `mg catalog looks` / `mg catalog fx` list the parts;
`fx: [grain, leak]`, `bg:`, `transition:`, scene `anim:`/`tr:` override the look only when the user asks for something specific.

Style (`meta.style`): `slides` — one scene per cut; talking-point explainers, data stories. `desk` — every scene is a window card on one
canvas, camera whip-pans between them; product/website tours, invites, announcements. In `desk`, add `win: title` per card,
end with `recap: true` (zoom out, cards collapse) then `ticket` or `cta`. `layout: grid | column | zigzag` moves the camera in 2D instead of a straight line.
Transitions come from the look (slides style); desk style moves the camera instead.
Music: `upbeat` product intros/explainers · `chill` personal/storytelling · `cinematic` brand stories · `hiphop` creator tips · `drive` launches. Never two scenes of the same type in a row
unless it is a product series.

## Spec cheatsheet

```yaml
meta: {size: "9:16", look: bold, seed: 1, theme: midnight, music: upbeat, brand: "@handle", max: 45}
scenes:
  - hook: "AI Agent *không phải* chatbot"      # *word* = accent; first key = scene type
    kicker: AI Agent 101
    sub: Chatbot trả lời. Agent hoàn thành công việc.
  - image: assets/product.jpg                   # path relative to the spec
    kicker: Công cụ online
    title: Tên sản phẩm
    caption: Một câu lợi ích
    win: Sản phẩm
  - clip: assets/demo.mp4                      # footage; from/to trim, sound: true keeps its audio
    from: 2
    to: 8
    title: Xem thực tế
    voice: Đây là sản phẩm khi chạy thật.       # narration → speech + captions (vo: file.wav to use a recording)
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
- Voice: `tts: auto` (piper → say/Windows → espeak) · `voice: <voice name>` · `rate: 1.1` · `captions: false` · `capwords: 6`.
- `marquee: "TEXT ★ TEXT ★"` scrolling band. `mascot: path` (desk) hops between cards. `cursor: Name` tags the `check` cursor.
- Other types: `kinetic`, `sting`, `split`, `device`, `grid`, `timeline`, `bullets`, `term`, `bars`, `quote`, `profile`, `clock`, `pin`, `cta`, `raw` (custom HTML — last resort, tell the user). Fields: `mg catalog <type>`.

## Writing rules that decide quality

- Long URLs and handles go in `sub` (hook, cta, sting take `sub`), not in the headline.
- Hook ≤ 8 words with one `*accent*`. Titles ≤ 6 words. Items ≤ 6 words; detail goes after `|`. Kicker ≤ 3 words.
- 3–4 items per scene; split rather than shrink. `fitNN%` under 80 in lint = too much text — cut words.
- Voice lines ≤ 2 short sentences per scene; captions are the narration, so write it the way it should read.
- Shorts 20–45s, 5–9 scenes; product tours up to 60s. Open with `hook`, end with `cta`/`ticket`.
- Show, don't list: prefer `image`, `split`, `device`, `flow`, `loop`, `compare`, `chat` over `bullets`. Open with `kinetic` or `hook`, mix at least 4 scene types.

## Token budget (keep a whole video inside a small plan)

One pass = this file once + spec (~300–700 tokens) + lint text + one sheet image (~1–3k). Footage and voice add no tokens: you never look at frames or hear audio. To stay there: no engine source,
no per-file image reads, no full-file rewrites, no re-viewing unchanged scenes, no rendered-frame reads, at most 2 full sheets per video; one `remix` image replaces trial-and-error renders when exploring styles.
