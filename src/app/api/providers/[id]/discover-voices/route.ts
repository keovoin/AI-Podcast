import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decryptApiKey } from '@/lib/crypto';
import { getTTSAdapter } from '@/lib/providers/registry';
import type { AdapterConfig } from '@/lib/providers/adapters/base';
import type { AdapterType } from '@/types/provider';

/**
 * POST /api/providers/:id/discover-voices
 * Discover available voices from a TTS provider.
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

    if (provider.category !== 'TTS') {
      return NextResponse.json(
        { error: 'Voice discovery is only supported for TTS providers' },
        { status: 400 }
      );
    }

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
    };

    const adapter = getTTSAdapter(provider.adapterType as AdapterType);
    const voices = await adapter.discoverVoices(config);

    return NextResponse.json({ voices });
  } catch (error) {
    console.error('POST /api/providers/:id/discover-voices error:', error);
    return NextResponse.json(
      { error: 'Voice discovery failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
