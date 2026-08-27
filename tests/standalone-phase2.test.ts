/**
 * Phase 2 tests: Dialogue validation, audio composition, transcript, show notes, ZIP export.
 * Run with: bun test tests/standalone-phase2.test.ts
 */
import { describe, test, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.ENCRYPTION_MASTER_KEY = 'a'.repeat(64);
});

// ===== Dialogue Validator Tests =====
import { validateDialogue } from '../src/lib/validation/dialogue-validator';
import type { DialogueTurn, ValidationContext } from '../src/lib/validation/dialogue-validator';

function makeTurn(overrides: Partial<DialogueTurn> = {}, index: number = 0): DialogueTurn {
  return {
    id: `turn_${String(index + 1).padStart(4, '0')}`,
    turnIndex: index,
    speakerId: index % 2 === 0 ? 'speaker_1' : 'speaker_2',
    text: `This is turn number ${index + 1} with some content to validate.`,
    delivery: { emotion: 'friendly', pace: 'normal', pause_after_ms: 350 },
    sourceFactIds: [],
    estimatedSeconds: 5 + index * 0.5,
    ...overrides,
  };
}

const baseContext: ValidationContext = {
  speakerIds: ['speaker_1', 'speaker_2'],
  factIds: ['fact_1', 'fact_2'],
  targetDurationSeconds: 60,
  language: 'km',
};

describe('DialogueValidator - Schema', () => {
  test('passes valid dialogue', () => {
    const turns = [makeTurn({}, 0), makeTurn({}, 1), makeTurn({}, 2), makeTurn({}, 3)];
    const result = validateDialogue(turns, baseContext);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  test('fails with fewer than 2 turns', () => {
    const turns = [makeTurn({}, 0)];
    const result = validateDialogue(turns, baseContext);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.category === 'schema')).toBe(true);
  });

  test('fails with empty text', () => {
    const turns = [makeTurn({ text: '' }, 0), makeTurn({}, 1)];
    const result = validateDialogue(turns, baseContext);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('empty text'))).toBe(true);
  });

  test('fails with missing speaker ID', () => {
    const turns = [makeTurn({ speakerId: '' }, 0), makeTurn({}, 1)];
    const result = validateDialogue(turns, baseContext);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.category === 'schema' && e.message.includes('no speaker_id'))).toBe(true);
  });

  test('warns on invalid pace', () => {
    const turns = [makeTurn({ delivery: { emotion: 'friendly', pace: 'turbo', pause_after_ms: 350 } }, 0), makeTurn({}, 1)];
    const result = validateDialogue(turns, baseContext);
    expect(result.warnings.some(w => w.message.includes('pace'))).toBe(true);
  });

  test('warns on very long pause', () => {
    const turns = [makeTurn({ delivery: { emotion: 'friendly', pace: 'normal', pause_after_ms: 8000 } }, 0), makeTurn({}, 1)];
    const result = validateDialogue(turns, baseContext);
    expect(result.warnings.some(w => w.message.includes('long'))).toBe(true);
  });
});

describe('DialogueValidator - Repetition', () => {
  test('errors on identical consecutive turns', () => {
    const turns = [
      makeTurn({ text: 'Exactly the same text' }, 0),
      makeTurn({ text: 'Exactly the same text' }, 1),
    ];
    const result = validateDialogue(turns, baseContext);
    expect(result.errors.some(e => e.category === 'repetition')).toBe(true);
  });

  test('warns on excessive agreement phrases', () => {
    const turns = Array.from({ length: 10 }, (_, i) =>
      makeTurn({ text: i % 2 === 0 ? 'That is a great point, I completely agree.' : 'Normal text here.' }, i)
    );
    const result = validateDialogue(turns, baseContext);
    expect(result.warnings.some(w => w.category === 'repetition' && w.message.includes('agreement'))).toBe(true);
  });
});

describe('DialogueValidator - Duration', () => {
  test('warns when estimated duration is too short', () => {
    const turns = [
      makeTurn({ estimatedSeconds: 2 }, 0),
      makeTurn({ estimatedSeconds: 2 }, 1),
    ];
    const ctx = { ...baseContext, targetDurationSeconds: 300 };
    const result = validateDialogue(turns, ctx);
    expect(result.warnings.some(w => w.category === 'duration' && w.message.includes('shorter'))).toBe(true);
  });

  test('warns when estimated duration is too long', () => {
    const turns = Array.from({ length: 10 }, (_, i) => makeTurn({ estimatedSeconds: 100 }, i));
    const ctx = { ...baseContext, targetDurationSeconds: 60 };
    const result = validateDialogue(turns, ctx);
    expect(result.warnings.some(w => w.category === 'duration' && w.message.includes('exceeds'))).toBe(true);
  });

  test('warns on very long individual turns', () => {
    const turns = [makeTurn({ estimatedSeconds: 90 }, 0), makeTurn({}, 1)];
    const result = validateDialogue(turns, baseContext);
    expect(result.warnings.some(w => w.category === 'duration' && w.message.includes('splitting'))).toBe(true);
  });
});

describe('DialogueValidator - Speaker', () => {
  test('errors on unknown speaker ID', () => {
    const turns = [makeTurn({ speakerId: 'ghost_speaker' }, 0), makeTurn({}, 1)];
    const result = validateDialogue(turns, baseContext);
    expect(result.errors.some(e => e.category === 'speaker' && e.message.includes('Unknown'))).toBe(true);
  });

  test('warns when a speaker has no turns', () => {
    const turns = [makeTurn({ speakerId: 'speaker_1' }, 0), makeTurn({ speakerId: 'speaker_1' }, 1)];
    const ctx = { ...baseContext, speakerIds: ['speaker_1', 'speaker_2', 'speaker_3'] };
    const result = validateDialogue(turns, ctx);
    expect(result.warnings.some(w => w.category === 'speaker' && w.message.includes('no turns'))).toBe(true);
  });
});

describe('DialogueValidator - Facts', () => {
  test('errors on non-existent fact reference', () => {
    const turns = [makeTurn({ sourceFactIds: ['fact_999'] }, 0), makeTurn({}, 1)];
    const result = validateDialogue(turns, baseContext);
    expect(result.errors.some(e => e.category === 'fact' && e.message.includes('non-existent'))).toBe(true);
  });

  test('warns about unused available facts', () => {
    const turns = [makeTurn({ sourceFactIds: ['fact_1'] }, 0), makeTurn({}, 1)];
    const result = validateDialogue(turns, baseContext);
    expect(result.warnings.some(w => w.category === 'fact' && w.message.includes('not referenced'))).toBe(true);
  });

  test('passes with no facts available and no references', () => {
    const turns = [makeTurn({}, 0), makeTurn({}, 1)];
    const ctx = { ...baseContext, factIds: [] };
    const result = validateDialogue(turns, ctx);
    expect(result.errors.filter(e => e.category === 'fact').length).toBe(0);
  });
});

describe('DialogueValidator - Stats', () => {
  test('computes correct stats', () => {
    const turns = [
      makeTurn({ speakerId: 'speaker_1', estimatedSeconds: 5 }, 0),
      makeTurn({ speakerId: 'speaker_2', estimatedSeconds: 8 }, 1),
      makeTurn({ speakerId: 'speaker_1', estimatedSeconds: 3 }, 2),
      makeTurn({ speakerId: 'speaker_2', estimatedSeconds: 6 }, 3),
    ];
    const result = validateDialogue(turns, baseContext);
    expect(result.stats.turnCount).toBe(4);
    expect(result.stats.totalEstimatedSeconds).toBe(22);
    expect(result.stats.speakerDistribution['speaker_1']!.turns).toBe(2);
    expect(result.stats.speakerDistribution['speaker_2']!.turns).toBe(2);
    expect(result.stats.longestTurn).toBe(8);
    expect(result.stats.shortestTurn).toBe(3);
  });
});

// ===== Audio Composition Tests =====
import { composeAudioClips, generateClipCacheKey } from '../src/lib/audio/composition';
import type { AudioClipInput } from '../src/lib/audio/composition';
import { MockTTSAdapter } from '../src/lib/providers/adapters/mock-tts';

describe('Audio Composition', () => {
  test('handles empty clip array', () => {
    const result = composeAudioClips([]);
    expect(result.totalDurationMs).toBe(0);
    expect(result.timestamps.length).toBe(0);
    expect(result.audio.length).toBe(0);
  });

  test('composes multiple clips with correct timestamps', async () => {
    const adapter = new MockTTSAdapter({ latencyMs: 1 });
    const config = { baseUrl: '', apiKey: '', authType: 'NONE', timeoutMs: 30000 };

    const clip1 = await adapter.synthesize({ text: 'Hello world testing one', voiceId: 'v1' }, config);
    const clip2 = await adapter.synthesize({ text: 'Second clip here', voiceId: 'v2' }, config);

    const clips: AudioClipInput[] = [
      { turnIndex: 0, speakerId: 's1', audio: clip1.audio, durationMs: clip1.durationMs, pauseAfterMs: 300 },
      { turnIndex: 1, speakerId: 's2', audio: clip2.audio, durationMs: clip2.durationMs, pauseAfterMs: 300 },
    ];

    const result = composeAudioClips(clips);

    // Check timestamps
    expect(result.timestamps.length).toBe(2);
    expect(result.timestamps[0]!.turnIndex).toBe(0);
    expect(result.timestamps[0]!.startMs).toBe(0);
    expect(result.timestamps[0]!.endMs).toBe(clip1.durationMs);
    expect(result.timestamps[1]!.startMs).toBe(clip1.durationMs + 300);

    // Total duration includes pauses
    expect(result.totalDurationMs).toBe(clip1.durationMs + 300 + clip2.durationMs + 300);

    // Valid WAV header
    expect(result.audio.toString('ascii', 0, 4)).toBe('RIFF');
    expect(result.audio.toString('ascii', 8, 12)).toBe('WAVE');
  });

  test('sorts clips by turn index', async () => {
    const adapter = new MockTTSAdapter({ latencyMs: 1 });
    const config = { baseUrl: '', apiKey: '', authType: 'NONE', timeoutMs: 30000 };

    const clip1 = await adapter.synthesize({ text: 'First clip', voiceId: 'v1' }, config);
    const clip2 = await adapter.synthesize({ text: 'Second clip', voiceId: 'v2' }, config);

    // Add in reverse order
    const clips: AudioClipInput[] = [
      { turnIndex: 1, speakerId: 's2', audio: clip2.audio, durationMs: clip2.durationMs, pauseAfterMs: 200 },
      { turnIndex: 0, speakerId: 's1', audio: clip1.audio, durationMs: clip1.durationMs, pauseAfterMs: 200 },
    ];

    const result = composeAudioClips(clips);
    expect(result.timestamps[0]!.turnIndex).toBe(0);
    expect(result.timestamps[1]!.turnIndex).toBe(1);
  });
});

describe('Clip Cache Key', () => {
  test('generates deterministic hash', () => {
    const key1 = generateClipCacheKey('provider1', 'voice1', 'hello', 'normal', 'friendly');
    const key2 = generateClipCacheKey('provider1', 'voice1', 'hello', 'normal', 'friendly');
    expect(key1).toBe(key2);
    expect(key1.length).toBe(64); // SHA-256 hex
  });

  test('different inputs produce different keys', () => {
    const key1 = generateClipCacheKey('p1', 'v1', 'hello', 'normal', 'friendly');
    const key2 = generateClipCacheKey('p1', 'v1', 'hello', 'fast', 'friendly');
    const key3 = generateClipCacheKey('p1', 'v1', 'different text', 'normal', 'friendly');
    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
  });
});

// ===== Transcript Tests =====
import { generateTranscript } from '../src/lib/export/transcript';

describe('Transcript Generation', () => {
  const turns = [
    { turnIndex: 0, speakerId: 's1', text: 'Hello everyone, welcome.' },
    { turnIndex: 1, speakerId: 's2', text: 'Thanks for having me.' },
    { turnIndex: 2, speakerId: 's1', text: 'Let us begin.' },
  ];

  const timestamps = [
    { turnIndex: 0, startMs: 0, endMs: 3000 },
    { turnIndex: 1, startMs: 3300, endMs: 5500 },
    { turnIndex: 2, startMs: 5800, endMs: 7200 },
  ];

  const names: Record<string, string> = { s1: 'Piseth', s2: 'Sreymom' };

  test('generates correct entry count', () => {
    const result = generateTranscript(turns, timestamps, names);
    expect(result.entries.length).toBe(3);
  });

  test('maps speaker names', () => {
    const result = generateTranscript(turns, timestamps, names);
    expect(result.entries[0]!.speakerName).toBe('Piseth');
    expect(result.entries[1]!.speakerName).toBe('Sreymom');
  });

  test('includes correct timestamps', () => {
    const result = generateTranscript(turns, timestamps, names);
    expect(result.entries[0]!.startMs).toBe(0);
    expect(result.entries[0]!.endMs).toBe(3000);
    expect(result.entries[1]!.startMs).toBe(3300);
  });

  test('generates valid SRT format', () => {
    const result = generateTranscript(turns, timestamps, names);
    expect(result.srt).toContain('1\n');
    expect(result.srt).toContain('00:00:00,000 --> 00:00:03,000');
    expect(result.srt).toContain('[Piseth]');
    expect(result.srt).toContain('Hello everyone, welcome.');
  });

  test('generates valid VTT format', () => {
    const result = generateTranscript(turns, timestamps, names);
    expect(result.vtt).toMatch(/^WEBVTT/);
    expect(result.vtt).toContain('00:00:00.000 --> 00:00:03.000');
    expect(result.vtt).toContain('<v Piseth>');
  });

  test('generates valid JSON', () => {
    const result = generateTranscript(turns, timestamps, names);
    const parsed = JSON.parse(result.json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(3);
  });
});

// ===== Show Notes Tests =====
import { generateShowNotes } from '../src/lib/export/show-notes';

describe('Show Notes Generation', () => {
  const segments = [
    { id: 'seg_1', title: 'Introduction', duration_seconds: 30 },
    { id: 'seg_2', title: 'Main Discussion', duration_seconds: 120 },
    { id: 'seg_3', title: 'Conclusion', duration_seconds: 30 },
  ];

  const timestamps = [
    { turnIndex: 0, startMs: 0, endMs: 5000 },
    { turnIndex: 1, startMs: 5300, endMs: 10000 },
    { turnIndex: 2, startMs: 10300, endMs: 15000 },
    { turnIndex: 3, startMs: 15300, endMs: 20000 },
    { turnIndex: 4, startMs: 20300, endMs: 25000 },
    { turnIndex: 5, startMs: 25300, endMs: 30000 },
  ];

  const turns = [
    { turnIndex: 0, text: 'Welcome to the show today.', sourceFactIds: [] },
    { turnIndex: 1, text: 'Thanks for having me here.', sourceFactIds: [] },
    { turnIndex: 2, text: 'Cambodia has seen rapid AI adoption.', sourceFactIds: ['fact_1'] },
    { turnIndex: 3, text: 'That is an interesting observation.', sourceFactIds: [] },
    { turnIndex: 4, text: 'In conclusion, AI will continue to grow in Cambodia.', sourceFactIds: ['fact_1'] },
    { turnIndex: 5, text: 'Thank you for watching, please subscribe.', sourceFactIds: [] },
  ];

  const facts = [
    { id: 'fact_1', content: 'Cambodia AI market grew 40% in 2025' },
    { id: 'fact_2', content: 'Unused fact here' },
  ];

  test('generates chapters from segments', () => {
    const result = generateShowNotes(segments, timestamps, turns, facts, 'AI Cambodia', 'AI growth');
    expect(result.chapters.length).toBe(3);
    expect(result.chapters[0]!.title).toBe('Introduction');
    expect(result.chapters[0]!.startFormatted).toBeTruthy();
  });

  test('generates summary', () => {
    const result = generateShowNotes(segments, timestamps, turns, facts, 'AI Cambodia', 'AI growth');
    expect(result.summary).toContain('AI Cambodia');
    expect(result.summary.length).toBeGreaterThan(10);
  });

  test('extracts takeaways', () => {
    const result = generateShowNotes(segments, timestamps, turns, facts, 'AI Cambodia');
    expect(result.takeaways.length).toBeGreaterThan(0);
    expect(result.takeaways.length).toBeLessThanOrEqual(5);
  });

  test('builds fact reference list', () => {
    const result = generateShowNotes(segments, timestamps, turns, facts, 'AI Cambodia');
    expect(result.factList.length).toBe(1); // Only fact_1 is referenced
    expect(result.factList[0]!.id).toBe('fact_1');
    expect(result.factList[0]!.turnIndices).toContain(2);
    expect(result.factList[0]!.turnIndices).toContain(4);
  });

  test('includes AI disclosure', () => {
    const result = generateShowNotes(segments, timestamps, turns, facts, 'AI Cambodia');
    expect(result.aiDisclosure).toContain('AI');
    expect(result.aiDisclosure.length).toBeGreaterThan(20);
  });
});

// ===== ZIP Builder Tests =====
import { buildExportZip } from '../src/lib/export/zip-builder';
import type { ExportManifest } from '../src/lib/export/zip-builder';

describe('ZIP Builder', () => {
  const mockTranscript = {
    entries: [{ index: 0, speakerId: 's1', speakerName: 'Host', text: 'Hello', startMs: 0, endMs: 3000 }],
    json: JSON.stringify([{ index: 0, text: 'Hello' }]),
    srt: '1\n00:00:00,000 --> 00:00:03,000\n[Host]\nHello\n',
    vtt: 'WEBVTT\n\n00:00:00.000 --> 00:00:03.000\n<v Host>Hello\n',
  };

  const mockShowNotes = {
    summary: 'A test episode.',
    chapters: [{ title: 'Intro', startMs: 0, endMs: 3000, startFormatted: '0:00' }],
    takeaways: ['AI is growing.'],
    factList: [],
    aiDisclosure: 'This content was AI-generated.',
  };

  const mockManifest: ExportManifest = {
    version: '1.0.0',
    title: 'Test Episode',
    language: 'km',
    generatedAt: new Date().toISOString(),
    duration: { totalMs: 3000, formatted: '0:03' },
    files: [],
    providers: { llm: { name: 'Mock' }, tts: { name: 'Mock', voiceIds: ['v1'] } },
    aiDisclosure: 'AI-generated.',
    turnCount: 1,
    speakerCount: 1,
  };

  test('produces a valid ZIP buffer', () => {
    const result = buildExportZip({
      title: 'Test Episode',
      language: 'km',
      transcript: mockTranscript,
      showNotes: mockShowNotes,
      manifest: mockManifest,
    });

    // ZIP magic number: PK\x03\x04
    expect(result.zipBuffer[0]).toBe(0x50); // P
    expect(result.zipBuffer[1]).toBe(0x4b); // K
    expect(result.zipBuffer[2]).toBe(0x03);
    expect(result.zipBuffer[3]).toBe(0x04);
  });

  test('includes all expected files', () => {
    const result = buildExportZip({
      title: 'Test Episode',
      language: 'km',
      audio: Buffer.from('fake-audio'),
      transcript: mockTranscript,
      showNotes: mockShowNotes,
      manifest: mockManifest,
    });

    // ZIP should be larger with audio included
    expect(result.zipBuffer.length).toBeGreaterThan(100);
    expect(result.fileName).toContain('Test_Episode');
    expect(result.fileName).toMatch(/.zip$/);
  });

  test('generates safe filename', () => {
    const result = buildExportZip({
      title: 'Episode with Special Ch@rs!!! & Stuff',
      language: 'km',
      transcript: mockTranscript,
      showNotes: mockShowNotes,
      manifest: mockManifest,
    });
    expect(result.fileName).not.toContain('@');
    expect(result.fileName).not.toContain('!');
    expect(result.fileName).not.toContain('&');
  });

  test('works without audio', () => {
    const result = buildExportZip({
      title: 'No Audio',
      language: 'km',
      transcript: mockTranscript,
      showNotes: mockShowNotes,
      manifest: mockManifest,
    });
    expect(result.zipBuffer.length).toBeGreaterThan(0);
    expect(result.zipBuffer[0]).toBe(0x50); // Still valid ZIP
  });
});
