/**
 * Worker-side AUDIO_FULL execution.
 *
 * Synthesizes every dialogue turn with the project's TTS provider, persists
 * clip bytes + composed episode to storage, and auto-generates the thumbnail.
 * The API route hands long episodes here (see POST /api/projects/:id/audio)
 * so heavy TTS work never runs inside the serverless request path.
 */

import type { PrismaClient } from '@prisma/client';
import { getTTSAdapter } from '../src/lib/providers/registry';
import { decryptApiKey } from '../src/lib/crypto';
import { RoutingEngine } from '../src/lib/routing/engine';
import { normalizeKhmerText } from '../src/lib/normalization/khmer';
import { composeAudioClips, generateClipCacheKey } from '../src/lib/audio/composition';
import { uploadFile, downloadFile } from '../src/lib/storage';
import { generateThumbnailSvgBuffer } from '../src/lib/thumbnail';
import type { AudioClipInput } from '../src/lib/audio/composition';
import type { RoutableProvider } from '../src/lib/routing/engine';
import type { AdapterConfig } from '../src/lib/providers/adapters/base';
import type { AdapterType, HealthStatus } from '../src/types/provider';

const AUDIO_CONTENT_TYPE = 'audio/wav';

export interface AudioFullResult {
  ok: boolean;
  error?: string;
  totalDurationMs?: number;
  clipCount?: number;
  cacheHits?: number;
}

export interface AudioFullCallbacks {
  onProgress: (progress: number, completedSteps: number, totalSteps: number) => Promise<void>;
}

/**
 * Process an AUDIO_FULL generation job to completion.
 * Every turn is synthesized (or served from the real cache), persisted to
 * storage, then composed into the final episode file; the thumbnail is
 * generated last. Progress is reported per turn.
 */
export async function processAudioFullJob(
  prisma: PrismaClient,
  jobId: string,
  callbacks: AudioFullCallbacks
): Promise<AudioFullResult> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, error: 'Job not found' };

  const project = await prisma.project.findFirst({
    where: { id: job.projectId },
    include: {
      speakers: { include: { speaker: true } },
      turns: { orderBy: { turnIndex: 'asc' }, include: { clip: true } },
    },
  });
  if (!project) return { ok: false, error: 'Project not found' };
  if (project.turns.length === 0) return { ok: false, error: 'No dialogue turns' };

  const ttsResolved = await resolveTTSProvider(prisma, project.userId, project.lockedTtsId, project.routingMode);
  if (!ttsResolved) {
    return { ok: false, error: 'No available TTS provider. Configure one in Provider Settings.' };
  }

  const speakerVoiceMap = buildSpeakerVoiceMap(project.speakers, ttsResolved.voiceIds);
  const adapter = getTTSAdapter(ttsResolved.adapterType as AdapterType);
  const generatedClips: AudioClipInput[] = [];
  let completedSteps = 0;
  let cacheHits = 0;

  for (const turn of project.turns) {
    if (globalThis.__workerShuttingDown) {
      return { ok: false, error: 'Worker shutting down' };
    }
    try {
      const voiceId = speakerVoiceMap[turn.speakerId] || ttsResolved.voiceIds?.[0] || 'default';
      const delivery = turn.delivery as { emotion?: string; pace?: string; pause_after_ms?: number } | null;

      const normalized = normalizeKhmerText(turn.text, project.language);
      const ttsText = normalized.normalized;

      const cacheKey = generateClipCacheKey(
        ttsResolved.providerId,
        voiceId,
        ttsText,
        delivery?.pace,
        delivery?.emotion
      );

      const existingClip = await prisma.audioClip.findFirst({
        where: { textHash: cacheKey, providerId: ttsResolved.providerId, voiceId },
      });

      let audio: Buffer;
      let durationMs: number;
      let usedCache = false;

      const clipStorageKey = existingClip?.audioKey || existingClip?.s3Key;
      if (existingClip && clipStorageKey) {
        const cachedBytes = await downloadFile(clipStorageKey);
        if (cachedBytes && cachedBytes.length > 0) {
          audio = cachedBytes;
          durationMs = existingClip.durationMs;
          usedCache = true;
          cacheHits++;
        } else {
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
      } else {
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

      const audioKey = `projects/${project.id}/clips/${turn.turnIndex}.wav`;
      await uploadFile(audioKey, audio, AUDIO_CONTENT_TYPE);

      await prisma.dialogueTurn.update({
        where: { id: turn.id },
        data: { normalizedText: ttsText },
      });

      await prisma.audioClip.upsert({
        where: { turnId: turn.id },
        create: {
          projectId: project.id,
          turnId: turn.id,
          providerId: ttsResolved.providerId,
          voiceId,
          textHash: cacheKey,
          s3Key: audioKey,
          audioKey,
          durationMs,
          format: 'wav',
          sizeBytes: audio.length,
          cached: usedCache,
        },
        update: {
          providerId: ttsResolved.providerId,
          voiceId,
          textHash: cacheKey,
          audioKey,
          durationMs,
          sizeBytes: audio.length,
          cached: usedCache,
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
      await callbacks.onProgress(completedSteps / project.turns.length, completedSteps, project.turns.length);
    } catch (turnError) {
      console.error(`[worker] Failed to generate audio for turn ${turn.turnIndex}:`, turnError);
      // Continue with remaining turns
    }
  }

  if (generatedClips.length === 0) {
    return { ok: false, error: 'Failed to generate audio for any turns' };
  }

  const composed = composeAudioClips(generatedClips);

  // Persist per-turn start timestamps
  for (const ts of composed.timestamps) {
    const turn = project.turns.find((t) => t.turnIndex === ts.turnIndex);
    if (turn) {
      await prisma.audioClip.updateMany({
        where: { turnId: turn.id },
        data: { startTimeMs: ts.startMs },
      });
    }
  }

  // Persist composed episode
  const episodeKey = `projects/${project.id}/episode.wav`;
  await uploadFile(episodeKey, composed.audio, AUDIO_CONTENT_TYPE);
  await prisma.project.update({
    where: { id: project.id },
    data: {
      audioKey: episodeKey,
      audioUrl: `/api/projects/${project.id}/audio`,
      status: 'AUDIO_READY',
    },
  });

  // Auto-generate thumbnail after audio completes (non-fatal)
  try {
    const speakerNames = project.speakers.map((ps) => ps.speaker.name);
    const thumbnailKey = `thumbnails/${project.id}.svg`;
    const svgBuffer = generateThumbnailSvgBuffer({
      title: project.title,
      topic: project.topic,
      language: project.language,
      speakerNames,
      status: 'AUDIO_READY',
    });
    await uploadFile(thumbnailKey, svgBuffer, 'image/svg+xml');
    await prisma.project.update({
      where: { id: project.id },
      data: { thumbnailKey, thumbnailUrl: `/api/projects/${project.id}/thumbnail` },
    });
  } catch (thumbError) {
    console.error('[worker] Thumbnail generation failed (non-fatal):', thumbError);
  }

  return {
    ok: true,
    totalDurationMs: composed.totalDurationMs,
    clipCount: generatedClips.length,
    cacheHits,
  };
}

// ===== helpers (mirror of the API route's helpers, kept worker-self-contained) =====

function buildSpeakerVoiceMap(
  speakers: Array<{ voiceOverride?: string | null; speaker: { id: string; voiceId?: string | null } }>,
  providerVoices?: string[]
): Record<string, string> {
  const map: Record<string, string> = {};
  const availableVoices = providerVoices || [];
  speakers.forEach((ps, index) => {
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
  prisma: PrismaClient,
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
      category: 'TTS' as const,
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
    const recommendation = engine.recommend({ category: 'TTS', mode: routingMode as never }, routable);
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
