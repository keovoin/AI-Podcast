import type {
  RoutingRequest,
  RoutingRecommendation,
  RoutingScore,
  RoutingExclusion,
  FallbackEntry,
  RoutingDecision,
} from '@/types/routing';
import { SCORING_WEIGHTS } from '@/types/routing';
import type { ProviderCategory, HealthStatus } from '@/types/provider';

/**
 * Provider data needed for routing decisions.
 */
export interface RoutableProvider {
  id: string;
  name: string;
  category: ProviderCategory;
  enabled: boolean;
  priority: number;
  model?: string;
  voiceIds?: string[];
  monthlyBudget?: number;
  dataResidency?: string;
  allowSensitive: boolean;
  languages?: string[];
  health: {
    status: HealthStatus;
    avgLatencyMs?: number;
    successRate?: number;
  };
  benchmark?: {
    weightedScore?: number;
    approved: boolean;
  };
  costPerRequest?: number;
  currentMonthSpend?: number;
}

interface FilterResult {
  passed: RoutableProvider[];
  excluded: RoutingExclusion[];
}

/**
 * Automatic Provider Routing Engine
 * 
 * Applies hard filters, then scores providers using the weighted formula:
 * score = quality * 0.40 + khmerAccuracy * 0.25 + reliability * 0.15
 *       + latency * 0.08 + costEfficiency * 0.07 + featureFit * 0.05
 * 
 * Supports modes: Auto, Best Khmer, Cheapest, Fastest, Private Only, Manual
 */
export class RoutingEngine {
  /**
   * Get a routing recommendation for a given request.
   */
  recommend(
    request: RoutingRequest,
    providers: RoutableProvider[]
  ): RoutingRecommendation | null {
    // If manual mode with locked provider, return that directly
    if (request.mode === 'MANUAL' && request.lockedProviderId) {
      const locked = providers.find((p) => p.id === request.lockedProviderId);
      if (locked) {
        return this.buildRecommendation(locked, [], providers);
      }
      return null;
    }

    // Apply hard filters
    const { passed, excluded } = this.applyHardFilters(request, providers);

    if (passed.length === 0) {
      return null;
    }

    // Score and rank
    const scored = passed.map((provider) => ({
      provider,
      score: this.scoreProvider(provider, request),
    }));

    // Sort by mode-specific criteria
    scored.sort((a, b) => this.compareByMode(a, b, request.mode));

    const best = scored[0]!;
    const fallbacks = scored.slice(1, 4).map((s) => ({
      providerId: s.provider.id,
      providerName: s.provider.name,
      score: s.score.total,
    }));

    return this.buildRecommendation(best.provider, fallbacks, providers, best.score, excluded);
  }

  /**
   * Get full routing decision for both LLM and TTS.
   */
  getDecision(
    llmProviders: RoutableProvider[],
    ttsProviders: RoutableProvider[],
    request: Omit<RoutingRequest, 'category'>
  ): RoutingDecision {
    const llmRecommendation = this.recommend(
      { ...request, category: 'LLM' },
      llmProviders
    );

    const ttsRecommendation = this.recommend(
      { ...request, category: 'TTS' },
      ttsProviders
    );

    return {
      llm: llmRecommendation ?? undefined,
      tts: ttsRecommendation ?? undefined,
      mode: request.mode,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Apply hard filters before scoring.
   * Filters: enabled/healthy, capability, language, voice count,
   * budget, privacy, rate-limit availability.
   */
  private applyHardFilters(
    request: RoutingRequest,
    providers: RoutableProvider[]
  ): FilterResult {
    const passed: RoutableProvider[] = [];
    const excluded: RoutingExclusion[] = [];

    for (const provider of providers) {
      // Filter: must be enabled
      if (!provider.enabled) {
        excluded.push({
          providerId: provider.id,
          providerName: provider.name,
          reason: 'Provider is disabled',
        });
        continue;
      }

      // Filter: must be healthy (not UNHEALTHY)
      if (provider.health.status === 'UNHEALTHY') {
        excluded.push({
          providerId: provider.id,
          providerName: provider.name,
          reason: 'Provider is unhealthy',
        });
        continue;
      }

      // Filter: correct category
      if (provider.category !== request.category) {
        continue; // Not an exclusion, just wrong category
      }

      // Filter: language support
      if (request.language && provider.languages) {
        const supportsLanguage = provider.languages.some(
          (lang) =>
            lang.toLowerCase().startsWith(request.language!.toLowerCase()) ||
            request.language!.toLowerCase().startsWith(lang.toLowerCase())
        );
        if (!supportsLanguage) {
          excluded.push({
            providerId: provider.id,
            providerName: provider.name,
            reason: `Does not support language: ${request.language}`,
          });
          continue;
        }
      }

      // Filter: voice count (for TTS)
      if (
        request.requiredVoiceCount &&
        provider.voiceIds &&
        provider.voiceIds.length < request.requiredVoiceCount
      ) {
        excluded.push({
          providerId: provider.id,
          providerName: provider.name,
          reason: `Insufficient voices: has ${provider.voiceIds.length}, needs ${request.requiredVoiceCount}`,
        });
        continue;
      }

      // Filter: budget
      if (provider.monthlyBudget && provider.currentMonthSpend) {
        if (provider.currentMonthSpend >= provider.monthlyBudget) {
          excluded.push({
            providerId: provider.id,
            providerName: provider.name,
            reason: 'Monthly budget exceeded',
          });
          continue;
        }
      }

      // Filter: privacy (for PRIVATE_ONLY mode)
      if (request.mode === 'PRIVATE_ONLY' && provider.dataResidency !== 'private') {
        excluded.push({
          providerId: provider.id,
          providerName: provider.name,
          reason: 'Not a private/self-hosted provider',
        });
        continue;
      }

      // Filter: sensitive content
      if (request.sensitiveContent && !provider.allowSensitive) {
        excluded.push({
          providerId: provider.id,
          providerName: provider.name,
          reason: 'Not approved for sensitive content',
        });
        continue;
      }

      passed.push(provider);
    }

    return { passed, excluded };
  }

  /**
   * Score a provider using the weighted formula.
   * All component scores are normalized to 0-100.
   */
  private scoreProvider(provider: RoutableProvider, _request: RoutingRequest): RoutingScore {
    const quality = this.scoreQuality(provider);
    const khmerAccuracy = this.scoreKhmerAccuracy(provider);
    const reliability = this.scoreReliability(provider);
    const latency = this.scoreLatency(provider);
    const costEfficiency = this.scoreCostEfficiency(provider);
    const featureFit = this.scoreFeatureFit(provider);

    const total =
      quality * SCORING_WEIGHTS.quality +
      khmerAccuracy * SCORING_WEIGHTS.khmerAccuracy +
      reliability * SCORING_WEIGHTS.reliability +
      latency * SCORING_WEIGHTS.latency +
      costEfficiency * SCORING_WEIGHTS.costEfficiency +
      featureFit * SCORING_WEIGHTS.featureFit;

    return {
      quality: Math.round(quality * 100) / 100,
      khmerAccuracy: Math.round(khmerAccuracy * 100) / 100,
      reliability: Math.round(reliability * 100) / 100,
      latency: Math.round(latency * 100) / 100,
      costEfficiency: Math.round(costEfficiency * 100) / 100,
      featureFit: Math.round(featureFit * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }

  private scoreQuality(provider: RoutableProvider): number {
    // Based on benchmark weighted score if available, otherwise use priority as proxy
    if (provider.benchmark?.weightedScore) {
      return Math.min(100, provider.benchmark.weightedScore * 20); // Scale 1-5 to 0-100
    }
    // Default based on priority (higher priority = higher quality assumption)
    return Math.min(100, provider.priority);
  }

  private scoreKhmerAccuracy(provider: RoutableProvider): number {
    // Based on Khmer benchmark scores
    if (provider.benchmark?.weightedScore) {
      return Math.min(100, provider.benchmark.weightedScore * 20);
    }
    // If no benchmark, check if Khmer is listed as a language
    if (provider.languages?.some((l) => l.startsWith('km'))) {
      return 30; // Low default score for unbenchmarked Khmer providers
    }
    return 0;
  }

  private scoreReliability(provider: RoutableProvider): number {
    const successRate = provider.health.successRate;
    if (successRate !== undefined) {
      return successRate * 100;
    }
    // Default for unknown reliability
    if (provider.health.status === 'HEALTHY') return 70;
    if (provider.health.status === 'DEGRADED') return 40;
    return 50; // UNKNOWN
  }

  private scoreLatency(provider: RoutableProvider): number {
    const avgLatency = provider.health.avgLatencyMs;
    if (avgLatency === undefined) return 50;

    // Lower latency = higher score
    // 100ms = 100, 500ms = 80, 1000ms = 60, 2000ms = 40, 5000ms = 10
    if (avgLatency <= 100) return 100;
    if (avgLatency <= 500) return 80;
    if (avgLatency <= 1000) return 60;
    if (avgLatency <= 2000) return 40;
    if (avgLatency <= 5000) return 20;
    return 10;
  }

  private scoreCostEfficiency(provider: RoutableProvider): number {
    const cost = provider.costPerRequest;
    if (cost === undefined) return 50;

    // Lower cost = higher score
    if (cost === 0) return 100;
    if (cost <= 0.001) return 90;
    if (cost <= 0.01) return 70;
    if (cost <= 0.05) return 50;
    if (cost <= 0.1) return 30;
    return 10;
  }

  private scoreFeatureFit(provider: RoutableProvider): number {
    let score = 50; // Base
    if (provider.voiceIds && provider.voiceIds.length > 2) score += 20;
    if (provider.allowSensitive) score += 10;
    if (provider.dataResidency === 'private') score += 10;
    return Math.min(100, score);
  }

  /**
   * Compare two scored providers based on routing mode.
   */
  private compareByMode(
    a: { provider: RoutableProvider; score: RoutingScore },
    b: { provider: RoutableProvider; score: RoutingScore },
    mode: string
  ): number {
    switch (mode) {
      case 'BEST_KHMER':
        // Prioritize Khmer accuracy, then total
        if (b.score.khmerAccuracy !== a.score.khmerAccuracy) {
          return b.score.khmerAccuracy - a.score.khmerAccuracy;
        }
        return b.score.total - a.score.total;

      case 'CHEAPEST':
        // Prioritize cost efficiency, then total
        if (b.score.costEfficiency !== a.score.costEfficiency) {
          return b.score.costEfficiency - a.score.costEfficiency;
        }
        return b.score.total - a.score.total;

      case 'FASTEST':
        // Prioritize latency score, then total
        if (b.score.latency !== a.score.latency) {
          return b.score.latency - a.score.latency;
        }
        return b.score.total - a.score.total;

      default:
        // AUTO and PRIVATE_ONLY use total score
        return b.score.total - a.score.total;
    }
  }

  private buildRecommendation(
    provider: RoutableProvider,
    fallbacks: FallbackEntry[],
    _allProviders: RoutableProvider[],
    score?: RoutingScore,
    excluded?: RoutingExclusion[]
  ): RoutingRecommendation {
    const reasons = this.buildReasons(provider, score);
    const benchmarked = provider.benchmark?.weightedScore !== undefined;

    return {
      providerId: provider.id,
      providerName: provider.name,
      model: provider.model,
      voiceId: provider.voiceIds?.[0],
      score: score || {
        quality: 0,
        khmerAccuracy: 0,
        reliability: 0,
        latency: 0,
        costEfficiency: 0,
        featureFit: 0,
        total: 0,
      },
      reasons,
      estimatedCost: provider.costPerRequest,
      benchmarked,
      fallbackOrder: fallbacks,
      excluded: excluded || [],
    };
  }

  private buildReasons(provider: RoutableProvider, score?: RoutingScore): string[] {
    const reasons: string[] = [];

    if (!provider.benchmark?.weightedScore) {
      reasons.push('Not benchmarked - scores are estimated');
    } else if (provider.benchmark.approved) {
      reasons.push('Approved for production use');
    }

    if (score) {
      if (score.quality >= 80) reasons.push('High quality score');
      if (score.khmerAccuracy >= 70) reasons.push('Strong Khmer language support');
      if (score.reliability >= 90) reasons.push('Excellent reliability');
      if (score.latency >= 80) reasons.push('Low latency');
      if (score.costEfficiency >= 80) reasons.push('Cost effective');
    }

    if (provider.health.status === 'HEALTHY') {
      reasons.push('Provider is healthy');
    }

    if (provider.dataResidency === 'private') {
      reasons.push('Self-hosted/private deployment');
    }

    return reasons;
  }
}

/**
 * Fallback execution strategy.
 * Retry once with backoff, then try next ranked provider (max 3 total).
 */
export interface FallbackStrategy {
  maxRetries: number;
  maxProviderAttempts: number;
  backoffMs: number;
  idempotencyKey?: string;
}

export const DEFAULT_FALLBACK_STRATEGY: FallbackStrategy = {
  maxRetries: 1,
  maxProviderAttempts: 3,
  backoffMs: 1000,
};

/**
 * Execute with fallback logic.
 */
export async function executeWithFallback<T>(
  providers: FallbackEntry[],
  executor: (providerId: string) => Promise<T>,
  strategy: FallbackStrategy = DEFAULT_FALLBACK_STRATEGY
): Promise<{ result: T; providerId: string; attempts: number }> {
  let attempts = 0;

  for (const entry of providers.slice(0, strategy.maxProviderAttempts)) {
    // Try with retry
    for (let retry = 0; retry <= strategy.maxRetries; retry++) {
      attempts++;
      try {
        const result = await executor(entry.providerId);
        return { result, providerId: entry.providerId, attempts };
      } catch (error) {
        if (retry < strategy.maxRetries) {
          // Backoff before retry
          await new Promise((resolve) =>
            setTimeout(resolve, strategy.backoffMs * (retry + 1))
          );
        }
        // If last retry, try next provider
        if (retry === strategy.maxRetries) {
          console.warn(
            `Provider ${entry.providerName} failed after ${retry + 1} attempts:`,
            error instanceof Error ? error.message : error
          );
        }
      }
    }
  }

  throw new Error(
    `All ${Math.min(providers.length, strategy.maxProviderAttempts)} providers failed after ${attempts} total attempts`
  );
}
