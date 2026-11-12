# mograph

Skill + plugin cho Claude Code: dựng video motion graphic từ một file **spec YAML ngắn**. Agent chỉ viết nội dung;
engine lo layout, chuyển động, timing và xuất MP4 ngay trên máy editor.

```yaml
meta: {size: "9:16", theme: midnight, bg: grid}
scenes:
  - hook: "AI Agent *không phải* chatbot"
  - loop: [Suy nghĩ, Hành động, Quan sát]
    center: Agent
  - cta: Follow để học *AI Agent* mỗi ngày
```

## Quy trình 7 bước (agent tự làm theo SKILL.md)

1. Chốt kịch bản trong chat: hook → các ý → CTA. Số liệu phải có nguồn.
2. Chọn ảnh: `assets <thư mục>` liệt kê kích thước và gợi ý cách dùng từng file, chỉ bằng text.
3. Chọn motion: bảng "nội dung nào → loại scene nào" trong SKILL.md, cộng style `slides` hoặc `desk`.
4. Viết spec YAML.
5. Thêm nhạc: `music: upbeat | chill | drive` (nhạc gốc do engine tự tổng hợp, dùng tự do) hoặc `audio: file-của-bạn` (tự dò BPM).
   Điểm cắt cảnh và cú lia camera tự bám vào lưới beat.
6. `lint` (text) cho đến khi `OK`.
7. `sheet` (1 ảnh) để soát hình, rồi `render` ra MP4.

## Token: số đo thật

Một agent mới (Claude Sonnet, không có ngữ cảnh trước) được giao làm video 33 giây, 6 scene, có nhạc, từ 4 file ảnh — ngày 11/11/2026:

| Chỉ số | Giá trị |
|---|---|
| Lượt gọi model | 7 |
| Lần xem ảnh | 1 (contact sheet) |
| Context tăng thêm do quy trình (SKILL.md + spec + kết quả lệnh + 1 ảnh) | khoảng 10.300 token |
| Token output | 2.101 |
| Context nền của chính agent (system prompt + định nghĩa tool, không thuộc plugin) | 55.409 token |
| Thời gian | 97 giây |

Context nền phụ thuộc môi trường của từng người (số MCP/tool đang bật), không phụ thuộc plugin. Đây là một lần đo; kịch bản đã duyệt sẵn nên không có vòng sửa.

Cơ chế giữ mức này: agent không sinh code (engine ~40 KB không đi qua context), `lint` và `assets` chỉ trả text,
`sheet` gom mọi scene vào 1 ảnh, tài liệu chi tiết chỉ nạp khi gọi `catalog <type>`, thời lượng và khớp beat do engine tự tính.

## Cài đặt

Yêu cầu: Node 18+, Google Chrome, ffmpeg.

**Cách 1 — plugin (khuyến nghị).** Trong Claude Code, gõ hai lệnh:

```
/plugin marketplace add thecoolestmarperindawurl/mograph
/plugin install mograph@mograph
```

Hoặc từ terminal:

```bash
claude plugin marketplace add thecoolestmarperindawurl/mograph
```

```bash
claude plugin install mograph@mograph
```

Lần đầu làm video, agent sẽ tự chạy `npm install` trong thư mục skill (lệnh cài cụ thể được in ra nếu thiếu).

**Cách 2 — skill đơn lẻ**: chép thư mục `skills/motion-video` vào `~/.claude/skills/`, rồi cài dependency một lần:

```bash
npm install --prefix ~/.claude/skills/motion-video
```

## Dùng

Trong Claude Code, nói: *"làm video motion graphic 30 giây giải thích AI Agent là gì"*. Hoặc chạy tay:

```bash
node skills/motion-video/scripts/mograph.mjs lint examples/ai-agent-explainer.yaml
```

```bash
node skills/motion-video/scripts/mograph.mjs sheet examples/ai-agent-explainer.yaml
```

```bash
node skills/motion-video/scripts/mograph.mjs render examples/ai-agent-explainer.yaml
```

| Lệnh | Việc |
|---|---|
| `catalog [type]` | Danh sách scene type / field của một type |
| `lint <spec>` | Kiểm tra schema, đo chữ tràn khung, bảng timing |
| `sheet <spec> [--scenes 2,5-6] [--frames 3] [-o f.jpg]` | Contact sheet để QA hình ảnh |
| `render <spec> [--draft] [--scenes 1-3] [--size 16:9] [-o f.mp4]` | Xuất MP4 (`--draft`: nửa độ phân giải, 15fps) |
| `assets <dir> [--sheet]` | Liệt kê ảnh/nhạc kèm gợi ý cách dùng |
| `music --style upbeat --dur 40 -o a.wav` | Xuất riêng bản nhạc có sẵn |
| `beat <audio>` | Dò BPM file nhạc của bạn |

## Hai phong cách

- `style: slides` (mặc định): mỗi scene một cảnh, hợp video giải thích và shorts. Xem `examples/ai-agent-explainer.yaml`.
- `style: desk`: mỗi scene là một thẻ cửa sổ trên cùng một mặt bàn, camera lia và zoom giữa các thẻ (có nhoè chuyển động),
  mascot nhảy theo, con trỏ tự bấm checklist, kết bằng toàn cảnh rồi vé mời. Xem `examples/workshop-invite.yaml`.

## Scene types

`hook` · `bullets` · `flow` · `loop` · `compare` · `chat` · `term` · `stat` · `bars` · `quote` · `image` · `cta` ·
`profile` · `check` · `clock` · `pin` · `ticket` · `recap` · `raw`. Xem `examples/kitchen-sink.yaml`.

## Brand

```yaml
meta:
  theme: {base: midnight, ac: "#7c3aed", ac2: "#f97316", bg: "#120b1f", font: Montserrat}
```

Font phải được cài trên máy render. Theme có sẵn: `midnight`, `paper`, `terminal`, `sunset`, `meadow`, `lanhmar` (font Montserrat đi kèm trong `engine/fonts`, giấy phép SIL OFL).

`meta.marquee` thêm dải chữ chạy; `--size 16:9` xuất cùng một spec ở tỉ lệ khác.

## Cấu trúc

```
.claude-plugin/            manifest plugin + marketplace
skills/motion-video/
  SKILL.md                 quy trình + cheatsheet cho agent
  scripts/mograph.mjs      CLI
  scripts/schema.mjs       schema (dùng chung cho lint và catalog)
  engine/                  engine.js + style.css — mỗi frame là hàm thuần của thời gian
examples/
```

Thêm scene type mới: một builder trong `engine/engine.js`, CSS trong `style.css`, một dòng trong `scripts/schema.mjs`.

## Giới hạn hiện tại

- Chưa có TTS và phụ đề khớp từng từ.
- Nhạc có sẵn là nhạc tổng hợp đơn giản (3 kiểu). Dò BPM cho file ngoài có thể nhầm nhịp đôi/nửa; sửa bằng `meta.bpm`.
- `slides` chỉ có một kiểu chuyển cảnh (fade + trượt); `desk` chỉ lia ngang.
- Chưa chèn được video footage, chỉ ảnh tĩnh.
