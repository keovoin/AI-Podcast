/**
 * Test suite using Bun's built-in test runner.
 * Run with: bun test tests/run-tests.test.ts
 */
import { describe, test, expect, beforeAll } from 'bun:test';

// Set up test environment
beforeAll(() => {
  process.env.ENCRYPTION_MASTER_KEY = 'a'.repeat(64);
  process.env.SSRF_ALLOWED_HOSTS = '';
});

// ===== Encryption Tests =====
import { encryptApiKey, decryptApiKey, maskApiKey, getMaskedKey } from '../src/lib/crypto/encryption';

describe('Encryption - encryptApiKey', () => {
  test('encrypts and returns encrypted data with iv and authTag', () => {
    const result = encryptApiKey('sk-test-key-12345678901234567890');
    expect(result.encryptedKey).toBeTruthy();
    expect(result.iv).toBeTruthy();
    expect(result.authTag).toBeTruthy();
    expect(result.encryptedKey).not.toBe('sk-test-key-12345678901234567890');
  });

  test('produces different ciphertext for same input (random IV)', () => {
    const r1 = encryptApiKey('same-key');
    const r2 = encryptApiKey('same-key');
    expect(r1.encryptedKey).not.toBe(r2.encryptedKey);
    expect(r1.iv).not.toBe(r2.iv);
  });
});

describe('Encryption - decryptApiKey', () => {
  test('correctly recovers plaintext', () => {
    const plaintext = 'sk-test-key-12345678901234567890';
    const encrypted = encryptApiKey(plaintext);
    expect(decryptApiKey(encrypted)).toBe(plaintext);
  });

  test('handles empty string', () => {
    const encrypted = encryptApiKey('');
    expect(decryptApiKey(encrypted)).toBe('');
  });

  test('handles unicode (Khmer characters)', () => {
    const plaintext = 'key-\u1780\u1781\u1782';
    const encrypted = encryptApiKey(plaintext);
    expect(decryptApiKey(encrypted)).toBe(plaintext);
  });

  test('fails with tampered ciphertext', () => {
    const encrypted = encryptApiKey('test-key');
    encrypted.encryptedKey += 'tampered';
    expect(() => decryptApiKey(encrypted)).toThrow();
  });

  test('fails with tampered auth tag', () => {
    const encrypted = encryptApiKey('test-key');
    encrypted.authTag = 'dGFtcGVyZWQ=';
    expect(() => decryptApiKey(encrypted)).toThrow();
  });
});

describe('Encryption - maskApiKey', () => {
  test('masks long key showing first 4 and last 4', () => {
    const result = maskApiKey('sk-1234567890abcdef');
    expect(result).toStartWith('sk-1');
    expect(result).toEndWith('cdef');
    expect(result).toContain('*');
    expect(result).not.toContain('567890');
  });

  test('fully masks short key', () => {
    expect(maskApiKey('short')).toBe('****');
    expect(maskApiKey('12345678')).toBe('****');
  });
});

describe('Encryption - security boundary', () => {
  test('throws if ENCRYPTION_MASTER_KEY not set', () => {
    const orig = process.env.ENCRYPTION_MASTER_KEY;
    delete process.env.ENCRYPTION_MASTER_KEY;
    expect(() => encryptApiKey('test')).toThrow('ENCRYPTION_MASTER_KEY');
    process.env.ENCRYPTION_MASTER_KEY = orig;
  });

  test('throws if ENCRYPTION_MASTER_KEY wrong length', () => {
    const orig = process.env.ENCRYPTION_MASTER_KEY;
    process.env.ENCRYPTION_MASTER_KEY = 'short';
    expect(() => encryptApiKey('test')).toThrow('64-character');
    process.env.ENCRYPTION_MASTER_KEY = orig;
  });
});

// ===== SSRF Tests =====
import { isObviouslyPrivate } from '../src/lib/ssrf/protection';

describe('SSRF Protection', () => {
  test('detects localhost as private', () => {
    expect(isObviouslyPrivate('http://localhost:8080/api')).toBe(true);
  });

  test('detects 127.0.0.1 as private', () => {
    expect(isObviouslyPrivate('http://127.0.0.1:3000')).toBe(true);
  });

  test('detects 10.x.x.x as private', () => {
    expect(isObviouslyPrivate('http://10.0.0.1/api')).toBe(true);
    expect(isObviouslyPrivate('http://10.255.255.255/api')).toBe(true);
  });

  test('detects 172.16.x.x as private', () => {
    expect(isObviouslyPrivate('http://172.16.0.1/api')).toBe(true);
    expect(isObviouslyPrivate('http://172.31.255.255/api')).toBe(true);
  });

  test('detects 192.168.x.x as private', () => {
    expect(isObviouslyPrivate('http://192.168.1.1/api')).toBe(true);
  });

  test('detects link-local (169.254) as private', () => {
    expect(isObviouslyPrivate('http://169.254.169.254/metadata')).toBe(true);
  });

  test('detects .local domains as private', () => {
    expect(isObviouslyPrivate('http://myservice.local/api')).toBe(true);
  });

  test('detects .internal domains as private', () => {
    expect(isObviouslyPrivate('http://api.internal/v1')).toBe(true);
  });

  test('allows public IPs', () => {
    expect(isObviouslyPrivate('https://8.8.8.8/api')).toBe(false);
    expect(isObviouslyPrivate('https://1.1.1.1/api')).toBe(false);
  });

  test('allows public domains', () => {
    expect(isObviouslyPrivate('https://api.openai.com/v1')).toBe(false);
    expect(isObviouslyPrivate('https://eastus.tts.speech.microsoft.com')).toBe(false);
  });

  test('treats invalid URLs as unsafe', () => {
    expect(isObviouslyPrivate('not-a-url')).toBe(true);
    expect(isObviouslyPrivate('')).toBe(true);
  });

  test('detects 0.0.0.0 as private', () => {
    expect(isObviouslyPrivate('http://0.0.0.0:8080')).toBe(true);
  });
});

// ===== Routing Engine Tests =====
import { RoutingEngine, executeWithFallback } from '../src/lib/routing/engine';
import type { RoutableProvider } from '../src/lib/routing/engine';

function createMockProvider(overrides: Partial<RoutableProvider> = {}): RoutableProvider {
  return {
    id: 'provider-1',
    name: 'Test Provider',
    category: 'LLM',
    enabled: true,
    priority: 50,
    model: 'test-model',
    allowSensitive: false,
    health: { status: 'HEALTHY', avgLatencyMs: 500, successRate: 0.95 },
    ...overrides,
  };
}

describe('RoutingEngine - Hard Filters', () => {
  const engine = new RoutingEngine();

  test('excludes disabled providers', () => {
    const result = engine.recommend(
      { category: 'LLM', mode: 'AUTO' },
      [
        createMockProvider({ id: '1', enabled: false }),
        createMockProvider({ id: '2', enabled: true }),
      ]
    );
    expect(result).not.toBeNull();
    expect(result!.providerId).toBe('2');
    expect(result!.excluded.some(e => e.providerId === '1')).toBe(true);
  });

  test('excludes unhealthy providers', () => {
    const result = engine.recommend(
      { category: 'LLM', mode: 'AUTO' },
      [
        createMockProvider({ id: '1', health: { status: 'UNHEALTHY', successRate: 0.1 } }),
        createMockProvider({ id: '2', health: { status: 'HEALTHY', successRate: 0.99 } }),
      ]
    );
    expect(result).not.toBeNull();
    expect(result!.providerId).toBe('2');
  });

  test('excludes providers without required language', () => {
    const result = engine.recommend(
      { category: 'LLM', mode: 'AUTO', language: 'km' },
      [
        createMockProvider({ id: '1', languages: ['en-US'] }),
        createMockProvider({ id: '2', languages: ['km-KH', 'en-US'] }),
      ]
    );
    expect(result).not.toBeNull();
    expect(result!.providerId).toBe('2');
  });

  test('excludes providers with insufficient voices', () => {
    const result = engine.recommend(
      { category: 'TTS', mode: 'AUTO', requiredVoiceCount: 2 },
      [
        createMockProvider({ id: '1', category: 'TTS', voiceIds: ['v1'] }),
        createMockProvider({ id: '2', category: 'TTS', voiceIds: ['v1', 'v2', 'v3'] }),
      ]
    );
    expect(result).not.toBeNull();
    expect(result!.providerId).toBe('2');
  });

  test('excludes non-private in PRIVATE_ONLY mode', () => {
    const result = engine.recommend(
      { category: 'LLM', mode: 'PRIVATE_ONLY' },
      [
        createMockProvider({ id: '1', dataResidency: 'us' }),
        createMockProvider({ id: '2', dataResidency: 'private' }),
      ]
    );
    expect(result).not.toBeNull();
    expect(result!.providerId).toBe('2');
  });

  test('returns null when no providers pass', () => {
    const result = engine.recommend(
      { category: 'LLM', mode: 'AUTO' },
      [createMockProvider({ id: '1', enabled: false })]
    );
    expect(result).toBeNull();
  });
});

describe('RoutingEngine - Scoring & Modes', () => {
  const engine = new RoutingEngine();

  test('selects highest scoring provider in AUTO', () => {
    const result = engine.recommend(
      { category: 'LLM', mode: 'AUTO' },
      [
        createMockProvider({ id: '1', priority: 30, health: { status: 'HEALTHY', avgLatencyMs: 2000, successRate: 0.8 } }),
        createMockProvider({ id: '2', priority: 80, health: { status: 'HEALTHY', avgLatencyMs: 200, successRate: 0.99 } }),
      ]
    );
    expect(result).not.toBeNull();
    expect(result!.providerId).toBe('2');
    expect(result!.score.total).toBeGreaterThan(0);
  });

  test('prefers fast provider in FASTEST mode', () => {
    const result = engine.recommend(
      { category: 'LLM', mode: 'FASTEST' },
      [
        createMockProvider({ id: '1', priority: 90, health: { status: 'HEALTHY', avgLatencyMs: 5000, successRate: 0.99 } }),
        createMockProvider({ id: '2', priority: 30, health: { status: 'HEALTHY', avgLatencyMs: 50, successRate: 0.9 } }),
      ]
    );
    expect(result!.providerId).toBe('2');
  });

  test('prefers cheap provider in CHEAPEST mode', () => {
    const result = engine.recommend(
      { category: 'LLM', mode: 'CHEAPEST' },
      [
        createMockProvider({ id: '1', costPerRequest: 0.1, priority: 90 }),
        createMockProvider({ id: '2', costPerRequest: 0.0001, priority: 30 }),
      ]
    );
    expect(result!.providerId).toBe('2');
  });

  test('returns locked provider in MANUAL mode', () => {
    const result = engine.recommend(
      { category: 'LLM', mode: 'MANUAL', lockedProviderId: '2' },
      [
        createMockProvider({ id: '1', priority: 90 }),
        createMockProvider({ id: '2', priority: 10 }),
      ]
    );
    expect(result!.providerId).toBe('2');
  });

  test('marks unbenchmarked providers', () => {
    const result = engine.recommend(
      { category: 'LLM', mode: 'AUTO' },
      [createMockProvider({ id: '1' })]
    );
    expect(result!.benchmarked).toBe(false);
    expect(result!.reasons).toContain('Not benchmarked - scores are estimated');
  });

  test('independent LLM and TTS in getDecision', () => {
    const decision = engine.getDecision(
      [createMockProvider({ id: 'llm-1', category: 'LLM' })],
      [createMockProvider({ id: 'tts-1', category: 'TTS' })],
      { mode: 'AUTO' }
    );
    expect(decision.llm!.providerId).toBe('llm-1');
    expect(decision.tts!.providerId).toBe('tts-1');
    expect(decision.mode).toBe('AUTO');
  });
});

describe('executeWithFallback', () => {
  test('succeeds on first attempt', async () => {
    const result = await executeWithFallback(
      [{ providerId: '1', providerName: 'Test', score: 80 }],
      async () => 'success'
    );
    expect(result.result).toBe('success');
    expect(result.attempts).toBe(1);
  });

  test('retries and succeeds', async () => {
    let calls = 0;
    const result = await executeWithFallback(
      [{ providerId: '1', providerName: 'Test', score: 80 }],
      async () => { calls++; if (calls === 1) throw new Error('fail'); return 'ok'; },
      { maxRetries: 1, maxProviderAttempts: 3, backoffMs: 1 }
    );
    expect(result.result).toBe('ok');
    expect(result.attempts).toBe(2);
  });

  test('falls back to next provider', async () => {
    const result = await executeWithFallback(
      [
        { providerId: '1', providerName: 'P1', score: 80 },
        { providerId: '2', providerName: 'P2', score: 60 },
      ],
      async (id) => { if (id === '1') throw new Error('fail'); return 'from-p2'; },
      { maxRetries: 1, maxProviderAttempts: 3, backoffMs: 1 }
    );
    expect(result.result).toBe('from-p2');
    expect(result.providerId).toBe('2');
  });

  test('throws when all providers fail', async () => {
    expect(
      executeWithFallback(
        [{ providerId: '1', providerName: 'P1', score: 80 }, { providerId: '2', providerName: 'P2', score: 60 }],
        async () => { throw new Error('fail'); },
        { maxRetries: 0, maxProviderAttempts: 2, backoffMs: 1 }
      )
    ).rejects.toThrow('All 2 providers failed');
  });
});

// ===== Mock Adapter Tests =====
import { MockLLMAdapter } from '../src/lib/providers/adapters/mock-llm';
import { MockTTSAdapter } from '../src/lib/providers/adapters/mock-tts';

const mockConfig = {
  baseUrl: 'http://localhost:8080',
  apiKey: 'mock-key',
  model: 'mock-model',
  authType: 'BEARER',
  timeoutMs: 30000,
};

describe('MockLLMAdapter', () => {
  const adapter = new MockLLMAdapter({ latencyMs: 1 });

  test('generates text response', async () => {
    const response = await adapter.generateText({ prompt: 'Hello' }, mockConfig);
    expect(response.text).toBeTruthy();
    expect(response.model).toBe('mock-gpt-4');
    expect(response.usage!.totalTokens).toBeGreaterThan(0);
  });

  test('generates structured JSON dialogue', async () => {
    const response = await adapter.generateText(
      { prompt: 'Generate dialogue', responseFormat: 'json' },
      mockConfig
    );
    const parsed = JSON.parse(response.text);
    expect(parsed.episode).toBeDefined();
    expect(parsed.turns).toBeArray();
    expect(parsed.turns.length).toBeGreaterThan(0);
    expect(parsed.turns[0].id).toMatch(/^turn_\d{4}$/);
    expect(parsed.turns[0].delivery.emotion).toBeTruthy();
    expect(parsed.turns[0].delivery.pace).toBeTruthy();
  });

  test('passes health check', async () => {
    const result = await adapter.healthCheck(mockConfig);
    expect(result.healthy).toBe(true);
  });

  test('discovers models', async () => {
    const models = await adapter.discoverModels(mockConfig);
    expect(models.length).toBeGreaterThan(0);
  });

  test('simulates failure', async () => {
    const fail = new MockLLMAdapter({ shouldFail: true });
    expect(fail.generateText({ prompt: 'x' }, mockConfig)).rejects.toThrow('Simulated failure');
  });
});

describe('MockTTSAdapter', () => {
  const adapter = new MockTTSAdapter({ latencyMs: 1 });

  test('synthesizes audio buffer', async () => {
    const response = await adapter.synthesize({ text: 'Hello world', voiceId: 'mock-km-male-1' }, mockConfig);
    expect(response.audio).toBeInstanceOf(Buffer);
    expect(response.audio.length).toBeGreaterThan(44);
    expect(response.durationMs).toBeGreaterThan(0);
  });

  test('generates valid WAV header', async () => {
    const response = await adapter.synthesize({ text: 'Test', voiceId: 'v' }, mockConfig);
    expect(response.audio.toString('ascii', 0, 4)).toBe('RIFF');
    expect(response.audio.toString('ascii', 8, 12)).toBe('WAVE');
  });

  test('adjusts duration by pace', async () => {
    const text = 'This is a test sentence for pace comparison.';
    const normal = await adapter.synthesize({ text, voiceId: 'v', pace: 'normal' }, mockConfig);
    const slow = await adapter.synthesize({ text, voiceId: 'v', pace: 'slow' }, mockConfig);
    const fast = await adapter.synthesize({ text, voiceId: 'v', pace: 'fast' }, mockConfig);
    expect(slow.durationMs).toBeGreaterThan(normal.durationMs);
    expect(fast.durationMs).toBeLessThan(normal.durationMs);
  });

  test('discovers Khmer voices', async () => {
    const voices = await adapter.discoverVoices(mockConfig);
    const khmer = voices.filter(v => v.language?.startsWith('km'));
    expect(khmer.length).toBeGreaterThan(0);
  });
});

// ===== Khmer Normalization Tests =====
import { normalizeKhmerText } from '../src/lib/normalization/khmer';

describe('Khmer Normalization', () => {
  test('preserves original text', () => {
    const result = normalizeKhmerText('Hello 123', 'km');
    expect(result.original).toBe('Hello 123');
  });

  test('detects Khmer-English mix', () => {
    const result = normalizeKhmerText('\u179F\u17BD\u179F\u17D2\u178F\u17B8 Hello', 'km');
    expect(result.hasKhmerEnglishMix).toBe(true);
  });

  test('expands percentages', () => {
    const result = normalizeKhmerText('50%', 'km');
    expect(result.normalized).toContain('\u1797\u17B6\u1782\u179A\u1799');
    expect(result.normalized).not.toContain('%');
  });

  test('normalizes multiple spaces', () => {
    const result = normalizeKhmerText('Hello    world', 'km');
    expect(result.normalized).not.toContain('  ');
  });

  test('handles empty string', () => {
    const result = normalizeKhmerText('', 'km');
    expect(result.chunks).toEqual([]);
  });

  test('applies NFC normalization', () => {
    const result = normalizeKhmerText('A\u030A', 'km');
    expect(result.normalized).toBe('\u00C5');
  });
});

// ===== Validation Schema Tests =====
import { providerCreateSchema, routingRequestSchema, dialogueTurnSchema, episodeDialogueSchema } from '../src/lib/validation/schemas';

describe('Validation Schemas', () => {
  test('accepts valid provider input', () => {
    const result = providerCreateSchema.safeParse({
      name: 'OpenAI',
      category: 'LLM',
      adapterType: 'OPENAI_COMPATIBLE',
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-test',
      model: 'gpt-4',
    });
    expect(result.success).toBe(true);
  });

  test('rejects invalid provider category', () => {
    const result = providerCreateSchema.safeParse({
      name: 'Test',
      category: 'INVALID',
      adapterType: 'MOCK',
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid URL', () => {
    const result = providerCreateSchema.safeParse({
      name: 'Test',
      category: 'LLM',
      adapterType: 'MOCK',
      baseUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  test('applies defaults', () => {
    const result = providerCreateSchema.safeParse({
      name: 'Test',
      category: 'TTS',
      adapterType: 'AZURE_SPEECH',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeoutMs).toBe(30000);
      expect(result.data.enabled).toBe(true);
      expect(result.data.priority).toBe(50);
    }
  });

  test('accepts valid routing request', () => {
    const result = routingRequestSchema.safeParse({ category: 'LLM', mode: 'BEST_KHMER', language: 'km' });
    expect(result.success).toBe(true);
  });

  test('accepts valid dialogue turn', () => {
    const result = dialogueTurnSchema.safeParse({
      id: 'turn_0001',
      speaker_id: 'speaker_1',
      text: 'Hello world',
      delivery: { emotion: 'friendly', pace: 'normal', pause_after_ms: 350 },
      source_fact_ids: [],
      estimated_seconds: 3.5,
    });
    expect(result.success).toBe(true);
  });

  test('rejects invalid turn ID format', () => {
    const result = dialogueTurnSchema.safeParse({
      id: 'bad_id',
      speaker_id: 's1',
      text: 'Hello',
      delivery: { emotion: 'friendly', pace: 'normal', pause_after_ms: 350 },
      source_fact_ids: [],
      estimated_seconds: 3.5,
    });
    expect(result.success).toBe(false);
  });

  test('rejects dialogue with <2 turns', () => {
    const result = episodeDialogueSchema.safeParse({
      episode: { title: 'Test', language: 'km', target_duration_seconds: 300 },
      turns: [{
        id: 'turn_0001', speaker_id: 's1', text: 'Hello',
        delivery: { emotion: 'friendly', pace: 'normal', pause_after_ms: 350 },
        source_fact_ids: [], estimated_seconds: 3.5,
      }],
    });
    expect(result.success).toBe(false);
  });
});
