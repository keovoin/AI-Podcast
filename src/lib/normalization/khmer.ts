/**
 * Khmer text normalization for TTS processing.
 * 
 * Handles:
 * - Unicode normalization (NFC)
 * - Number/decimal/percentage expansion
 * - Date/time expansion
 * - Abbreviation expansion
 * - Punctuation normalization
 * - Intentional Khmer-English handling
 * - Natural sentence chunking
 * 
 * The original text is always preserved separately.
 */

export interface NormalizationResult {
  original: string;
  normalized: string;
  chunks: string[];
  language: string;
  hasKhmerEnglishMix: boolean;
}

// Khmer digits
const KHMER_DIGITS = ['\u17E0', '\u17E1', '\u17E2', '\u17E3', '\u17E4', '\u17E5', '\u17E6', '\u17E7', '\u17E8', '\u17E9'];

/**
 * Normalize text for Khmer TTS synthesis.
 */
export function normalizeKhmerText(text: string, language: string = 'km'): NormalizationResult {
  const original = text;

  // Step 1: Unicode NFC normalization
  let normalized = text.normalize('NFC');

  // Step 2: Normalize punctuation
  normalized = normalizePunctuation(normalized);

  // Step 3: Expand numbers, decimals, percentages
  normalized = expandNumbers(normalized, language);

  // Step 4: Expand dates and times
  normalized = expandDates(normalized, language);

  // Step 5: Expand common abbreviations
  normalized = expandAbbreviations(normalized);

  // Step 6: Handle Khmer-English code switching
  const hasKhmerEnglishMix = detectKhmerEnglishMix(normalized);

  // Step 7: Chunk into natural sentences
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
  // Khan (\u17D4) - period equivalent
  // Bariyoosan (\u17D5) - etc.
  // Camnuc pii kuuh (\u17D6) - colon

  // Ensure space after punctuation for natural pauses
  text = text.replace(/([.!?។\u17D4\u17D5\u17D6])(\S)/g, '$1 $2');

  return text.trim();
}

/**
 * Expand numbers for Khmer TTS.
 * Converts digits to spoken Khmer words.
 */
function expandNumbers(text: string, language: string): string {
  if (language !== 'km' && !language.startsWith('km')) {
    return text;
  }

  // Expand percentages
  text = text.replace(/(\d+(?:\.\d+)?)\s*%/g, (_match, num: string) => {
    return `${numberToKhmerWords(num)} \u1797\u17B6\u1782\u179A\u1799`; // "ភាគរយ"
  });

  // Expand decimal numbers
  text = text.replace(/(\d+)\.(\d+)/g, (_match, whole: string, decimal: string) => {
    return `${numberToKhmerWords(whole)} \u1785\u17BB\u1785 ${numberToKhmerWords(decimal)}`; // "ចុច"
  });

  // Expand plain numbers (but not if part of IDs like turn_0001)
  text = text.replace(/(?<![_\w])(\d+)(?![_\w])/g, (_match, num: string) => {
    return numberToKhmerWords(num);
  });

  return text;
}

/**
 * Convert a number string to Khmer words.
 */
function numberToKhmerWords(numStr: string): string {
  const num = parseInt(numStr, 10);
  if (isNaN(num)) return numStr;

  const ONES = ['', '\u1798\u17BD\u1799', '\u1796\u17B8\u179A', '\u1794\u17B8', '\u1794\u17BD\u1793', '\u1794\u17D2\u179A\u17B6\u17C6', '\u1798\u17D2\u1797\u17BB\u17C7', '\u1787\u17D2\u179A\u17BB\u17C7', '\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17B8', '\u1780\u17C5\u17BB'];
  // Simplified - for full implementation would need place-value system
  // For now, read digit by digit for large numbers
  const DIGIT_WORDS = ['\u179F\u17BC\u1793\u17D2\u1799', '\u1798\u17BD\u1799', '\u1796\u17B8\u179A', '\u1794\u17B8', '\u1794\u17BD\u1793', '\u1794\u17D2\u179A\u17B6\u17C6', '\u1798\u17D2\u1797\u17BB\u17C7', '\u1787\u17D2\u179A\u17BB\u17C7', '\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17B8', '\u1780\u17C5\u17BB'];

  if (num >= 0 && num <= 9) {
    return DIGIT_WORDS[num] || numStr;
  }

  // For larger numbers, read digit by digit
  return numStr
    .split('')
    .map((d) => DIGIT_WORDS[parseInt(d, 10)] || d)
    .join(' ');
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
    return `\u1790\u17D2\u1784\u17C3\u1791\u17B8 ${day} \u1781\u17C2 ${monthName} \u1786\u17D2\u1793\u17B6\u17C6 ${year}`;
  });

  // Match HH:MM time
  text = text.replace(/(\d{1,2}):(\d{2})/g, (_match, hour: string, minute: string) => {
    return `\u1798\u17C9\u17C4\u1784 ${hour} \u1793\u17B6\u1791\u17B8 ${minute}`;
  });

  return text;
}

/**
 * Expand common Cambodian abbreviations.
 */
function expandAbbreviations(text: string): string {
  const abbreviations: Record<string, string> = {
    '\u179F\u17D2\u179A\u17B8': '\u1793\u17B6\u1784',  // Abbreviation examples
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
 */
function chunkText(text: string): string[] {
  // Split on sentence-ending punctuation
  const sentenceEnders = /([.!?។\u17D4\u17D5])\s+/;
  const raw = text.split(sentenceEnders);

  const chunks: string[] = [];
  let current = '';

  for (let i = 0; i < raw.length; i++) {
    const part = raw[i]!;
    current += part;

    // If this is a sentence ender, finalize chunk
    if (sentenceEnders.test(part) || i === raw.length - 1) {
      if (current.trim()) {
        chunks.push(current.trim());
      }
      current = '';
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  // Further split chunks that are too long (>200 chars)
  const maxChunkLength = 200;
  const finalChunks: string[] = [];

  for (const chunk of chunks) {
    if (chunk.length <= maxChunkLength) {
      finalChunks.push(chunk);
    } else {
      // Split on commas or clause boundaries
      const parts = chunk.split(/[,\u17CB]\s*/);
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
