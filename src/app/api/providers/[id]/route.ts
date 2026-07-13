import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { providerUpdateSchema } from '@/lib/validation/schemas';
import { encryptApiKey, maskApiKey } from '@/lib/crypto';
import { validateUrl } from '@/lib/ssrf';

/**
 * GET /api/providers/:id
 * Get a single provider configuration.
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
    return NextResponse.json({ error: 'Failed to fetch provider' }, { status: 500 });
  }
}

/**
 * PATCH /api/providers/:id
 * Update a provider configuration.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = 'default-user';
    const body = await request.json();

    const validation = providerUpdateSchema.safeParse(body);
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
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // SSRF check if URL is being updated
    if (data.baseUrl) {
      const ssrfResult = await validateUrl(data.baseUrl);
      if (!ssrfResult.safe) {
        return NextResponse.json(
          { error: `URL validation failed: ${ssrfResult.reason}` },
          { status: 400 }
        );
      }
    }

    // Update provider
    const { apiKey, ...providerData } = data;
    const updated = await prisma.provider.update({
      where: { id },
      data: {
        ...providerData,
        customHeaders: providerData.customHeaders ?? undefined,
        costMetadata: providerData.costMetadata ?? undefined,
        requestTemplate: providerData.requestTemplate ?? undefined,
        voiceIds: providerData.voiceIds ?? undefined,
      },
    });

    // Update API key if provided
    if (apiKey) {
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
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'provider.update',
        resource: 'provider',
        resourceId: id,
        metadata: { updatedFields: Object.keys(data) },
      },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      hasApiKey: !!(apiKey || (await prisma.providerSecret.findUnique({ where: { providerId: id } }))),
      maskedApiKey: apiKey ? maskApiKey(apiKey) : undefined,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('PATCH /api/providers/:id error:', error);
    return NextResponse.json({ error: 'Failed to update provider' }, { status: 500 });
  }
}

/**
 * DELETE /api/providers/:id
 * Delete a provider and its associated secrets.
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

    // Delete cascades handle secrets, health, capabilities, benchmarks
    await prisma.provider.delete({ where: { id } });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'provider.delete',
        resource: 'provider',
        resourceId: id,
        metadata: { name: existing.name },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/providers/:id error:', error);
    return NextResponse.json({ error: 'Failed to delete provider' }, { status: 500 });
  }
}
