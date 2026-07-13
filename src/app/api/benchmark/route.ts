import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const userId = 'default-user';
  const results = await prisma.providerBenchmark.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json(results);
}

export async function POST(request: NextRequest) {
  const userId = 'default-user';
  const body = await request.json();

  const result = await prisma.providerBenchmark.create({
    data: {
      providerId: body.providerId,
      userId,
      testCase: body.testCase,
      pronunciation: body.pronunciation,
      naturalness: body.naturalness,
      cambodianAccent: body.cambodianAccent,
      numberDateAcc: body.numberDateAcc,
      codeSwitching: body.codeSwitching,
      emotion: body.emotion,
      longFormStab: body.longFormStab,
      weightedScore: body.weightedScore,
      notes: body.notes,
      approved: body.approved ?? false,
    },
  });

  return NextResponse.json(result, { status: 201 });
}
