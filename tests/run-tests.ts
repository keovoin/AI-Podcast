/**
 * Standalone test runner using Node.js built-in assert.
 * Runs without external dependencies (vitest/jest).
 * Tests the core library code directly.
 */

import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

// Set up test environment
process.env.ENCRYPTION_MASTER_KEY = 'a'.repeat(64);
process.env.SSRF_ALLOWED_HOSTS = '';

// ===== Encryption Tests =====
import { encryptApiKey, decryptApiKey, maskApiKey } from '../src/lib/crypto/encryption.js';

describe('Encryption', () => {
  test('encryptApiKey returns encrypted data with iv and authTag', () => {
    const result = encryptApiKey('sk-test-key-12345678901234567890');
    assert.ok(result.encryptedKey);
    assert.ok(result.iv);
    assert.ok(result.authTag);
    assert.notEqual(result.encryptedKey, 'sk-test-key-12345678901234567890');
  });

  test('produces different ciphertext for same input (random IV)', () => {
    const r1 = encryptApiKey('same-key');
    const r2 = encryptApiKey('same-key');
    assert.notEqual(r1.encryptedKey, r2.encryptedKey);
    assert.notEqual(r1.iv, r2.iv);
  });

  test('decryptApiKey correctly recovers plaintext', () => {
    const plaintext = 'sk-test-key-12345678901234567890';
    const encrypted = encryptApiKey(plaintext);
    const decrypted = decryptApiKey(encrypted);
    assert.equal(decrypted, plaintext);
  });

  test('decryption fails with tampered ciphertext', () => {
    const encrypted = encryptApiKey('test-key');
    encrypted.encryptedKey = encrypted.encryptedKey + 'x';
    assert.throws(() => decryptApiKey(encrypted));
  });

  test('decryption fails with tampered authTag', () => {
    const encrypted = encryptApiKey('test-key');
    encrypted.authTag = 'dGFtcGVyZWQ=';
    assert.throws(() => decryptApiKey(encrypted));
  });

  test('handles unicode characters', () => {
    const plaintext = 'key-\u1780\u1781\u1782';
    const encrypted = encryptApiKey(plaintext);
    assert.equal(decryptApiKey(encrypted), plaintext);
  });

  test('throws if master key not set', () => {
    const orig = process.env.ENCRYPTION_MASTER_KEY;
    delete process.env.ENCRYPTION_MASTER_KEY;
    assert.throws(() => encryptApiKey('test'), /ENCRYPTION_MASTER_KEY/);
    process.env.ENCRYPTION_MASTER_KEY = orig;
  });

  test('throws if master key wrong length', () => {
    const orig = process.env.ENCRYPTION_MASTER_KEY;
    process.env.ENCRYPTION_MASTER_KEY = 'short';
    assert.throws(() => encryptApiKey('test'), /64-character/);
    process.env.ENCRYPTION_MASTER_KEY = orig;
  });
});

describe('maskApiKey', () => {
  test('masks long key showing first 4 and last 4', () => {
    const result = maskApiKey('sk-1234567890abcdef');
    assert.ok(result.startsWith('sk-1'));
    assert.ok(result.endsWith('cdef'));
    assert.ok(result.includes('*'));
    assert.ok(!result.includes('567890'));
  });

  test('fully masks short key', () => {
    assert.equal(maskApiKey('short'), '****');
    assert.equal(maskApiKey('12345678'), '****');
  });
});

// ===== SSRF Tests =====
import { isObviouslyPrivate } from '../src/lib/ssrf/protection.js';

describe('SSRF Protection', () => {
  test('detects localhost as private', () => {
    assert.equal(isObviouslyPrivate('http://localhost:8080/api'), true);
  });

  test('detects 127.0.0.1 as private', () => {
    assert.equal(isObviouslyPrivate('http://127.0.0.1:3000'), true);
  });

  test('detects 10.x.x.x as private', () => {
    assert.equal(isObviouslyPrivate('http://10.0.0.1/api'), true);
    assert.equal(isObviouslyPrivate('http://10.255.255.255/api'), true);
  });

  test('detects 172.16.x.x as private', () => {
    assert.equal(isObviouslyPrivate('http://172.16.0.1/api'), true);
  });

  test('detects 192.168.x.x as private', () => {
    assert.equal(isObviouslyPrivate('http://192.168.1.1/api'), true);
  });

  test('detects link-local (169.254) as private', () => {
    assert.equal(isObviouslyPrivate('http://169.254.169.254/metadata'), true);
  });

  test('detects .local domains as private', () => {
    assert.equal(isObviouslyPrivate('http://myservice.local/api'), true);
  });

  test('detects .internal domains as private', () => {
    assert.equal(isObviouslyPrivate('http://api.internal/v1'), true);
  });

  test('allows public IPs', () => {
    assert.equal(isObviouslyPrivate('https://8.8.8.8/api'), false);
    assert.equal(isObviouslyPrivate('https://1.1.1.1/api'), false);
  });

  test('allows public domains', () => {
    assert.equal(isObviouslyPrivate('https://api.openai.com/v1'), false);
  });

  test('treats invalid URLs as unsafe', () => {
    assert.equal(isObviouslyPrivate('not-a-url'), true);
    assert.equal(isObviouslyPrivate(''), true);
  });
});

// ===== Routing Engine Tests =====
import { RoutingEngine, executeWithFallback } from '../src/lib/routing/engine.js';
import type { RoutableProvider } from '../src/lib/routing/engine.js';

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

describe('RoutingEngine', () => {
  const engine = new RoutingEngine();

  test('excludes disabled providers', () => {
    const providers = [
      createMockProvider({ id: '1', enabled: false }),
      createMockProvider({ id: '2', enabled: true }),
    ];
    const result = engine.recommend({ category: 'LLM', mode: 'AUTO' }, providers);
    assert.ok(result);
    assert.equal(result.providerId, '2');
    assert.ok(result.excluded.some((e) => e.providerId === '1'));
  });

  test('excludes unhealthy providers', () => {
    const providers = [
      createMockProvider({ id: '1', health: { status: 'UNHEALTHY', successRate: 0.1 } }),
      createMockProvider({ id: '2', health: { status: 'HEALTHY', successRate: 0.99 } }),
    ];
    const result = engine.recommend({ category: 'LLM', mode: 'AUTO' }, providers);
    assert.ok(result);
    assert.equal(result.providerId, '2');
  });

  test('excludes providers without required language', () => {
    const providers = [
      createMockProvider({ id: '1', languages: ['en-US'] }),
      createMockProvider({ id: '2', languages: ['km-KH', 'en-US'] }),
    ];
    const result = engine.recommend({ category: 'LLM', mode: 'AUTO', language: 'km' }, providers);
    assert.ok(result);
    assert.equal(result.providerId, '2');
  });

  test('returns null when no providers pass filters', () => {
    const providers = [createMockProvider({ id: '1', enabled: false })];
    const result = engine.recommend({ category: 'LLM', mode: 'AUTO' }, providers);
    assert.equal(result, null);
  });

  test('selects highest scoring provider', () => {
    const providers = [
      createMockProvider({ id: '1', priority: 30, health: { status: 'HEALTHY', avgLatencyMs: 2000, successRate: 0.8 } }),
      createMockProvider({ id: '2', priority: 80, health: { status: 'HEALTHY', avgLatencyMs: 200, successRate: 0.99 } }),
    ];
    const result = engine.recommend({ category: 'LLM', mode: 'AUTO' }, providers);
    assert.ok(result);
    assert.equal(result.providerId, '2');
    assert.ok(result.score.total > 0);
  });

  test('prefers fast provider in FASTEST mode', () => {
    const providers = [
      createMockProvider({ id: '1', priority: 90, health: { status: 'HEALTHY', avgLatencyMs: 5000, successRate: 0.99 } }),
      createMockProvider({ id: '2', priority: 30, health: { status: 'HEALTHY', avgLatencyMs: 50, successRate: 0.9 } }),
    ];
    const result = engine.recommend({ category: 'LLM', mode: 'FASTEST' }, providers);
    assert.ok(result);
    assert.equal(result.providerId, '2');
  });

  test('prefers cheap provider in CHEAPEST mode', () => {
    const providers = [
      createMockProvider({ id: '1', costPerRequest: 0.1, priority: 90 }),
      createMockProvider({ id: '2', costPerRequest: 0.0001, priority: 30 }),
    ];
    const result = engine.recommend({ category: 'LLM', mode: 'CHEAPEST' }, providers);
    assert.ok(result);
    assert.equal(result.providerId, '2');
  });

  test('returns locked provider in MANUAL mode', () => {
    const providers = [
      createMockProvider({ id: '1', priority: 90 }),
      createMockProvider({ id: '2', priority: 10 }),
    ];
    const result = engine.recommend({ category: 'LLM', mode: 'MANUAL', lockedProviderId: '2' }, providers);
    assert.ok(result);
    assert.equal(result.providerId, '2');
  });

  test('marks unbenchmarked providers correctly', () => {
    const providers = [createMockProvider({ id: '1' })];
    const result = engine.recommend({ category: 'LLM', mode: 'AUTO' }, providers);
    assert.ok(result);
    assert.equal(result.benchmarked, false);
    assert.ok(result.reasons.includes('Not benchmarked - scores are estimated'));
  });

  test('provides independent LLM and TTS recommendations', () => {
    const llm = [createMockProvider({ id: 'llm-1', category: 'LLM' })];
    const tts = [createMockProvider({ id: 'tts-1', category: 'TTS' })];
    const decision = engine.getDecision(llm, tts, { mode: 'AUTO' });
    assert.ok(decision.llm);
    assert.ok(decision.tts);
    assert.equal(decision.llm.providerId, 'llm-1');
    assert.equal(decision.tts.providerId, 'tts-1');
  });
});

describe('executeWithFallback', () => {
  test('succeeds on first attempt', async () => {
    const result = await executeWithFallback(
      [{ providerId: '1', providerName: 'Test', score: 80 }],
      async () => 'success'
    );
    assert.equal(result.result, 'success');
    assert.equal(result.attempts, 1);
  });

  test('retries and succeeds', async () => {
    let calls = 0;
    const result = await executeWithFallback(
      [{ providerId: '1', providerName: 'Test', score: 80 }],
      async () => {
        calls++;
        if (calls === 1) throw new Error('fail');
        return 'ok';
      },
      { maxRetries: 1, maxProviderAttempts: 3, backoffMs: 1 }
    );
    assert.equal(result.result, 'ok');
    assert.equal(result.attempts, 2);
  });

  test('falls back to next provider', async () => {
    const result = await executeWithFallback(
      [
        { providerId: '1', providerName: 'P1', score: 80 },
        { providerId: '2', providerName: 'P2', score: 60 },
      ],
      async (id) => {
        if (id === '1') throw new Error('fail');
        return 'from-p2';
      },
      { maxRetries: 1, maxProviderAttempts: 3, backoffMs: 1 }
    );
    assert.equal(result.result, 'from-p2');
    assert.equal(result.providerId, '2');
  });

  test('throws when all providers fail', async () => {
    await assert.rejects(
      executeWithFallback(
        [
          { providerId: '1', providerName: 'P1', score: 80 },
          { providerId: '2', providerName: 'P2', score: 60 },
        ],
        async () => { throw new Error('fail'); },
        { maxRetries: 0, maxProviderAttempts: 2, backoffMs: 1 }
      ),
      /All 2 providers failed/
    );
  });
});

// ===== Mock Adapter Tests =====
import { MockLLMAdapter } from '../src/lib/providers/adapters/mock-llm.js';
import { MockTTSAdapter } from '../src/lib/providers/adapters/mock-tts.js';

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
    assert.ok(response.text);
    assert.equal(response.model, 'mock-gpt-4');
    assert.ok(response.usage);
    assert.ok(response.usage.totalTokens > 0);
  });

  test('generates JSON dialogue for json format', async () => {
    const response = await adapter.generateText(
      { prompt: 'Generate', responseFormat: 'json' },
      mockConfig
    );
    const parsed = JSON.parse(response.text);
    assert.ok(parsed.episode);
    assert.ok(parsed.turns);
    assert.ok(parsed.turns.length > 0);
    assert.match(parsed.turns[0].id, /^turn_\d{4}$/);
  });

  test('passes health check', async () => {
    const result = await adapter.healthCheck(mockConfig);
    assert.equal(result.healthy, true);
  });

  test('discovers models', async () => {
    const models = await adapter.discoverModels(mockConfig);
    assert.ok(models.length > 0);
    assert.ok(models[0]!.id);
  });

  test('simulates failure when configured', async () => {
    const fail = new MockLLMAdapter({ shouldFail: true });
    await assert.rejects(fail.generateText({ prompt: 'x' }, mockConfig), /Simulated failure/);
  });
});

describe('MockTTSAdapter', () => {
  const adapter = new MockTTSAdapter({ latencyMs: 1 });

  test('synthesizes audio buffer', async () => {
    const response = await adapter.synthesize(
      { text: 'Hello world test', voiceId: 'mock-km-male-1' },
      mockConfig
    );
    assert.ok(Buffer.isBuffer(response.audio));
    assert.ok(response.audio.length > 44);
    assert.ok(response.durationMs > 0);
    assert.ok(response.sizeBytes > 0);
  });

  test('generates valid WAV header', async () => {
    const response = await adapter.synthesize(
      { text: 'Test', voiceId: 'mock-km-male-1' },
      mockConfig
    );
    assert.equal(response.audio.toString('ascii', 0, 4), 'RIFF');
    assert.equal(response.audio.toString('ascii', 8, 12), 'WAVE');
  });

  test('adjusts duration based on pace', async () => {
    const text = 'This is a test sentence for comparison.';
    const normal = await adapter.synthesize({ text, voiceId: 'v', pace: 'normal' }, mockConfig);
    const slow = await adapter.synthesize({ text, voiceId: 'v', pace: 'slow' }, mockConfig);
    const fast = await adapter.synthesize({ text, voiceId: 'v', pace: 'fast' }, mockConfig);
    assert.ok(slow.durationMs > normal.durationMs);
    assert.ok(fast.durationMs < normal.durationMs);
  });

  test('discovers Khmer voices', async () => {
    const voices = await adapter.discoverVoices(mockConfig);
    assert.ok(voices.length > 0);
    const khmer = voices.filter((v) => v.language?.startsWith('km'));
    assert.ok(khmer.length > 0);
  });

  test('simulates failure when configured', async () => {
    const fail = new MockTTSAdapter({ shouldFail: true });
    await assert.rejects(fail.synthesize({ text: 'x', voiceId: 'y' }, mockConfig), /Simulated failure/);
  });
});

// ===== Khmer Normalization Tests =====
import { normalizeKhmerText } from '../src/lib/normalization/khmer.js';

describe('Khmer Normalization', () => {
  test('preserves original text', () => {
    const result = normalizeKhmerText('Hello 123', 'km');
    assert.equal(result.original, 'Hello 123');
    assert.ok(result.normalized);
  });

  test('detects Khmer-English mix', () => {
    const result = normalizeKhmerText('\u179F\u17BD\u179F\u17D2\u178F\u17B8 Hello', 'km');
    assert.equal(result.hasKhmerEnglishMix, true);
  });

  test('expands percentages in Khmer', () => {
    const result = normalizeKhmerText('50%', 'km');
    assert.ok(result.normalized.includes('\u1797\u17B6\u1782\u179A\u1799'));
    assert.ok(!result.normalized.includes('%'));
  });

  test('normalizes multiple spaces', () => {
    const result = normalizeKhmerText('Hello    world', 'km');
    assert.ok(!result.normalized.includes('  '));
  });

  test('handles empty string', () => {
    const result = normalizeKhmerText('', 'km');
    assert.equal(result.original, '');
    assert.equal(result.normalized, '');
    assert.deepEqual(result.chunks, []);
  });

  test('applies NFC normalization', () => {
    const result = normalizeKhmerText('A\u030A', 'km');
    assert.equal(result.normalized, '\u00C5');
  });
});

console.log('\n All tests defined. Running with Node.js test runner...\n');
