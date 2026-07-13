import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getLLMAdapter } from '@/lib/providers/registry';
import { decryptApiKey } from '@/lib/crypto';
import { RoutingEngine } from '@/lib/routing/engine';
import type { RoutableProvider } from '@/lib/routing/engine';
import type { AdapterConfig } from '@/lib/providers/adapters/base';
import type { AdapterType, HealthStatus } from '@/types/provider';

/**
 * POST /api/projects/:id/outline
 * Generate or regenerate the episode outline using the LLM provider.
 * The outline structures the episode into segments with durations and questions.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = 'default-user';

    const project = await prisma.project.findFirst({
      where: { id, userId },
      include: {
        speakers: { include: { speaker: true } },
        sources: { include: { facts: true } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.speakers.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 speakers are required to generate an outline' },
        { status: 400 }
      );
    }

    // Get LLM provider (via routing or manual lock)
    const llmConfig = await resolveLLMProvider(userId, project.lockedLlmId, project.routingMode);
    if (!llmConfig) {
      return NextResponse.json(
        { error: 'No available LLM provider. Configure one in Provider Settings.' },
        { status: 400 }
      );
    }

    // Build the outline generation prompt
    const prompt = buildOutlinePrompt(project);

    const adapter = getLLMAdapter(llmConfig.adapterType as AdapterType);
    const response = await adapter.generateText(
      {
        prompt,
        systemPrompt: OUTLINE_SYSTEM_PROMPT,
        model: llmConfig.model,
        temperature: 0.7,
        maxTokens: 4096,
        responseFormat: 'json',
      },
      llmConfig.config
    );

    // Parse and validate outline
    let outline;
    try {
      outline = JSON.parse(response.text);
    } catch {
      return NextResponse.json(
        { error: 'LLM returned invalid JSON. Try regenerating.' },
        { status: 500 }
      );
    }

    // Ensure structure
    if (!outline.segments || !Array.isArray(outline.segments)) {
      return NextResponse.json(
        { error: 'LLM output missing segments array.' },
        { status: 500 }
      );
    }

    // Calculate total duration
    const totalDuration = outline.segments.reduce(
      (sum: number, seg: { duration_seconds?: number }) => sum + (seg.duration_seconds || 60),
      0
    );
    outline.total_duration_seconds = totalDuration;

    // Upsert outline
    await prisma.episodeOutline.upsert({
      where: { projectId: id },
      create: {
        projectId: id,
        segments: outline.segments,
      },
      update: {
        segments: outline.segments,
        locked: false,
      },
    });

    // Update project status
    await prisma.project.update({
      where: { id },
      data: { status: 'OUTLINE_READY' },
    });

    return NextResponse.json({
      outline,
      model: response.model,
      latencyMs: response.latencyMs,
    });
  } catch (error) {
    console.error('POST /api/projects/:id/outline error:', error);
    return NextResponse.json(
      { error: 'Outline generation failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/:id/outline
 * Edit outline segments (lock/unlock, update content).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = 'default-user';
    const body = await request.json();

    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const existing = await prisma.episodeOutline.findUnique({ where: { projectId: id } });
    if (!existing) {
      return NextResponse.json({ error: 'No outline exists. Generate one first.' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.segments !== undefined) {
      updateData.segments = body.segments;
    }
    if (body.locked !== undefined) {
      updateData.locked = body.locked;
    }

    const updated = await prisma.episodeOutline.update({
      where: { projectId: id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/projects/:id/outline error:', error);
    return NextResponse.json({ error: 'Failed to update outline' }, { status: 500 });
  }
}

/**
 * GET /api/projects/:id/outline
 * Get current outline.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = 'default-user';

    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const outline = await prisma.episodeOutline.findUnique({ where: { projectId: id } });
    if (!outline) {
      return NextResponse.json({ error: 'No outline exists' }, { status: 404 });
    }

    return NextResponse.json(outline);
  } catch (error) {
    console.error('GET /api/projects/:id/outline error:', error);
    return NextResponse.json({ error: 'Failed to get outline' }, { status: 500 });
  }
}

// === Helpers ===

const OUTLINE_SYSTEM_PROMPT = `You are a podcast producer. Generate a structured episode outline in JSON format.
Output ONLY valid JSON with this structure:
{
  "segments": [
    {
      "id": "seg_1",
      "title": "Segment title",
      "duration_seconds": 60,
      "lead_speaker_id": "speaker_id",
      "questions": ["Question 1", "Question 2"],
      "locked": false
    }
  ]
}

Rules:
- Each segment has a clear focus
- Questions drive natural conversation
- Distribute speaking time across speakers
- Include introduction and conclusion segments
- Duration should roughly match the target episode length
- Use actual speaker IDs provided in the prompt`;

function buildOutlinePrompt(project: {
  title: string;
  topic?: string | null;
  objective?: string | null;
  audience?: string | null;
  language: string;
  targetDuration?: number | null;
  style?: string | null;
  requiredPoints?: unknown;
  excludedPoints?: unknown;
  speakers: Array<{ speaker: { id: string; name: string; role?: string | null; personality?: string | null } }>;
  sources: Array<{ facts: Array<{ id: string; content: string }> }>;
}): string {
  const speakers = project.speakers.map((ps) => ({
    id: ps.speaker.id,
    name: ps.speaker.name,
    role: ps.speaker.role,
    personality: ps.speaker.personality,
  }));

  const facts = project.sources.flatMap((s) => s.facts.map((f) => ({ id: f.id, content: f.content })));

  return `Generate a podcast episode outline for:

Title: ${project.title}
Topic: ${project.topic || 'General discussion'}
Objective: ${project.objective || 'Informative and engaging conversation'}
Audience: ${project.audience || 'General audience'}
Language: ${project.language}
Target Duration: ${project.targetDuration || 300} seconds
Style: ${project.style || 'conversational'}

Speakers:
${speakers.map((s) => `- ${s.id}: ${s.name} (${s.role || 'Speaker'}) - ${s.personality || 'Neutral'}`).join('\n')}

${(project.requiredPoints as string[] | null)?.length ? `Required points to cover:\n${(project.requiredPoints as string[]).map((p) => `- ${p}`).join('\n')}` : ''}
${(project.excludedPoints as string[] | null)?.length ? `Points to avoid:\n${(project.excludedPoints as string[]).map((p) => `- ${p}`).join('\n')}` : ''}
${facts.length > 0 ? `Available facts (reference by ID):\n${facts.map((f) => `- [${f.id}] ${f.content}`).join('\n')}` : ''}

Generate 3-5 segments that cover the topic naturally. Include an introduction and conclusion.`;
}

interface ResolvedLLM {
  adapterType: string;
  model?: string;
  config: AdapterConfig;
}

async function resolveLLMProvider(
  userId: string,
  lockedLlmId: string | null,
  routingMode: string
): Promise<ResolvedLLM | null> {
  // If manually locked, use that provider
  const targetId = lockedLlmId;

  let provider;
  if (targetId) {
    provider = await prisma.provider.findFirst({
      where: { id: targetId, userId, enabled: true, category: 'LLM' },
      include: { secret: true, health: true },
    });
  } else {
    // Use routing engine to select
    const providers = await prisma.provider.findMany({
      where: { userId, category: 'LLM', enabled: true },
      include: { secret: true, health: true, capabilities: true, benchmarks: { take: 1, orderBy: { createdAt: 'desc' } } },
    });

    if (providers.length === 0) return null;

    const routable: RoutableProvider[] = providers.map((p) => ({
      id: p.id,
      name: p.name,
      category: 'LLM',
      enabled: p.enabled,
      priority: p.priority,
      model: p.model || undefined,
      allowSensitive: p.allowSensitive,
      health: {
        status: (p.health?.status || 'UNKNOWN') as HealthStatus,
        avgLatencyMs: p.health?.avgLatencyMs || undefined,
        successRate: p.health?.successRate || undefined,
      },
      benchmark: p.benchmarks.length > 0 ? { weightedScore: p.benchmarks[0]?.weightedScore || undefined, approved: p.benchmarks[0]?.approved || false } : undefined,
      costPerRequest: (p.costMetadata as Record<string, number> | null)?.costPerRequest,
    }));

    const engine = new RoutingEngine();
    const recommendation = engine.recommend({ category: 'LLM', mode: routingMode as any }, routable);
    if (!recommendation) return null;

    provider = providers.find((p) => p.id === recommendation.providerId);
  }

  if (!provider) return null;

  let apiKey = '';
  if (provider.secret) {
    apiKey = decryptApiKey({
      encryptedKey: provider.secret.encryptedKey,
      iv: provider.secret.iv,
      authTag: provider.secret.authTag,
    });
  }

  return {
    adapterType: provider.adapterType,
    model: provider.model || undefined,
    config: {
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
    },
  };
}
