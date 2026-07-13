import { describe, test, expect } from 'bun:test';
import {
  extractTurns,
  extractSegments,
  normalizeTurns,
  parseLLMJson,
  extractBalanced,
} from '../src/lib/parsing/llm-output';

const speakers = [
  { id: 'cuid-host-abc', name: 'Piseth' },
  { id: 'cuid-guest-xyz', name: 'Sreymom' },
];

describe('extractBalanced', () => {
  test('extracts balanced object', () => {
    expect(extractBalanced('{"a":1} trailing')).toBe('{"a":1}');
  });
  test('handles braces inside strings', () => {
    expect(extractBalanced('{"a":"}{"} x')).toBe('{"a":"}{"}');
  });
  test('extracts balanced array', () => {
    expect(extractBalanced('[1,2,3] extra')).toBe('[1,2,3]');
  });
});

describe('parseLLMJson', () => {
  test('parses plain JSON', () => {
    expect(parseLLMJson('{"x":1}')).toEqual({ x: 1 });
  });
  test('strips markdown fences', () => {
    expect(parseLLMJson('```json\n{"x":2}\n```')).toEqual({ x: 2 });
  });
  test('ignores surrounding prose', () => {
    expect(parseLLMJson('Here is your JSON: {"x":3} Hope that helps!')).toEqual({ x: 3 });
  });
});

describe('extractTurns', () => {
  test('handles {turns: [...]}', () => {
    const r = extractTurns('{"turns":[{"text":"a"},{"text":"b"}]}');
    expect(r.length).toBe(2);
  });
  test('handles direct array', () => {
    const r = extractTurns('[{"text":"a"},{"text":"b"}]');
    expect(r.length).toBe(2);
  });
  test('handles episode.turns nesting', () => {
    const r = extractTurns('{"episode":{"turns":[{"text":"a"},{"text":"b"}]}}');
    expect(r.length).toBe(2);
  });
  test('handles alternate key "dialogue"', () => {
    const r = extractTurns('{"dialogue":[{"text":"a"},{"text":"b"}]}');
    expect(r.length).toBe(2);
  });
  test('handles markdown-fenced turns', () => {
    const r = extractTurns('```json\n{"turns":[{"text":"a"},{"text":"b"},{"text":"c"}]}\n```');
    expect(r.length).toBe(3);
  });
  test('returns empty for no array', () => {
    expect(extractTurns('{"message":"no turns here"}').length).toBe(0);
  });
});

describe('extractSegments', () => {
  test('handles {segments: [...]}', () => {
    expect(extractSegments('{"segments":[{"title":"Intro"}]}').length).toBe(1);
  });
  test('handles alternate key "sections"', () => {
    expect(extractSegments('{"sections":[{"title":"A"},{"title":"B"}]}').length).toBe(2);
  });
  test('handles direct array', () => {
    expect(extractSegments('[{"title":"A"}]').length).toBe(1);
  });
});

describe('normalizeTurns - speaker mapping', () => {
  test('maps exact CUID', () => {
    const r = normalizeTurns([
      { speaker_id: 'cuid-host-abc', text: 'hi' },
      { speaker_id: 'cuid-guest-xyz', text: 'hello' },
    ], speakers);
    expect(r[0]!.speakerId).toBe('cuid-host-abc');
    expect(r[1]!.speakerId).toBe('cuid-guest-xyz');
  });

  test('maps by speaker name', () => {
    const r = normalizeTurns([
      { speaker: 'Piseth', text: 'hi' },
      { speaker: 'Sreymom', text: 'hello' },
    ], speakers);
    expect(r[0]!.speakerId).toBe('cuid-host-abc');
    expect(r[1]!.speakerId).toBe('cuid-guest-xyz');
  });

  test('maps positional speaker_1 / speaker_2', () => {
    const r = normalizeTurns([
      { speaker_id: 'speaker_1', text: 'hi' },
      { speaker_id: 'speaker_2', text: 'hello' },
    ], speakers);
    expect(r[0]!.speakerId).toBe('cuid-host-abc');
    expect(r[1]!.speakerId).toBe('cuid-guest-xyz');
  });

  test('alternates speakers when unknown', () => {
    const r = normalizeTurns([
      { speaker: 'Unknown', text: 'a' },
      { speaker: 'AlsoUnknown', text: 'b' },
      { speaker: 'StillUnknown', text: 'c' },
    ], speakers);
    expect(r[0]!.speakerId).toBe('cuid-host-abc');
    expect(r[1]!.speakerId).toBe('cuid-guest-xyz');
    expect(r[2]!.speakerId).toBe('cuid-host-abc');
  });

  test('extracts text from alternate keys', () => {
    const r = normalizeTurns([
      { speaker: 'Piseth', content: 'from content field' },
      { speaker: 'Sreymom', line: 'from line field' },
    ], speakers);
    expect(r[0]!.text).toBe('from content field');
    expect(r[1]!.text).toBe('from line field');
  });

  test('skips turns with empty text', () => {
    const r = normalizeTurns([
      { speaker: 'Piseth', text: '' },
      { speaker: 'Sreymom', text: 'valid' },
    ], speakers);
    expect(r.length).toBe(1);
    expect(r[0]!.text).toBe('valid');
  });

  test('fills default delivery and estimates seconds', () => {
    const r = normalizeTurns([{ speaker: 'Piseth', text: 'hello world this is a test' }], speakers);
    expect(r[0]!.delivery.emotion).toBe('neutral');
    expect(r[0]!.delivery.pace).toBe('normal');
    expect(r[0]!.estimatedSeconds).toBeGreaterThan(0);
  });

  test('preserves provided delivery', () => {
    const r = normalizeTurns([
      { speaker: 'Piseth', text: 'hi', delivery: { emotion: 'excited', pace: 'fast', pause_after_ms: 500 } },
    ], speakers);
    expect(r[0]!.delivery.emotion).toBe('excited');
    expect(r[0]!.delivery.pace).toBe('fast');
    expect(r[0]!.delivery.pause_after_ms).toBe(500);
  });

  test('returns empty when no speakers', () => {
    expect(normalizeTurns([{ text: 'hi' }], []).length).toBe(0);
  });
});
