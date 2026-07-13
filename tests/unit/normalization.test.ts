import { describe, it, expect } from 'vitest';
import { normalizeKhmerText } from '@/lib/normalization/khmer';

describe('Khmer Normalization', () => {
  it('should preserve original text', () => {
    const text = 'Hello World 123';
    const result = normalizeKhmerText(text, 'km');
    expect(result.original).toBe(text);
    expect(result.normalized).not.toBe('');
  });

  it('should detect Khmer-English mix', () => {
    const mixed = '\u179F\u17BD\u179F\u17D2\u178F\u17B8 Hello World';
    const result = normalizeKhmerText(mixed, 'km');
    expect(result.hasKhmerEnglishMix).toBe(true);
  });

  it('should detect pure Khmer text', () => {
    const khmer = '\u179F\u17BD\u179F\u17D2\u178F\u17B8 \u1793\u17C1\u17C7\u1787\u17B6\u1797\u17B6\u179F\u17B6\u1781\u17D2\u1798\u17C2\u179A';
    const result = normalizeKhmerText(khmer, 'km');
    expect(result.hasKhmerEnglishMix).toBe(false);
  });

  it('should expand percentages', () => {
    const text = '50%';
    const result = normalizeKhmerText(text, 'km');
    expect(result.normalized).toContain('\u1797\u17B6\u1782\u179A\u1799'); // ភាគរយ
    expect(result.normalized).not.toContain('%');
  });

  it('should normalize multiple spaces', () => {
    const text = 'Hello    world   test';
    const result = normalizeKhmerText(text, 'km');
    expect(result.normalized).not.toContain('  ');
  });

  it('should produce chunks for long text', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    const result = normalizeKhmerText(text, 'km');
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it('should handle empty string', () => {
    const result = normalizeKhmerText('', 'km');
    expect(result.original).toBe('');
    expect(result.normalized).toBe('');
    expect(result.chunks).toEqual([]);
  });

  it('should apply NFC normalization', () => {
    // Test with decomposed Unicode
    const decomposed = 'A\u030A'; // A + combining ring above = Å
    const result = normalizeKhmerText(decomposed, 'km');
    expect(result.normalized).toBe('\u00C5'); // Composed Å
  });

  it('should handle time format', () => {
    const text = '\u1798\u17C9\u17C4\u1784 14:30';
    const result = normalizeKhmerText(text, 'km');
    // Should expand time
    expect(result.normalized).toBeTruthy();
  });

  it('should not expand numbers that are part of identifiers', () => {
    // Numbers within identifiers should not be expanded
    // This tests the negative lookbehind/lookahead
    const text = 'turn_0001';
    const result = normalizeKhmerText(text, 'en');
    expect(result.normalized).toBe('turn_0001');
  });
});
