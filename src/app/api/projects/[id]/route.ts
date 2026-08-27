import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getRequestUserId } from '@/lib/auth';
import { projectUpdateSchema } from '@/lib/validation/schemas';

/**
 * GET /api/projects/:id
 * Get full project details including speakers, outline, turns, clips.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getRequestUserId(request);

    const project = await prisma.project.findFirst({
      where: { id, userId },
      include: {
        speakers: { include: { speaker: true } },
        sources: { include: { facts: true } },
        outline: true,
        turns: {
          orderBy: { turnIndex: 'asc' },
          include: { clip: true },
        },
        clips: true,
        jobs: { orderBy: { createdAt: 'desc' }, take: 10 },
        transcript: true,
        showNotes: true,
        exports: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error('GET /api/projects/:id error:', error);
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

/**
 * PATCH /api/projects/:id
 * Update project settings.
 *
 * SECURITY FIX: body is validated against a whitelist schema (projectUpdateSchema)
 * before being written. Arbitrary fields can no longer be mass-assigned (the
 * previous `data: body` allowed callers to overwrite userId, id, createdAt, ...).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getRequestUserId(request);
    const body = await request.json();

    const existing = await prisma.project.findFirst({ where: { id, userId } });
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const validation = projectUpdateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const data = validation.data;
    const updatePayload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) updatePayload[key] = value;
    }

    const updated = await prisma.project.update({
      where: { id },
      data: updatePayload as Prisma.ProjectUpdateInput,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/projects/:id error:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/:id
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getRequestUserId(request);

    const existing = await prisma.project.findFirst({ where: { id, userId } });
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    await prisma.project.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/projects/:id error:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
