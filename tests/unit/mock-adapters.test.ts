import { describe, it, expect } from 'vitest';
import { MockLLMAdapter } from '@/lib/providers/adapters/mock-llm';
import { MockTTSAdapter } from '@/lib/providers/adapters/mock-tts';
import type { AdapterConfig } from '@/lib/providers/adapters/base';

const mockConfig: AdapterConfig = {
  baseUrl: 'http://localhost:8080',
  apiKey: 'mock-key',
  model: 'mock-model',
  authType: 'BEARER',
  timeoutMs: 30000,
};

describe('MockLLMAdapter', () => {
  const adapter = new MockLLMAdapter({ latencyMs: 10 });

  it('should have type MOCK', () => {
    expect(adapter.type).toBe('MOCK');
  });

  it('should generate text response', async () => {
    const response = await adapter.generateText(
      { prompt: 'Test prompt' },
      mockConfig
    );

    expect(response.text).toBeTruthy();
    expect(response.model).toBe('mock-gpt-4');
    expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    expect(response.usage).toBeDefined();
    expect(response.usage!.totalTokens).toBeGreaterThan(0);
  });

  it('should generate JSON dialogue when responseFormat is json', async () => {
    const response = await adapter.generateText(
      { prompt: 'Generate dialogue', responseFormat: 'json' },
      mockConfig
    );

    const parsed = JSON.parse(response.text);
    expect(parsed.episode).toBeDefined();
    expect(parsed.episode.title).toBeTruthy();
    expect(parsed.turns).toBeInstanceOf(Array);
    expect(parsed.turns.length).toBeGreaterThan(0);

    // Validate turn structure
    const turn = parsed.turns[0];
    expect(turn.id).toMatch(/^turn_\d{4}$/);
    expect(turn.speaker_id).toBeTruthy();
    expect(turn.text).toBeTruthy();
    expect(turn.delivery).toBeDefined();
    expect(turn.delivery.emotion).toBeTruthy();
    expect(turn.delivery.pace).toBeTruthy();
    expect(turn.delivery.pause_after_ms).toBeGreaterThanOrEqual(0);
    expect(turn.source_fact_ids).toBeInstanceOf(Array);
    expect(turn.estimated_seconds).toBeGreaterThan(0);
  });

  it('should generate outline when prompt contains outline', async () => {
    const response = await adapter.generateText(
      { prompt: 'Generate an outline for the episode' },
      mockConfig
    );

    const parsed = JSON.parse(response.text);
    expect(parsed.segments).toBeInstanceOf(Array);
    expect(parsed.total_duration_seconds).toBeGreaterThan(0);
  });

  it('should pass health check', async () => {
    const result = await adapter.healthCheck(mockConfig);
    expect(result.healthy).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should discover mock models', async () => {
    const models = await adapter.discoverModels(mockConfig);
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]!.id).toBeTruthy();
    expect(models[0]!.name).toBeTruthy();
  });

  it('should simulate failure when configured', async () => {
    const failAdapter = new MockLLMAdapter({ shouldFail: true });

    await expect(
      failAdapter.generateText({ prompt: 'test' }, mockConfig)
    ).rejects.toThrow('Simulated failure');

    const health = await failAdapter.healthCheck(mockConfig);
    expect(health.healthy).toBe(false);
    expect(health.error).toBeTruthy();
  });
});

describe('MockTTSAdapter', () => {
  const adapter = new MockTTSAdapter({ latencyMs: 10 });

  it('should have type MOCK', () => {
    expect(adapter.type).toBe('MOCK');
  });

  it('should synthesize audio from text', async () => {
    const response = await adapter.synthesize(
      {
        text: 'Hello, this is a test of the text to speech system.',
        voiceId: 'mock-km-male-1',
        language: 'km-KH',
      },
      mockConfig
    );

    expect(response.audio).toBeInstanceOf(Buffer);
    expect(response.audio.length).toBeGreaterThan(44); // > WAV header
    expect(response.durationMs).toBeGreaterThan(0);
    expect(response.sizeBytes).toBeGreaterThan(0);
    expect(response.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should generate valid WAV headers', async () => {
    const response = await adapter.synthesize(
      { text: 'Test', voiceId: 'mock-km-male-1' },
      mockConfig
    );

    const audio = response.audio;
    // Check RIFF header
    expect(audio.toString('ascii', 0, 4)).toBe('RIFF');
    expect(audio.toString('ascii', 8, 12)).toBe('WAVE');
    expect(audio.toString('ascii', 12, 16)).toBe('fmt ');
    expect(audio.toString('ascii', 36, 40)).toBe('data');
  });

  it('should adjust duration based on pace', async () => {
    const text = 'This is a test sentence for pace comparison.';

    const normalResponse = await adapter.synthesize(
      { text, voiceId: 'mock-km-male-1', pace: 'normal' },
      mockConfig
    );

    const slowResponse = await adapter.synthesize(
      { text, voiceId: 'mock-km-male-1', pace: 'slow' },
      mockConfig
    );

    const fastResponse = await adapter.synthesize(
      { text, voiceId: 'mock-km-male-1', pace: 'fast' },
      mockConfig
    );

    expect(slowResponse.durationMs).toBeGreaterThan(normalResponse.durationMs);
    expect(fastResponse.durationMs).toBeLessThan(normalResponse.durationMs);
  });

  it('should pass health check', async () => {
    const result = await adapter.healthCheck(mockConfig);
    expect(result.healthy).toBe(true);
  });

  it('should discover mock voices', async () => {
    const voices = await adapter.discoverVoices(mockConfig);
    expect(voices.length).toBeGreaterThan(0);

    // Should include Khmer voices
    const khmerVoices = voices.filter((v) => v.language?.startsWith('km'));
    expect(khmerVoices.length).toBeGreaterThan(0);
  });

  it('should simulate failure when configured', async () => {
    const failAdapter = new MockTTSAdapter({ shouldFail: true });

    await expect(
      failAdapter.synthesize(
        { text: 'test', voiceId: 'mock' },
        mockConfig
      )
    ).rejects.toThrow('Simulated failure');
  });
});
