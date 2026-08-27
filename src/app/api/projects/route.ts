import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getRequestUserId } from '@/lib/auth';
import { projectCreateSchema } from '@/lib/validation/schemas';

/**
 * GET /api/projects
 * List all projects for the current user.
 * - Default: returns the plain array (backward compatible with the existing UI).
 * - With ?page=&limit=: returns { projects, pagination }.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = getRequestUserId(request);
    const { searchParams } = new URL(request.url);
    const hasPagination = searchParams.has('page') || searchParams.has('limit');

    if (!hasPagination) {
      const projects = await prisma.project.findMany({
        where: { userId },
        include: {
          speakers: { include: { speaker: true } },
          _count: { select: { turns: true, clips: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });
      return NextResponse.json(projects);
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where: { userId },
        include: {
          speakers: { include: { speaker: true } },
          _count: { select: { turns: true, clips: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.project.count({ where: { userId } }),
    ]);

    return NextResponse.json({
      projects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
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
    const userId = getRequestUserId(request);

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
