import type {
  LLMAdapter,
  LLMRequest,
  LLMResponse,
  AdapterConfig,
  HealthCheckResult,
  DiscoveredModel,
} from './base';

/**
 * OpenAI-compatible LLM adapter.
 * Works with OpenAI, Azure OpenAI, LM Studio, Ollama, vLLM, and other
 * services that implement the OpenAI Chat Completions API.
 */
export class OpenAICompatibleLLMAdapter implements LLMAdapter {
  readonly type = 'OPENAI_COMPATIBLE';

  async generateText(request: LLMRequest, config: AdapterConfig): Promise<LLMResponse> {
    const start = Date.now();
    const url = `${config.baseUrl}${config.endpointPath || '/v1/chat/completions'}`;

    const messages: Array<{ role: string; content: string }> = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    messages.push({ role: 'user', content: request.prompt });

    const body: Record<string, unknown> = {
      model: request.model || config.model || 'gpt-4',
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
    };

    if (request.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

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
        throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        model: string;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      const latencyMs = Date.now() - start;

      return {
        text: data.choices[0]?.message?.content || '',
        model: data.model || config.model || 'unknown',
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
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
    const url = `${config.baseUrl}${config.endpointPath || '/v1/models'}`;
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

      if (!response.ok) {
        return {
          healthy: false,
          latencyMs,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
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
    const url = `${config.baseUrl}/v1/models`;
    const headers = this.buildHeaders(config);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to discover models: ${response.status}`);
      }

      const data = await response.json() as {
        data: Array<{ id: string; object?: string; owned_by?: string }>;
      };

      return (data.data || []).map((m) => ({
        id: m.id,
        name: m.id,
        description: m.owned_by ? `Owned by ${m.owned_by}` : undefined,
      }));
    } finally {
      clearTimeout(timeout);
    }
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
