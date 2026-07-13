/**
 * Khmer pronunciation dictionary for TTS normalization.
 * Maps written forms to phonetic hints for improved TTS output.
 * 
 * Categories:
 * - Common abbreviations
 * - Technical terms (Khmer-English)
 * - Number words
 * - Cambodian place names with pronunciation guides
 * - Common Khmer words that TTS may mispronounce
 */

export interface DictionaryEntry {
  written: string;
  spoken: string;
  category: 'abbreviation' | 'technical' | 'name' | 'number' | 'common';
  notes?: string;
}

export const KHMER_DICTIONARY: DictionaryEntry[] = [
  // === Abbreviations ===
  { written: '\u179F\u17D2\u179A\u17B8', spoken: '\u179F\u17D2\u179A\u17B8\u1798\u178F\u17B7', category: 'abbreviation', notes: 'Honorific prefix' },
  { written: '\u179B\u17C4\u1780', spoken: '\u179B\u17C4\u1780', category: 'abbreviation' },
  { written: '\u178A\u17C2\u179B', spoken: '\u178A\u17C2\u179B', category: 'abbreviation' },

  // === Technical Terms (Khmer-English) ===
  { written: 'AI', spoken: '\u17A2\u17C1 \u17A2\u17B6\u1799', category: 'technical', notes: 'Artificial Intelligence' },
  { written: 'ML', spoken: '\u17A2\u17C2\u17C6 \u17A2\u17C2\u179B', category: 'technical', notes: 'Machine Learning' },
  { written: 'API', spoken: '\u17A2\u17C1 \u1797\u17B8 \u17A2\u17B6\u1799', category: 'technical' },
  { written: 'IT', spoken: '\u17A2\u17B6\u1799 \u1791\u17B8', category: 'technical' },
  { written: 'GPS', spoken: '\u1787\u17B8 \u1797\u17B8 \u17A2\u17C2\u179F', category: 'technical' },
  { written: 'URL', spoken: '\u1799\u17BC \u17A2\u17B6 \u17A2\u17C2\u179B', category: 'technical' },
  { written: 'WiFi', spoken: '\u179C\u17B6\u1799\u17A0\u17D2\u179C\u17B6\u1799', category: 'technical' },
  { written: 'app', spoken: '\u17A2\u17C2\u1795', category: 'technical' },
  { written: 'startup', spoken: '\u179F\u17D2\u178F\u17B6\u178F\u17A2\u17B6\u1795', category: 'technical' },
  { written: 'blockchain', spoken: '\u1794\u17D2\u179B\u17BB\u1780\u1786\u17C1\u1793', category: 'technical' },
  { written: 'fintech', spoken: '\u17A0\u17D2\u179C\u17B7\u1793\u178F\u17C2\u1780', category: 'technical' },
  { written: 'data science', spoken: '\u178A\u17B6\u178F\u17B6 \u179F\u17B6\u1799\u17A2\u17C1\u1793', category: 'technical' },

  // === Cambodian Place Names ===
  { written: '\u1797\u17D2\u1793\u17C6\u1796\u17C1\u1789', spoken: '\u1797\u17D2\u1793\u17C6\u1796\u17C1\u1789', category: 'name', notes: 'Phnom Penh' },
  { written: '\u179F\u17C0\u1798\u179A\u17B6\u1794', spoken: '\u179F\u17C0\u1798\u179A\u17B6\u1794', category: 'name', notes: 'Siem Reap' },
  { written: '\u1794\u178F\u17D2\u178F\u17C6\u1794\u1784', spoken: '\u1794\u178F\u17D2\u178F\u17C6\u1794\u1784', category: 'name', notes: 'Battambang' },
  { written: '\u1780\u17C6\u1796\u1784\u17CB\u1785\u17B6\u1798', spoken: '\u1780\u17C6\u1796\u1784\u17CB\u1785\u17B6\u1798', category: 'name', notes: 'Kampong Cham' },
  { written: '\u179F\u17B7\u17C2\u1798\u179A\u17B6\u1794', spoken: '\u179F\u17B7\u17C2\u1798\u179A\u17B6\u1794', category: 'name', notes: 'Siem Reap alt' },

  // === Number-related ===
  { written: '\u17E0', spoken: '\u179F\u17BC\u1793\u17D2\u1799', category: 'number', notes: '0' },
  { written: '\u17E1', spoken: '\u1798\u17BD\u1799', category: 'number', notes: '1' },
  { written: '\u17E2', spoken: '\u1796\u17B8\u179A', category: 'number', notes: '2' },
  { written: '\u17E3', spoken: '\u1794\u17B8', category: 'number', notes: '3' },
  { written: '\u17E4', spoken: '\u1794\u17BD\u1793', category: 'number', notes: '4' },
  { written: '\u17E5', spoken: '\u1794\u17D2\u179A\u17B6\u17C6', category: 'number', notes: '5' },
  { written: '\u17E6', spoken: '\u1798\u17D2\u1797\u17BB\u17C7', category: 'number', notes: '6' },
  { written: '\u17E7', spoken: '\u1787\u17D2\u179A\u17BB\u17C7', category: 'number', notes: '7' },
  { written: '\u17E8', spoken: '\u1794\u17D2\u179A\u17B6\u17C6\u1794\u17B8', category: 'number', notes: '8' },
  { written: '\u17E9', spoken: '\u1780\u17C5\u17BB', category: 'number', notes: '9' },

  // === Common Words ===
  { written: '\u179F\u17D2\u179C\u17B6\u1782\u1798\u1793\u17CD', spoken: '\u179F\u17D2\u179C\u17B6\u1782\u17C0\u1798\u17CD\u1793\u17CD', category: 'common', notes: 'Autonomy/Independence' },
  { written: '\u1794\u17D2\u179A\u1787\u17B6\u1792\u17B7\u1794\u178F\u17C1\u1799\u17D2\u1799', spoken: '\u1794\u17D2\u179A\u1787\u17B6\u1792\u17B7\u1794\u178F\u17C1\u1799\u17D2\u1799', category: 'common', notes: 'Democracy' },
];

/**
 * Apply pronunciation dictionary to text.
 * Replaces written forms with spoken forms for TTS.
 */
export function applyDictionary(text: string): string {
  let result = text;

  for (const entry of KHMER_DICTIONARY) {
    // Use word boundary matching where possible
    const escaped = entry.written.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'g');
    result = result.replace(regex, entry.spoken);
  }

  return result;
}

/**
 * Get dictionary entries by category.
 */
export function getEntriesByCategory(category: DictionaryEntry['category']): DictionaryEntry[] {
  return KHMER_DICTIONARY.filter((e) => e.category === category);
}

/**
 * Add a custom entry to the dictionary (runtime only).
 */
export function addEntry(entry: DictionaryEntry): void {
  KHMER_DICTIONARY.push(entry);
}
