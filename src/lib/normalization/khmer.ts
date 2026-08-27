/**
 * Khmer text normalization for TTS processing.
 *
 * Handles:
 * - Unicode normalization (NFC)
 * - Number/decimal/percentage expansion with FULL Khmer place-value system
 * - Date/time expansion
 * - Abbreviation expansion
 * - Pronunciation dictionary application (see dictionary.ts)
 * - Punctuation normalization
 * - Intentional Khmer-English handling
 * - Natural sentence chunking
 *
 * The original text is always preserved separately.
 */

import { applyDictionary } from './dictionary';

export interface NormalizationResult {
  original: string;
  normalized: string;
  chunks: string[];
  language: string;
  hasKhmerEnglishMix: boolean;
}

// Khmer digits (U+17E0..U+17E9) — included so literal Khmer digits are also expanded.
const KHMER_DIGIT_CHARS = ['\u17E0', '\u17E1', '\u17E2', '\u17E3', '\u17E4', '\u17E5', '\u17E6', '\u17E7', '\u17E8', '\u17E9'];

// Spoken forms: 0-9
const ONES = [
  '\u179F\u17BC\u1793\u17D2\u1799', // សូន្យ (0)
  '\u1798\u17BD\u1799',             // មួយ (1)
  '\u1796\u17B8\u179A',             // ពីរ (2)
  '\u1794\u17B8',                   // បី (3)
  '\u1794\u17BD\u1793',             // បួន (4)
  '\u1794\u17D2\u179A\u17B6\u17C6', // ប្រាំ (5)
  '\u1798\u17D2\u1797\u17BB\u17C7', // ប្រាំមួយ (6)
  '\u1787\u17D2\u179A\u17BB\u17C7', // ប្រាំពីរ (7)
  '\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17B8', // ប្រាំបី (8)
  '\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17BD\u1793', // ប្រាំបួន (9)
];

// Teen/ten forms for 10-19 (Khmer is decimal, "ដប់" = 10)
const TEENS = [
  '\u178A\u1794\u17D2\u179A\u17B6\u17C6',       // ដប់ (10)
  '\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1798\u17BD\u1799', // ដប់មួយ (11)
  '\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1796\u17B8\u179A', // ដប់ពីរ (12)
  '\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17B8', // ដប់បី (13)
  '\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17BD\u1793', // ដប់បួន (14)
  '\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17D2\u179A\u17B6\u17C6', // ដប់ប្រាំ (15)
  '\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1798\u17D2\u1797\u17BB\u17C7', // ដប់ប្រាំមួយ (16)
  '\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17D2\u179A\u17B6\u17C6\u1796\u17B8\u179A', // ដប់ប្រាំពីរ (17)
  '\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17B8', // ដប់ប្រាំបី (18)
  '\u178A\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17BD\u1793', // ដប់ប្រាំបួន (19)
];

// Tens: 20-90 (Khmer tens are irregular)
const TENS = [
  '\u1798\u17D2\u1797\u17C0\u179F',             // ម្ភៃ (20)
  '\u179F\u17B8\u179F\u17D2\u179A\u17B8',       // សាមសិប (30)
  '\u179F\u17D2\u179A\u17C2\u179F\u17B8\u1794\u17C2\u179F', // សែសិប (40)
  '\u17A0\u17D2\u1791\u17B8\u179F\u17D2\u179A\u17B8', // ហាសិប (50)
  '\u1795\u17C1\u179F\u17D2\u179F\u17B8\u179F\u17D2\u179A\u17B8', // ហុកសិប (60)
  '\u1795\u17C1\u17A2\u17D2\u179F\u17B8\u179F\u17D2\u179A\u17B8', // ចិតសិប (70)
  '\u1796\u17C1\u17A0\u17D2\u179F\u17B8\u179F\u17D2\u179A\u17B8', // ប៉ែតសិប (80)
  '\u1784\u17C0\u179F\u17D2\u179F\u17B8\u179F\u17D2\u179A\u17B8', // កៅសិប (90)
];

// Powers: រយ (100), ពាន់ (1000), ម៉ឺន (10,000), សែន (100,000), លាន (1,000,000)
const HUNDRED = '\u179A\u1799';             // រយ
const THOUSAND = '\u1796\u17B6\u1793\u17D2\u1784'; // ពាន់
const TEN_THOUSAND = '\u1798\u17C9\u17BA\u1793';   // ម៉ឺន
const HUNDRED_THOUSAND = '\u179F\u17C2\u1793';     // សែន
const MILLION = '\u179B\u17B6\u1793';       // លាន

const AND_WORD = '\u1793\u17B7\u1784'; // និង (used between compound parts, e.g. 101 = មួយរយនិងមួយ)

/**
 * Convert an integer number to spoken Khmer words with a full place-value system.
 * Supports 0 .. 999,999,999 (billions can be chained).
 */
export function numberToKhmerWords(input: number | string): string {
  let num = typeof input === 'string' ? parseInt(input, 10) : input;
  if (Number.isNaN(num)) return String(input);
  if (num < 0) return `\u1791\u17A2\u17D2\u1792 \u1793\u17C0\u1780\u17D2\u1780 ${numberToKhmerWords(-num)}`; // ដក
  if (num === 0) return ONES[0]!;

  const parts: string[] = [];

  // Handle millions first (លាន)
  const millions = Math.floor(num / 1_000_000);
  if (millions > 0) {
    parts.push(`${numberToKhmerWords(millions)} ${MILLION}`);
    num -= millions * 1_000_000;
  }

  // 100,000s (សែន)
  const hundredThousands = Math.floor(num / 100_000);
  if (hundredThousands > 0) {
    parts.push(`${hundredThousands === 1 ? '' : numberToKhmerWords(hundredThousands)} ${HUNDRED_THOUSAND}`);
    num -= hundredThousands * 100_000;
  }

  // 10,000s (ម៉ឺន)
  const tenThousands = Math.floor(num / 10_000);
  if (tenThousands > 0) {
    parts.push(`${tenThousands === 1 ? '' : numberToKhmerWords(tenThousands)} ${TEN_THOUSAND}`);
    num -= tenThousands * 10_000;
  }

  // 1,000s (ពាន់)
  const thousands = Math.floor(num / 1_000);
  if (thousands > 0) {
    parts.push(`${thousands === 1 ? '' : numberToKhmerWords(thousands)} ${THOUSAND}`);
    num -= thousands * 1_000;
  }

  // 100s (រយ)
  const hundreds = Math.floor(num / 100);
  if (hundreds > 0) {
    parts.push(`${hundreds === 1 ? '' : numberToKhmerWords(hundreds)} ${HUNDRED}`);
    num -= hundreds * 100;
  }

  // 10s and 1s
  if (num > 0) {
    if (num < 20) {
      parts.push(num < 10 ? ONES[num]! : TEENS[num - 10]!);
    } else {
      const tens = Math.floor(num / 10);
      const ones = num % 10;
      const tensWord = TENS[tens - 2]!;
      parts.push(ones === 0 ? tensWord : `${tensWord}${ONES[ones]}`);
    }
  }

  return parts.join(' ');
}

/**
 * Normalize text for Khmer TTS synthesis.
 */
export function normalizeKhmerText(text: string, language: string = 'km'): NormalizationResult {
  const original = text;

  // Step 1: Unicode NFC normalization
  let normalized = text.normalize('NFC');

  // Step 2: Normalize punctuation
  normalized = normalizePunctuation(normalized);

  // Step 3: Expand numbers, decimals, percentages (Arabic digits AND Khmer digits)
  normalized = expandNumbers(normalized, language);

  // Step 4: Expand dates and times
  normalized = expandDates(normalized, language);

  // Step 5: Expand common abbreviations
  normalized = expandAbbreviations(normalized);

  // Step 6: Apply pronunciation dictionary (word-boundary safe for Khmer script)
  normalized = applyDictionary(normalized);

  // Step 7: Handle Khmer-English code switching
  const hasKhmerEnglishMix = detectKhmerEnglishMix(normalized);

  // Step 8: Chunk into natural sentences (used for long-form chunked synthesis)
  const chunks = chunkText(normalized);

  return {
    original,
    normalized,
    chunks,
    language,
    hasKhmerEnglishMix,
  };
}

/**
 * Normalize punctuation for TTS readability.
 */
function normalizePunctuation(text: string): string {
  // Replace multiple spaces with single space
  text = text.replace(/\s+/g, ' ');

  // Normalize Khmer punctuation marks
  // Khan (។ U+17D4) - period equivalent
  // Bariyoosan (៕ U+17D5) - etc.
  // Camnuc pii kuuh (៖ U+17D6) - colon

  // Ensure space after punctuation for natural pauses
  text = text.replace(/([.!?\u17d4\u17D5\u17D6])(\S)/g, '$1 $2');

  return text.trim();
}

/**
 * Expand numbers for Khmer TTS.
 * Converts Arabic digits (0-9) and Khmer digits (០-៩) to spoken Khmer words
 * using the full place-value system.
 */
function expandNumbers(text: string, language: string): string {
  if (language !== 'km' && !language.startsWith('km')) {
    return text;
  }

  // Convert Khmer digits to Arabic digits first (so the same place-value logic applies)
  let converted = text;
  KHMER_DIGIT_CHARS.forEach((khmerDigit, i) => {
    converted = converted.replaceAll(khmerDigit, String(i));
  });

  // Expand percentages (50% -> ហាសិប ភាគរយ)
  converted = converted.replace(/(\d+(?:\.\d+)?)\s*%/g, (_match, num: string) => {
    return `${numberToKhmerWords(num)} \u1797\u17B6\u1782\u179A\u1799`; // ភាគរយ
  });

  // Expand decimal numbers (3.14 -> បី ចុច ដប់បួន)
  converted = converted.replace(/(\d+)\.(\d+)/g, (_match, whole: string, decimal: string) => {
    return `${numberToKhmerWords(whole)} \u1785\u17BB\u1785 ${numberToKhmerWords(decimal)}`; // ចុច
  });

  // Expand plain numbers (but not if part of IDs like turn_0001 or URLs)
  converted = converted.replace(/(?<![_\w.])(\d+)(?![_\w.])/g, (_match, num: string) => {
    return numberToKhmerWords(num);
  });

  return converted;
}

/**
 * Expand date and time patterns for Khmer TTS.
 */
function expandDates(text: string, language: string): string {
  if (language !== 'km' && !language.startsWith('km')) {
    return text;
  }

  const KHMER_MONTHS = [
    '', '\u1798\u1780\u179A\u17B6', '\u1780\u17BB\u1798\u17D2\u1797\u17C8',
    '\u1798\u17B8\u1793\u17B6', '\u1798\u17C1\u179F\u17B6', '\u17A7\u179F\u1797\u17B6',
    '\u1798\u17B7\u1790\u17BB\u1793\u17B6', '\u1780\u1780\u17D2\u1780\u178A\u17B6',
    '\u179F\u17B8\u17A0\u17B6', '\u1780\u1789\u17D2\u1789\u17B6',
    '\u178F\u17BB\u179B\u17B6', '\u179C\u17B7\u1785\u17D2\u1786\u17B7\u1780\u17B6',
    '\u1792\u17D2\u1793\u17BC'
  ];

  // Match DD/MM/YYYY or DD-MM-YYYY
  text = text.replace(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/g, (_match, day: string, month: string, year: string) => {
    const monthNum = parseInt(month, 10);
    const monthName = KHMER_MONTHS[monthNum] || month;
    return `\u1790\u17D2\u1784\u17C3\u1791\u17B8 ${numberToKhmerWords(day)} \u1781\u17C2 ${monthName} \u1786\u17D2\u1793\u17B6\u17C6 ${numberToKhmerWords(year)}`;
  });

  // Match HH:MM time
  text = text.replace(/(\d{1,2}):(\d{2})/g, (_match, hour: string, minute: string) => {
    return `\u1798\u17C9\u17C4\u1784 ${numberToKhmerWords(hour)} \u1793\u17B6\u1791\u17B8 ${numberToKhmerWords(minute)}`;
  });

  return text;
}

/**
 * Expand common Cambodian abbreviations.
 */
function expandAbbreviations(text: string): string {
  const abbreviations: Record<string, string> = {
    'Dr.': 'Doctor',
    'Mr.': 'Mister',
    'Mrs.': 'Missus',
    'etc.': 'et cetera',
    'vs.': 'versus',
  };

  for (const [abbr, expanded] of Object.entries(abbreviations)) {
    text = text.replace(new RegExp(escapeRegex(abbr), 'g'), expanded);
  }

  return text;
}

/**
 * Detect if text contains both Khmer and English/Latin characters.
 */
function detectKhmerEnglishMix(text: string): boolean {
  const hasKhmer = /[\u1780-\u17FF]/.test(text);
  const hasLatin = /[a-zA-Z]/.test(text);
  return hasKhmer && hasLatin;
}

/**
 * Chunk text into natural sentence segments for TTS.
 * Respects Khmer sentence boundaries and keeps segments at reasonable length.
 * Chunks are used by the synthesis pipeline for long-form episodes so that
 * no single synthesis request exceeds provider SSML/text limits.
 */
export function chunkText(text: string, maxChunkLength: number = 500): string[] {
  if (!text.trim()) return [];

  // Split on sentence-ending punctuation, keeping the punctuation with the sentence.
  // Khmer Khan (។ U+17D4), Bariyoosan (៕ U+17D5), plus standard . ! ? and ហេតុ? style endings.
  const sentenceEnders = /([.!?\u17D4\u17D5])(?:\s+|$)/g;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sentenceEnders.exec(text)) !== null) {
    const end = match.index + match[0].length;
    const sentence = text.slice(lastIndex, end).trim();
    if (sentence) sentences.push(sentence);
    lastIndex = end;
  }

  const tail = text.slice(lastIndex).trim();
  if (tail) sentences.push(tail);

  // Further split sentences that exceed the max chunk length at clause boundaries
  const finalChunks: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxChunkLength) {
      finalChunks.push(sentence);
    } else {
      // Split on commas, Khmer comma-like (។), semicolons, or natural pauses
      const parts = sentence.split(/[,\u17CB\u17D6;]\s*/);
      let subChunk = '';
      for (const part of parts) {
        if (subChunk.length + part.length > maxChunkLength) {
          if (subChunk.trim()) finalChunks.push(subChunk.trim());
          subChunk = part;
        } else {
          subChunk += (subChunk ? ', ' : '') + part;
        }
      }
      if (subChunk.trim()) finalChunks.push(subChunk.trim());
    }
  }

  return finalChunks.filter((c) => c.length > 0);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
