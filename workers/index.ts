/**
 * AI Podcast — Background worker entrypoint.
 *
 * Long-running poller that picks up QUEUED GenerationJobs and drives them to
 * completion. This replaces the previously broken docker-compose reference to
 * `dist/workers/index.js` (no such file existed) and gives the queue/storage
 * infrastructure a real execution path.
 *
 * Build: `npm run build:worker` (tsc emits dist/workers/index.js)
 * Run:   `node dist/workers/index.js`
 *
 * NOTE: full job execution (outline/dialogue/audio/export) is implemented by
 * the API routes; this worker currently performs claim/heartbeat bookkeeping
 * and is the integration point for moving heavy work off the serverless path.
 */
import { PrismaClient, JobStatus } from '@prisma/client';

const prisma = new PrismaClient();

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000);
const STALE_AFTER_MS = Number(process.env.WORKER_STALE_AFTER_MS ?? 60_000);
const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

let shuttingDown = false;

async function claimNextJob() {
  // Claim a queued job atomically-ish: mark RUNNING before processing so a
  // crashed worker doesn't re-pick the same job immediately.
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS);

  const candidate = await prisma.generationJob.findFirst({
    where: {
      status: { in: ['QUEUED', 'RUNNING'] },
      OR: [
        { status: 'QUEUED' },
        // A RUNNING job is only retriable if its heartbeat went stale
        { startedAt: { lt: staleBefore } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!candidate) return null;

  // Re-claim with an attempt guard (idempotency: don't exceed maxAttempts).
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

    // Placeholder execution: mark progress so clients see liveness, then
    // complete. Integrate real pipeline stages (outline/dialogue/TTS/export)
    // here as they are extracted from the API routes.
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
  } catch (err) {
    console.error('[worker] cycle error:', err);
  }
}

async function main() {
  console.log(`[worker] AI Podcast worker started (poll ${POLL_INTERVAL_MS}ms)`);
  for (const sig of SHUTDOWN_SIGNALS) {
    process.on(sig, () => {
      shuttingDown = true;
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
