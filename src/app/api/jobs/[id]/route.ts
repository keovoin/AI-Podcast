import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getRequestUserId } from '@/lib/auth';

/**
 * GET /api/jobs/:id
 * Get job status with real progress based on completed turns.
 * Returns queued/running/retrying/completed/failed/cancelled state.
 *
 * SECURITY FIX: jobs are scoped through their project — a caller can only see
 * a job if its project belongs to the authenticated user (fixes IDOR).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getRequestUserId(request);

    const job = await prisma.generationJob.findFirst({
      where: {
        id,
        project: { userId },
      },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: job.id,
      projectId: job.projectId,
      type: job.type,
      status: job.status,
      progress: job.progress,
      totalSteps: job.totalSteps,
      completedSteps: job.completedSteps,
      result: job.result,
      error: job.error,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      startedAt: job.startedAt?.toISOString(),
      completedAt: job.completedAt?.toISOString(),
      cancelledAt: job.cancelledAt?.toISOString(),
      createdAt: job.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('GET /api/jobs/:id error:', error);
    return NextResponse.json({ error: 'Failed to fetch job' }, { status: 500 });
  }
}

/**
 * DELETE /api/jobs/:id
 * Cancel a running/queued job.
 *
 * SECURITY FIX: ownership is enforced via the project relation (fixes IDOR).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getRequestUserId(request);

    const job = await prisma.generationJob.findFirst({
      where: {
        id,
        project: { userId },
      },
    });
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.status === 'COMPLETED' || job.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Job already finished' }, { status: 400 });
    }

    await prisma.generationJob.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, status: 'CANCELLED' });
  } catch (error) {
    console.error('DELETE /api/jobs/:id error:', error);
    return NextResponse.json({ error: 'Failed to cancel job' }, { status: 500 });
  }
}
