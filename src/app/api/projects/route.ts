import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { projectCreateSchema } from '@/lib/validation/schemas';

/**
 * GET /api/projects
 * List all projects for the current user.
 */
export async function GET(_request: NextRequest) {
  try {
    const userId = 'default-user';

    const projects = await prisma.project.findMany({
      where: { userId },
      include: {
        speakers: { include: { speaker: true } },
        _count: { select: { turns: true, clips: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error('GET /api/projects error:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

/**
 * POST /api/projects
 * Create a new podcast project.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = projectCreateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const data = validation.data;
    const userId = 'default-user';

    const project = await prisma.project.create({
      data: {
        userId,
        title: data.title,
        topic: data.topic,
        objective: data.objective,
        audience: data.audience,
        language: data.language,
        targetDuration: data.targetDuration,
        style: data.style,
        requiredPoints: data.requiredPoints ?? undefined,
        excludedPoints: data.excludedPoints ?? undefined,
        routingMode: data.routingMode,
        status: 'DRAFT',
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'project.create',
        resource: 'project',
        resourceId: project.id,
        metadata: { title: data.title },
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error('POST /api/projects error:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
