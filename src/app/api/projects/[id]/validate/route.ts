import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getRequestUserId } from '@/lib/auth';
import { validateDialogue } from '@/lib/validation/dialogue-validator';
import type { DialogueTurn, ValidationContext } from '@/lib/validation/dialogue-validator';

/**
 * POST /api/projects/:id/validate
 * Validate the project's dialogue for schema conformance, repetition,
 * duration targets, speaker consistency, and fact references.
 * Returns structured issues and statistics.
 */
export async function POST(
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
        turns: { orderBy: { turnIndex: 'asc' } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.turns.length === 0) {
      return NextResponse.json(
        { error: 'No dialogue turns exist. Generate dialogue first.' },
        { status: 400 }
      );
    }

    // Build validation context
    const context: ValidationContext = {
      speakerIds: project.speakers.map((ps) => ps.speaker.id),
      factIds: project.sources.flatMap((s) => s.facts.map((f) => f.id)),
      targetDurationSeconds: project.targetDuration || undefined,
      language: project.language,
    };

    // Map DB turns to validation format
    const turns: DialogueTurn[] = project.turns.map((t) => ({
      id: t.id,
      turnIndex: t.turnIndex,
      speakerId: t.speakerId,
      text: t.text,
      delivery: t.delivery as DialogueTurn['delivery'],
      sourceFactIds: t.sourceFactIds as string[] | null,
      estimatedSeconds: t.estimatedSeconds,
    }));

    // Run validation
    const result = validateDialogue(turns, context);

    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/projects/:id/validate error:', error);
    return NextResponse.json(
      { error: 'Validation failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
