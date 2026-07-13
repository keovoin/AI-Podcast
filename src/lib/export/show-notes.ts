/**
 * Show notes, chapters, and takeaways generation.
 * Produces structured metadata for podcast distribution.
 */

export interface Chapter {
  title: string;
  startMs: number;
  endMs: number;
  startFormatted: string;
}

export interface ShowNotesResult {
  summary: string;
  chapters: Chapter[];
  takeaways: string[];
  factList: Array<{ id: string; content: string; turnIndices: number[] }>;
  aiDisclosure: string;
}

/**
 * Generate show notes from outline segments and timestamps.
 */
export function generateShowNotes(
  segments: Array<{ id: string; title: string; duration_seconds: number }>,
  timestamps: Array<{ turnIndex: number; startMs: number; endMs: number }>,
  turns: Array<{
    turnIndex: number;
    text: string;
    sourceFactIds?: string[] | null;
  }>,
  facts: Array<{ id: string; content: string }>,
  projectTitle: string,
  projectTopic?: string
): ShowNotesResult {
  // Generate chapters from outline segments mapped to actual timestamps
  const chapters = generateChapters(segments, timestamps, turns);

  // Generate summary
  const summary = generateSummary(projectTitle, projectTopic, segments);

  // Extract takeaways from the final segment or key turns
  const takeaways = extractTakeaways(turns, segments);

  // Build fact reference list
  const factList = buildFactList(turns, facts);

  // AI disclosure statement
  const aiDisclosure =
    'This podcast was generated with AI assistance. Dialogue was produced by an AI language model and voices were synthesized using AI text-to-speech technology.';

  return {
    summary,
    chapters,
    takeaways,
    factList,
    aiDisclosure,
  };
}

function generateChapters(
  segments: Array<{ id: string; title: string; duration_seconds: number }>,
  timestamps: Array<{ turnIndex: number; startMs: number; endMs: number }>,
  turns: Array<{ turnIndex: number; text: string }>
): Chapter[] {
  if (timestamps.length === 0 || segments.length === 0) {
    return segments.map((seg, i) => ({
      title: seg.title,
      startMs: i * seg.duration_seconds * 1000,
      endMs: (i + 1) * seg.duration_seconds * 1000,
      startFormatted: formatChapterTime(i * seg.duration_seconds * 1000),
    }));
  }

  // Distribute turns across segments proportionally
  const turnsPerSegment = Math.ceil(turns.length / segments.length);
  const chapters: Chapter[] = [];

  for (let i = 0; i < segments.length; i++) {
    const startTurnIdx = i * turnsPerSegment;
    const endTurnIdx = Math.min((i + 1) * turnsPerSegment - 1, turns.length - 1);

    const startTs = timestamps.find((t) => t.turnIndex === startTurnIdx);
    const endTs = timestamps.find((t) => t.turnIndex === endTurnIdx);

    const startMs = startTs?.startMs || 0;
    const endMs = endTs?.endMs || startMs + segments[i]!.duration_seconds * 1000;

    chapters.push({
      title: segments[i]!.title,
      startMs,
      endMs,
      startFormatted: formatChapterTime(startMs),
    });
  }

  return chapters;
}

function generateSummary(
  title: string,
  topic?: string,
  segments?: Array<{ title: string }>
): string {
  const segmentList = segments?.map((s) => s.title).join(', ') || '';
  return `${title}${topic ? ` - ${topic}` : ''}. In this episode: ${segmentList}.`;
}

function extractTakeaways(
  turns: Array<{ turnIndex: number; text: string }>,
  segments: Array<{ title: string }>
): string[] {
  const takeaways: string[] = [];

  // Use the last segment title as a conclusion reference
  if (segments.length > 0) {
    takeaways.push(`Key topic: ${segments[segments.length - 1]!.title}`);
  }

  // Extract sentences from the last few turns as potential takeaways
  const lastTurns = turns.slice(-4);
  for (const turn of lastTurns) {
    const sentences = turn.text.split(/[.!?។]+/).filter((s) => s.trim().length > 20);
    if (sentences.length > 0) {
      takeaways.push(sentences[0]!.trim());
    }
    if (takeaways.length >= 5) break;
  }

  return takeaways.slice(0, 5);
}

function buildFactList(
  turns: Array<{ turnIndex: number; sourceFactIds?: string[] | null }>,
  facts: Array<{ id: string; content: string }>
): Array<{ id: string; content: string; turnIndices: number[] }> {
  const factUsage: Record<string, number[]> = {};

  for (const turn of turns) {
    const refs = (turn.sourceFactIds || []) as string[];
    for (const factId of refs) {
      if (!factUsage[factId]) factUsage[factId] = [];
      factUsage[factId]!.push(turn.turnIndex);
    }
  }

  return facts
    .filter((f) => factUsage[f.id])
    .map((f) => ({
      id: f.id,
      content: f.content,
      turnIndices: factUsage[f.id]!,
    }));
}

function formatChapterTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
