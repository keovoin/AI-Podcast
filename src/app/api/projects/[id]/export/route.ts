import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateTranscript } from '@/lib/export/transcript';
import { generateShowNotes } from '@/lib/export/show-notes';
import { buildExportZip } from '@/lib/export/zip-builder';
import { composeAudioClips, generateClipCacheKey } from '@/lib/audio/composition';
import { getTTSAdapter } from '@/lib/providers/registry';
import { decryptApiKey } from '@/lib/crypto';
import { RoutingEngine } from '@/lib/routing/engine';
import { normalizeKhmerText } from '@/lib/normalization/khmer';
import type { AudioClipInput } from '@/lib/audio/composition';
import type { ExportManifest } from '@/lib/export/zip-builder';
import type { RoutableProvider } from '@/lib/routing/engine';
import type { AdapterConfig } from '@/lib/providers/adapters/base';
import type { AdapterType, HealthStatus } from '@/types/provider';
import { MockTTSAdapter } from '@/lib/providers/adapters/mock-tts';

/**
 * POST /api/projects/:id/export
 * Generate and return a ZIP export package containing:
 * - Audio (MP3/WAV)
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

    // Get audio clips and compose
    let composedAudio: Buffer | undefined;
    let timestamps: Array<{ turnIndex: number; startMs: number; endMs: number; speakerId: string; durationMs: number }> = [];
    let ttsProviderUsed = { name: 'Mock TTS', voiceIds: Object.values(speakerNames) };

    // Check if all clips exist
    const allClipsExist = project.clips.length > 0 && project.clips.length >= project.turns.length;

    if (allClipsExist) {
      // Use existing clips (previously generated via /api/projects/:id/audio)
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
      // Generate audio on-the-fly using either real TTS provider or mock for preview
      let adapter: any;
      let config: AdapterConfig;
      let providerId = 'mock';
      let providerName = 'Mock TTS';

      // Try to resolve real TTS provider
      const ttsResolved = await resolveTTSProvider(userId, project.lockedTtsId, project.routingMode);
      if (ttsResolved) {
        adapter = getTTSAdapter(ttsResolved.adapterType as AdapterType);
        config = ttsResolved.config;
        providerId = ttsResolved.providerId;
        providerName = ttsResolved.adapterType;
        ttsProviderUsed = { name: providerName, voiceIds: ttsResolved.voiceIds || Object.values(speakerNames) };
      } else {
        // Fallback to mock adapter for preview
        adapter = new MockTTSAdapter({ latencyMs: 1 });
        config = { baseUrl: '', apiKey: '', authType: 'NONE', timeoutMs: 30000 };
      }

      // Build speaker -> voice mapping
      const speakerVoiceMap = buildSpeakerVoiceMap(project.speakers, ttsResolved?.voiceIds);

      const clips: AudioClipInput[] = [];

      // Generate audio for each turn
      for (const turn of project.turns) {
        try {
          const voiceId = speakerVoiceMap[turn.speakerId] || ttsResolved?.voiceIds?.[0] || 'mock-km-male-1';
          const delivery = turn.delivery as { emotion?: string; pace?: string; pause_after_ms?: number } | null;

          // Normalize text for TTS (if using real provider)
          let ttsText = turn.text;
          if (project.language === 'km') {
            const normalized = normalizeKhmerText(turn.text, project.language);
            ttsText = normalized.normalized;
          }

          // Generate cache key
          const cacheKey = generateClipCacheKey(
            providerId,
            voiceId,
            ttsText,
            delivery?.pace,
            delivery?.emotion
          );

          // Synthesize
          const response = await adapter.synthesize(
            {
              text: ttsText,
              voiceId,
              language: project.language,
              emotion: delivery?.emotion,
              pace: (delivery?.pace as 'slow' | 'normal' | 'fast' | undefined) || 'normal',
              outputFormat: 'wav',
            },
            config
          );

          // Save clip record to DB
          await prisma.audioClip.upsert({
            where: { turnId: turn.id },
            create: {
              projectId: id,
              turnId: turn.id,
              providerId,
              voiceId,
              textHash: cacheKey,
              s3Key: `projects/${id}/clips/${turn.turnIndex}.wav`,
              durationMs: response.durationMs,
              format: 'wav',
              sizeBytes: response.audio.length,
              cached: false,
            },
            update: {
              providerId,
              voiceId,
              textHash: cacheKey,
              durationMs: response.durationMs,
              sizeBytes: response.audio.length,
            },
          });

          clips.push({
            turnIndex: turn.turnIndex,
            speakerId: turn.speakerId,
            audio: response.audio,
            durationMs: response.durationMs,
            pauseAfterMs: delivery?.pause_after_ms || 300,
          });
        } catch (turnError) {
          console.error(`Failed to generate audio for turn ${turn.turnIndex}:`, turnError);
          // Continue with remaining turns - don't fail the whole export
        }
      }

      if (clips.length === 0) {
        return NextResponse.json(
          { error: 'Failed to generate audio for any turns. Check TTS provider configuration.' },
          { status: 500 }
        );
      }

      // Compose all clips into final audio
      const composed = composeAudioClips(clips);
      composedAudio = composed.audio;
      timestamps = composed.timestamps;

      // Update clip records with timestamps
      for (const ts of timestamps) {
        const turn = project.turns.find((t) => t.turnIndex === ts.turnIndex);
        if (turn) {
          await prisma.audioClip.updateMany({
            where: { turnId: turn.id },
            data: { startTimeMs: ts.startMs },
          });
        }
      }
    }

    // Compose if we have clips but no composed audio
    if (!composedAudio && project.clips.length > 0) {
      const clipAudios: AudioClipInput[] = project.clips
        .sort((a, b) => {
          const turnA = project.turns.find((t) => t.id === a.turnId);
          const turnB = project.turns.find((t) => t.id === b.turnId);
          return (turnA?.turnIndex || 0) - (turnB?.turnIndex || 0);
        })
        .map((clip) => {
          const turn = project.turns.find((t) => t.id === clip.turnId);
          return {
            turnIndex: turn?.turnIndex || 0,
            speakerId: turn?.speakerId || '',
            audio: Buffer.alloc(0), // Placeholder - in production would fetch from S3
            durationMs: clip.durationMs,
            pauseAfterMs: 300,
          };
        });

      if (clipAudios.length > 0) {
        const composed = composeAudioClips(clipAudios);
        composedAudio = composed.audio;
      }
    }

    // Fallback: generate using mock adapter if still no audio
    if (!composedAudio) {
      const mockAdapter = new MockTTSAdapter({ latencyMs: 1 });
      const mockConfig = { baseUrl: '', apiKey: '', authType: 'NONE', timeoutMs: 30000 };
      const clips: AudioClipInput[] = [];

      for (const turn of project.turns) {
        const delivery = turn.delivery as { pause_after_ms?: number; pace?: string } | null;
        const response = await mockAdapter.synthesize(
          {
            text: turn.text,
            voiceId: 'mock-km-male-1',
            language: project.language,
            pace: (delivery?.pace as 'slow' | 'normal' | 'fast' | undefined) || 'normal',
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
        { name: 'audio/episode.wav', type: 'audio', description: 'Full episode audio (WAV format)' },
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
        tts: { name: ttsProviderUsed.name, voiceIds: ttsProviderUsed.voiceIds },
      },
      aiDisclosure: showNotes.aiDisclosure,
      turnCount: project.turns.length,
      speakerCount: project.speakers.length,
    };

    // Build ZIP
    const exportResult = buildExportZip({
      title: project.title,
      language: project.language,
      audio: composedAudio || Buffer.alloc(0),
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

// === Helpers ===

function buildSpeakerVoiceMap(
  speakers: Array<{ voiceOverride?: string | null; speaker: { id: string; voiceId?: string | null } }>,
  providerVoices?: string[]
): Record<string, string> {
  const map: Record<string, string> = {};
  const availableVoices = providerVoices || [];

  speakers.forEach((ps, index) => {
    const voice = ps.voiceOverride || ps.speaker.voiceId || availableVoices[index % Math.max(availableVoices.length, 1)] || 'mock-km-male-1';
    map[ps.speaker.id] = voice;
  });

  return map;
}

interface ResolvedTTS {
  providerId: string;
  adapterType: string;
  voiceIds?: string[];
  config: AdapterConfig;
}

async function resolveTTSProvider(
  userId: string,
  lockedTtsId: string | null,
  routingMode: string
): Promise<ResolvedTTS | null> {
  let provider;
  if (lockedTtsId) {
    provider = await prisma.provider.findFirst({
      where: { id: lockedTtsId, userId, enabled: true, category: 'TTS' },
      include: { secret: true, health: true },
    });
  } else {
    const providers = await prisma.provider.findMany({
      where: { userId, category: 'TTS', enabled: true },
      include: { secret: true, health: true, capabilities: true, benchmarks: { take: 1, orderBy: { createdAt: 'desc' } } },
    });

    if (providers.length === 0) return null;

    const routable: RoutableProvider[] = providers.map((p) => ({
      id: p.id,
      name: p.name,
      category: 'TTS',
      enabled: p.enabled,
      priority: p.priority,
      model: p.model || undefined,
      voiceIds: (p.voiceIds as string[]) || undefined,
      allowSensitive: p.allowSensitive,
      health: {
        status: (p.health?.status || 'UNKNOWN') as HealthStatus,
        avgLatencyMs: p.health?.avgLatencyMs || undefined,
        successRate: p.health?.successRate || undefined,
      },
      benchmark: p.benchmarks.length > 0
        ? { weightedScore: p.benchmarks[0]?.weightedScore || undefined, approved: p.benchmarks[0]?.approved || false }
        : undefined,
      costPerRequest: (p.costMetadata as Record<string, number> | null)?.costPerRequest,
    }));

    const engine = new RoutingEngine();
    const recommendation = engine.recommend({ category: 'TTS', mode: routingMode as any }, routable);
    if (!recommendation) return null;

    provider = providers.find((p) => p.id === recommendation.providerId);
  }

  if (!provider) return null;

  let apiKey = '';
  if (provider.secret) {
    apiKey = decryptApiKey({
      encryptedKey: provider.secret.encryptedKey,
      iv: provider.secret.iv,
      authTag: provider.secret.authTag,
    });
  }

  return {
    providerId: provider.id,
    adapterType: provider.adapterType,
    voiceIds: (provider.voiceIds as string[]) || undefined,
    config: {
      baseUrl: provider.baseUrl || '',
      apiKey,
      model: provider.model || undefined,
      endpointPath: provider.endpointPath || undefined,
      authType: provider.authType,
      authHeaderName: provider.authHeaderName || undefined,
      customHeaders: (provider.customHeaders as Record<string, string>) || undefined,
      timeoutMs: provider.timeoutMs,
      requestTemplate: (provider.requestTemplate as Record<string, unknown>) || undefined,
      responseJsonPath: provider.responseJsonPath || undefined,
      audioResponseType: provider.audioResponseType || undefined,
    },
  };
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
