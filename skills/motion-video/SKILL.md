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
4. **Write `<name>.yaml`.** Deliver BOTH formats by default: `meta: { sizes: ["9:16", "16:9"] }` (one `render` writes `-9x16.mp4` and `-16x9.mp4`; lint/sheet check both). Only one size if the user asks. Omit `dur` (auto-timed). `mg catalog <type>` only for a type whose fields you are unsure of.
5. **Add sound.** Music: `music: upbeat | chill | cinematic | hiphop | drive` (built-in, original, exact BPM) or `audio: path`
   (user's file, BPM auto-detected). Cuts and camera moves snap to the beat grid — never hand-tune `dur` for sync.
   Voiceover (optional): `voice: "narration"` on a scene → speech + on-screen captions; the scene stretches to fit the line and music
   ducks under it. Use the user's recording with `vo: file.wav` (keep `voice:` as the caption text). One or two short sentences per scene.
6. **`mg lint <spec>`** (text). Fix every ERR/WARN, repeat until `OK`. Check the `♪` line: if confidence is LOW or it lists other possible tempos, tell the user and set `bpm` if they say the cuts feel off.
   The `🎙` line names the voice engine; if it is espeak (also the automatic fallback when a piper voice cannot be downloaded), keep going, then tell the user it sounds robotic and offer `pip install edge-tts` (natural, online), `pip install piper-tts` (offline) or recorded `vo:` files. When the user says a word is misread, add `say:` with a respelling on that scene; never change `voice:` for it.
   Over `max`: set `pace: 0.8`, trim clips, shorten voice lines, or drop a scene. Up to ~2s over is fine — say so instead of looping.
7. **`mg sheet <spec>`** — ONE contact-sheet image of every scene; look once. After fixes re-check only what changed
   (`--scenes 3,5`). A `recap` frame looks empty in the sheet — that is its end state, not a bug. `sheet` and `render` re-run lint themselves.
   Then **`mg render <spec>`** → MP4 (+ `.srt` captions when voiced; `--thumb` cover, `--gif`, `--webm` on request; audio is normalised to -14 LUFS) (`--draft` for a quick preview, `--size 16:9` for another ratio). Lint prints `⏱ render ≈ Ns`:
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
| A hero moment in 3D | `3d: card` (+ `image`) product slab · `3d: object` brand shape behind a title · `3d: particles` beat-reactive field | real depth; renders ~3x slower, use 1–2 per video |
| A formula, function graph, geometry | `manim: file.py` (optional, only if `mg doctor` lists Manim; you write a short Manim Scene) | precise math animation |
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
| Old way vs new way over time ("days → minutes") | `race` (`total`, `reach`, `times`, `result`, `src`) | two grids fill side by side, counters run, loser dims, title flips to the result |
| A conversation with an AI / tool use | `chat` | typed reply, tool chips |
| A command-line demo | `term` | typed commands |
| A list of points | `bullets` · `check` (cursor ticks them) | stagger |
| A person / a hero object (editor-reel style) | `subject` (photo → background removed automatically, title BEHIND it, accent shape) · `card` (pill grows into a card with the cutout, list grows below) | the signature TikTok motion-design look |
| A person | `profile` | avatar + typed quote |
| Time / place of an event | `clock` · `pin` | clock sweep · pin drop |
| A saying | `quote` | |
| Ending | `cta` · `ticket` (summary card + confetti) | |

Looks (`meta.look`) — each sets text animations, transitions, background and overlays; `seed: 2` reshuffles:
`clean` calm/corporate · `bold` short-form social energy · `kinetic` typography-led · `glitch` tech/AI (sparingly) ·
`cinematic` slow brand story · `editorial` magazine/explainer · `playful` fun/lifestyle · `studio` editor-reel: off-white, one accent, swoosh lines, colour floods, motion blur, condensed type (pair with `theme: studio` or the brand's colours). `mg catalog looks` / `mg catalog fx` list the parts;
With music the look also picks **beat accents** (a different hit each bar, strong on beat 1) and list items land on the beat.
Backgrounds stay calm behind the content (`intensity: low`); `mid`/`high` only if the user wants a busier background.
`fx: [grain, leak]`, `bg:`, `accents:`, `transition:`, scene `anim:`/`tr:` override the look only when the user asks for something specific.

Style (`meta.style`): `slides` — one scene per cut; talking-point explainers, data stories. `desk` — every scene is a window card on one
canvas, camera whip-pans between them; product/website tours, invites, announcements. In `desk`, add `win: title` per card,
end with `recap: true` (zoom out, cards collapse) then `ticket` or `cta`. `layout: grid | column | zigzag` moves the camera in 2D instead of a straight line.
Transitions come from the look (slides style); desk style moves the camera instead.
Music: `upbeat` product intros/explainers · `chill` personal/storytelling · `cinematic` brand stories · `hiphop` creator tips · `drive` launches. Never two scenes of the same type in a row
unless it is a product series.

## Real footage + real voice (A-roll mode)

When the user has a recorded video with their own voice (talking head, screen recording, podcast clip), that video IS the
timeline — do not write `voice:` lines or invent a script.
1. Long pauses? `mg jumpcut talk.mp4` → `talk.cut.mp4` (drops silences > 0.45 s). Use the cut file from here on.
2. Transcript: best = `.srt` the user exports from CapCut/Premiere/YouTube; else `mg transcribe talk.mp4 --lang vi`
   (needs `pip install faster-whisper`; the model downloads once); else their script as `.txt` (aligned to pauses, approximate).
   Read the transcript text once — it is the script. Fix misheard names in the .srt, not in the spec.
3. `meta: { aroll: talk.cut.mp4, transcript: talk.srt, music: chill }` → the voice plays start to end, music ducks under it,
   captions come word-timed from the transcript, the video is exactly as long as the footage.
   Colour: `meta.grade: warm | cool | moody | bw | vivid` grades the aroll and every `clip` (a `clip` can set its own `grade:`);
   the user's own LUT works too: `grade: looks/film.cube`. Pick from the mood (warm = lifestyle/food, cool = tech, moody = story,
   bw = quote/flashback, vivid = product/travel); leave it off for screen recordings.
4. Scenes start at `at:` — a spoken phrase from the transcript (`at: "kho báu"`, preferred) or seconds. First scene starts at 0;
   a scene without `at` splits the gap evenly. Pattern from viral edits: `aroll` (face/screen, headline `num: 1`) → graphic
   scene with `pip: true` (footage stays as a round bubble) → back to `aroll` with `zoom: 1.15` (punch-in) → … → `cta`.
   More talking-head moves (one or two per video each):
   - `behind: "BIG WORD"` on an `aroll` scene: giant words sit BEHIND the speaker (matted ~10 frames/s, cached; first run
     ≈2–4 s per matte with the default light model). Keep it ≤3 words, on a scene of ≤4 s. `meta.cutout: person` = cleaner
     edges but ~25x slower — only if the user complains about the edges.
   - `half: true` on any graphic scene: speaker fills the bottom half (right half in 16:9), the scene the other half —
     b-roll / list / chart above, face below. Not with `pip`.
   - `follow: "@handle"` (Follow pill gets tapped) and `comment: "user|text"` (Instagram comment, heart fills) on any scene —
     a CTA moment or social proof. Use the user's real handle; never invent a comment and present it as real.
5. Point at things in the footage: `marks: ["circle x y w h", "arrow x1 y1 x2 y2", "underline x y w", "text x y words"]`
   (on `aroll` scenes: percent of the FOOTAGE, so the same marks land right in 9:16 and 16:9; lint warns if one is cropped out; draw on like a pen). Keep `text` marks above y 72 (captions live below).
   Footage moves, so add `freeze: true` to that `aroll` scene (picture holds, voice continues), then aim with
   `mg sheet <spec> --scenes N --grid` (10% grid over the frame) — never guess coordinates.
   Landscape footage but 9:16 output? `meta.reframe: face` keeps the speaker in frame (needs the optional add-on below).
6. Lint prints `🎬 aroll … cuts at …` — check the cut times land where the user says those words.

### Optional add-on: OpenMontage (only when the footage needs it)
`mg openmontage setup` once (clones OpenMontage, AGPL-3.0, into the cache — a separate program, not part of mograph).
Then `mg om <tool> --input_path f [-o out] [--key value]`: `reframe` (face-following 16:9→9:16), `enhance --preset clean_speech`
(noisy phone/laptop voice), `scenes` (shot cuts of a long video, to choose segments), `faces`, `grade`, `silence`, `transcribe`.
Do not set it up unless one of these is needed — it costs a download and a few tool calls.

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
- Voice: `tts: auto` (edge → piper → say/Windows → espeak; `edge` = Microsoft neural voices, online; default `vi-VN-HoaiMyNeural` (female, natural Vietnamese; says English names the Vietnamese way, so fix key names with `say:`); `voice: en-US-AndrewMultilingualNeural` (male) keeps English names in English) · scene `say: "Com-pô-zi-ô"` = what the engine reads when it mispronounces a word (captions keep `voice:`) · `voice: <voice name>` · `rate: 1.1` · `captions: false` · `capwords: 6`.
- `marquee: "TEXT ★ TEXT ★"` scrolling band. `mascot: path` (desk) hops between cards. `cursor: Name` tags the `check` cursor.
- Other types: `kinetic`, `sting`, `split`, `device`, `grid`, `timeline`, `bullets`, `term`, `bars`, `quote`, `profile`, `clock`, `pin`, `cta`, `raw` (custom HTML — last resort, tell the user). Fields: `mg catalog <type>`.

## Writing rules that decide quality

- Mixed-scale headlines: `"small lead / BIG WORDS"` (one slash with spaces) stacks a light small line over heavy big words — the most-used title treatment in short-form motion design. Use it for hooks and titles.
- `emoji: "🔥"` on any scene adds a 3D emoji sticker (Fluent 3D set, installed on first use); one or two per video.
- Long URLs and handles go in `sub` (hook, cta, sting take `sub`), not in the headline.
- Hook ≤ 8 words with one `*accent*`. Titles ≤ 6 words. Items ≤ 6 words; detail goes after `|`. Kicker ≤ 3 words.
- 3–4 items per scene; split rather than shrink. `fitNN%` under 80 in lint = too much text — cut words.
- Voice lines ≤ 2 short sentences per scene; captions are the narration, so write it the way it should read.
- Shorts 20–45s, 5–9 scenes; product tours up to 60s. Open with `hook`, end with `cta`/`ticket`.
- Show, don't list: prefer `image`, `split`, `device`, `flow`, `loop`, `compare`, `chat` over `bullets`. Open with `kinetic` or `hook`, mix at least 4 scene types.

## Token budget (keep a whole video inside a small plan)

One pass = this file once + spec (~300–700 tokens) + lint text + one sheet image (~1–3k). Footage and voice add no tokens: you never look at frames or hear audio. To stay there: no engine source,
no per-file image reads, no full-file rewrites, no re-viewing unchanged scenes, no rendered-frame reads, at most 2 full sheets per video; one `remix` image replaces trial-and-error renders when exploring styles.
