import { describe, it, expect } from 'vitest';
import { composeAudioClips, parseWavHeader, generateClipCacheKey, TARGET_SAMPLE_RATE } from '@/lib/audio/composition';
import { MockTTSAdapter } from '@/lib/providers/adapters/mock-tts';
import { numberToKhmerWords, normalizeKhmerText } from '@/lib/normalization/khmer';
import { applyDictionary } from '@/lib/normalization/dictionary';
import { generateThumbnailSvg } from '@/lib/thumbnail';

const mockConfig = { baseUrl: '', apiKey: '', authType: 'NONE' as const, timeoutMs: 30000 };

describe('Khmer number place-values', () => {
  it('reads 1-19 correctly', () => {
    expect(numberToKhmerWords(1)).toContain('\u1798\u17BD\u1799'); // មួយ
    expect(numberToKhmerWords(10)).toContain('\u178A\u1794\u17D2\u179A\u17B6\u17C6'); // ដប់
    expect(numberToKhmerWords(15)).toContain('\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17D2\u179A\u17B6\u17C6'); // ដប់ប្រាំ
  });
  it('reads tens with place value', () => {
    const w = numberToKhmerWords(20);
    expect(w).toContain('\u1798\u17D2\u1797\u17C0\u179F'); // ម្ភៃ
  });
  it('reads hundreds', () => {
    const w = numberToKhmerWords(200);
    expect(w).toContain('\u1796\u17B8\u179A \u179A\u1799'); // ពីររយ
  });
  it('reads thousands', () => {
    const w = numberToKhmerWords(2026);
    expect(w).toContain('\u1796\u17B6\u1793\u17D2\u1784'); // ពាន់
  });
  it('normalization expands 2026 not digit-by-digit', () => {
    const r = normalizeKhmerText('ឆ្នាំ 2026', 'km');
    expect(r.normalized).toContain('\u1796\u17B6\u1793\u17D2\u1784'); // ពាន់
    // should NOT be 3 separate digit words for 2,0,2,6
    expect(r.normalized).not.toMatch(/មួយ សូន្យ ពីរ ប្រាំមួយ/);
  });
  it('expands ML via dictionary with Khmer-safe boundary', () => {
    const r = normalizeKhmerText('ML គឺសំខាន់', 'km');
    expect(r.normalized).toContain('\u17A2\u17C2\u1798 \u17A2\u17C2\u179B'); // អែម អែល
  });
});

describe('Audio composition 16kHz', () => {
  it('composes mock clips into valid 16kHz WAV', async () => {
    const adapter = new MockTTSAdapter({ latencyMs: 1 });
    const r1 = await adapter.synthesize({ text: 'សួស្តី', voiceId: 'mock-km-male-1', outputFormat: 'wav' }, mockConfig);
    const r2 = await adapter.synthesize({ text: 'ជំរាបសួរ', voiceId: 'mock-km-female-1', outputFormat: 'wav' }, mockConfig);
    expect(parseWavHeader(r1.audio)!.sampleRate).toBe(16000);
    const composed = composeAudioClips([
      { turnIndex: 0, speakerId: 'a', audio: r1.audio, durationMs: r1.durationMs, pauseAfterMs: 300 },
      { turnIndex: 1, speakerId: 'b', audio: r2.audio, durationMs: r2.durationMs, pauseAfterMs: 300 },
    ]);
    const hdr = parseWavHeader(composed.audio)!;
    expect(hdr.sampleRate).toBe(TARGET_SAMPLE_RATE);
    expect(hdr.channels).toBe(1);
    expect(composed.timestamps.length).toBe(2);
    expect(composed.timestamps[1]!.startMs).toBeGreaterThanOrEqual(composed.timestamps[0]!.durationMs + 300);
    expect(composed.totalDurationMs).toBeGreaterThan(0);
  });
  it('generates deterministic clip cache keys', () => {
    expect(generateClipCacheKey('p', 'v', 'text', 'normal', 'friendly'))
      .toBe(generateClipCacheKey('p', 'v', 'text', 'normal', 'friendly'));
    expect(generateClipCacheKey('p', 'v', 'text', 'normal', 'friendly'))
      .not.toBe(generateClipCacheKey('p', 'v', 'text2', 'normal', 'friendly'));
  });
});

describe('Thumbnail generator', () => {
  it('produces valid SVG with title', () => {
    const svg = generateThumbnailSvg({ title: 'ភាគទី ១០', topic: 'AI នៅកម្ពុជា', speakerNames: ['Piseth', 'Sreymom'] });
    expect(svg).toContain('<svg');
    expect(svg).toContain('AI PODCAST');
    expect(svg).toContain('ភាគទី');
    expect(svg).toContain('</svg>');
  });
});
