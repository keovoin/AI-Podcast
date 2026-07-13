/**
 * Audio composition module.
 * Concatenates per-turn audio clips into a final episode file.
 * 
 * On Vercel, this runs within the serverless function timeout.
 * For large episodes, consider offloading to an external worker or
 * using streaming concatenation.
 * 
 * Supports:
 * - Simple WAV concatenation (buffer-based, no FFmpeg needed)
 * - Silence insertion between turns (based on delivery.pause_after_ms)
 * - Actual timestamp calculation from real clip durations
 */

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

/**
 * Compose multiple audio clips into a single WAV file.
 * Inserts silence between clips based on pause_after_ms.
 * Returns the combined audio and actual timestamps.
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

  // Calculate total size including silence
  const SAMPLE_RATE = 22050;
  const BITS_PER_SAMPLE = 16;
  const NUM_CHANNELS = 1;
  const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
  const BYTES_PER_SECOND = SAMPLE_RATE * NUM_CHANNELS * BYTES_PER_SAMPLE;

  let totalDataSize = 0;
  const timestamps: TurnTimestamp[] = [];
  let currentMs = 0;

  for (const clip of sorted) {
    // Strip WAV header from clip (first 44 bytes)
    const dataSize = Math.max(0, clip.audio.length - 44);
    const silenceBytes = Math.round((clip.pauseAfterMs / 1000) * BYTES_PER_SECOND);

    timestamps.push({
      turnIndex: clip.turnIndex,
      speakerId: clip.speakerId,
      startMs: currentMs,
      endMs: currentMs + clip.durationMs,
      durationMs: clip.durationMs,
    });

    currentMs += clip.durationMs + clip.pauseAfterMs;
    totalDataSize += dataSize + silenceBytes;
  }

  // Build combined WAV
  const headerSize = 44;
  const fileSize = headerSize + totalDataSize;
  const buffer = Buffer.alloc(fileSize);

  // Write WAV header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(fileSize - 8, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Sub-chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(NUM_CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(BYTES_PER_SECOND, 28);
  buffer.writeUInt16LE(NUM_CHANNELS * BYTES_PER_SAMPLE, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(totalDataSize, 40);

  // Copy audio data (skip WAV headers from individual clips) + add silence
  let offset = headerSize;
  for (const clip of sorted) {
    const audioData = clip.audio.subarray(44); // Skip WAV header
    audioData.copy(buffer, offset);
    offset += audioData.length;

    // Add silence for pause
    const silenceBytes = Math.round((clip.pauseAfterMs / 1000) * BYTES_PER_SECOND);
    // Buffer is already zero-filled (silence)
    offset += silenceBytes;
  }

  return {
    audio: buffer,
    format: 'wav',
    totalDurationMs: currentMs,
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
  const crypto = require('crypto');
  const input = JSON.stringify({ providerId, voiceId, text, pace, emotion });
  return crypto.createHash('sha256').update(input).digest('hex');
}
