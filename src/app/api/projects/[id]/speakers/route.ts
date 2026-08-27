import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getRequestUserId } from '@/lib/auth';
import { z } from 'zod';

const addSpeakerSchema = z.object({
  speakerId: z.string().optional(),
  // If no speakerId, create a new speaker inline
  name: z.string().min(1).max(100).optional(),
  role: z.string().max(200).optional(),
  personality: z.string().max(500).optional(),
  viewpoint: z.string().max(500).optional(),
  voiceId: z.string().max(200).optional(),
  formality: z.number().int().min(0).max(100).default(50),
  energy: z.number().int().min(0).max(100).default(50),
  humor: z.number().int().min(0).max(100).default(30),
  assertiveness: z.number().int().min(0).max(100).default(50),
  speakingShare: z.number().min(0).max(1).optional(),
  voiceOverride: z.string().optional(),
  reactions: z.boolean().default(true),
  interruptions: z.boolean().default(false),
});

/**
 * POST /api/projects/:id/speakers
 * Add a speaker to the project (existing or new).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getRequestUserId(request);
    const body = await request.json();
    const validation = addSpeakerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Verify project ownership
    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    let speakerId = data.speakerId;

    // Create new speaker if no ID provided
    if (!speakerId) {
      if (!data.name) {
        return NextResponse.json({ error: 'Speaker name or speakerId is required' }, { status: 400 });
      }
      const speaker = await prisma.speaker.create({
        data: {
          userId,
          name: data.name,
          role: data.role,
          personality: data.personality,
          viewpoint: data.viewpoint,
          voiceId: data.voiceId,
          formality: data.formality,
          energy: data.energy,
          humor: data.humor,
          assertiveness: data.assertiveness,
        },
      });
      speakerId = speaker.id;
    }

    // Link speaker to project
    const projectSpeaker = await prisma.projectSpeaker.create({
      data: {
        projectId: id,
        speakerId,
        speakingShare: data.speakingShare,
        voiceOverride: data.voiceOverride,
        reactions: data.reactions,
        interruptions: data.interruptions,
      },
      include: { speaker: true },
    });

    return NextResponse.json(projectSpeaker, { status: 201 });
  } catch (error) {
    console.error('POST /api/projects/:id/speakers error:', error);
    return NextResponse.json({ error: 'Failed to add speaker' }, { status: 500 });
  }
}
