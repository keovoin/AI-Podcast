import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const userId = 'default-user';

  // Get providers with health data
  const providers = await prisma.provider.findMany({
    where: { userId },
    include: { health: true },
  });

  const providerUsage = providers.map((p) => {
    const cost = (p.costMetadata as Record<string, number> | null)?.costPerRequest || 0;
    const totalReqs = p.health?.totalRequests || 0;
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      totalRequests: totalReqs,
      failedRequests: p.health?.failedRequests || 0,
      successRate: p.health?.successRate || 0,
      avgLatencyMs: p.health?.avgLatencyMs || 0,
      costPerRequest: cost,
      estimatedSpend: totalReqs * cost,
      monthlyBudget: p.monthlyBudget || undefined,
    };
  });

  const totals = {
    totalRequests: providerUsage.reduce((s, p) => s + p.totalRequests, 0),
    totalSpend: providerUsage.reduce((s, p) => s + p.estimatedSpend, 0),
    avgLatency: providerUsage.length > 0
      ? providerUsage.reduce((s, p) => s + p.avgLatencyMs, 0) / providerUsage.length
      : 0,
  };

  // Recent audit logs
  const recentAudit = await prisma.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return NextResponse.json({ providers: providerUsage, totals, recentAudit });
}
