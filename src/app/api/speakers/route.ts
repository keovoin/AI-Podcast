import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const userId = 'default-user';
  const speakers = await prisma.speaker.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  return NextResponse.json(speakers);
}

export async function POST(request: NextRequest) {
  const userId = 'default-user';
  const body = await request.json();
  const speaker = await prisma.speaker.create({
    data: { userId, name: body.name, role: body.role, personality: body.personality, voiceId: body.voiceId, formality: body.formality ?? 50, energy: body.energy ?? 50, humor: body.humor ?? 30, assertiveness: body.assertiveness ?? 50 },
  });
  return NextResponse.json(speaker, { status: 201 });
}
