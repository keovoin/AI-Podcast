import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getRequestUserId } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { getTTSAdapter } from '@/lib/providers/registry';
import { decryptApiKey } from '@/lib/crypto';
import { RoutingEngine } from '@/lib/routing/engine';
import { normalizeKhmerText } from '@/lib/normalization/khmer';
import { composeAudioClips, generateClipCacheKey } from '@/lib/audio/composition';
import type { AudioClipInput } from '@/lib/audio/composition';
import type { RoutableProvider } from '@/lib/routing/engine';
import type { AdapterConfig } from '@/lib/providers/adapters/base';
import type { AdapterType, HealthStatus } from '@/types/provider';
import { uploadFile, downloadFile } from '@/lib/storage';
import { generateThumbnailSvgBuffer } from '@/lib/thumbnail';

const AUDIO_CONTENT_TYPE = 'audio/wav';
// Long-form safety: episodes that exceed this many turns are handed to the
// background worker (workers/index.ts) instead of running synchronously in the
// serverless request path. Vercel's Hobby function timeout is 10s (60s Pro);
// a full episode with 60+ turns of real TTS cannot fit in that window.
const WORKER_HANDOFF_TURNS = 60;

/**
 * GET /api/projects/:id/audio
 * Serve the composed episode audio (or a single turn's clip with ?turnIndex=N).
 * Supports HTTP Range requests so the browser <audio> element can seek/stream.
 * Returns 202 with { status: 'NOT_READY' } if audio has not been generated yet.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getRequestUserId(request);
    const { searchParams } = new URL(request.url);
    const turnIndex = searchParams.get('turnIndex');
    const rawRange = request.headers.get('range');

    const project = await prisma.project.findFirst({
      where: { id, userId },
      include: {
        turns: { orderBy: { turnIndex: 'asc' }, include: { clip: true } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Single-clip serving: look up the clip for a specific turn
    if (turnIndex !== null) {
      const turn = project.turns.find((t) => t.turnIndex === parseInt(turnIndex, 10));
      const clip = turn?.clip;
      if (!clip) {
        return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
      }
      const key = clip.audioKey || clip.s3Key;
      const clipBuffer = await downloadFile(key);
      if (!clipBuffer || clipBuffer.length === 0) {
        return NextResponse.json(
          { error: 'Clip audio not available. Regenerate audio first.' },
          { status: 409 }
        );
      }
      return serveAudioBuffer(clipBuffer, AUDIO_CONTENT_TYPE, rawRange);
    }

    // Full episode: prefer the composed audio stored on the project
    let buffer: Buffer | null = null;
    if (project.audioKey) {
      buffer = await downloadFile(project.audioKey);
    }

    if (!buffer || buffer.length === 0) {
      // No composed episode on storage yet (e.g. clips generated but episode
      // never composed, or storage is not configured). Returning 202 lets the
      // client trigger POST /audio (regeneration) instead of a confusing 404.
      return NextResponse.json(
        { error: 'Audio not ready. Generate audio first.', status: 'NOT_READY' },
        { status: 202 }
      );
    }

    return serveAudioBuffer(buffer, AUDIO_CONTENT_TYPE, rawRange);
  } catch (error) {
    console.error('GET /api/projects/:id/audio error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audio', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/:id/audio
 * Generate audio for all turns (or a single turn if turnIndex is specified).
 * Each turn gets its own TTS clip, cached by content hash AND persisted to
 * storage so cache hits skip the TTS call entirely.
 * After all clips are generated, composes them into a single episode file,
 * persists it, and auto-generates the episode thumbnail.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getRequestUserId(request);
    const body = await request.json().catch(() => ({}));
    const singleTurnIndex: number | undefined = body?.turnIndex;

    const rate = checkRateLimit('audio-generate', userId);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429 }
      );
    }

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

    // Long-form support: hand large full-episode generations to the background
    // worker so the serverless request path never times out. The worker claims
    // QUEUED jobs and drives AUDIO_FULL jobs to completion (see workers/index.ts).
    if (singleTurnIndex === undefined && turnsToProcess.length >= WORKER_HANDOFF_TURNS) {
      const queued = await prisma.generationJob.create({
        data: {
          projectId: id,
          type: 'AUDIO_FULL',
          status: 'QUEUED',
          totalSteps: turnsToProcess.length,
          idempotencyKey: `audio-full-${id}-${Date.now()}`,
        },
      });
      await prisma.project.update({
        where: { id },
        data: { status: 'GENERATING_AUDIO' },
      });
      return NextResponse.json(
        {
          jobId: queued.id,
          status: 'QUEUED',
          message: `Episode has ${turnsToProcess.length} turns; audio generation queued to the background worker. Poll GET /api/jobs/${queued.id} for progress.`,
          progress: 0,
        },
        { status: 202 }
      );
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
    let cacheHits = 0;

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
        let usedCache = false;

        const clipStorageKey = existingClip?.audioKey || existingClip?.s3Key;

        if (existingClip && clipStorageKey) {
          // REAL cache hit: fetch the persisted clip bytes, skip the TTS call.
          const cachedBytes = await downloadFile(clipStorageKey);
          if (cachedBytes && cachedBytes.length > 0) {
            audio = cachedBytes;
            durationMs = existingClip.durationMs;
            usedCache = true;
            cacheHits++;
          } else {
            // Cache record exists but bytes are gone — synthesize fresh.
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

        // Persist clip bytes to storage so future cache hits can skip TTS
        const audioKey = `projects/${id}/clips/${turn.turnIndex}.wav`;
        await uploadFile(audioKey, audio, AUDIO_CONTENT_TYPE);

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
      // Persist the composed episode audio so GET can serve it
      if (composedResult.audio.length > 0) {
        const episodeKey = `projects/${id}/episode.wav`;
        await uploadFile(episodeKey, composedResult.audio, AUDIO_CONTENT_TYPE);
        await prisma.project.update({
          where: { id },
          data: {
            audioKey: episodeKey,
            audioUrl: `/api/projects/${id}/audio`,
          },
        });
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
          ? { totalDurationMs: composedResult.totalDurationMs, clipCount: generatedClips.length, cacheHits }
          : { clipCount: generatedClips.length, cacheHits },
      },
    });

    // Auto-generate episode thumbnail after audio completes
    let thumbnailUrl: string | null = null;
    try {
      const speakerNames = project.speakers.map((ps) => ps.speaker.name);
      const thumbnailKey = `thumbnails/${id}.svg`;
      const svgBuffer = generateThumbnailSvgBuffer({
        title: project.title,
        topic: project.topic,
        language: project.language,
        speakerNames,
        status: 'AUDIO_READY',
      });
      await uploadFile(thumbnailKey, svgBuffer, 'image/svg+xml');
      thumbnailUrl = `/api/projects/${id}/thumbnail`;
      await prisma.project.update({
        where: { id },
        data: { thumbnailKey, thumbnailUrl },
      });
    } catch (thumbError) {
      // Thumbnail failure must not fail the audio generation
      console.error('Thumbnail generation failed (non-fatal):', thumbError);
    }

    // Update project status
    await prisma.project.update({
      where: { id },
      data: { status: 'AUDIO_READY' },
    });

    return NextResponse.json({
      jobId: job.id,
      status: 'COMPLETED',
      clipsGenerated: generatedClips.length,
      cacheHits,
      totalDurationMs: composedResult?.totalDurationMs,
      timestamps: composedResult?.timestamps,
      audioUrl: `/api/projects/${id}/audio`,
      thumbnailUrl,
    });
  } catch (error) {
    console.error('POST /api/projects/:id/audio error:', error);
    return NextResponse.json(
      { error: 'Audio generation failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// === Audio serving helpers ===

function serveAudioBuffer(buffer: Buffer, contentType: string, rawRange: string | null) {
  const total = buffer.length;

  if (!rawRange) {
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(total),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // Parse "bytes=start-end" | "bytes=start-" | "bytes=-suffix"
  const match = /^bytes=(\d*)-(\d*)$/.exec(rawRange.trim());
  if (!match) {
    return new NextResponse(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${total}` },
    });
  }

  let start: number;
  let end: number;

  if (match[1] === '') {
    // Suffix range: last N bytes
    const suffix = parseInt(match[2] || '0', 10);
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = parseInt(match[1]!, 10);
    end = match[2] === '' ? total - 1 : Math.min(parseInt(match[2]!, 10), total - 1);
  }

  if (start > end || start >= total) {
    return new NextResponse(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${total}` },
    });
  }

  const chunk = buffer.subarray(start, end + 1);
  return new NextResponse(new Uint8Array(chunk), {
    status: 206,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(chunk.length),
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    },
  });
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
