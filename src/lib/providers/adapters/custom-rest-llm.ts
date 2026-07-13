import type {
  LLMAdapter,
  LLMRequest,
  LLMResponse,
  AdapterConfig,
  HealthCheckResult,
  DiscoveredModel,
} from './base';

/**
 * Custom REST LLM adapter.
 * Allows users to define request/response templates with variable substitution.
 * Supports any REST API that accepts JSON and returns text.
 */
export class CustomRestLLMAdapter implements LLMAdapter {
  readonly type = 'CUSTOM_REST';

  async generateText(request: LLMRequest, config: AdapterConfig): Promise<LLMResponse> {
    const start = Date.now();
    const url = `${config.baseUrl}${config.endpointPath || ''}`;

    // Build request body from template with variable substitution
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
        throw new Error(`Custom REST API error (${response.status}): ${errorBody}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - start;

      // Extract text using JSON path
      const text = this.extractValue(data, config.responseJsonPath || 'text');

      return {
        text: typeof text === 'string' ? text : JSON.stringify(text),
        model: config.model || 'custom',
        latencyMs,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(config: AdapterConfig): Promise<HealthCheckResult> {
    const start = Date.now();
    const url = `${config.baseUrl}${config.endpointPath || '/health'}`;
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

  async discoverModels(_config: AdapterConfig): Promise<DiscoveredModel[]> {
    // Custom REST APIs don't have a standardized model discovery endpoint
    return [];
  }

  /**
   * Build request body from template, substituting variables.
   * Template variables: {{model}}, {{prompt}}, {{system_prompt}},
   * {{temperature}}, {{max_tokens}}
   */
  private buildRequestBody(
    request: LLMRequest,
    config: AdapterConfig
  ): Record<string, unknown> {
    const template = config.requestTemplate || { prompt: '{{prompt}}', model: '{{model}}' };

    const variables: Record<string, string> = {
      model: request.model || config.model || '',
      prompt: request.prompt,
      system_prompt: request.systemPrompt || '',
      temperature: String(request.temperature ?? 0.7),
      max_tokens: String(request.maxTokens ?? 4096),
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

  /**
   * Extract a value from a JSON object using a dot-notation path.
   * e.g., "choices.0.message.content" or "result.text"
   */
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
