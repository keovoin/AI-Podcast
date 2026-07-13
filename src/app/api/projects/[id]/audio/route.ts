import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getTTSAdapter } from '@/lib/providers/registry';
import { decryptApiKey } from '@/lib/crypto';
import { RoutingEngine } from '@/lib/routing/engine';
import { normalizeKhmerText } from '@/lib/normalization/khmer';
import { composeAudioClips, generateClipCacheKey } from '@/lib/audio/composition';
import type { AudioClipInput } from '@/lib/audio/composition';
import type { RoutableProvider } from '@/lib/routing/engine';
import type { AdapterConfig } from '@/lib/providers/adapters/base';
import type { AdapterType, HealthStatus } from '@/types/provider';

/**
 * POST /api/projects/:id/audio
 * Generate audio for all turns (or a single turn if turnIndex is specified).
 * Each turn gets its own TTS clip, cached by content hash.
 * After all clips are generated, composes them into a single file.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = 'default-user';
    const body = await request.json().catch(() => ({}));
    const singleTurnIndex: number | undefined = body?.turnIndex;

    const project = await prisma.project.findFirst({
      where: { id, userId },
      include: {
        speakers: { include: { speaker: true } },
        turns: { orderBy: { turnIndex: 'asc' }, include: { clip: true } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.turns.length === 0) {
      return NextResponse.json({ error: 'No dialogue turns. Generate dialogue first.' }, { status: 400 });
    }

    // Resolve TTS provider
    const ttsResolved = await resolveTTSProvider(userId, project.lockedTtsId, project.routingMode);
    if (!ttsResolved) {
      return NextResponse.json(
        { error: 'No available TTS provider. Configure one in Provider Settings.' },
        { status: 400 }
      );
    }

    // Build speaker -> voice mapping
    const speakerVoiceMap = buildSpeakerVoiceMap(project.speakers, ttsResolved.voiceIds);

    // Determine which turns to generate
    const turnsToProcess = singleTurnIndex !== undefined
      ? project.turns.filter((t) => t.turnIndex === singleTurnIndex)
      : project.turns;

    if (turnsToProcess.length === 0) {
      return NextResponse.json({ error: `Turn ${singleTurnIndex} not found.` }, { status: 404 });
    }

    // Create job record
    const job = await prisma.generationJob.create({
      data: {
        projectId: id,
        type: singleTurnIndex !== undefined ? 'AUDIO_SINGLE' : 'AUDIO_FULL',
        status: 'RUNNING',
        totalSteps: turnsToProcess.length,
        startedAt: new Date(),
      },
    });

    // Update project status
    await prisma.project.update({
      where: { id },
      data: { status: 'GENERATING_AUDIO' },
    });

    // Generate audio per turn
    const adapter = getTTSAdapter(ttsResolved.adapterType as AdapterType);
    const generatedClips: AudioClipInput[] = [];
    let completedSteps = 0;

    for (const turn of turnsToProcess) {
      try {
        const voiceId = speakerVoiceMap[turn.speakerId] || ttsResolved.voiceIds?.[0] || 'default';
        const delivery = turn.delivery as { emotion?: string; pace?: string; pause_after_ms?: number } | null;

        // Normalize text for TTS
        const normalized = normalizeKhmerText(turn.text, project.language);
        const ttsText = normalized.normalized;

        // Check cache
        const cacheKey = generateClipCacheKey(
          ttsResolved.providerId,
          voiceId,
          ttsText,
          delivery?.pace,
          delivery?.emotion
        );

        // Check if clip already exists with same hash
        const existingClip = await prisma.audioClip.findFirst({
          where: { textHash: cacheKey, providerId: ttsResolved.providerId, voiceId },
        });

        let audio: Buffer;
        let durationMs: number;

        if (existingClip && !singleTurnIndex) {
          // Use cached clip - skip TTS call
          // In production, we'd fetch from S3. For now, regenerate.
          // This is the cache-hit path placeholder.
          const response = await adapter.synthesize(
            {
              text: ttsText,
              voiceId,
              language: project.language,
              emotion: delivery?.emotion,
              pace: delivery?.pace as 'slow' | 'normal' | 'fast' | undefined,
              outputFormat: 'wav',
            },
            ttsResolved.config
          );
          audio = response.audio;
          durationMs = response.durationMs;
        } else {
          // Generate new clip
          const response = await adapter.synthesize(
            {
              text: ttsText,
              voiceId,
              language: project.language,
              emotion: delivery?.emotion,
              pace: delivery?.pace as 'slow' | 'normal' | 'fast' | undefined,
              outputFormat: 'wav',
            },
            ttsResolved.config
          );
          audio = response.audio;
          durationMs = response.durationMs;
        }

        // Store normalized text
        await prisma.dialogueTurn.update({
          where: { id: turn.id },
          data: { normalizedText: ttsText },
        });

        // Upsert audio clip record
        await prisma.audioClip.upsert({
          where: { turnId: turn.id },
          create: {
            projectId: id,
            turnId: turn.id,
            providerId: ttsResolved.providerId,
            voiceId,
            textHash: cacheKey,
            s3Key: `projects/${id}/clips/${turn.turnIndex}.wav`,
            durationMs,
            format: 'wav',
            sizeBytes: audio.length,
            cached: false,
          },
          update: {
            providerId: ttsResolved.providerId,
            voiceId,
            textHash: cacheKey,
            durationMs,
            sizeBytes: audio.length,
          },
        });

        generatedClips.push({
          turnIndex: turn.turnIndex,
          speakerId: turn.speakerId,
          audio,
          durationMs,
          pauseAfterMs: delivery?.pause_after_ms || 300,
        });

        completedSteps++;
        await prisma.generationJob.update({
          where: { id: job.id },
          data: {
            completedSteps,
            progress: completedSteps / turnsToProcess.length,
          },
        });
      } catch (turnError) {
        console.error(`Failed to generate audio for turn ${turn.turnIndex}:`, turnError);
        // Continue with remaining turns
      }
    }

    // Compose all clips into final audio (include existing clips for full generation)
    let composedResult;
    if (singleTurnIndex === undefined) {
      composedResult = composeAudioClips(generatedClips);

      // Update timestamps on clips
      for (const ts of composedResult.timestamps) {
        const turn = project.turns.find((t) => t.turnIndex === ts.turnIndex);
        if (turn) {
          await prisma.audioClip.updateMany({
            where: { turnId: turn.id },
            data: { startTimeMs: ts.startMs },
          });
        }
      }
    }

    // Mark job complete
    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        progress: 1,
        completedSteps,
        result: composedResult
          ? { totalDurationMs: composedResult.totalDurationMs, clipCount: generatedClips.length }
          : { clipCount: generatedClips.length },
      },
    });

    // Update project status
    await prisma.project.update({
      where: { id },
      data: { status: 'AUDIO_READY' },
    });

    return NextResponse.json({
      jobId: job.id,
      status: 'COMPLETED',
      clipsGenerated: generatedClips.length,
      totalDurationMs: composedResult?.totalDurationMs,
      timestamps: composedResult?.timestamps,
    });
  } catch (error) {
    console.error('POST /api/projects/:id/audio error:', error);
    return NextResponse.json(
      { error: 'Audio generation failed', details: error instanceof Error ? error.message : 'Unknown' },
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
    // Priority: voiceOverride > speaker.voiceId > provider voice by index
    const voice = ps.voiceOverride || ps.speaker.voiceId || availableVoices[index % Math.max(availableVoices.length, 1)] || 'default';
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
