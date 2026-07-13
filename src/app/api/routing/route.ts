import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { routingRequestSchema } from '@/lib/validation/schemas';
import { RoutingEngine } from '@/lib/routing/engine';
import type { RoutableProvider } from '@/lib/routing/engine';
import type { HealthStatus } from '@/types/provider';

/**
 * POST /api/routing/recommend
 * Get provider routing recommendation based on request criteria.
 * Returns scored recommendations with explanations.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = routingRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const routingRequest = validation.data;
    const userId = 'default-user';

    // Fetch providers with health and benchmark data
    const providers = await prisma.provider.findMany({
      where: { userId },
      include: {
        health: true,
        capabilities: true,
        benchmarks: {
          select: { weightedScore: true, approved: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // Transform to routable providers
    const routableProviders: RoutableProvider[] = providers.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category as RoutableProvider['category'],
      enabled: p.enabled,
      priority: p.priority,
      model: p.model || undefined,
      voiceIds: (p.voiceIds as string[]) || undefined,
      monthlyBudget: p.monthlyBudget || undefined,
      dataResidency: p.dataResidency || undefined,
      allowSensitive: p.allowSensitive,
      languages: p.capabilities
        .filter((c) => c.languages)
        .flatMap((c) => (c.languages as string[]) || []),
      health: {
        status: (p.health?.status || 'UNKNOWN') as HealthStatus,
        avgLatencyMs: p.health?.avgLatencyMs || undefined,
        successRate: p.health?.successRate || undefined,
      },
      benchmark: p.benchmarks.length > 0
        ? {
            weightedScore: p.benchmarks[0]?.weightedScore || undefined,
            approved: p.benchmarks[0]?.approved || false,
          }
        : undefined,
      costPerRequest: (p.costMetadata as Record<string, number> | null)?.costPerRequest,
    }));

    // Run routing engine
    const engine = new RoutingEngine();
    const recommendation = engine.recommend(routingRequest, routableProviders);

    if (!recommendation) {
      return NextResponse.json(
        { error: 'No suitable provider found', excluded: [] },
        { status: 404 }
      );
    }

    // Log routing decision
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'routing.recommend',
        resource: 'provider',
        resourceId: recommendation.providerId,
        metadata: {
          mode: routingRequest.mode,
          category: routingRequest.category,
          score: recommendation.score.total,
          benchmarked: recommendation.benchmarked,
        },
      },
    });

    return NextResponse.json(recommendation);
  } catch (error) {
    console.error('POST /api/routing/recommend error:', error);
    return NextResponse.json(
      { error: 'Routing recommendation failed' },
      { status: 500 }
    );
  }
}
