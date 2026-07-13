import { describe, it, expect } from 'vitest';
import { RoutingEngine, executeWithFallback } from '@/lib/routing/engine';
import type { RoutableProvider } from '@/lib/routing/engine';
import type { RoutingRequest } from '@/types/routing';

function createMockProvider(overrides: Partial<RoutableProvider> = {}): RoutableProvider {
  return {
    id: 'provider-1',
    name: 'Test Provider',
    category: 'LLM',
    enabled: true,
    priority: 50,
    model: 'test-model',
    allowSensitive: false,
    health: {
      status: 'HEALTHY',
      avgLatencyMs: 500,
      successRate: 0.95,
    },
    ...overrides,
  };
}

describe('RoutingEngine', () => {
  const engine = new RoutingEngine();

  describe('Hard Filters', () => {
    it('should exclude disabled providers', () => {
      const providers = [
        createMockProvider({ id: '1', enabled: false }),
        createMockProvider({ id: '2', enabled: true }),
      ];

      const result = engine.recommend(
        { category: 'LLM', mode: 'AUTO' },
        providers
      );

      expect(result).not.toBeNull();
      expect(result!.providerId).toBe('2');
      expect(result!.excluded).toContainEqual(
        expect.objectContaining({ providerId: '1', reason: 'Provider is disabled' })
      );
    });

    it('should exclude unhealthy providers', () => {
      const providers = [
        createMockProvider({ id: '1', health: { status: 'UNHEALTHY', successRate: 0.1 } }),
        createMockProvider({ id: '2', health: { status: 'HEALTHY', successRate: 0.99 } }),
      ];

      const result = engine.recommend(
        { category: 'LLM', mode: 'AUTO' },
        providers
      );

      expect(result).not.toBeNull();
      expect(result!.providerId).toBe('2');
    });

    it('should exclude providers that do not support required language', () => {
      const providers = [
        createMockProvider({ id: '1', languages: ['en-US'] }),
        createMockProvider({ id: '2', languages: ['km-KH', 'en-US'] }),
      ];

      const result = engine.recommend(
        { category: 'LLM', mode: 'AUTO', language: 'km' },
        providers
      );

      expect(result).not.toBeNull();
      expect(result!.providerId).toBe('2');
      expect(result!.excluded).toContainEqual(
        expect.objectContaining({ providerId: '1', reason: expect.stringContaining('language') })
      );
    });

    it('should exclude providers with insufficient voices', () => {
      const providers = [
        createMockProvider({ id: '1', category: 'TTS', voiceIds: ['voice1'] }),
        createMockProvider({ id: '2', category: 'TTS', voiceIds: ['voice1', 'voice2', 'voice3'] }),
      ];

      const result = engine.recommend(
        { category: 'TTS', mode: 'AUTO', requiredVoiceCount: 2 },
        providers
      );

      expect(result).not.toBeNull();
      expect(result!.providerId).toBe('2');
    });

    it('should exclude non-private providers in PRIVATE_ONLY mode', () => {
      const providers = [
        createMockProvider({ id: '1', dataResidency: 'us' }),
        createMockProvider({ id: '2', dataResidency: 'private' }),
      ];

      const result = engine.recommend(
        { category: 'LLM', mode: 'PRIVATE_ONLY' },
        providers
      );

      expect(result).not.toBeNull();
      expect(result!.providerId).toBe('2');
    });

    it('should exclude providers not approved for sensitive content', () => {
      const providers = [
        createMockProvider({ id: '1', allowSensitive: false }),
        createMockProvider({ id: '2', allowSensitive: true }),
      ];

      const result = engine.recommend(
        { category: 'LLM', mode: 'AUTO', sensitiveContent: true },
        providers
      );

      expect(result).not.toBeNull();
      expect(result!.providerId).toBe('2');
    });

    it('should return null when no providers pass filters', () => {
      const providers = [
        createMockProvider({ id: '1', enabled: false }),
      ];

      const result = engine.recommend(
        { category: 'LLM', mode: 'AUTO' },
        providers
      );

      expect(result).toBeNull();
    });
  });

  describe('Scoring', () => {
    it('should score providers and select the highest', () => {
      const providers = [
        createMockProvider({
          id: '1',
          priority: 30,
          health: { status: 'HEALTHY', avgLatencyMs: 2000, successRate: 0.8 },
        }),
        createMockProvider({
          id: '2',
          priority: 80,
          health: { status: 'HEALTHY', avgLatencyMs: 200, successRate: 0.99 },
        }),
      ];

      const result = engine.recommend(
        { category: 'LLM', mode: 'AUTO' },
        providers
      );

      expect(result).not.toBeNull();
      expect(result!.providerId).toBe('2');
      expect(result!.score.total).toBeGreaterThan(0);
    });

    it('should prefer low latency in FASTEST mode', () => {
      const providers = [
        createMockProvider({
          id: '1',
          priority: 90,
          health: { status: 'HEALTHY', avgLatencyMs: 5000, successRate: 0.99 },
        }),
        createMockProvider({
          id: '2',
          priority: 30,
          health: { status: 'HEALTHY', avgLatencyMs: 50, successRate: 0.9 },
        }),
      ];

      const result = engine.recommend(
        { category: 'LLM', mode: 'FASTEST' },
        providers
      );

      expect(result).not.toBeNull();
      expect(result!.providerId).toBe('2');
    });

    it('should prefer cost efficiency in CHEAPEST mode', () => {
      const providers = [
        createMockProvider({ id: '1', costPerRequest: 0.1, priority: 90 }),
        createMockProvider({ id: '2', costPerRequest: 0.0001, priority: 30 }),
      ];

      const result = engine.recommend(
        { category: 'LLM', mode: 'CHEAPEST' },
        providers
      );

      expect(result).not.toBeNull();
      expect(result!.providerId).toBe('2');
    });

    it('should prefer Khmer accuracy in BEST_KHMER mode', () => {
      const providers = [
        createMockProvider({
          id: '1',
          priority: 90,
          languages: ['en-US'],
          benchmark: { weightedScore: 2, approved: false },
        }),
        createMockProvider({
          id: '2',
          priority: 40,
          languages: ['km-KH'],
          benchmark: { weightedScore: 4.5, approved: true },
        }),
      ];

      const result = engine.recommend(
        { category: 'LLM', mode: 'BEST_KHMER' },
        providers
      );

      expect(result).not.toBeNull();
      expect(result!.providerId).toBe('2');
    });

    it('should mark unbenchmarked providers as not benchmarked', () => {
      const providers = [
        createMockProvider({ id: '1', benchmark: undefined }),
      ];

      const result = engine.recommend(
        { category: 'LLM', mode: 'AUTO' },
        providers
      );

      expect(result).not.toBeNull();
      expect(result!.benchmarked).toBe(false);
      expect(result!.reasons).toContain('Not benchmarked - scores are estimated');
    });
  });

  describe('Manual Lock', () => {
    it('should return locked provider in MANUAL mode', () => {
      const providers = [
        createMockProvider({ id: '1', priority: 90 }),
        createMockProvider({ id: '2', priority: 10 }),
      ];

      const result = engine.recommend(
        { category: 'LLM', mode: 'MANUAL', lockedProviderId: '2' },
        providers
      );

      expect(result).not.toBeNull();
      expect(result!.providerId).toBe('2');
    });
  });

  describe('Fallback Order', () => {
    it('should include fallback providers in order', () => {
      const providers = [
        createMockProvider({ id: '1', priority: 90 }),
        createMockProvider({ id: '2', priority: 70, name: 'Second' }),
        createMockProvider({ id: '3', priority: 50, name: 'Third' }),
        createMockProvider({ id: '4', priority: 30, name: 'Fourth' }),
      ];

      const result = engine.recommend(
        { category: 'LLM', mode: 'AUTO' },
        providers
      );

      expect(result).not.toBeNull();
      expect(result!.fallbackOrder.length).toBeLessThanOrEqual(3);
      expect(result!.fallbackOrder[0]!.score).toBeGreaterThanOrEqual(
        result!.fallbackOrder[1]?.score || 0
      );
    });
  });

  describe('Full Decision (LLM + TTS)', () => {
    it('should provide independent LLM and TTS recommendations', () => {
      const llmProviders = [createMockProvider({ id: 'llm-1', category: 'LLM' })];
      const ttsProviders = [createMockProvider({ id: 'tts-1', category: 'TTS' })];

      const decision = engine.getDecision(llmProviders, ttsProviders, { mode: 'AUTO' });

      expect(decision.llm).toBeDefined();
      expect(decision.tts).toBeDefined();
      expect(decision.llm!.providerId).toBe('llm-1');
      expect(decision.tts!.providerId).toBe('tts-1');
      expect(decision.mode).toBe('AUTO');
      expect(decision.timestamp).toBeTruthy();
    });
  });
});

describe('executeWithFallback', () => {
  it('should succeed on first attempt', async () => {
    const result = await executeWithFallback(
      [{ providerId: '1', providerName: 'Test', score: 80 }],
      async () => 'success'
    );

    expect(result.result).toBe('success');
    expect(result.providerId).toBe('1');
    expect(result.attempts).toBe(1);
  });

  it('should retry once then succeed', async () => {
    let callCount = 0;
    const result = await executeWithFallback(
      [{ providerId: '1', providerName: 'Test', score: 80 }],
      async () => {
        callCount++;
        if (callCount === 1) throw new Error('First attempt failed');
        return 'success';
      },
      { maxRetries: 1, maxProviderAttempts: 3, backoffMs: 10 }
    );

    expect(result.result).toBe('success');
    expect(result.attempts).toBe(2);
  });

  it('should fallback to next provider after retries exhausted', async () => {
    const result = await executeWithFallback(
      [
        { providerId: '1', providerName: 'First', score: 80 },
        { providerId: '2', providerName: 'Second', score: 60 },
      ],
      async (id) => {
        if (id === '1') throw new Error('Provider 1 always fails');
        return 'success from provider 2';
      },
      { maxRetries: 1, maxProviderAttempts: 3, backoffMs: 10 }
    );

    expect(result.result).toBe('success from provider 2');
    expect(result.providerId).toBe('2');
    expect(result.attempts).toBeGreaterThan(2);
  });

  it('should throw after all providers fail', async () => {
    await expect(
      executeWithFallback(
        [
          { providerId: '1', providerName: 'First', score: 80 },
          { providerId: '2', providerName: 'Second', score: 60 },
        ],
        async () => {
          throw new Error('Always fails');
        },
        { maxRetries: 0, maxProviderAttempts: 2, backoffMs: 10 }
      )
    ).rejects.toThrow('All 2 providers failed');
  });

  it('should respect maxProviderAttempts limit', async () => {
    let attemptedProviders: string[] = [];
    try {
      await executeWithFallback(
        [
          { providerId: '1', providerName: 'P1', score: 80 },
          { providerId: '2', providerName: 'P2', score: 70 },
          { providerId: '3', providerName: 'P3', score: 60 },
          { providerId: '4', providerName: 'P4', score: 50 },
        ],
        async (id) => {
          attemptedProviders.push(id);
          throw new Error('fail');
        },
        { maxRetries: 0, maxProviderAttempts: 3, backoffMs: 10 }
      );
    } catch {
      // Expected
    }

    expect(attemptedProviders).toEqual(['1', '2', '3']);
    expect(attemptedProviders).not.toContain('4');
  });
});
