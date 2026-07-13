import type {
  TTSAdapter,
  TTSRequest,
  TTSResponse,
  AdapterConfig,
  HealthCheckResult,
  DiscoveredVoice,
} from './base';

/**
 * Custom REST TTS adapter.
 * Supports any REST API for speech synthesis with configurable
 * request templates and response handling (binary, base64 JSON, or URL).
 */
export class CustomRestTTSAdapter implements TTSAdapter {
  readonly type = 'CUSTOM_REST';

  async synthesize(request: TTSRequest, config: AdapterConfig): Promise<TTSResponse> {
    const start = Date.now();
    const url = `${config.baseUrl}${config.endpointPath || ''}`;

    const body = this.buildRequestBody(request, config);
    const headers = this.buildHeaders(config);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Custom TTS API error (${response.status}): ${errorBody}`);
      }

      let audio: Buffer;
      const audioResponseType = config.audioResponseType || 'BINARY';

      switch (audioResponseType) {
        case 'BINARY': {
          const arrayBuffer = await response.arrayBuffer();
          audio = Buffer.from(arrayBuffer);
          break;
        }
        case 'BASE64_JSON': {
          const data = await response.json();
          const base64 = this.extractValue(data, config.responseJsonPath || 'audio');
          if (typeof base64 !== 'string') {
            throw new Error('Expected base64 audio string in response');
          }
          audio = Buffer.from(base64, 'base64');
          break;
        }
        case 'DOWNLOAD_URL': {
          const data = await response.json();
          const downloadUrl = this.extractValue(data, config.responseJsonPath || 'url');
          if (typeof downloadUrl !== 'string') {
            throw new Error('Expected download URL in response');
          }
          const downloadResponse = await fetch(downloadUrl);
          if (!downloadResponse.ok) {
            throw new Error(`Failed to download audio from ${downloadUrl}`);
          }
          const arrayBuf = await downloadResponse.arrayBuffer();
          audio = Buffer.from(arrayBuf);
          break;
        }
        default:
          throw new Error(`Unsupported audio response type: ${audioResponseType}`);
      }

      const latencyMs = Date.now() - start;
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
    const url = `${config.baseUrl}/health`;
    const headers = this.buildHeaders(config);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'GET',
        headers,
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

  async discoverVoices(_config: AdapterConfig): Promise<DiscoveredVoice[]> {
    // Custom REST APIs may not have standardized voice discovery
    return [];
  }

  private buildRequestBody(
    request: TTSRequest,
    config: AdapterConfig
  ): Record<string, unknown> {
    const template = config.requestTemplate || {
      text: '{{text}}',
      voice_id: '{{voice_id}}',
      language: '{{language}}',
      output_format: '{{output_format}}',
    };

    const variables: Record<string, string> = {
      text: request.text,
      voice_id: request.voiceId,
      language: request.language || 'km',
      output_format: request.outputFormat || 'mp3',
      model: config.model || '',
      emotion: request.emotion || 'neutral',
      pace: request.pace || 'normal',
    };

    return this.substituteVariables(template, variables);
  }

  private substituteVariables(
    obj: Record<string, unknown>,
    variables: Record<string, string>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.replaceTemplateVars(value, variables);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.substituteVariables(
          value as Record<string, unknown>,
          variables
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private replaceTemplateVars(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, varName: string) => {
      return variables[varName] ?? '';
    });
  }

  private extractValue(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  private estimateDuration(audio: Buffer, format: string): number {
    if (format === 'mp3') {
      return Math.round((audio.length / 16000) * 1000);
    }
    if (format === 'wav') {
      return Math.round(((audio.length - 44) / 32000) * 1000);
    }
    return Math.round((audio.length / 16000) * 1000);
  }

  private buildHeaders(config: AdapterConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config.customHeaders,
    };

    switch (config.authType) {
      case 'BEARER':
        headers['Authorization'] = `Bearer ${config.apiKey}`;
        break;
      case 'API_KEY_HEADER':
        headers[config.authHeaderName || 'X-API-Key'] = config.apiKey;
        break;
      case 'CUSTOM':
        if (config.authHeaderName) {
          headers[config.authHeaderName] = config.apiKey;
        }
        break;
    }

    return headers;
  }
}
