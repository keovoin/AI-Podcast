import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const exports = await prisma.exportPackage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json(exports);
}
