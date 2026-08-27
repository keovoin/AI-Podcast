import type {
  LLMAdapter,
  LLMRequest,
  LLMResponse,
  AdapterConfig,
  HealthCheckResult,
  DiscoveredModel,
} from './base';

/**
 * Google Gemini LLM adapter.
 *
 * Uses the Gemini `generateContent` REST API (v1beta) with the API key from
 * `GEMINI_API_KEY` (or the provider's stored secret). Default model is
 * `gemini-3.5-flash-lite` (Google's fast/cheap Flash Lite tier, 2026 line),
 * overridable via `GEMINI_MODEL` or the provider's `model` field.
 *
 * The adapter is used for Khmer podcast script/dialogue generation: it returns
 * raw text (JSON when responseFormat === 'json'), which the dialogue route
 * parses via the existing `extractTurns` pipeline. No SDK dependency — plain
 * fetch, works in edge/serverless runtimes.
 */
export class GeminiLLMAdapter implements LLMAdapter {
  readonly type = 'GEMINI';

  private resolveKey(config: AdapterConfig): string {
    // Prefer the provider-stored secret; fall back to the env var so a
    // deployment only needs GEMINI_API_KEY set to work out of the box.
    return config.apiKey || process.env.GEMINI_API_KEY || '';
  }

  private resolveModel(request: LLMRequest, config: AdapterConfig): string {
    return (
      request.model ||
      config.model ||
      process.env.GEMINI_MODEL ||
      'gemini-3.5-flash-lite'
    );
  }

  private buildUrl(): string {
    const base = process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com';
    return `${base}/v1beta/models`;
  }

  async generateText(request: LLMRequest, config: AdapterConfig): Promise<LLMResponse> {
    const start = Date.now();
    const apiKey = this.resolveKey(config);
    if (!apiKey) {
      throw new Error(
        'Gemini API key is not configured. Set GEMINI_API_KEY (or store the key on the provider).'
      );
    }

    const model = this.resolveModel(request, config);
    const url = `${this.buildUrl()}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    if (request.systemPrompt) {
      contents.push({ role: 'user', parts: [{ text: request.systemPrompt }] });
    }
    contents.push({ role: 'user', parts: [{ text: request.prompt }] });

    const generationConfig: Record<string, unknown> = {
      temperature: request.temperature ?? 0.8,
      maxOutputTokens: request.maxTokens ?? 8192,
    };

    if (request.responseFormat === 'json') {
      generationConfig.responseMimeType = 'application/json';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 60_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errorBody.slice(0, 800)}`);
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
          finishReason?: string;
        }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      };

      const latencyMs = Date.now() - start;
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.map((p) => p.text || '').join('') || '';

      return {
        text,
        model,
        usage:
          data.usageMetadata && data.usageMetadata.totalTokenCount !== undefined
            ? {
                promptTokens: data.usageMetadata.promptTokenCount || 0,
                completionTokens: data.usageMetadata.candidatesTokenCount || 0,
                totalTokens: data.usageMetadata.totalTokenCount,
              }
            : undefined,
        latencyMs,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(config: AdapterConfig): Promise<HealthCheckResult> {
    const start = Date.now();
    const apiKey = this.resolveKey(config);
    if (!apiKey) {
      return { healthy: false, latencyMs: 0, error: 'GEMINI_API_KEY is not set' };
    }
    const model = this.resolveModel({ prompt: '' } as LLMRequest, config);
    try {
      const response = await fetch(`${this.buildUrl()}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 1 } }),
        signal: AbortSignal.timeout(10_000),
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) {
        return { healthy: false, latencyMs, error: `HTTP ${response.status}: ${response.statusText}` };
      }
      return { healthy: true, latencyMs };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async discoverModels(config: AdapterConfig): Promise<DiscoveredModel[]> {
    const apiKey = this.resolveKey(config);
    if (!apiKey) return [];
    try {
      const response = await fetch(`${this.buildUrl()}?key=${encodeURIComponent(apiKey)}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return [];
      const data = (await response.json()) as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }> };
      return (data.models || [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => ({
          id: m.name.replace(/^models\//, ''),
          name: m.name.replace(/^models\//, ''),
          description: 'Google Gemini model',
          capabilities: ['text-generation'],
        }));
    } catch {
      return [];
    }
  }
}
