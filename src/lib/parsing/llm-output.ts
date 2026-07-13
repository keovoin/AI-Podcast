/**
 * Robust parsing of LLM text output into structured data.
 * Real LLMs are unpredictable: they wrap JSON in markdown fences, add prose,
 * nest arrays under varying keys, and use inconsistent field names.
 * These helpers extract usable data from all those variations.
 */

/** Return the first balanced {...} or [...] substring (string-aware). */
export function extractBalanced(text: string): string {
  if (!text) return text;
  const open = text[0];
  if (open !== '{' && open !== '[') return text;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === open) depth++;
    if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(0, i + 1);
    }
  }
  return text; // Unbalanced; let JSON.parse throw
}

/** Parse JSON from arbitrary LLM text (strips fences and surrounding prose). */
export function parseLLMJson(rawText: string): unknown {
  let jsonText = rawText.trim();

  const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1]!.trim();
  }

  const firstBrace = jsonText.search(/[{[]/);
  if (firstBrace > 0) {
    jsonText = jsonText.slice(firstBrace);
  }
  jsonText = extractBalanced(jsonText);

  return JSON.parse(jsonText);
}

/**
 * Extract a turns array from an arbitrary LLM text response.
 * Handles markdown fences, extra prose, direct arrays, and turns nested
 * under common keys (turns, dialogue, script, conversation, episode.turns).
 */
export function extractTurns(rawText: string): unknown[] {
  const parsed = parseLLMJson(rawText);

  if (Array.isArray(parsed)) return parsed;

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const candidates = [
      obj.turns,
      obj.dialogue,
      obj.script,
      obj.conversation,
      obj.lines,
      (obj.episode as Record<string, unknown> | undefined)?.turns,
    ];
    for (const c of candidates) {
      if (Array.isArray(c)) return c;
    }
    // A single big script string -> split into non-empty lines
    for (const key of ['script', 'dialogue', 'text', 'content', 'transcript']) {
      const v = obj[key];
      if (typeof v === 'string' && v.trim()) {
        const lines = splitScriptLines(v);
        if (lines.length >= 2) return lines;
      }
    }
    for (const value of Object.values(obj)) {
      if (Array.isArray(value) && value.length > 0) return value;
    }
  }

  // Whole response is a plain string script
  if (typeof parsed === 'string' && parsed.trim()) {
    const lines = splitScriptLines(parsed);
    if (lines.length >= 2) return lines;
  }

  return [];
}

/** Split a multi-line script into individual line strings. */
function splitScriptLines(script: string): string[] {
  return script
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Extract a segments array (for outlines) from arbitrary LLM output. */
export function extractSegments(rawText: string): unknown[] {
  const parsed = parseLLMJson(rawText);

  if (Array.isArray(parsed)) return parsed;

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const candidates = [obj.segments, obj.outline, obj.sections, obj.chapters];
    for (const c of candidates) {
      if (Array.isArray(c)) return c;
    }
    for (const value of Object.values(obj)) {
      if (Array.isArray(value) && value.length > 0) return value;
    }
  }

  return [];
}

export interface NormalizedTurn {
  speakerId: string;
  text: string;
  delivery: { emotion: string; pace: string; pause_after_ms: number };
  sourceFactIds: string[];
  estimatedSeconds: number;
}

/**
 * Some providers return turns as plain strings ("Piseth: Hello there")
 * or the whole dialogue as one big string with newlines. This splits a
 * string into { speaker, text } parts when a "Name: text" pattern exists.
 */
function parseStringTurn(
  raw: string,
  speakerNames: string[]
): { speaker?: string; text: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Match "Speaker: text" or "**Speaker**: text" or "[Speaker]: text"
  const match = trimmed.match(/^\s*[*\[]*\s*([A-Za-z0-9_\u1780-\u17FF .'-]{1,40}?)\s*[*\]]*\s*[:：\-]\s*(.+)$/s);
  if (match) {
    const possibleSpeaker = match[1]!.trim();
    const text = match[2]!.trim();
    // Only treat as speaker if it loosely matches a known name or looks like a label
    const isKnown = speakerNames.some(
      (n) => n.toLowerCase() === possibleSpeaker.toLowerCase()
    );
    if (isKnown || possibleSpeaker.split(/\s+/).length <= 3) {
      return { speaker: possibleSpeaker, text };
    }
  }
  return { text: trimmed };
}

export function estimateSeconds(text: string): number {
  // ~150 words per minute, ~5 chars per word
  const wordCount = text.length / 5;
  return Math.round((wordCount / 150) * 60 * 10) / 10;
}

/**
 * Normalize raw turns into DB-ready turns, mapping whatever speaker
 * identifier the LLM used to a real project speaker ID.
 */
export function normalizeTurns(
  rawTurns: unknown[],
  speakers: Array<{ id: string; name: string }>
): NormalizedTurn[] {
  const result: NormalizedTurn[] = [];
  if (speakers.length === 0) return result;

  const byId = new Map(speakers.map((s) => [s.id.toLowerCase(), s.id]));
  const byName = new Map(speakers.map((s) => [s.name.toLowerCase().trim(), s.id]));
  const speakerNames = speakers.map((s) => s.name);

  for (let i = 0; i < rawTurns.length; i++) {
    const item = rawTurns[i];
    let text = '';
    let rawSpeaker = '';
    let delivery: Record<string, unknown> = {};
    let sourceFactIds: string[] = [];
    let estimatedSeconds: number | undefined;

    if (typeof item === 'string') {
      // Turn is a plain string like "Piseth: Hello there"
      const parsed = parseStringTurn(item, speakerNames);
      if (!parsed) continue;
      text = parsed.text;
      rawSpeaker = (parsed.speaker ?? '').toLowerCase().trim();
    } else if (item && typeof item === 'object') {
      const t = item as Record<string, unknown>;
      text = String(
        t.text ?? t.content ?? t.line ?? t.dialogue ?? t.message ?? t.utterance ?? ''
      ).trim();
      rawSpeaker = String(
        t.speaker_id ?? t.speakerId ?? t.speaker ?? t.name ?? t.role ?? t.character ?? ''
      ).toLowerCase().trim();
      delivery = (t.delivery as Record<string, unknown> | undefined) || {};
      sourceFactIds = Array.isArray(t.source_fact_ids) ? (t.source_fact_ids as string[]) : [];
      estimatedSeconds = typeof t.estimated_seconds === 'number' ? t.estimated_seconds : undefined;

      // If text still contains "Speaker: ..." and no speaker found, parse it
      if (text && !rawSpeaker) {
        const parsed = parseStringTurn(text, speakerNames);
        if (parsed?.speaker) {
          rawSpeaker = parsed.speaker.toLowerCase().trim();
          text = parsed.text;
        }
      }
    } else {
      continue;
    }

    if (!text) continue;

    let speakerId: string | undefined = byId.get(rawSpeaker) || byName.get(rawSpeaker);

    if (!speakerId) {
      const posMatch = rawSpeaker.match(/(\d+)/);
      if (posMatch) {
        const idx = parseInt(posMatch[1]!, 10) - 1;
        if (speakers[idx]) speakerId = speakers[idx]!.id;
      }
    }

    if (!speakerId) {
      speakerId = speakers[i % speakers.length]!.id;
    }

    result.push({
      speakerId,
      text,
      delivery: {
        emotion: String(delivery.emotion ?? 'neutral'),
        pace: String(delivery.pace ?? 'normal'),
        pause_after_ms: Number(delivery.pause_after_ms ?? 300),
      },
      sourceFactIds,
      estimatedSeconds: estimatedSeconds ?? estimateSeconds(text),
    });
  }

  return result;
}
