import type { ProviderCategory, RoutingMode } from './provider';

export interface RoutingRequest {
  category: ProviderCategory;
  mode: RoutingMode;
  language?: string;
  requiredVoiceCount?: number;
  sensitiveContent?: boolean;
  maxBudget?: number;
  preferredProviderId?: string;
  lockedProviderId?: string;
}

export interface RoutingScore {
  quality: number;
  khmerAccuracy: number;
  reliability: number;
  latency: number;
  costEfficiency: number;
  featureFit: number;
  total: number;
}

export interface RoutingExclusion {
  providerId: string;
  providerName: string;
  reason: string;
}

export interface RoutingRecommendation {
  providerId: string;
  providerName: string;
  model?: string;
  voiceId?: string;
  score: RoutingScore;
  reasons: string[];
  estimatedCost?: number;
  benchmarked: boolean;
  fallbackOrder: FallbackEntry[];
  excluded: RoutingExclusion[];
}

export interface FallbackEntry {
  providerId: string;
  providerName: string;
  score: number;
}

export interface RoutingDecision {
  llm?: RoutingRecommendation;
  tts?: RoutingRecommendation;
  mode: RoutingMode;
  timestamp: string;
}

export const SCORING_WEIGHTS = {
  quality: 0.40,
  khmerAccuracy: 0.25,
  reliability: 0.15,
  latency: 0.08,
  costEfficiency: 0.07,
  featureFit: 0.05,
} as const;
