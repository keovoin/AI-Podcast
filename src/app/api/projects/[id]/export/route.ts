import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateTranscript } from '@/lib/export/transcript';
import { generateShowNotes } from '@/lib/export/show-notes';
import { buildExportZip } from '@/lib/export/zip-builder';
import { composeAudioClips } from '@/lib/audio/composition';
import type { AudioClipInput } from '@/lib/audio/composition';
import type { ExportManifest } from '@/lib/export/zip-builder';
import { MockTTSAdapter } from '@/lib/providers/adapters/mock-tts';

/**
 * POST /api/projects/:id/export
 * Generate and return a ZIP export package containing:
 * - Audio (WAV)
 * - Timestamped transcript (JSON, SRT, VTT)
 * - Show notes (JSON, Markdown)
 * - Chapters
 * - Manifest with AI disclosure
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = 'default-user';

    const project = await prisma.project.findFirst({
      where: { id, userId },
      include: {
        speakers: { include: { speaker: true } },
        sources: { include: { facts: true } },
        outline: true,
        turns: { orderBy: { turnIndex: 'asc' }, include: { clip: true } },
        clips: true,
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.turns.length === 0) {
      return NextResponse.json({ error: 'No dialogue turns. Generate dialogue first.' }, { status: 400 });
    }

    // Build speaker name map
    const speakerNames: Record<string, string> = {};
    for (const ps of project.speakers) {
      speakerNames[ps.speaker.id] = ps.speaker.name;
    }

    // Get audio clips and compose (or regenerate if missing)
    let composedAudio: Buffer | undefined;
    let timestamps: Array<{ turnIndex: number; startMs: number; endMs: number; speakerId: string; durationMs: number }> = [];

    // Check if clips exist
    if (project.clips.length > 0 && project.clips.length >= project.turns.length) {
      // Build timestamps from existing clips
      timestamps = project.clips
        .sort((a, b) => {
          const turnA = project.turns.find((t) => t.id === a.turnId);
          const turnB = project.turns.find((t) => t.id === b.turnId);
          return (turnA?.turnIndex || 0) - (turnB?.turnIndex || 0);
        })
        .map((clip) => {
          const turn = project.turns.find((t) => t.id === clip.turnId);
          return {
            turnIndex: turn?.turnIndex || 0,
            startMs: clip.startTimeMs || 0,
            endMs: (clip.startTimeMs || 0) + clip.durationMs,
            speakerId: turn?.speakerId || '',
            durationMs: clip.durationMs,
          };
        });
    } else {
      // Generate audio on-the-fly using mock adapter for export preview
      const mockAdapter = new MockTTSAdapter({ latencyMs: 1 });
      const mockConfig = { baseUrl: '', apiKey: '', authType: 'NONE', timeoutMs: 30000 };
      const clips: AudioClipInput[] = [];

      for (const turn of project.turns) {
        const delivery = turn.delivery as { pause_after_ms?: number; pace?: string } | null;
        const response = await mockAdapter.synthesize(
          {
            text: turn.text,
            voiceId: 'mock-voice',
            language: project.language,
            pace: (delivery?.pace as 'slow' | 'normal' | 'fast') || 'normal',
          },
          mockConfig
        );
        clips.push({
          turnIndex: turn.turnIndex,
          speakerId: turn.speakerId,
          audio: response.audio,
          durationMs: response.durationMs,
          pauseAfterMs: delivery?.pause_after_ms || 300,
        });
      }

      const composed = composeAudioClips(clips);
      composedAudio = composed.audio;
      timestamps = composed.timestamps;
    }

    // Generate transcript
    const transcript = generateTranscript(
      project.turns.map((t) => ({
        turnIndex: t.turnIndex,
        speakerId: t.speakerId,
        text: t.text,
      })),
      timestamps,
      speakerNames
    );

    // Generate show notes
    const segments = (project.outline?.segments as Array<{ id: string; title: string; duration_seconds: number }>) || [];
    const facts = project.sources.flatMap((s) => s.facts.map((f) => ({ id: f.id, content: f.content })));

    const showNotes = generateShowNotes(
      segments,
      timestamps,
      project.turns.map((t) => ({
        turnIndex: t.turnIndex,
        text: t.text,
        sourceFactIds: t.sourceFactIds as string[] | null,
      })),
      facts,
      project.title,
      project.topic || undefined
    );

    // Save transcript and show notes to DB
    await prisma.transcript.upsert({
      where: { projectId: id },
      create: {
        projectId: id,
        content: transcript.entries,
        srt: transcript.srt,
        vtt: transcript.vtt,
      },
      update: {
        content: transcript.entries,
        srt: transcript.srt,
        vtt: transcript.vtt,
      },
    });

    await prisma.showNotes.upsert({
      where: { projectId: id },
      create: {
        projectId: id,
        summary: showNotes.summary,
        chapters: showNotes.chapters,
        takeaways: showNotes.takeaways,
        factList: showNotes.factList,
      },
      update: {
        summary: showNotes.summary,
        chapters: showNotes.chapters,
        takeaways: showNotes.takeaways,
        factList: showNotes.factList,
      },
    });

    // Build manifest
    const totalDurationMs = timestamps.length > 0
      ? timestamps[timestamps.length - 1]!.endMs
      : project.turns.reduce((sum, t) => sum + (t.estimatedSeconds || 5) * 1000, 0);

    const manifest: ExportManifest = {
      version: '1.0.0',
      title: project.title,
      language: project.language,
      generatedAt: new Date().toISOString(),
      duration: {
        totalMs: totalDurationMs,
        formatted: formatDuration(totalDurationMs),
      },
      files: [
        { name: 'audio/episode.wav', type: 'audio', description: 'Full episode audio' },
        { name: 'transcript/transcript.json', type: 'transcript', description: 'Timestamped transcript (JSON)' },
        { name: 'transcript/transcript.srt', type: 'transcript', description: 'Subtitle format (SRT)' },
        { name: 'transcript/transcript.vtt', type: 'transcript', description: 'Web subtitle format (VTT)' },
        { name: 'show-notes/show-notes.json', type: 'metadata', description: 'Show notes (JSON)' },
        { name: 'show-notes/show-notes.md', type: 'metadata', description: 'Show notes (Markdown)' },
        { name: 'chapters/chapters.json', type: 'metadata', description: 'Chapter markers' },
        { name: 'manifest.json', type: 'metadata', description: 'Export manifest' },
        { name: 'AI_DISCLOSURE.txt', type: 'legal', description: 'AI content disclosure' },
      ],
      providers: {
        llm: { name: 'Mock LLM', model: 'mock-gpt-4' },
        tts: { name: 'Mock TTS', voiceIds: Object.values(speakerNames) },
      },
      aiDisclosure: showNotes.aiDisclosure,
      turnCount: project.turns.length,
      speakerCount: project.speakers.length,
    };

    // Build ZIP
    const exportResult = buildExportZip({
      title: project.title,
      language: project.language,
      audio: composedAudio,
      transcript,
      showNotes,
      manifest,
    });

    // Record export
    await prisma.exportPackage.create({
      data: {
        projectId: id,
        format: 'zip',
        s3Key: `exports/${id}/${exportResult.fileName}`,
        sizeBytes: exportResult.zipBuffer.length,
        manifest: manifest,
        includesAi: true,
      },
    });

    // Update project status
    await prisma.project.update({
      where: { id },
      data: { status: 'EXPORTED' },
    });

    // Return ZIP as download
    return new NextResponse(exportResult.zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${exportResult.fileName}"`,
        'Content-Length': String(exportResult.zipBuffer.length),
      },
    });
  } catch (error) {
    console.error('POST /api/projects/:id/export error:', error);
    return NextResponse.json(
      { error: 'Export failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
