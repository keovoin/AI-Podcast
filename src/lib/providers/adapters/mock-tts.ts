import type {
  TTSAdapter,
  TTSRequest,
  TTSResponse,
  AdapterConfig,
  HealthCheckResult,
  DiscoveredVoice,
} from './base';

/**
 * Mock TTS adapter for testing and development.
 * Generates synthetic audio buffers with actual tone content (not just silence).
 * Produces valid WAV files with audible sine wave tones for duration testing.
 */
export class MockTTSAdapter implements TTSAdapter {
  readonly type = 'MOCK';

  private latencyMs: number;
  private shouldFail: boolean;

  constructor(options?: { latencyMs?: number; shouldFail?: boolean }) {
    this.latencyMs = options?.latencyMs ?? 50;
    this.shouldFail = options?.shouldFail ?? false;
  }

  async synthesize(request: TTSRequest, _config: AdapterConfig): Promise<TTSResponse> {
    const start = Date.now();

    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs));

    if (this.shouldFail) {
      throw new Error('Mock TTS: Simulated failure');
    }

    // Estimate duration based on text length (~150 words/min, ~5 chars/word)
    const wordsPerMinute = 150;
    const avgCharsPerWord = 5;
    const wordCount = request.text.length / avgCharsPerWord;
    const durationSeconds = (wordCount / wordsPerMinute) * 60;
    const durationMs = Math.round(durationSeconds * 1000);

    // Apply pace modifier
    const paceMultiplier = request.pace === 'slow' ? 1.3 : request.pace === 'fast' ? 0.8 : 1.0;
    const adjustedDurationMs = Math.round(durationMs * paceMultiplier);

    // Generate a WAV file with actual audio tone content (not just silence)
    const audio = this.generateToneWav(adjustedDurationMs, request.emotion || 'neutral');
    const latency = Date.now() - start;

    return {
      audio,
      format: request.outputFormat || 'wav',
      durationMs: adjustedDurationMs,
      sizeBytes: audio.length,
      latencyMs: latency,
    };
  }

  async healthCheck(_config: AdapterConfig): Promise<HealthCheckResult> {
    const start = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 10));

    if (this.shouldFail) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: 'Mock TTS: Health check failed (simulated)',
      };
    }

    return {
      healthy: true,
      latencyMs: Date.now() - start,
      metadata: { provider: 'mock-tts', version: '1.0.0', voices: 4 },
    };
  }

  async discoverVoices(_config: AdapterConfig): Promise<DiscoveredVoice[]> {
    return [
      {
        id: 'mock-km-male-1',
        name: 'Piseth (Mock Khmer Male)',
        language: 'km-KH',
        gender: 'male',
      },
      {
        id: 'mock-km-female-1',
        name: 'Sreymom (Mock Khmer Female)',
        language: 'km-KH',
        gender: 'female',
      },
      {
        id: 'mock-en-male-1',
        name: 'James (Mock English Male)',
        language: 'en-US',
        gender: 'male',
      },
      {
        id: 'mock-en-female-1',
        name: 'Sarah (Mock English Female)',
        language: 'en-US',
        gender: 'female',
      },
    ];
  }

  /**
   * Generate a WAV file with actual audio tone content (sine wave).
   * 16-bit PCM, 16000 Hz, mono — matches the pipeline target sample rate
   * (Azure TTS outputs 16 kHz; the composer resamples everything to 16 kHz).
   */
  private generateToneWav(durationMs: number, emotion?: string): Buffer {
    const sampleRate = 16000;
    const bitsPerSample = 16;
    const numChannels = 1;
    const bytesPerSample = bitsPerSample / 8;
    const numSamples = Math.round((sampleRate * durationMs) / 1000);
    const dataSize = numSamples * numChannels * bytesPerSample;
    const fileSize = 44 + dataSize; // WAV header is 44 bytes

    const buffer = Buffer.alloc(fileSize);

    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(fileSize - 8, 4);
    buffer.write('WAVE', 8);

    // fmt sub-chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Sub-chunk size
    buffer.writeUInt16LE(1, 20); // PCM format
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28); // Byte rate
    buffer.writeUInt16LE(numChannels * bytesPerSample, 32); // Block align
    buffer.writeUInt16LE(bitsPerSample, 34);

    // data sub-chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Generate sine wave tone with frequency based on emotion
    // This creates audible content for testing
    let frequency = 440; // Default A4 note (neutral)
    switch (emotion?.toLowerCase()) {
      case 'friendly':
      case 'enthusiastic':
      case 'happy':
        frequency = 523; // C5 - higher, brighter
        break;
      case 'sad':
      case 'concerned':
        frequency = 330; // E4 - lower, darker
        break;
      case 'confident':
        frequency = 440; // A4 - standard
        break;
      case 'curious':
        frequency = 494; // B4 - medium-high
        break;
      case 'thoughtful':
        frequency = 392; // G4 - medium
        break;
      case 'interested':
        frequency = 466; // A#4 - slightly above neutral
        break;
      default:
        frequency = 440; // A4 neutral
    }

    // Generate audio samples (sine wave)
    let bufferIndex = 44; // Start after WAV header
    const amplitude = 20000; // Volume level (16-bit range is -32768 to 32767)

    for (let i = 0; i < numSamples; i++) {
      // Calculate sine wave value
      const angle = (2 * Math.PI * frequency * i) / sampleRate;
      const sample = Math.sin(angle) * amplitude;

      // Fade in/out to reduce clicks
      let envelope = 1.0;
      const fadeDuration = Math.min(500, durationMs / 10); // 500ms or 10% fade
      const fadeSamples = Math.round((fadeDuration / 1000) * sampleRate);

      if (i < fadeSamples) {
        // Fade in
        envelope = i / fadeSamples;
      } else if (i > numSamples - fadeSamples) {
        // Fade out
        envelope = (numSamples - i) / fadeSamples;
      }

      const finalSample = Math.round(sample * envelope);

      // Write 16-bit signed integer (little-endian)
      buffer.writeInt16LE(finalSample, bufferIndex);
      bufferIndex += 2;
    }

    return buffer;
  }
}
