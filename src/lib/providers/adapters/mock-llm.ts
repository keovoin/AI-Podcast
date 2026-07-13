import type {
  LLMAdapter,
  LLMRequest,
  LLMResponse,
  AdapterConfig,
  HealthCheckResult,
  DiscoveredModel,
} from './base';

/**
 * Mock LLM adapter for testing.
 * Generates deterministic responses without requiring external API keys.
 */
export class MockLLMAdapter implements LLMAdapter {
  readonly type = 'MOCK';

  private latencyMs: number;
  private shouldFail: boolean;

  constructor(options?: { latencyMs?: number; shouldFail?: boolean }) {
    this.latencyMs = options?.latencyMs ?? 100;
    this.shouldFail = options?.shouldFail ?? false;
  }

  async generateText(request: LLMRequest, _config: AdapterConfig): Promise<LLMResponse> {
    const start = Date.now();

    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs));

    if (this.shouldFail) {
      throw new Error('Mock LLM: Simulated failure');
    }

    const responseText = this.generateMockResponse(request);
    const latency = Date.now() - start;

    return {
      text: responseText,
      model: 'mock-gpt-4',
      usage: {
        promptTokens: Math.ceil(request.prompt.length / 4),
        completionTokens: Math.ceil(responseText.length / 4),
        totalTokens: Math.ceil((request.prompt.length + responseText.length) / 4),
      },
      latencyMs: latency,
    };
  }

  async healthCheck(_config: AdapterConfig): Promise<HealthCheckResult> {
    const start = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 10));

    if (this.shouldFail) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: 'Mock LLM: Health check failed (simulated)',
      };
    }

    return {
      healthy: true,
      latencyMs: Date.now() - start,
      metadata: { provider: 'mock', version: '1.0.0' },
    };
  }

  async discoverModels(_config: AdapterConfig): Promise<DiscoveredModel[]> {
    return [
      {
        id: 'mock-gpt-4',
        name: 'Mock GPT-4',
        description: 'Mock model for testing dialogue generation',
        capabilities: ['text-generation', 'json-mode', 'multilingual'],
      },
      {
        id: 'mock-gpt-3.5',
        name: 'Mock GPT-3.5',
        description: 'Mock model for testing (faster, cheaper)',
        capabilities: ['text-generation', 'multilingual'],
      },
    ];
  }

  private generateMockResponse(request: LLMRequest): string {
    // Check for outline request first (even with JSON format)
    if (request.prompt.toLowerCase().includes('outline')) {
      return this.generateMockOutline(request.prompt);
    }

    // If JSON format requested, generate structured dialogue
    if (request.responseFormat === 'json') {
      return this.generateMockDialogue(request.prompt);
    }

    return this.generateMockText(request.prompt);
  }

  private generateMockDialogue(prompt: string): string {
    // Extract speaker IDs from prompt if possible
    const speakerMatches = prompt.match(/ID: "([^"]+)"/g);
    const speakerIds = speakerMatches
      ? speakerMatches.map((m) => m.replace('ID: "', '').replace('"', ''))
      : ['speaker_1', 'speaker_2'];
    const s1 = speakerIds[0] || 'speaker_1';
    const s2 = speakerIds[1] || 'speaker_2';

    const dialogue = {
      turns: [
        {
          id: 'turn_0001',
          speaker_id: s1,
          text: 'Welcome to our podcast today. We have an exciting topic to discuss.',
          delivery: { emotion: 'friendly', pace: 'normal', pause_after_ms: 500 },
          source_fact_ids: [],
          estimated_seconds: 5.2,
        },
        {
          id: 'turn_0002',
          speaker_id: s2,
          text: 'Thank you for having me. I am looking forward to sharing my thoughts on this.',
          delivery: { emotion: 'enthusiastic', pace: 'normal', pause_after_ms: 350 },
          source_fact_ids: [],
          estimated_seconds: 4.8,
        },
        {
          id: 'turn_0003',
          speaker_id: s1,
          text: 'Let us start with the basics. Can you explain the core concept for our listeners?',
          delivery: { emotion: 'curious', pace: 'normal', pause_after_ms: 400 },
          source_fact_ids: [],
          estimated_seconds: 5.5,
        },
        {
          id: 'turn_0004',
          speaker_id: s2,
          text: 'Of course. The fundamental idea is quite straightforward once you break it down into components.',
          delivery: { emotion: 'thoughtful', pace: 'normal', pause_after_ms: 300 },
          source_fact_ids: [],
          estimated_seconds: 6.2,
        },
        {
          id: 'turn_0005',
          speaker_id: s1,
          text: 'That is a great point. How does this apply in practice?',
          delivery: { emotion: 'interested', pace: 'normal', pause_after_ms: 350 },
          source_fact_ids: [],
          estimated_seconds: 3.5,
        },
        {
          id: 'turn_0006',
          speaker_id: s2,
          text: 'In practice, we see this pattern emerge across many different domains. Let me give you a concrete example.',
          delivery: { emotion: 'confident', pace: 'normal', pause_after_ms: 400 },
          source_fact_ids: [],
          estimated_seconds: 6.8,
        },
      ],
    };

    return JSON.stringify(dialogue, null, 2);
  }

  private generateMockOutline(_prompt: string): string {
    // Extract speaker IDs from prompt if possible
    const speakerMatches = _prompt.match(/ID: "([^"]+)"/g);
    const speakerIds = speakerMatches
      ? speakerMatches.map((m) => m.replace('ID: "', '').replace('"', ''))
      : ['speaker_1', 'speaker_2'];

    const outline = {
      segments: [
        {
          id: 'seg_1',
          title: 'Introduction',
          duration_seconds: 60,
          lead_speaker_id: speakerIds[0] || 'speaker_1',
          questions: ['What is the topic?', 'Why is it relevant?'],
          locked: false,
        },
        {
          id: 'seg_2',
          title: 'Main Discussion',
          duration_seconds: 180,
          lead_speaker_id: speakerIds[1] || 'speaker_2',
          questions: ['How does it work?', 'What are the implications?'],
          locked: false,
        },
        {
          id: 'seg_3',
          title: 'Conclusion',
          duration_seconds: 60,
          lead_speaker_id: speakerIds[0] || 'speaker_1',
          questions: ['What are the key takeaways?', 'What is next?'],
          locked: false,
        },
      ],
      total_duration_seconds: 300,
    };

    return JSON.stringify(outline, null, 2);
  }

  private generateMockText(_prompt: string): string {
    return 'This is a mock LLM response generated for testing purposes. The actual response would be generated by a real LLM provider based on the given prompt and system instructions.';
  }
}
