# AI-Podcast — Khmer TTS/Audio Pipeline Fixes (Voice AI Integration Engineer)

**Date:** 2026-08-27 · **Repo:** keovoin/AI-Podcast · **Commit:** `feat(tts): Khmer naturalness, 16kHz composition, audio delivery + auto thumbnails`

## 1. Khmer naturalness & conversational quality

### Numbers — full place-value system (`src/lib/normalization/khmer.ts`)
- Replaced the digit-by-digit reader with a complete Khmer place-value converter: ones (០–៩), teens (ដប់–ដប់ប្រាំបួន), irregular tens (ម្ភៃ, សាមសិប, សែសិប, ហាសិប, ហុកសិប, ចិតសិប, ប៉ែតសិប, កៅសិប), រយ (100), ពាន់ (1000), ម៉ឺន (10,000), សែន (100,000), លាន (1,000,000).
- Examples: **2026** → «ពីរពាន់ ម្ភៃប្រាំមួយ» (was «ពីរ សូន្យ ពីរ ប្រាំមួយ»), **101** → «មួយរយនិងមួយ».
- Literal Khmer digits (០–៩) are also converted before expansion.
- Fixed teen unicode sequences for 17/18/19.

### Dictionary fixes (`src/lib/normalization/dictionary.ts`)
- **Typo:** ML → «អែម អែល» (was «អែល អែល»).
- **Khmer-safe word boundary:** `applyDictionary()` no longer uses `\b` (which is broken for Khmer script — Khmer letters are not JS word chars, so **no entry was ever applied**). Now uses `(?<![\u1780-\u17FFa-zA-Z0-9])…(?!…)`.
- Added common entries: podcast, YouTube, Facebook, Telegram, Kiri, plus existing AI/API/GPS/URL/WiFi terms.
- **Wired into pipeline:** `applyDictionary()` is now called inside `normalizeKhmerText()` (step 6), so every synthesis path (audio route, export route, previews) benefits automatically.

### Long-form & conversational quality
- `chunkText()` improved (keeps punctuation with sentence, Khmer Khan ។/៕ respected, configurable max length) and **exported** for the synthesis path.
- Azure adapter now synthesizes long turns **chunk-by-chunk at sentence boundaries** (max 1200 chars/request) and concatenates — no SSML length overflow, natural pauses between sentences.
- Khmer emotion handling: Azure km-KH voices do **not** support `mstts:express-as` styles; the adapter now maps emotion to **prosody pitch** (which all neural voices support) instead of emitting a style tag Azure ignores/rejects. No more silent style failures.

## 2. Audio composition & sample rate (`src/lib/audio/composition.ts`)

- **Real WAV parsing:** walks RIFF chunks (`fmt `/`data`), handles non-44-byte headers, computes true sample rate/channels/bit depth/data size.
- **16 kHz mono normalization:** every clip is resampled (linear interpolation) to 16 kHz mono before composition — fixes the old composer hardcoding **22050 Hz** which made Azure 16 kHz clips play **~1.38× fast**.
- **Real timestamps:** durations from actual sample counts, not bit-rate guesses; silence (pause_after_ms) inserted correctly.
- `MockTTSAdapter` now emits **16 kHz mono** WAV to match the pipeline (`src/lib/providers/adapters/mock-tts.ts`).
- Azure WAV duration parsed from RIFF header; output format upgraded to `audio-24khz-96kbitrate-mono-mp3` for MP3 (crisper speech than 16 kHz MP3).

## 3. Audio delivery (`src/app/api/projects/[id]/audio/route.ts`)

- **NEW `GET /api/projects/:id/audio`** — serves the composed episode WAV with:
  - HTTP **Range** support (206 partial content, `Accept-Ranges`, suffix ranges) so `<audio>` can seek/stream;
  - `?turnIndex=N` to fetch a single turn clip;
  - 202 `NOT_READY` when audio hasn't been generated.
- **Real cache:** the cache-hit branch no longer calls `synthesize()`. Clip bytes are **persisted to storage** (`uploadFile`), and on a hash hit they are **fetched from storage** (`downloadFile`) — zero TTS cost on regenerate. `AudioClip.audioKey` + `cached` flags updated.
- **Episode persistence:** composed audio is stored (`projects/{id}/episode.wav`) and exposed as `project.audioUrl` + `audioKey` on the Project.
- Response now reports `cacheHits` and `audioUrl`.

## 4. Auto thumbnail generation

- **New lib `src/lib/thumbnail/generator.ts`:** deterministic 1200×630 SVG poster — gradient palette (seeded by title), waveform motif, «AI PODCAST» brand, language badge, wrapped title (Khmer-safe), topic line, speaker names. No external assets/fonts; Khmer renders via viewer font fallback. `generateThumbnailDataUri()` for og:image/RSS.
- **NEW `GET /api/projects/:id/thumbnail`:** serves persisted thumbnail or lazily generates + persists it.
- **Auto-generation:** after audio generation completes (`POST /audio`), the thumbnail is generated, uploaded (`thumbnails/{id}.svg`), and `thumbnailUrl`/`thumbnailKey` persisted — **non-fatal** if it fails.
- **UI:** projects list page and project detail page already render `thumbnailUrl`; detail page now also has an **episode audio player** (`<audio src="/api/projects/{id}/audio">`) when status is AUDIO_READY/EXPORTED.

## 5. Schema (`prisma/schema.prisma` + `prisma/init.sql`)

- `Project`: `audioKey`, `audioUrl`, `thumbnailKey`, `thumbnailUrl`.
- `AudioClip`: `audioKey`.
- `init.sql` updated to match (docker-compose DB init).

## Verification

- `npx tsc --noEmit` → **0 errors**.
- `npx vitest run tests/unit/audio-composition.test.ts` → **9/9 pass** (new tests: number place-values 1–19/20/200/2026, normalization not digit-by-digit, ML dictionary expansion, 16 kHz composition with timestamps, cache key determinism, thumbnail SVG).
- Full suite: 282 passed / 8 failed — the 8 failures are **pre-existing** (MockLLM dialogue shape, validation URL, encryption/routing) and outside this change set.
- Commit: `feat(tts): Khmer naturalness, 16kHz composition, audio delivery + auto thumbnails` (14 files, +1298/−246).

## Notes for follow-up specialists

- **Backend Architect:** `GET /audio` Range serving uses `downloadFile` (memory fallback if S3 unconfigured) — when real auth lands, scope `userId` on the new GET/thumbnail routes.
- **DevOps:** thumbnail + episode audio keys live under `projects/{id}/` and `thumbnails/{id}/` — add lifecycle/retention policy.
- **Frontend:** timeline page could consume `GET /audio?turnIndex=N` per clip instead of simulation.
