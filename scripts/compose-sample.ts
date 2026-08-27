/**
 * Sample Khmer podcast composer — builds the episode from real per-turn audio
 * using the repo's OWN pipeline modules:
 *   - src/lib/normalization (Khmer normalization + number-to-words)
 *   - src/lib/audio/composition (16 kHz mono compose + per-turn timestamps)
 *   - src/lib/thumbnail (auto thumbnail SVG generator)
 *
 * Input: sample-output/tmp/turn_XX.wav (real km-KH TTS clips, 16 kHz mono)
 * Output: sample-output/sample-khmer-episode.wav + thumbnails + script + timestamps
 *
 * Build & run:
 *   npx esbuild scripts/compose-sample.ts --bundle --platform=node --target=node20 \
 *     --outfile=sample-output/compose-sample.cjs --external:@prisma/client --external:prisma
 *   node sample-output/compose-sample.cjs
 */
import fs from 'fs';
import path from 'path';
import { normalizeKhmerText } from '../src/lib/normalization';
import { composeAudioClips } from '../src/lib/audio/composition';
import type { AudioClipInput } from '../src/lib/audio/composition';
import { generateThumbnailSvgBuffer } from '../src/lib/thumbnail';

const REPO = path.join(__dirname, '..');
const OUT_DIR = path.join(REPO, 'sample-output');

const TURNS = [
  { speaker: 'ពិសិដ្ឋ', speakerId: 'speaker-host', text: 'សួស្តីអ្នកទាំងអស់គ្នា! សូមស្វាគមន៍មកកាន់ផតខាសរបស់យើង។ ថ្ងៃនេះយើងនឹងនិយាយអំពីបញ្ញាសិប្បនិម្មិតនៅកម្ពុជា។' },
  { speaker: 'ស្រីមុំ', speakerId: 'speaker-guest', text: 'អរគុណពិសិដ្ឋដែលបានអញ្ជើញខ្ញុំ។ នេះជាប្រធានបទដែលគួរឱ្យចាប់អារម្មណ៍ខ្លាំងណាស់សម្រាប់យុវជនកម្ពុជា។' },
  { speaker: 'ពិសិដ្ឋ', speakerId: 'speaker-host', text: 'តើស្រីមុំយល់ថាបញ្ញាសិប្បនិម្មិតកំពុងផ្លាស់ប្តូរវិស័យអ្វីខ្លះនៅកម្ពុជា?' },
  { speaker: 'ស្រីមុំ', speakerId: 'speaker-guest', text: 'ជាក់ស្តែង វិស័យអប់រំ និងវិស័យសុខាភិបាលកំពុងទទួលផលច្រើន។ ឧទាហរណ៍ កម្មវិធីរៀនភាសាដែលប្រើ AI អាចជួយសិស្សនៅតាមជនបទបានយ៉ាងល្អ។' },
  { speaker: 'ពិសិដ្ឋ', speakerId: 'speaker-host', text: 'ពិតមែន! ហើយតើមានបញ្ហាប្រឈមអ្វីខ្លះសម្រាប់ការអនុវត្តនេះ?' },
  { speaker: 'ស្រីមុំ', speakerId: 'speaker-guest', text: 'បញ្ហាធំបំផុតគឺហេដ្ឋារចនាសម្ព័ន្ធឌីជីថល និងការអប់រំប្រជាជនឱ្យយល់ដឹងពីការប្រើប្រាស់ប្រកបដោយសុវត្ថិភាព។' },
  { speaker: 'ពិសិដ្ឋ', speakerId: 'speaker-host', text: 'ខ្ញុំជឿថាអនាគតរបស់កម្ពុជាក្នុងវិស័យបច្ចេកវិទ្យានឹងភ្លឺស្វាង បើយើងទាំងអស់គ្នាចូលរួមសហការ។ អរគុណស្រីមុំសម្រាប់ការចែករំលែកដ៏មានតម្លៃ!' },
];

async function main() {
  fs.mkdirSync(path.join(OUT_DIR, 'tmp'), { recursive: true });

  // 1) Normalize every turn with the repo's Khmer normalization pipeline
  const normalizedTurns = TURNS.map((t) => {
    const n = normalizeKhmerText(t.text, 'km');
    return { ...t, normalized: n.normalized, warnings: n.warnings ?? [] };
  });

  // 2) Read the real 16 kHz mono WAV clips
  const clips: AudioClipInput[] = [];
  for (let i = 0; i < normalizedTurns.length; i++) {
    const wavPath = path.join(OUT_DIR, 'tmp', `turn_${String(i + 1).padStart(2, '0')}.wav`);
    if (!fs.existsSync(wavPath)) {
      throw new Error(`Missing clip: ${wavPath}`);
    }
    const audio = fs.readFileSync(wavPath);
    // Duration from the WAV header via the repo's parser
    const { parseWavHeader } = await import('../src/lib/audio/composition');
    const parsed = parseWavHeader(audio);
    const durationMs = parsed?.durationMs ?? 0;
    clips.push({
      turnIndex: i,
      speakerId: normalizedTurns[i]!.speakerId,
      audio,
      durationMs,
      pauseAfterMs: i < normalizedTurns.length - 1 ? 500 : 250,
    });
  }

  // 3) Compose into the final episode (16 kHz mono WAV with timestamps)
  const composed = composeAudioClips(clips);

  const episodeWav = path.join(OUT_DIR, 'sample-khmer-episode.wav');
  fs.writeFileSync(episodeWav, composed.audio);

  // 4) Auto thumbnail via the repo's generator
  const svg = generateThumbnailSvgBuffer({
    title: 'បញ្ញាសិប្បនិម្មិតនៅកម្ពុជា',
    topic: 'AI និងបច្ចេកវិទ្យានៅកម្ពុជា',
    language: 'km',
    speakerNames: ['ពិសិដ្ឋ', 'ស្រីមុំ'],
    status: 'AUDIO_READY',
  });
  const thumbPath = path.join(OUT_DIR, 'sample-khmer-thumbnail.svg');
  fs.writeFileSync(thumbPath, svg);

  // 5) Script + timestamps JSON
  const scriptPath = path.join(OUT_DIR, 'sample-khmer-script.json');
  fs.writeFileSync(
    scriptPath,
    JSON.stringify(
      {
        title: 'បញ្ញាសិប្បនិម្មិតនៅកម្ពុជា',
        language: 'km',
        generator: 'repo pipeline (normalization + composition + thumbnail) + real km-KH TTS clips',
        turns: normalizedTurns.map((t, i) => ({
          index: i,
          speaker: t.speaker,
          speakerId: t.speakerId,
          text: t.text,
          normalized: t.normalized,
          estimatedSeconds: Math.round((t.text.length / 12) * 10) / 10,
          warnings: t.warnings,
        })),
      },
      null,
      2
    )
  );

  const tsPath = path.join(OUT_DIR, 'sample-khmer-timestamps.json');
  fs.writeFileSync(
    tsPath,
    JSON.stringify(
      {
        totalDurationMs: composed.totalDurationMs,
        timestamps: composed.timestamps.map((t) => ({
          turnIndex: t.turnIndex,
          speaker: normalizedTurns[t.turnIndex]?.speaker,
          startMs: t.startMs,
          endMs: t.endMs,
          durationMs: t.durationMs,
          text: normalizedTurns[t.turnIndex]?.text,
        })),
      },
      null,
      2
    )
  );

  console.log(`Episode:      ${episodeWav}  (${(composed.audio.length / 1024 / 1024).toFixed(2)} MB, ${(composed.totalDurationMs / 1000).toFixed(1)} s)`);
  console.log(`Thumbnail:    ${thumbPath}`);
  console.log(`Script:       ${scriptPath}`);
  console.log(`Timestamps:   ${tsPath}`);
  console.log(`Turns:        ${clips.length}`);
  console.log('Sample complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
