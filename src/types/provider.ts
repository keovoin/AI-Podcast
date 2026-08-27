export type ProviderCategory = 'LLM' | 'TTS' | 'STT' | 'EMBEDDING';
export type AdapterType = 'OPENAI_COMPATIBLE' | 'CUSTOM_REST' | 'GEMINI' | 'AZURE_SPEECH' | 'MOCK';
export type AuthType = 'BEARER' | 'API_KEY_HEADER' | 'QUERY_PARAM' | 'CUSTOM' | 'NONE';
export type AudioResponseType = 'BINARY' | 'BASE64_JSON' | 'DOWNLOAD_URL';
export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
export type RoutingMode = 'AUTO' | 'BEST_KHMER' | 'CHEAPEST' | 'FASTEST' | 'PRIVATE_ONLY' | 'MANUAL';

export interface ProviderConfig {
  id: string;
  name: string;
  category: ProviderCategory;
  adapterType: AdapterType;
  baseUrl?: string;
  endpointPath?: string;
  model?: string;
  authType: AuthType;
  authHeaderName?: string;
  customHeaders?: Record<string, string>;
  timeoutMs: number;
  enabled: boolean;
  priority: number;
  costMetadata?: CostMetadata;
  monthlyBudget?: number;
  dataResidency?: string;
  allowSensitive: boolean;
  requestTemplate?: Record<string, unknown>;
  responseJsonPath?: string;
  audioResponseType?: AudioResponseType;
  voiceIds?: string[];
}

export interface CostMetadata {
  costPerRequest?: number;
  costPerToken?: number;
  costPerCharacter?: number;
  currency: string;
}

export interface ProviderHealthInfo {
  status: HealthStatus;
  lastChecked?: Date;
  lastLatencyMs?: number;
  avgLatencyMs?: number;
  successRate?: number;
  totalRequests: number;
  failedRequests: number;
  lastError?: string;
  consecutiveFails: number;
}

export interface ProviderCreateInput {
  name: string;
  category: ProviderCategory;
  adapterType: AdapterType;
  baseUrl?: string;
  endpointPath?: string;
  apiKey?: string;
  model?: string;
  authType?: AuthType;
  authHeaderName?: string;
  customHeaders?: Record<string, string>;
  timeoutMs?: number;
  enabled?: boolean;
  priority?: number;
  costMetadata?: CostMetadata;
  monthlyBudget?: number;
  dataResidency?: string;
  allowSensitive?: boolean;
  requestTemplate?: Record<string, unknown>;
  responseJsonPath?: string;
  audioResponseType?: AudioResponseType;
  voiceIds?: string[];
}

export interface ProviderResponse {
  id: string;
  name: string;
  category: ProviderCategory;
  adapterType: AdapterType;
  baseUrl?: string;
  endpointPath?: string;
  model?: string;
  authType: AuthType;
  authHeaderName?: string;
  customHeaders?: Record<string, string>;
  timeoutMs: number;
  enabled: boolean;
  priority: number;
  costMetadata?: CostMetadata;
  monthlyBudget?: number;
  dataResidency?: string;
  allowSensitive: boolean;
  requestTemplate?: Record<string, unknown>;
  responseJsonPath?: string;
  audioResponseType?: AudioResponseType;
  voiceIds?: string[];
  hasApiKey: boolean;
  maskedApiKey?: string;
  health?: ProviderHealthInfo;
  hasBenchmark: boolean;
  createdAt: string;
  updatedAt: string;
}
