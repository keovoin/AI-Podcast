import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { providerUpdateSchema } from '@/lib/validation/schemas';
import { encryptApiKey, maskApiKey } from '@/lib/crypto';
import { validateUrl } from '@/lib/ssrf';

/**
 * GET /api/providers/:id
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = 'default-user';

    const provider = await prisma.provider.findFirst({
      where: { id, userId },
      include: {
        secret: true,
        health: true,
        capabilities: true,
        benchmarks: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    return NextResponse.json({
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
      health: provider.health,
      capabilities: provider.capabilities,
      benchmarks: provider.benchmarks,
      createdAt: provider.createdAt.toISOString(),
      updatedAt: provider.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('GET /api/providers/:id error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch provider', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/providers/:id
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = 'default-user';
    const body = await request.json();

    // Strip empty strings — convert to undefined for Zod optional fields
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === '' || value === null) continue;
      cleaned[key] = value;
    }

    const validation = providerUpdateSchema.safeParse(cleaned);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Verify ownership
    const existing = await prisma.provider.findFirst({ where: { id, userId } });
    if (!existing) {
      return NextResponse.json({ error: 'Provider not found. Check that database tables and seed data exist.' }, { status: 404 });
    }

    // SSRF check if URL is being updated
    if (data.baseUrl) {
      const ssrfResult = await validateUrl(data.baseUrl);
      if (!ssrfResult.safe) {
        return NextResponse.json(
          { error: `URL blocked: ${ssrfResult.reason}` },
          { status: 400 }
        );
      }
    }

    // Separate apiKey from update data
    const { apiKey, ...providerData } = data;

    // Build prisma update payload, removing undefined values
    const updatePayload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(providerData)) {
      if (value !== undefined) {
        updatePayload[key] = value;
      }
    }

    // Update provider record
    const updated = await prisma.provider.update({
      where: { id },
      data: updatePayload,
    });

    // Update API key if provided
    if (apiKey) {
      try {
        const encrypted = encryptApiKey(apiKey);
        await prisma.providerSecret.upsert({
          where: { providerId: id },
          create: {
            providerId: id,
            encryptedKey: encrypted.encryptedKey,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
          },
          update: {
            encryptedKey: encrypted.encryptedKey,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
          },
        });
      } catch (encError) {
        return NextResponse.json(
          { error: 'Failed to encrypt API key. Check ENCRYPTION_MASTER_KEY env var.', details: encError instanceof Error ? encError.message : String(encError) },
          { status: 500 }
        );
      }
    }

    // Audit log (non-blocking)
    prisma.auditLog.create({
      data: {
        userId,
        action: 'provider.update',
        resource: 'provider',
        resourceId: id,
        metadata: { updatedFields: Object.keys(data) },
      },
    }).catch(() => {}); // Don't fail the request if audit log fails

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('PATCH /api/providers/:id error:', error);
    return NextResponse.json(
      { error: 'Failed to update provider', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/providers/:id
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = 'default-user';

    const existing = await prisma.provider.findFirst({ where: { id, userId } });
    if (!existing) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    await prisma.provider.delete({ where: { id } });

    prisma.auditLog.create({
      data: {
        userId,
        action: 'provider.delete',
        resource: 'provider',
        resourceId: id,
        metadata: { name: existing.name },
      },
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/providers/:id error:', error);
    return NextResponse.json(
      { error: 'Failed to delete provider', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
