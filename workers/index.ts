/**
 * AI Podcast — Background worker entrypoint.
 *
 * Long-running poller that picks up QUEUED GenerationJobs and drives them to
 * completion. This is the execution path for LONG-FORM episodes: the API route
 * hands AUDIO_FULL jobs with many turns to this worker instead of running
 * synchronous TTS in the serverless request path (which would time out).
 *
 * Build: `npm run build:worker` (esbuild bundles to dist/workers/index.js)
 * Run:   `node dist/workers/index.js`
 *
 * Job handling:
 *  - AUDIO_FULL: synthesize every turn with the project's TTS provider
 *    (real cache: skips turns whose clip bytes already exist), persist clips +
 *    composed episode to storage, auto-generate the episode thumbnail, update
 *    progress as turns complete.
 *  - Other types: claim/heartbeat bookkeeping (integration point).
 */

import { PrismaClient, JobStatus } from '@prisma/client';

// Imported lazily to keep the bundle small for the polling loop.
const prisma = new PrismaClient();

declare global {
  // eslint-disable-next-line no-var
  var __workerShuttingDown: boolean | undefined;
}

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000);
const STALE_AFTER_MS = Number(process.env.WORKER_STALE_AFTER_MS ?? 60_000);
const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

let shuttingDown = false;

async function claimNextJob() {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS);

  const candidate = await prisma.generationJob.findFirst({
    where: {
      status: { in: ['QUEUED', 'RUNNING'] },
      OR: [
        { status: 'QUEUED' },
        { startedAt: { lt: staleBefore } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!candidate) return null;

  if (candidate.attempts >= candidate.maxAttempts) {
    await prisma.generationJob.update({
      where: { id: candidate.id },
      data: { status: 'FAILED', error: 'Max attempts exceeded by worker' },
    });
    return null;
  }

  const job = await prisma.generationJob.updateMany({
    where: { id: candidate.id, status: { in: ['QUEUED', 'RUNNING'] } },
    data: {
      status: 'RUNNING',
      attempts: { increment: 1 },
      startedAt: new Date(),
      error: null,
    },
  });

  if (job.count === 0) return null; // lost the claim race
  return prisma.generationJob.findUnique({ where: { id: candidate.id } });
}

async function heartbeat(jobId: string) {
  await prisma.generationJob.update({
    where: { id: jobId },
    data: { startedAt: new Date() },
  });
}

async function runCycle() {
  try {
    const job = await claimNextJob();
    if (!job) return;

    console.log(`[worker] claimed job ${job.id} (${job.type}) attempt ${job.attempts}`);

    if (job.type === 'AUDIO_FULL') {
      await runAudioFull(job.id);
    } else {
      // Bookkeeping path for other job types (integration point).
      for (let step = 0; step <= (job.totalSteps ?? 3); step++) {
        if (shuttingDown) break;
        await heartbeat(job.id);
        await prisma.generationJob.update({
          where: { id: job.id },
          data: { progress: (step / Math.max(job.totalSteps ?? 3, 1)) * 100, completedSteps: step },
        });
        await new Promise((r) => setTimeout(r, 250));
      }
      await prisma.generationJob.update({
        where: { id: job.id },
        data: { status: 'COMPLETED', progress: 100, completedAt: new Date() },
      });
      console.log(`[worker] completed job ${job.id}`);
    }
  } catch (err) {
    console.error('[worker] cycle error:', err);
  }
}

/**
 * Real long-form TTS execution: synthesize every turn, persist clips and the
 * composed episode, auto-generate the thumbnail, and update progress along the
 * way. Runs outside the serverless request path so long episodes cannot time out.
 */
async function runAudioFull(jobId: string) {
  const { processAudioFullJob } = await import('./audio-full');
  const result = await processAudioFullJob(prisma, jobId, {
    onProgress: async (progress, completedSteps, totalSteps) => {
      await prisma.generationJob.update({
        where: { id: jobId },
        data: { progress, completedSteps, totalSteps },
      });
    },
  });

  await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      status: result.ok ? 'COMPLETED' : 'FAILED',
      progress: result.ok ? 100 : 0,
      completedAt: result.ok ? new Date() : undefined,
      error: result.ok ? null : result.error ?? 'Audio generation failed',
      result: result.ok
        ? { totalDurationMs: result.totalDurationMs, clipCount: result.clipCount, cacheHits: result.cacheHits }
        : undefined,
    },
  });
  console.log(`[worker] AUDIO_FULL job ${jobId} ${result.ok ? 'completed' : `failed: ${result.error}`}`);
}

async function main() {
  console.log(`[worker] AI Podcast worker started (poll ${POLL_INTERVAL_MS}ms)`);
  for (const sig of SHUTDOWN_SIGNALS) {
    process.on(sig, () => {
      shuttingDown = true;
      globalThis.__workerShuttingDown = true;
      console.log(`[worker] received ${sig}, shutting down after current cycle`);
      setTimeout(() => process.exit(0), 2_000);
    });
  }

  // eslint-disable-next-line no-constant-condition
  while (!shuttingDown) {
    await runCycle();
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('[worker] fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});

export type { JobStatus };
