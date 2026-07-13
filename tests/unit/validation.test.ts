import { describe, it, expect } from 'vitest';
import {
  providerCreateSchema,
  routingRequestSchema,
  dialogueTurnSchema,
  episodeDialogueSchema,
} from '@/lib/validation/schemas';

describe('Provider Validation', () => {
  it('should accept valid provider input', () => {
    const input = {
      name: 'OpenAI',
      category: 'LLM',
      adapterType: 'OPENAI_COMPATIBLE',
      baseUrl: 'https://api.openai.com',
      endpointPath: '/v1/chat/completions',
      apiKey: 'sk-test123',
      model: 'gpt-4',
      authType: 'BEARER',
      timeoutMs: 30000,
    };

    const result = providerCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject missing required fields', () => {
    const input = { name: '' };
    const result = providerCreateSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject invalid URL', () => {
    const input = {
      name: 'Test',
      category: 'LLM',
      adapterType: 'OPENAI_COMPATIBLE',
      baseUrl: 'not-a-url',
    };
    const result = providerCreateSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject timeout below minimum', () => {
    const input = {
      name: 'Test',
      category: 'LLM',
      adapterType: 'OPENAI_COMPATIBLE',
      timeoutMs: 500,
    };
    const result = providerCreateSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject timeout above maximum', () => {
    const input = {
      name: 'Test',
      category: 'LLM',
      adapterType: 'OPENAI_COMPATIBLE',
      timeoutMs: 200000,
    };
    const result = providerCreateSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject invalid category', () => {
    const input = {
      name: 'Test',
      category: 'INVALID',
      adapterType: 'OPENAI_COMPATIBLE',
    };
    const result = providerCreateSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should accept minimal valid input with defaults', () => {
    const input = {
      name: 'Minimal Provider',
      category: 'TTS',
      adapterType: 'AZURE_SPEECH',
    };
    const result = providerCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeoutMs).toBe(30000);
      expect(result.data.enabled).toBe(true);
      expect(result.data.priority).toBe(50);
      expect(result.data.authType).toBe('BEARER');
    }
  });
});

describe('Routing Request Validation', () => {
  it('should accept valid routing request', () => {
    const input = {
      category: 'LLM',
      mode: 'AUTO',
      language: 'km',
    };
    const result = routingRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid mode', () => {
    const input = {
      category: 'LLM',
      mode: 'INVALID_MODE',
    };
    const result = routingRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should default mode to AUTO', () => {
    const input = { category: 'TTS' };
    const result = routingRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe('AUTO');
    }
  });
});

describe('Dialogue Turn Validation', () => {
  it('should accept valid dialogue turn', () => {
    const turn = {
      id: 'turn_0001',
      speaker_id: 'speaker_1',
      text: 'Hello, welcome to the podcast.',
      delivery: {
        emotion: 'friendly',
        pace: 'normal',
        pause_after_ms: 350,
      },
      source_fact_ids: [],
      estimated_seconds: 3.5,
    };
    const result = dialogueTurnSchema.safeParse(turn);
    expect(result.success).toBe(true);
  });

  it('should reject invalid turn ID format', () => {
    const turn = {
      id: 'invalid_id',
      speaker_id: 'speaker_1',
      text: 'Hello',
      delivery: { emotion: 'friendly', pace: 'normal', pause_after_ms: 350 },
      source_fact_ids: [],
      estimated_seconds: 3.5,
    };
    const result = dialogueTurnSchema.safeParse(turn);
    expect(result.success).toBe(false);
  });

  it('should reject empty text', () => {
    const turn = {
      id: 'turn_0001',
      speaker_id: 'speaker_1',
      text: '',
      delivery: { emotion: 'friendly', pace: 'normal', pause_after_ms: 350 },
      source_fact_ids: [],
      estimated_seconds: 3.5,
    };
    const result = dialogueTurnSchema.safeParse(turn);
    expect(result.success).toBe(false);
  });

  it('should reject invalid pace', () => {
    const turn = {
      id: 'turn_0001',
      speaker_id: 'speaker_1',
      text: 'Hello',
      delivery: { emotion: 'friendly', pace: 'invalid', pause_after_ms: 350 },
      source_fact_ids: [],
      estimated_seconds: 3.5,
    };
    const result = dialogueTurnSchema.safeParse(turn);
    expect(result.success).toBe(false);
  });
});

describe('Episode Dialogue Validation', () => {
  it('should accept valid episode dialogue', () => {
    const dialogue = {
      episode: {
        title: 'Test Episode',
        language: 'km',
        target_duration_seconds: 300,
      },
      turns: [
        {
          id: 'turn_0001',
          speaker_id: 'speaker_1',
          text: 'Hello',
          delivery: { emotion: 'friendly', pace: 'normal', pause_after_ms: 350 },
          source_fact_ids: [],
          estimated_seconds: 3.5,
        },
        {
          id: 'turn_0002',
          speaker_id: 'speaker_2',
          text: 'Hi there',
          delivery: { emotion: 'enthusiastic', pace: 'normal', pause_after_ms: 300 },
          source_fact_ids: [],
          estimated_seconds: 2.5,
        },
      ],
    };
    const result = episodeDialogueSchema.safeParse(dialogue);
    expect(result.success).toBe(true);
  });

  it('should reject dialogue with less than 2 turns', () => {
    const dialogue = {
      episode: {
        title: 'Test',
        language: 'km',
        target_duration_seconds: 300,
      },
      turns: [
        {
          id: 'turn_0001',
          speaker_id: 'speaker_1',
          text: 'Hello',
          delivery: { emotion: 'friendly', pace: 'normal', pause_after_ms: 350 },
          source_fact_ids: [],
          estimated_seconds: 3.5,
        },
      ],
    };
    const result = episodeDialogueSchema.safeParse(dialogue);
    expect(result.success).toBe(false);
  });

  it('should reject duration below minimum', () => {
    const dialogue = {
      episode: {
        title: 'Test',
        language: 'km',
        target_duration_seconds: 10, // Below 30s minimum
      },
      turns: [
        { id: 'turn_0001', speaker_id: 's1', text: 'Hi', delivery: { emotion: 'friendly', pace: 'normal', pause_after_ms: 0 }, source_fact_ids: [], estimated_seconds: 1 },
        { id: 'turn_0002', speaker_id: 's2', text: 'Hey', delivery: { emotion: 'friendly', pace: 'normal', pause_after_ms: 0 }, source_fact_ids: [], estimated_seconds: 1 },
      ],
    };
    const result = episodeDialogueSchema.safeParse(dialogue);
    expect(result.success).toBe(false);
  });
});
