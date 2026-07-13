import type {
  TTSAdapter,
  TTSRequest,
  TTSResponse,
  AdapterConfig,
  HealthCheckResult,
  DiscoveredVoice,
} from './base';

/**
 * Azure Speech TTS adapter.
 * Implements Microsoft Cognitive Services Speech synthesis.
 * Supports Khmer voices: km-KH-PisethNeural, km-KH-SreymomNeural
 */
export class AzureSpeechTTSAdapter implements TTSAdapter {
  readonly type = 'AZURE_SPEECH';

  async synthesize(request: TTSRequest, config: AdapterConfig): Promise<TTSResponse> {
    const start = Date.now();

    // Azure Speech uses region-based endpoints
    const baseUrl = config.baseUrl || `https://${config.endpointPath}.tts.speech.microsoft.com`;
    const url = `${baseUrl}/cognitiveservices/v1`;

    // Build SSML
    const ssml = this.buildSSML(request);

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
        throw new Error(`Azure Speech error (${response.status}): ${errorBody}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audio = Buffer.from(arrayBuffer);
      const latencyMs = Date.now() - start;

      // Estimate duration from audio size (approximation for MP3)
      const durationMs = this.estimateDuration(audio, request.outputFormat || 'mp3');

      return {
        audio,
        format: request.outputFormat || 'mp3',
        durationMs,
        sizeBytes: audio.length,
        latencyMs,
      };
    } finally {
      clearTimeout(timeout);
    }
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

  private buildSSML(request: TTSRequest): string {
    const lang = request.language || 'km-KH';
    const voiceId = request.voiceId || 'km-KH-PisethNeural';
    const rate = request.pace === 'slow' ? '-10%' : request.pace === 'fast' ? '+10%' : '0%';

    // Map emotions to Azure prosody styles
    const style = this.mapEmotion(request.emotion);

    let expressAs = '';
    if (style) {
      expressAs = `<mstts:express-as style="${style}">`;
    }
    const expressAsClose = style ? '</mstts:express-as>' : '';

    return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='${lang}'>
  <voice name='${voiceId}'>
    ${expressAs}
    <prosody rate='${rate}'>
      ${this.escapeXml(request.text)}
    </prosody>
    ${expressAsClose}
  </voice>
</speak>`;
  }

  private mapEmotion(emotion?: string): string | null {
    if (!emotion) return null;
    const emotionMap: Record<string, string> = {
      friendly: 'friendly',
      enthusiastic: 'cheerful',
      curious: 'curious',
      thoughtful: 'calm',
      confident: 'confident',
      sad: 'sad',
      angry: 'angry',
      excited: 'excited',
    };
    return emotionMap[emotion] || null;
  }

  private getOutputFormat(format: string): string {
    const formatMap: Record<string, string> = {
      mp3: 'audio-16khz-128kbitrate-mono-mp3',
      wav: 'riff-16khz-16bit-mono-pcm',
      ogg: 'ogg-16khz-16bit-mono-opus',
    };
    return formatMap[format] || formatMap['mp3']!;
  }

  private estimateDuration(audio: Buffer, format: string): number {
    // Rough estimation based on file size and format bitrate
    if (format === 'mp3') {
      // ~128kbps = 16000 bytes/sec
      return Math.round((audio.length / 16000) * 1000);
    }
    if (format === 'wav') {
      // 16kHz, 16-bit, mono = 32000 bytes/sec
      return Math.round(((audio.length - 44) / 32000) * 1000);
    }
    // Default estimation
    return Math.round((audio.length / 16000) * 1000);
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
