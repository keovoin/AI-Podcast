/**
 * Base adapter interfaces for LLM and TTS providers.
 * All adapters must implement these interfaces.
 */

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

export interface LLMResponse {
  text: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
}

export interface TTSRequest {
  text: string;
  voiceId: string;
  language?: string;
  emotion?: string;
  pace?: 'slow' | 'normal' | 'fast';
  outputFormat?: 'mp3' | 'wav' | 'ogg';
}

export interface TTSResponse {
  audio: Buffer;
  format: string;
  durationMs: number;
  sizeBytes: number;
  latencyMs: number;
}

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface DiscoveredModel {
  id: string;
  name: string;
  description?: string;
  capabilities?: string[];
}

export interface DiscoveredVoice {
  id: string;
  name: string;
  language?: string;
  gender?: string;
  preview_url?: string;
}

export interface AdapterConfig {
  baseUrl: string;
  apiKey: string;
  model?: string;
  endpointPath?: string;
  authType: string;
  authHeaderName?: string;
  customHeaders?: Record<string, string>;
  timeoutMs: number;
  requestTemplate?: Record<string, unknown>;
  responseJsonPath?: string;
  audioResponseType?: string;
}

/**
 * LLM Adapter interface.
 * Implementations: OpenAI-compatible, Custom REST, Mock
 */
export interface LLMAdapter {
  readonly type: string;

  generateText(request: LLMRequest, config: AdapterConfig): Promise<LLMResponse>;
  healthCheck(config: AdapterConfig): Promise<HealthCheckResult>;
  discoverModels(config: AdapterConfig): Promise<DiscoveredModel[]>;
}

/**
 * TTS Adapter interface.
 * Implementations: Azure Speech, Custom REST, Mock
 */
export interface TTSAdapter {
  readonly type: string;

  synthesize(request: TTSRequest, config: AdapterConfig): Promise<TTSResponse>;
  healthCheck(config: AdapterConfig): Promise<HealthCheckResult>;
  discoverVoices(config: AdapterConfig): Promise<DiscoveredVoice[]>;
}
