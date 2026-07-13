/**
 * ZIP export builder.
 * Bundles audio, transcript, chapters, show notes, sources, and manifest
 * into a downloadable ZIP package.
 * 
 * Uses a simple ZIP implementation that works in serverless (no native deps).
 * For production, consider using a streaming ZIP library.
 */

import type { TranscriptResult } from './transcript';
import type { ShowNotesResult } from './show-notes';

export interface ExportManifest {
  version: string;
  title: string;
  language: string;
  generatedAt: string;
  duration: {
    totalMs: number;
    formatted: string;
  };
  files: Array<{ name: string; type: string; description: string }>;
  providers: {
    llm: { name: string; model?: string };
    tts: { name: string; voiceIds: string[] };
  };
  aiDisclosure: string;
  turnCount: number;
  speakerCount: number;
}

export interface ExportResult {
  zipBuffer: Buffer;
  manifest: ExportManifest;
  fileName: string;
}

/**
 * Build a ZIP export package containing all podcast deliverables.
 * Returns a buffer that can be sent as a download or uploaded to S3.
 */
export function buildExportZip(params: {
  title: string;
  language: string;
  audio?: Buffer;
  transcript: TranscriptResult;
  showNotes: ShowNotesResult;
  manifest: ExportManifest;
}): ExportResult {
  const { title, transcript, showNotes, manifest } = params;

  // Build individual files
  const files: Array<{ name: string; content: Buffer }> = [];

  // Audio file
  if (params.audio && params.audio.length > 0) {
    files.push({ name: 'audio/episode.wav', content: params.audio });
  }

  // Transcript files
  files.push({
    name: 'transcript/transcript.json',
    content: Buffer.from(transcript.json, 'utf-8'),
  });
  files.push({
    name: 'transcript/transcript.srt',
    content: Buffer.from(transcript.srt, 'utf-8'),
  });
  files.push({
    name: 'transcript/transcript.vtt',
    content: Buffer.from(transcript.vtt, 'utf-8'),
  });

  // Show notes
  files.push({
    name: 'show-notes/show-notes.json',
    content: Buffer.from(JSON.stringify(showNotes, null, 2), 'utf-8'),
  });
  files.push({
    name: 'show-notes/show-notes.md',
    content: Buffer.from(formatShowNotesMarkdown(showNotes, title), 'utf-8'),
  });

  // Chapters (Podcasting 2.0 format)
  files.push({
    name: 'chapters/chapters.json',
    content: Buffer.from(JSON.stringify(showNotes.chapters, null, 2), 'utf-8'),
  });

  // Manifest
  files.push({
    name: 'manifest.json',
    content: Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'),
  });

  // AI Disclosure
  files.push({
    name: 'AI_DISCLOSURE.txt',
    content: Buffer.from(showNotes.aiDisclosure, 'utf-8'),
  });

  // Build ZIP (minimal implementation)
  const zipBuffer = createZipBuffer(files);

  const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
  const fileName = `${safeTitle}_export.zip`;

  return {
    zipBuffer,
    manifest,
    fileName,
  };
}

/**
 * Minimal ZIP file builder (no external dependencies).
 * Creates a valid ZIP archive from file entries.
 */
function createZipBuffer(files: Array<{ name: string; content: Buffer }>): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuffer = Buffer.from(file.name, 'utf-8');
    const content = file.content;

    // Local file header (30 bytes + name + content)
    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract
    localHeader.writeUInt16LE(0, 6); // General purpose bit flag
    localHeader.writeUInt16LE(0, 8); // Compression method (0 = stored)
    localHeader.writeUInt16LE(0, 10); // Last mod file time
    localHeader.writeUInt16LE(0, 12); // Last mod file date
    localHeader.writeUInt32LE(crc32(content), 14); // CRC-32
    localHeader.writeUInt32LE(content.length, 18); // Compressed size
    localHeader.writeUInt32LE(content.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28); // Extra field length
    nameBuffer.copy(localHeader, 30);

    localHeaders.push(localHeader, content);

    // Central directory header (46 bytes + name)
    const centralHeader = Buffer.alloc(46 + nameBuffer.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory header signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed to extract
    centralHeader.writeUInt16LE(0, 8); // General purpose bit flag
    centralHeader.writeUInt16LE(0, 10); // Compression method
    centralHeader.writeUInt16LE(0, 12); // Last mod file time
    centralHeader.writeUInt16LE(0, 14); // Last mod file date
    centralHeader.writeUInt32LE(crc32(content), 16); // CRC-32
    centralHeader.writeUInt32LE(content.length, 20); // Compressed size
    centralHeader.writeUInt32LE(content.length, 24); // Uncompressed size
    centralHeader.writeUInt16LE(nameBuffer.length, 28); // File name length
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // File comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0, 38); // External file attributes
    centralHeader.writeUInt32LE(offset, 42); // Relative offset of local header
    nameBuffer.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);
    offset += localHeader.length + content.length;
  }

  // End of central directory record
  const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0); // End of central directory signature
  endRecord.writeUInt16LE(0, 4); // Number of this disk
  endRecord.writeUInt16LE(0, 6); // Disk where central directory starts
  endRecord.writeUInt16LE(files.length, 8); // Number of central directory records on this disk
  endRecord.writeUInt16LE(files.length, 10); // Total number of central directory records
  endRecord.writeUInt32LE(centralDirSize, 12); // Size of central directory
  endRecord.writeUInt32LE(offset, 16); // Offset of start of central directory
  endRecord.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, endRecord]);
}

/**
 * CRC-32 calculation for ZIP file integrity.
 */
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function formatShowNotesMarkdown(showNotes: ShowNotesResult, title: string): string {
  let md = `# ${title}\n\n`;
  md += `## Summary\n\n${showNotes.summary}\n\n`;

  md += `## Chapters\n\n`;
  for (const ch of showNotes.chapters) {
    md += `- ${ch.startFormatted} - ${ch.title}\n`;
  }

  if (showNotes.takeaways.length > 0) {
    md += `\n## Key Takeaways\n\n`;
    for (const t of showNotes.takeaways) {
      md += `- ${t}\n`;
    }
  }

  if (showNotes.factList.length > 0) {
    md += `\n## Sources & Facts\n\n`;
    for (const f of showNotes.factList) {
      md += `- [${f.id}] ${f.content} (referenced in turns: ${f.turnIndices.join(', ')})\n`;
    }
  }

  md += `\n---\n\n_${showNotes.aiDisclosure}_\n`;

  return md;
}
