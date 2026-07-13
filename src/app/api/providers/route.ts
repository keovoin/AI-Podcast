import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { providerCreateSchema } from '@/lib/validation/schemas';
import { encryptApiKey, maskApiKey } from '@/lib/crypto';
import { validateUrl } from '@/lib/ssrf';

/**
 * GET /api/providers
 * List all providers for the current user.
 * Returns masked API keys only.
 */
export async function GET(_request: NextRequest) {
  try {
    // TODO: Get userId from auth session
    const userId = 'default-user';

    const providers = await prisma.provider.findMany({
      where: { userId },
      include: {
        secret: true,
        health: true,
        capabilities: true,
        benchmarks: {
          select: { weightedScore: true, approved: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { priority: 'desc' },
    });

    const response = providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      category: provider.category,
      adapterType: provider.adapterType,
      baseUrl: provider.baseUrl,
      endpointPath: provider.endpointPath,
      model: provider.model,
      authType: provider.authType,
      authHeaderName: provider.authHeaderName,
      customHeaders: provider.customHeaders,
      timeoutMs: provider.timeoutMs,
      enabled: provider.enabled,
      priority: provider.priority,
      costMetadata: provider.costMetadata,
      monthlyBudget: provider.monthlyBudget,
      dataResidency: provider.dataResidency,
      allowSensitive: provider.allowSensitive,
      requestTemplate: provider.requestTemplate,
      responseJsonPath: provider.responseJsonPath,
      audioResponseType: provider.audioResponseType,
      voiceIds: provider.voiceIds,
      hasApiKey: !!provider.secret,
      maskedApiKey: provider.secret ? '****' : undefined,
      health: provider.health
        ? {
            status: provider.health.status,
            lastChecked: provider.health.lastChecked,
            lastLatencyMs: provider.health.lastLatencyMs,
            avgLatencyMs: provider.health.avgLatencyMs,
            successRate: provider.health.successRate,
            totalRequests: provider.health.totalRequests,
            failedRequests: provider.health.failedRequests,
            lastError: provider.health.lastError,
            consecutiveFails: provider.health.consecutiveFails,
          }
        : undefined,
      hasBenchmark: provider.benchmarks.length > 0,
      benchmarkScore: provider.benchmarks[0]?.weightedScore ?? null,
      benchmarkApproved: provider.benchmarks[0]?.approved ?? false,
      createdAt: provider.createdAt.toISOString(),
      updatedAt: provider.updatedAt.toISOString(),
    }));

    return NextResponse.json(response);
  } catch (error) {
    console.error('GET /api/providers error:', error);
    // Handle Prisma connection errors gracefully
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('prisma') || message.includes('connect') || message.includes('ECONNREFUSED') || message.includes('does not exist')) {
      return NextResponse.json(
        { error: 'Database not connected. Please run the SQL init script in your database.' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch providers' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/providers
 * Create a new provider configuration.
 * API key is encrypted before storage.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Strip empty strings — convert to undefined for Zod optional fields
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === '' || value === null) continue;
      cleaned[key] = value;
    }

    const validation = providerCreateSchema.safeParse(cleaned);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const data = validation.data;

    // SSRF check on base URL
    if (data.baseUrl) {
      const ssrfResult = await validateUrl(data.baseUrl);
      if (!ssrfResult.safe) {
        return NextResponse.json(
          { error: `URL validation failed: ${ssrfResult.reason}` },
          { status: 400 }
        );
      }
    }

    // TODO: Get userId from auth session
    const userId = 'default-user';

    // Create provider
    const provider = await prisma.provider.create({
      data: {
        userId,
        name: data.name,
        category: data.category,
        adapterType: data.adapterType,
        baseUrl: data.baseUrl,
        endpointPath: data.endpointPath,
        model: data.model,
        authType: data.authType,
        authHeaderName: data.authHeaderName,
        customHeaders: data.customHeaders ?? undefined,
        timeoutMs: data.timeoutMs,
        enabled: data.enabled,
        priority: data.priority,
        costMetadata: data.costMetadata ?? undefined,
        monthlyBudget: data.monthlyBudget,
        dataResidency: data.dataResidency,
        allowSensitive: data.allowSensitive,
        requestTemplate: data.requestTemplate ?? undefined,
        responseJsonPath: data.responseJsonPath,
        audioResponseType: data.audioResponseType,
        voiceIds: data.voiceIds ?? undefined,
      },
    });

    // Encrypt and store API key
    if (data.apiKey) {
      const encrypted = encryptApiKey(data.apiKey);
      await prisma.providerSecret.create({
        data: {
          providerId: provider.id,
          encryptedKey: encrypted.encryptedKey,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
        },
      });
    }

    // Create initial health record
    await prisma.providerHealth.create({
      data: {
        providerId: provider.id,
        status: 'UNKNOWN',
      },
    });

    // Audit log (without secrets)
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'provider.create',
        resource: 'provider',
        resourceId: provider.id,
        metadata: {
          name: data.name,
          category: data.category,
          adapterType: data.adapterType,
        },
      },
    });

    return NextResponse.json(
      {
        id: provider.id,
        name: provider.name,
        category: provider.category,
        adapterType: provider.adapterType,
        hasApiKey: !!data.apiKey,
        maskedApiKey: data.apiKey ? maskApiKey(data.apiKey) : undefined,
        createdAt: provider.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/providers error:', error);
    return NextResponse.json(
      { error: 'Failed to create provider' },
      { status: 500 }
    );
  }
}
