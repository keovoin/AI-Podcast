import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decryptApiKey } from '@/lib/crypto';
import { getLLMAdapter, getTTSAdapter } from '@/lib/providers/registry';
import type { AdapterConfig } from '@/lib/providers/adapters/base';
import type { AdapterType } from '@/types/provider';

/**
 * POST /api/providers/:id/test
 * Test the connection to a configured provider.
 * Returns health status and latency.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = 'default-user';

    const provider = await prisma.provider.findFirst({
      where: { id, userId },
      include: { secret: true },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Build adapter config
    let apiKey = '';
    if (provider.secret) {
      apiKey = decryptApiKey({
        encryptedKey: provider.secret.encryptedKey,
        iv: provider.secret.iv,
        authTag: provider.secret.authTag,
      });
    }

    const config: AdapterConfig = {
      baseUrl: provider.baseUrl || '',
      apiKey,
      model: provider.model || undefined,
      endpointPath: provider.endpointPath || undefined,
      authType: provider.authType,
      authHeaderName: provider.authHeaderName || undefined,
      customHeaders: (provider.customHeaders as Record<string, string>) || undefined,
      timeoutMs: provider.timeoutMs,
      requestTemplate: (provider.requestTemplate as Record<string, unknown>) || undefined,
      responseJsonPath: provider.responseJsonPath || undefined,
      audioResponseType: provider.audioResponseType || undefined,
    };

    // Get the appropriate adapter
    let result;
    if (provider.category === 'LLM') {
      const adapter = getLLMAdapter(provider.adapterType as AdapterType);
      result = await adapter.healthCheck(config);
    } else if (provider.category === 'TTS') {
      const adapter = getTTSAdapter(provider.adapterType as AdapterType);
      result = await adapter.healthCheck(config);
    } else {
      return NextResponse.json({ error: 'Unsupported provider category for testing' }, { status: 400 });
    }

    // Update health record
    const newStatus = result.healthy ? 'HEALTHY' : 'UNHEALTHY';
    await prisma.providerHealth.upsert({
      where: { providerId: id },
      create: {
        providerId: id,
        status: newStatus,
        lastChecked: new Date(),
        lastLatencyMs: result.latencyMs,
        lastError: result.error,
      },
      update: {
        status: newStatus,
        lastChecked: new Date(),
        lastLatencyMs: result.latencyMs,
        avgLatencyMs: result.latencyMs, // simplified; would normally use rolling avg
        lastError: result.error,
        totalRequests: { increment: 1 },
        failedRequests: result.healthy ? undefined : { increment: 1 },
        consecutiveFails: result.healthy ? 0 : { increment: 1 },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'provider.test',
        resource: 'provider',
        resourceId: id,
        metadata: {
          healthy: result.healthy,
          latencyMs: result.latencyMs,
        },
      },
    });

    return NextResponse.json({
      healthy: result.healthy,
      latencyMs: result.latencyMs,
      error: result.error,
      metadata: result.metadata,
      testedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('POST /api/providers/:id/test error:', error);
    return NextResponse.json(
      { error: 'Connection test failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
