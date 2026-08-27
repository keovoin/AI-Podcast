/**
 * Audio composition module.
 * Concatenates per-turn audio clips into a final episode file.
 *
 * KEY FIXES vs the previous implementation:
 * - Real WAV parsing: reads the RIFF/fmt/data chunks to get the ACTUAL sample
 *   rate, channel count, bit depth and data size of every clip instead of
 *   blindly stripping the first 44 bytes (WAV headers are not always 44 bytes).
 * - Sample-rate normalization: every clip is resampled to 16 kHz mono so that
 *   Azure (16 kHz) and Mock TTS (16 kHz after fix) clips play at the correct
 *   speed. The old composer hardcoded 22050 Hz which made 16 kHz clips play
 *   ~1.38x fast.
 * - Correct timestamps: durations are computed from real sample counts, not
 *   bit-rate guesses.
 *
 * On Vercel this runs inside the serverless function; for very long episodes
 * consider the external worker (workers/index.ts) as the execution path.
 */

import { createHash } from 'crypto';

export const TARGET_SAMPLE_RATE = 16000;
export const TARGET_CHANNELS = 1;
export const TARGET_BITS_PER_SAMPLE = 16;
const TARGET_BYTES_PER_SAMPLE = TARGET_BITS_PER_SAMPLE / 8;
const TARGET_BYTES_PER_SECOND = TARGET_SAMPLE_RATE * TARGET_CHANNELS * TARGET_BYTES_PER_SAMPLE;

export interface AudioClipInput {
  turnIndex: number;
  speakerId: string;
  audio: Buffer;
  durationMs: number;
  pauseAfterMs: number;
}

export interface ComposedAudio {
  audio: Buffer;
  format: string;
  totalDurationMs: number;
  timestamps: TurnTimestamp[];
}

export interface TurnTimestamp {
  turnIndex: number;
  speakerId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
}

export interface ParsedWav {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataSize: number;
  dataOffset: number;
  durationMs: number;
}

/**
 * Parse a WAV file's RIFF header and locate the PCM data chunk.
 * Returns null if the buffer is not a valid RIFF/WAVE file.
 */
export function parseWavHeader(buffer: Buffer): ParsedWav | null {
  if (buffer.length < 44) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buffer.toString('ascii', 8, 12) !== 'WAVE') return null;

  // Walk chunks to find 'fmt ' and 'data' (headers are not always 44 bytes)
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataSize = 0;
  let dataOffset = -1;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === 'fmt ') {
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (chunkId === 'data') {
      dataSize = Math.min(chunkSize, buffer.length - (offset + 8));
      dataOffset = offset + 8;
      break;
    }

    // Chunks are word-aligned (even size)
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0 || sampleRate === 0 || channels === 0 || bitsPerSample === 0) {
    return null;
  }

  const bytesPerSample = bitsPerSample / 8;
  const samplesPerChannel = Math.floor(dataSize / (channels * bytesPerSample));
  const durationMs = Math.round((samplesPerChannel / sampleRate) * 1000);

  return {
    sampleRate,
    channels,
    bitsPerSample,
    dataSize,
    dataOffset,
    durationMs,
  };
}

/**
 * Extract mono PCM16 samples from a WAV buffer (resampling to 16 kHz mono if needed).
 * Returns a Float32Array of normalized samples in [-1, 1].
 */
function extractPcmSamples(wav: Buffer, parsed: ParsedWav): Float32Array {
  const { channels, bitsPerSample, sampleRate, dataSize, dataOffset } = parsed;
  const bytesPerSample = Math.max(1, bitsPerSample / 8);

  // Read raw samples (int16 or int8; ignore float32 WAVs by treating as unsupported)
  const rawSamples = new Float32Array(Math.floor(dataSize / (channels * bytesPerSample)));

  if (bitsPerSample === 16) {
    for (let i = 0; i < rawSamples.length; i++) {
      const byteOffset = dataOffset + i * channels * 2;
      rawSamples[i] = wav.readInt16LE(byteOffset) / 32768;
    }
  } else if (bitsPerSample === 8) {
    for (let i = 0; i < rawSamples.length; i++) {
      const byteOffset = dataOffset + i * channels;
      rawSamples[i] = (wav[byteOffset]! - 128) / 128;
    }
  } else {
    throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}`);
  }

  // Downmix to mono by averaging channels
  let mono: Float32Array;
  if (channels === 1) {
    mono = rawSamples;
  } else {
    mono = new Float32Array(rawSamples.length / channels);
    for (let i = 0; i < mono.length; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) {
        sum += rawSamples[i * channels + c]!;
      }
      mono[i] = sum / channels;
    }
  }

  // Resample to 16 kHz if needed (linear interpolation)
  if (sampleRate === TARGET_SAMPLE_RATE) {
    return mono;
  }
  if (sampleRate <= 0) {
    return mono;
  }

  const ratio = sampleRate / TARGET_SAMPLE_RATE;
  const outLength = Math.max(1, Math.floor(mono.length / ratio));
  const out = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s0 = mono[idx] ?? 0;
    const s1 = mono[Math.min(idx + 1, mono.length - 1)] ?? 0;
    out[i] = s0 + (s1 - s0) * frac;
  }

  return out;
}

/**
 * Convert a Float32Array of samples into a 16 kHz mono 16-bit PCM WAV buffer.
 */
function samplesToWav(samples: Float32Array): Buffer {
  const dataSize = samples.length * 2;
  const fileSize = 44 + dataSize;
  const buffer = Buffer.alloc(fileSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(fileSize - 8, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Sub-chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(TARGET_CHANNELS, 22);
  buffer.writeUInt32LE(TARGET_SAMPLE_RATE, 24);
  buffer.writeUInt32LE(TARGET_BYTES_PER_SECOND, 28);
  buffer.writeUInt16LE(TARGET_CHANNELS * TARGET_BYTES_PER_SAMPLE, 32);
  buffer.writeUInt16LE(TARGET_BITS_PER_SAMPLE, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  return buffer;
}

/**
 * Normalize a single audio clip to 16 kHz mono WAV.
 * - WAV input: fully parsed + resampled.
 * - Non-WAV input (e.g. MP3): returned unchanged; duration falls back to the
 *   caller-provided durationMs. Callers should request outputFormat 'wav' so
 *   this path is only a safety net.
 */
export function normalizeClipToWav(
  clip: Pick<AudioClipInput, 'audio' | 'durationMs'>
): { buffer: Buffer; durationMs: number; wasResampled: boolean } {
  const parsed = parseWavHeader(clip.audio);

  if (parsed) {
    const samples = extractPcmSamples(clip.audio, parsed);
    const resampled = samplesToWav(samples);
    const durationMs = Math.round((samples.length / TARGET_SAMPLE_RATE) * 1000);
    const wasResampled = parsed.sampleRate !== TARGET_SAMPLE_RATE || parsed.channels !== TARGET_CHANNELS || parsed.bitsPerSample !== TARGET_BITS_PER_SAMPLE;
    return { buffer: resampled, durationMs, wasResampled };
  }

  // Non-WAV fallback: pass through as-is
  return { buffer: clip.audio, durationMs: clip.durationMs, wasResampled: false };
}

/**
 * Compose multiple audio clips into a single 16 kHz mono WAV file.
 * Inserts silence between clips based on pause_after_ms.
 * Returns the combined audio and ACTUAL timestamps computed from real samples.
 */
export function composeAudioClips(clips: AudioClipInput[]): ComposedAudio {
  if (clips.length === 0) {
    return {
      audio: Buffer.alloc(0),
      format: 'wav',
      totalDurationMs: 0,
      timestamps: [],
    };
  }

  // Sort by turn index
  const sorted = [...clips].sort((a, b) => a.turnIndex - b.turnIndex);

  // Normalize every clip to 16 kHz mono WAV
  const normalizedClips = sorted.map((clip) => {
    const normalized = normalizeClipToWav(clip);
    return { ...clip, audio: normalized.buffer, durationMs: normalized.durationMs };
  });

  // Build the final sample buffer: audio + silence per clip
  const totalSamples = normalizedClips.reduce((sum, clip) => {
    const samples = Math.round((clip.durationMs / 1000) * TARGET_SAMPLE_RATE);
    const silenceSamples = Math.round((clip.pauseAfterMs / 1000) * TARGET_SAMPLE_RATE);
    return sum + samples + silenceSamples;
  }, 0);

  const combined = new Float32Array(totalSamples);
  const timestamps: TurnTimestamp[] = [];
  let currentMs = 0;
  let writeOffset = 0;

  for (const clip of normalizedClips) {
    const parsed = parseWavHeader(clip.audio);
    let clipSamples: Float32Array;

    if (parsed) {
      clipSamples = extractPcmSamples(clip.audio, parsed);
    } else {
      // Non-WAV fallback: fill silence for the estimated duration
      clipSamples = new Float32Array(Math.round((clip.durationMs / 1000) * TARGET_SAMPLE_RATE));
    }

    const clipDurationMs = Math.round((clipSamples.length / TARGET_SAMPLE_RATE) * 1000);

    timestamps.push({
      turnIndex: clip.turnIndex,
      speakerId: clip.speakerId,
      startMs: currentMs,
      endMs: currentMs + clipDurationMs,
      durationMs: clipDurationMs,
    });

    combined.set(clipSamples, writeOffset);
    writeOffset += clipSamples.length;

    currentMs += clipDurationMs + clip.pauseAfterMs;

    // Silence samples are already zero-filled in the Float32Array
    writeOffset += Math.round((clip.pauseAfterMs / 1000) * TARGET_SAMPLE_RATE);
  }

  const wav = samplesToWav(combined);

  return {
    audio: wav,
    format: 'wav',
    totalDurationMs: Math.round((combined.length / TARGET_SAMPLE_RATE) * 1000),
    timestamps,
  };
}

/**
 * Generate a hash for clip caching.
 * Clips are cached by provider + model + voice + text + settings.
 */
export function generateClipCacheKey(
  providerId: string,
  voiceId: string,
  text: string,
  pace?: string,
  emotion?: string
): string {
  const input = JSON.stringify({ providerId, voiceId, text, pace, emotion });
  return createHash('sha256').update(input).digest('hex');
}
