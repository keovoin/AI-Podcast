/**
 * Transcript generation module.
 * Produces timestamped transcript in multiple formats: JSON, SRT, VTT.
 */

export interface TranscriptEntry {
  index: number;
  speakerId: string;
  speakerName: string;
  text: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptResult {
  entries: TranscriptEntry[];
  json: string;
  srt: string;
  vtt: string;
}

/**
 * Generate timestamped transcript from dialogue turns and audio timestamps.
 */
export function generateTranscript(
  turns: Array<{
    turnIndex: number;
    speakerId: string;
    text: string;
  }>,
  timestamps: Array<{
    turnIndex: number;
    startMs: number;
    endMs: number;
  }>,
  speakerNames: Record<string, string>
): TranscriptResult {
  const entries: TranscriptEntry[] = turns.map((turn) => {
    const ts = timestamps.find((t) => t.turnIndex === turn.turnIndex);
    return {
      index: turn.turnIndex,
      speakerId: turn.speakerId,
      speakerName: speakerNames[turn.speakerId] || turn.speakerId,
      text: turn.text,
      startMs: ts?.startMs || 0,
      endMs: ts?.endMs || 0,
    };
  });

  return {
    entries,
    json: JSON.stringify(entries, null, 2),
    srt: generateSRT(entries),
    vtt: generateVTT(entries),
  };
}

function generateSRT(entries: TranscriptEntry[]): string {
  return entries
    .map((entry, i) => {
      const start = formatSRTTime(entry.startMs);
      const end = formatSRTTime(entry.endMs);
      return `${i + 1}\n${start} --> ${end}\n[${entry.speakerName}]\n${entry.text}\n`;
    })
    .join('\n');
}

function generateVTT(entries: TranscriptEntry[]): string {
  const header = 'WEBVTT\n\n';
  const cues = entries
    .map((entry) => {
      const start = formatVTTTime(entry.startMs);
      const end = formatVTTTime(entry.endMs);
      return `${start} --> ${end}\n<v ${entry.speakerName}>${entry.text}\n`;
    })
    .join('\n');
  return header + cues;
}

function formatSRTTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`;
}

function formatVTTTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}`;
}

function pad(num: number, length: number): string {
  return String(num).padStart(length, '0');
}
