import type {
  TTSAdapter,
  TTSRequest,
  TTSResponse,
  AdapterConfig,
  HealthCheckResult,
  DiscoveredVoice,
} from './base';

/**
 * Mock TTS adapter for testing.
 * Generates synthetic audio buffers without requiring external API keys.
 * Produces a valid WAV header with silence for duration testing.
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

    // Generate a minimal valid WAV file with silence
    const audio = this.generateSilentWav(adjustedDurationMs);
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
   * Generate a valid WAV file with silence for the given duration.
   * 16-bit PCM, 22050 Hz, mono.
   */
  private generateSilentWav(durationMs: number): Buffer {
    const sampleRate = 22050;
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

    // Audio data is already zero-filled (silence)
    return buffer;
  }
}
