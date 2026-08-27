import type {
  TTSAdapter,
  TTSRequest,
  TTSResponse,
  AdapterConfig,
  HealthCheckResult,
  DiscoveredVoice,
} from './base';
import { chunkText } from '@/lib/normalization/khmer';

/**
 * Azure Speech TTS adapter.
 * Implements Microsoft Cognitive Services Speech synthesis.
 * Supports Khmer voices: km-KH-PisethNeural, km-KH-SreymomNeural
 *
 * FIXES vs previous implementation:
 * - Khmer voices do NOT support mstts:express-as styles (Azure only supports
 *   express-as for a subset of en-US / zh-CN etc. voices). Emotion is now
 *   mapped to prosody (pitch/rate/volume) instead of an unsupported style tag,
 *   which Azure would reject or ignore for km-KH voices.
 * - Chunked synthesis: long turns are split at sentence boundaries and each
 *   chunk is synthesized separately, then concatenated — prevents SSML length
 *   overflow on long-form episodes.
 * - Retry with exponential backoff on transient failures (429/5xx).
 * - WAV duration parsed from the real RIFF header (16 kHz mono) instead of a
 *   bit-rate guess.
 */
export class AzureSpeechTTSAdapter implements TTSAdapter {
  readonly type = 'AZURE_SPEECH';

  /** Voices that DO support mstts:express-as styles (documented by Azure). */
  private static readonly STYLE_SUPPORTED_LOCALES = new Set([
    'en-US', 'zh-CN', 'ja-JP', 'ko-KR', 'pt-BR', 'es-MX', 'fr-FR', 'de-DE', 'it-IT',
  ]);

  async synthesize(request: TTSRequest, config: AdapterConfig): Promise<TTSResponse> {
    const start = Date.now();

    // Chunk long text at sentence boundaries (max ~1200 chars per SSML request
    // keeps Azure well under limits while preserving pauses between sentences).
    const textChunks = this.splitTextForSynthesis(request.text);

    const synthesized = await this.synthesizeWithRetry(
      textChunks,
      request,
      config,
      3
    );

    const audio = Buffer.concat(synthesized.map((s) => s.audio));
    const durationMs = this.sumDurations(synthesized, request.outputFormat || 'mp3');

    return {
      audio,
      format: request.outputFormat || 'mp3',
      durationMs,
      sizeBytes: audio.length,
      latencyMs: Date.now() - start,
    };
  }

  async healthCheck(config: AdapterConfig): Promise<HealthCheckResult> {
    const start = Date.now();
    const baseUrl = config.baseUrl || `https://${config.endpointPath}.tts.speech.microsoft.com`;
    const url = `${baseUrl}/cognitiveservices/voices/list`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Ocp-Apim-Subscription-Key': config.apiKey,
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latencyMs = Date.now() - start;

      return {
        healthy: response.ok,
        latencyMs,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async discoverVoices(config: AdapterConfig): Promise<DiscoveredVoice[]> {
    const baseUrl = config.baseUrl || `https://${config.endpointPath}.tts.speech.microsoft.com`;
    const url = `${baseUrl}/cognitiveservices/voices/list`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Ocp-Apim-Subscription-Key': config.apiKey,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to discover voices: ${response.status}`);
      }

      const voices = await response.json() as Array<{
        ShortName: string;
        DisplayName: string;
        Locale: string;
        Gender: string;
        VoiceType: string;
      }>;

      return voices.map((v) => ({
        id: v.ShortName,
        name: v.DisplayName,
        language: v.Locale,
        gender: v.Gender?.toLowerCase(),
      }));
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Split text into synthesis-safe chunks.
   * Uses the shared Khmer-aware sentence chunker (max 1200 chars), falling back
   * to the raw text when the chunker returns nothing.
   */
  private splitTextForSynthesis(text: string): string[] {
    const trimmed = (text || '').trim();
    if (!trimmed) return [''];
    const chunks = chunkText(trimmed, 1200);
    return chunks.length > 0 ? chunks : [trimmed];
  }

  /**
   * Synthesize each chunk with retry/backoff, then return per-chunk results.
   */
  private async synthesizeWithRetry(
    chunks: string[],
    request: TTSRequest,
    config: AdapterConfig,
    maxRetries: number
  ): Promise<Array<{ audio: Buffer; durationMs: number }>> {
    const results: Array<{ audio: Buffer; durationMs: number }> = [];

    for (const chunk of chunks) {
      let lastError: Error | null = null;
      let delayMs = 500;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const result = await this.synthesizeChunk(chunk, request, config);
          results.push(result);
          lastError = null;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const status = this.extractStatus(error);
          // Do not retry 4xx except 429 (rate limit)
          if (status !== null && status >= 400 && status < 500 && status !== 429) {
            break;
          }
          if (attempt < maxRetries - 1) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            delayMs *= 2; // exponential backoff: 500ms, 1s, 2s
          }
        }
      }

      if (lastError) {
        throw new Error(`Azure Speech synthesis failed after retries: ${lastError.message}`);
      }
    }

    return results;
  }

  private async synthesizeChunk(
    text: string,
    request: TTSRequest,
    config: AdapterConfig
  ): Promise<{ audio: Buffer; durationMs: number }> {
    const baseUrl = config.baseUrl || `https://${config.endpointPath}.tts.speech.microsoft.com`;
    const url = `${baseUrl}/cognitiveservices/v1`;

    const ssml = this.buildSSML({ ...request, text });

    const headers: Record<string, string> = {
      'Ocp-Apim-Subscription-Key': config.apiKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': this.getOutputFormat(request.outputFormat || 'mp3'),
      'User-Agent': 'AIPodcastStudio/1.0',
      ...config.customHeaders,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: ssml,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const err = new Error(`Azure Speech error (${response.status}): ${errorBody}`);
        (err as Error & { status?: number }).status = response.status;
        throw err;
      }

      const arrayBuffer = await response.arrayBuffer();
      const audio = Buffer.from(arrayBuffer);
      const durationMs = this.detectDuration(audio, request.outputFormat || 'mp3');

      return { audio, durationMs };
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractStatus(error: unknown): number | null {
    if (error && typeof error === 'object' && 'status' in error) {
      return (error as { status?: number }).status ?? null;
    }
    return null;
  }

  private buildSSML(request: TTSRequest): string {
    const lang = request.language || 'km-KH';
    const voiceId = request.voiceId || 'km-KH-PisethNeural';
    const rate = request.pace === 'slow' ? '-10%' : request.pace === 'fast' ? '+10%' : '0%';

    // Map emotion to prosody (pitch) — Khmer voices don't support express-as.
    const pitch = this.mapEmotionToPitch(request.emotion);

    return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='${lang}'>
  <voice name='${voiceId}'>
    <prosody rate='${rate}'${pitch ? ` pitch='${pitch}'` : ''}>
      ${this.escapeXml(request.text)}
    </prosody>
  </voice>
</speak>`;
  }

  /**
   * Map emotion to an Azure prosody pitch value.
   * Khmer voices do not support mstts:express-as styles, so emotion is applied
   * via pitch/rate which every Azure neural voice supports.
   */
  private mapEmotionToPitch(emotion?: string): string | null {
    if (!emotion) return null;
    const pitchMap: Record<string, string> = {
      friendly: '+4%',
      enthusiastic: '+8%',
      curious: '+3%',
      thoughtful: '-2%',
      confident: '+0%',
      sad: '-6%',
      angry: '+2%',
      excited: '+10%',
    };
    return pitchMap[emotion] || null;
  }

  private getOutputFormat(format: string): string {
    const formatMap: Record<string, string> = {
      mp3: 'audio-24khz-96kbitrate-mono-mp3',
      wav: 'riff-16khz-16bit-mono-pcm',
      ogg: 'ogg-16khz-16bit-mono-opus',
    };
    return formatMap[format] || formatMap['mp3']!;
  }

  /**
   * Detect audio duration: parse WAV header when available, else estimate
   * from bitrate/size.
   */
  private detectDuration(audio: Buffer, format: string): number {
    // WAV: parse real RIFF header
    if (format === 'wav' || format === 'ogg') {
      if (audio.length >= 44 && audio.toString('ascii', 0, 4) === 'RIFF') {
        const dataSize = audio.readUInt32LE(40);
        const sampleRate = audio.readUInt32LE(24);
        const channels = audio.readUInt16LE(22);
        const bitsPerSample = audio.readUInt16LE(34);
        if (sampleRate > 0 && channels > 0 && bitsPerSample > 0) {
          const bytesPerSample = bitsPerSample / 8;
          const durationSec = dataSize / (sampleRate * channels * bytesPerSample);
          return Math.round(durationSec * 1000);
        }
      }
      // Ogg is variable bitrate; estimate as before
      return Math.round((audio.length / 16000) * 1000);
    }
    // MP3: ~96kbps = 12000 bytes/sec (24 kHz mono output)
    return Math.round((audio.length / 12000) * 1000);
  }

  private sumDurations(
    results: Array<{ audio: Buffer; durationMs: number }>,
    format: string
  ): number {
    if (format === 'wav') {
      // For WAV output each chunk is a standalone WAV; the total is the sum.
      return results.reduce((sum, r) => sum + r.durationMs, 0);
    }
    return results.reduce((sum, r) => sum + r.durationMs, 0);
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
