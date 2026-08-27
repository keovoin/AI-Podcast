import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getRequestUserId } from '@/lib/auth';
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
  request: NextRequest,
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
        turns: { orderBy: { turnIndex: 'asc' } },
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

    // Always generate fresh audio for export (ensures all turns have audio)
    const clips: AudioClipInput[] = [];
    let ttsProviderUsed = { name: 'Mock TTS', voiceIds: Object.values(speakerNames) };

    // Resolve TTS provider
    const ttsResolved = await resolveTTSProvider(userId, project.lockedTtsId, project.routingMode);
    
    let adapter: any;
    let config: AdapterConfig;
    let providerId = 'mock';

    if (ttsResolved) {
      adapter = getTTSAdapter(ttsResolved.adapterType as AdapterType);
      config = ttsResolved.config;
      providerId = ttsResolved.providerId;
      ttsProviderUsed = { name: ttsResolved.adapterType, voiceIds: ttsResolved.voiceIds || Object.values(speakerNames) };
    } else {
      // Fallback to mock adapter
      adapter = new MockTTSAdapter({ latencyMs: 1 });
      config = { baseUrl: '', apiKey: '', authType: 'NONE', timeoutMs: 30000 };
    }

    // Build speaker -> voice mapping
    const speakerVoiceMap = buildSpeakerVoiceMap(project.speakers, ttsResolved?.voiceIds);

    // Generate audio for each turn
    console.log(`[Export] Generating audio for ${project.turns.length} turns...`);
    
    for (const turn of project.turns) {
      try {
        const voiceId = speakerVoiceMap[turn.speakerId] || ttsResolved?.voiceIds?.[0] || 'mock-km-male-1';
        const delivery = turn.delivery as { emotion?: string; pace?: string; pause_after_ms?: number } | null;

        // Normalize text for TTS (if Khmer)
        let ttsText = turn.text;
        if (project.language === 'km') {
          const normalized = normalizeKhmerText(turn.text, project.language);
          ttsText = normalized.normalized;
        }

        console.log(`[Export] Turn ${turn.turnIndex}: "${ttsText.substring(0, 40)}..." (emotion: ${delivery?.emotion || 'neutral'})`);

        // Synthesize audio
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

        console.log(`[Export] Turn ${turn.turnIndex}: Generated ${response.durationMs}ms audio (${response.audio.length} bytes)`);

        // Add to clips array
        clips.push({
          turnIndex: turn.turnIndex,
          speakerId: turn.speakerId,
          audio: response.audio,
          durationMs: response.durationMs,
          pauseAfterMs: delivery?.pause_after_ms || 300,
        });

      } catch (turnError) {
        console.error(`[Export] Failed to generate audio for turn ${turn.turnIndex}:`, turnError);
        // Continue with remaining turns
      }
    }

    if (clips.length === 0) {
      return NextResponse.json(
        { error: 'Failed to generate audio for any turns.' },
        { status: 500 }
      );
    }

    console.log(`[Export] Composing ${clips.length} clips into final audio...`);

    // Compose all clips into single audio file
    const composed = composeAudioClips(clips);
    
    console.log(`[Export] Final audio: ${composed.audio.length} bytes, ${composed.totalDurationMs}ms duration`);

    // Save audio clips to database
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]!;
      const cacheKey = generateClipCacheKey(
        providerId,
        speakerVoiceMap[clip.speakerId] ?? ttsResolved?.voiceIds?.[0] ?? 'mock-km-male-1',
        project.turns[i]!.text,
        (project.turns[i]!.delivery as any)?.pace,
        (project.turns[i]!.delivery as any)?.emotion
      );

      await prisma.audioClip.upsert({
        where: { turnId: project.turns[i]!.id },
        create: {
          projectId: id,
          turnId: project.turns[i]!.id,
          providerId,
          voiceId: speakerVoiceMap[clip.speakerId] ?? ttsResolved?.voiceIds?.[0] ?? 'mock-km-male-1',
          textHash: cacheKey,
          s3Key: `projects/${id}/clips/${i}.wav`,
          durationMs: clip.durationMs,
          format: 'wav',
          sizeBytes: clip.audio.length,
          cached: false,
          startTimeMs: composed.timestamps[i]?.startMs || 0,
        },
        update: {
          durationMs: clip.durationMs,
          sizeBytes: clip.audio.length,
          startTimeMs: composed.timestamps[i]?.startMs || 0,
        },
      });
    }

    // Generate transcript
    const transcript = generateTranscript(
      project.turns.map((t) => ({
        turnIndex: t.turnIndex,
        speakerId: t.speakerId,
        text: t.text,
      })),
      composed.timestamps,
      speakerNames
    );

    // Generate show notes
    const segments = (project.outline?.segments as Array<{ id: string; title: string; duration_seconds: number }>) || [];
    const facts = project.sources.flatMap((s) => s.facts.map((f) => ({ id: f.id, content: f.content })));

    const showNotes = generateShowNotes(
      segments,
      composed.timestamps,
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
        content: transcript.entries as unknown as Prisma.InputJsonValue,
        srt: transcript.srt,
        vtt: transcript.vtt,
      },
      update: {
        content: transcript.entries as unknown as Prisma.InputJsonValue,
        srt: transcript.srt,
        vtt: transcript.vtt,
      },
    });

    await prisma.showNotes.upsert({
      where: { projectId: id },
      create: {
        projectId: id,
        summary: showNotes.summary,
        chapters: showNotes.chapters as unknown as Prisma.InputJsonValue,
        takeaways: showNotes.takeaways as unknown as Prisma.InputJsonValue,
        factList: showNotes.factList as unknown as Prisma.InputJsonValue,
      },
      update: {
        summary: showNotes.summary,
        chapters: showNotes.chapters as unknown as Prisma.InputJsonValue,
        takeaways: showNotes.takeaways as unknown as Prisma.InputJsonValue,
        factList: showNotes.factList as unknown as Prisma.InputJsonValue,
      },
    });

    // Build manifest
    const totalDurationMs = composed.totalDurationMs || 
      project.turns.reduce((sum, t) => sum + (t.estimatedSeconds || 5) * 1000, 0);

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
    console.log(`[Export] Building ZIP package...`);
    const exportResult = buildExportZip({
      title: project.title,
      language: project.language,
      audio: composed.audio,
      transcript,
      showNotes,
      manifest,
    });

    console.log(`[Export] ZIP created: ${exportResult.zipBuffer.length} bytes`);

    // Record export
    await prisma.exportPackage.create({
      data: {
        projectId: id,
        format: 'zip',
        s3Key: `exports/${id}/${exportResult.fileName}`,
        sizeBytes: exportResult.zipBuffer.length,
        manifest: manifest as unknown as Prisma.InputJsonValue,
        includesAi: true,
      },
    });

    // Update project status
    await prisma.project.update({
      where: { id },
      data: { status: 'EXPORTED' },
    });

    console.log(`[Export] Complete! ZIP: ${exportResult.zipBuffer.length} bytes`);

    // Return ZIP as download
    return new NextResponse(new Uint8Array(exportResult.zipBuffer), {
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