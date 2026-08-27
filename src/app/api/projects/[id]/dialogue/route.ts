import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getRequestUserId } from '@/lib/auth';
import { getLLMAdapter } from '@/lib/providers/registry';
import { decryptApiKey } from '@/lib/crypto';
import { RoutingEngine } from '@/lib/routing/engine';
import { extractTurns, normalizeTurns, estimateSeconds } from '@/lib/parsing/llm-output';
import type { RoutableProvider } from '@/lib/routing/engine';
import type { AdapterConfig } from '@/lib/providers/adapters/base';
import type { AdapterType, HealthStatus } from '@/types/provider';

/**
 * POST /api/projects/:id/dialogue
 * Generate structured dialogue turns from the episode outline.
 * Each turn follows the strict JSON contract with speaker_id, delivery, and fact refs.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getRequestUserId(request);
    const body = await request.json().catch(() => ({}));
    const targetTurns: number | undefined =
      typeof body?.targetTurns === 'number' && body.targetTurns > 0
        ? Math.min(Math.round(body.targetTurns), 100)
        : undefined;

    const project = await prisma.project.findFirst({
      where: { id, userId },
      include: {
        speakers: { include: { speaker: true } },
        sources: { include: { facts: true } },
        outline: true,
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.outline) {
      return NextResponse.json(
        { error: 'Generate an outline first before creating dialogue.' },
        { status: 400 }
      );
    }

    if (project.speakers.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 speakers are required.' },
        { status: 400 }
      );
    }

    // Resolve LLM provider
    const llmConfig = await resolveLLMProvider(userId, project.lockedLlmId, project.routingMode);
    if (!llmConfig) {
      return NextResponse.json(
        { error: 'No available LLM provider. Configure one in Provider Settings.' },
        { status: 400 }
      );
    }

    // Build dialogue generation prompt
    const prompt = buildDialoguePrompt(project, targetTurns);

    const adapter = getLLMAdapter(llmConfig.adapterType as AdapterType);
    let response;
    try {
      response = await adapter.generateText(
        {
          prompt,
          systemPrompt: DIALOGUE_SYSTEM_PROMPT,
          model: llmConfig.model,
          temperature: 0.8,
          maxTokens: 8192,
          responseFormat: 'json',
        },
        { ...llmConfig.config, timeoutMs: Math.max(llmConfig.config.timeoutMs, 60000) }
      );
    } catch (genError) {
      return NextResponse.json(
        { error: `LLM generation failed: ${genError instanceof Error ? genError.message : String(genError)}` },
        { status: 502 }
      );
    }

    // Parse dialogue (robust extraction that handles various LLM output shapes)
    let rawTurns: unknown[];
    try {
      rawTurns = extractTurns(response.text);
    } catch (parseError) {
      return NextResponse.json(
        {
          error:
            'Could not parse dialogue from LLM response. Raw (first 800 chars): ' +
            response.text.slice(0, 800),
        },
        { status: 500 }
      );
    }

    if (rawTurns.length < 2) {
      return NextResponse.json(
        {
          error:
            `LLM returned ${rawTurns.length} turn(s); at least 2 are required. ` +
            `The provider may not follow the JSON format. Raw (first 500 chars): ` +
            response.text.slice(0, 500),
        },
        { status: 500 }
      );
    }

    // Normalize turns and map speaker IDs to valid project speaker IDs.
    // Real LLMs often use names ("Piseth"), positional ids ("speaker_1"),
    // or the actual CUID. We map all of these to valid speaker IDs.
    const projectSpeakers = project.speakers.map((ps) => ps.speaker);
    const normalized = normalizeTurns(rawTurns, projectSpeakers);

    if (normalized.length < 2) {
      return NextResponse.json(
        {
          error:
            'Could not extract valid turns with speaker and text. ' +
            'The provider returned an unexpected format. Raw output (first 800 chars): ' +
            response.text.slice(0, 800),
        },
        { status: 500 }
      );
    }

    // Delete existing turns and save new ones
    await prisma.dialogueTurn.deleteMany({ where: { projectId: id } });

    const turnRecords = normalized.map((turn, index) => ({
      projectId: id,
      turnIndex: index,
      speakerId: turn.speakerId,
      text: turn.text,
      delivery: turn.delivery,
      sourceFactIds: turn.sourceFactIds,
      estimatedSeconds: turn.estimatedSeconds,
    }));

    await prisma.dialogueTurn.createMany({ data: turnRecords });

    // Update project status
    await prisma.project.update({
      where: { id },
      data: { status: 'DIALOGUE_READY' },
    });

    // Fetch the created turns
    const savedTurns = await prisma.dialogueTurn.findMany({
      where: { projectId: id },
      orderBy: { turnIndex: 'asc' },
    });

    return NextResponse.json({
      episode: {
        title: project.title,
        language: project.language,
        target_duration_seconds: project.targetDuration || 300,
      },
      turns: savedTurns,
      turnCount: savedTurns.length,
      estimatedDuration: savedTurns.reduce((sum, t) => sum + (t.estimatedSeconds || 0), 0),
      model: response.model,
      latencyMs: response.latencyMs,
    });
  } catch (error) {
    console.error('POST /api/projects/:id/dialogue error:', error);
    return NextResponse.json(
      { error: 'Dialogue generation failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/:id/dialogue
 * Get current dialogue turns.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getRequestUserId(request);

    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const turns = await prisma.dialogueTurn.findMany({
      where: { projectId: id },
      orderBy: { turnIndex: 'asc' },
      include: { clip: true },
    });

    return NextResponse.json({
      episode: {
        title: project.title,
        language: project.language,
        target_duration_seconds: project.targetDuration || 300,
      },
      turns,
      turnCount: turns.length,
      estimatedDuration: turns.reduce((sum, t) => sum + (t.estimatedSeconds || 0), 0),
    });
  } catch (error) {
    console.error('GET /api/projects/:id/dialogue error:', error);
    return NextResponse.json({ error: 'Failed to fetch dialogue' }, { status: 500 });
  }
}

/**
 * PATCH /api/projects/:id/dialogue
 * Edit a specific turn's text or delivery.
 * Body: { turnIndex: number, text?: string, delivery?: object }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getRequestUserId(request);
    const body = await request.json();

    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (body.turnIndex === undefined) {
      return NextResponse.json({ error: 'turnIndex is required' }, { status: 400 });
    }

    const turn = await prisma.dialogueTurn.findUnique({
      where: { projectId_turnIndex: { projectId: id, turnIndex: body.turnIndex } },
    });

    if (!turn) {
      return NextResponse.json({ error: 'Turn not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.text !== undefined) {
      updateData.text = body.text;
      updateData.estimatedSeconds = estimateSeconds(body.text);
      // Clear normalized text and clip since text changed
      updateData.normalizedText = null;
    }
    if (body.delivery !== undefined) {
      updateData.delivery = body.delivery;
    }
    if (body.speakerId !== undefined) {
      updateData.speakerId = body.speakerId;
    }

    const updated = await prisma.dialogueTurn.update({
      where: { projectId_turnIndex: { projectId: id, turnIndex: body.turnIndex } },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/projects/:id/dialogue error:', error);
    return NextResponse.json({ error: 'Failed to update turn' }, { status: 500 });
  }
}

/**
 * PUT /api/projects/:id/dialogue
 * Add a new custom turn (user-authored), or delete a turn.
 * Body to add:    { action: 'add', speakerId, text, insertAfter?: number, delivery? }
 * Body to delete: { action: 'delete', turnIndex: number }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getRequestUserId(request);
    const body = await request.json();

    const project = await prisma.project.findFirst({
      where: { id, userId },
      include: { speakers: { include: { speaker: true } } },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const existingTurns = await prisma.dialogueTurn.findMany({
      where: { projectId: id },
      orderBy: { turnIndex: 'asc' },
    });

    if (body.action === 'delete') {
      if (body.turnIndex === undefined) {
        return NextResponse.json({ error: 'turnIndex is required' }, { status: 400 });
      }
      // Remove the turn and re-index the rest
      const remaining = existingTurns.filter((t) => t.turnIndex !== body.turnIndex);
      await prisma.dialogueTurn.deleteMany({ where: { projectId: id } });
      if (remaining.length > 0) {
        await prisma.dialogueTurn.createMany({
          data: remaining.map((t, i) => ({
            projectId: id,
            turnIndex: i,
            speakerId: t.speakerId,
            text: t.text,
            delivery: t.delivery ?? undefined,
            sourceFactIds: t.sourceFactIds ?? undefined,
            estimatedSeconds: t.estimatedSeconds,
          })),
        });
      }
      const updated = await prisma.dialogueTurn.findMany({
        where: { projectId: id },
        orderBy: { turnIndex: 'asc' },
      });
      return NextResponse.json({ turns: updated, turnCount: updated.length });
    }

    // Default: add a new turn
    const { speakerId, text, insertAfter, delivery } = body;
    if (!speakerId || !text) {
      return NextResponse.json({ error: 'speakerId and text are required' }, { status: 400 });
    }

    // Validate speaker belongs to project
    const validSpeaker = project.speakers.some((ps) => ps.speaker.id === speakerId);
    if (!validSpeaker) {
      return NextResponse.json({ error: 'speakerId is not a speaker on this project' }, { status: 400 });
    }

    // Determine insert position (default: append at end)
    const insertPos =
      insertAfter === undefined || insertAfter === null
        ? existingTurns.length
        : Math.min(insertAfter + 1, existingTurns.length);

    // Rebuild turn list with the new turn inserted
    const newTurn = {
      speakerId,
      text: String(text),
      delivery: delivery || { emotion: 'neutral', pace: 'normal', pause_after_ms: 300 },
      sourceFactIds: [] as string[],
      estimatedSeconds: estimateSeconds(String(text)),
    };

    const rebuilt = [
      ...existingTurns.slice(0, insertPos).map((t) => ({
        speakerId: t.speakerId,
        text: t.text,
        delivery: t.delivery ?? undefined,
        sourceFactIds: t.sourceFactIds ?? undefined,
        estimatedSeconds: t.estimatedSeconds,
      })),
      newTurn,
      ...existingTurns.slice(insertPos).map((t) => ({
        speakerId: t.speakerId,
        text: t.text,
        delivery: t.delivery ?? undefined,
        sourceFactIds: t.sourceFactIds ?? undefined,
        estimatedSeconds: t.estimatedSeconds,
      })),
    ];

    await prisma.dialogueTurn.deleteMany({ where: { projectId: id } });
    await prisma.dialogueTurn.createMany({
      data: rebuilt.map((t, i) => ({
        projectId: id,
        turnIndex: i,
        speakerId: t.speakerId,
        text: t.text,
        delivery: t.delivery ?? undefined,
        sourceFactIds: t.sourceFactIds ?? undefined,
        estimatedSeconds: t.estimatedSeconds,
      })),
    });

    // Ensure project status reflects dialogue exists
    if (project.status === 'DRAFT' || project.status === 'OUTLINE_READY') {
      await prisma.project.update({ where: { id }, data: { status: 'DIALOGUE_READY' } });
    }

    const updated = await prisma.dialogueTurn.findMany({
      where: { projectId: id },
      orderBy: { turnIndex: 'asc' },
    });
    return NextResponse.json({ turns: updated, turnCount: updated.length });
  } catch (error) {
    console.error('PUT /api/projects/:id/dialogue error:', error);
    return NextResponse.json(
      { error: 'Failed to add/delete turn', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// === Helpers ===

const DIALOGUE_SYSTEM_PROMPT = `You are a podcast script writer. Generate natural, engaging multi-speaker dialogue in strict JSON format.

Output ONLY valid JSON with this structure:
{
  "turns": [
    {
      "id": "turn_0001",
      "speaker_id": "actual_speaker_id",
      "text": "Spoken text in the episode language",
      "delivery": {
        "emotion": "friendly|curious|thoughtful|enthusiastic|confident|concerned",
        "pace": "normal|slow|fast",
        "pause_after_ms": 350
      },
      "source_fact_ids": [],
      "estimated_seconds": 5.2
    }
  ]
}

CONVERSATION RULES:
- Vary response lengths naturally (short reactions mixed with longer explanations)
- Include follow-up questions from the host
- Allow respectful disagreement occasionally
- Reference earlier ideas ("Going back to what you said about...")
- Use restrained reactions, not exaggerated agreement
- Avoid identical turn lengths
- Avoid excessive filler words
- Avoid repeated "That's a great point" patterns
- Avoid exaggerated emotion
- Every data claim MUST reference a fact ID; if no fact supports it, describe as uncertain
- Generate dialogue in the specified language
- Turn IDs must follow pattern: turn_NNNN (zero-padded 4 digits)`;

function buildDialoguePrompt(project: {
  title: string;
  topic?: string | null;
  language: string;
  targetDuration?: number | null;
  style?: string | null;
  speakers: Array<{
    speakingShare?: number | null;
    speaker: { id: string; name: string; role?: string | null; personality?: string | null; formality: number; energy: number; humor: number; assertiveness: number };
  }>;
  sources: Array<{ facts: Array<{ id: string; content: string }> }>;
  outline: { segments: unknown } | null;
}, requestedTurns?: number): string {
  const speakers = project.speakers.map((ps) => ({
    id: ps.speaker.id,
    name: ps.speaker.name,
    role: ps.speaker.role,
    personality: ps.speaker.personality,
    share: ps.speakingShare,
    formality: ps.speaker.formality,
    energy: ps.speaker.energy,
    humor: ps.speaker.humor,
    assertiveness: ps.speaker.assertiveness,
  }));

  const facts = project.sources.flatMap((s) =>
    s.facts.map((f) => ({ id: f.id, content: f.content }))
  );

  const targetTurns = requestedTurns ?? Math.max(6, Math.round((project.targetDuration || 300) / 8));

  return `Generate podcast dialogue for:

Title: ${project.title}
Topic: ${project.topic || 'General discussion'}
Language: ${project.language}
Target Duration: ${project.targetDuration || 300} seconds
Style: ${project.style || 'conversational'}
Target turns: approximately ${targetTurns}

Speakers:
${speakers.map((s) => `- ID: "${s.id}" | Name: ${s.name} | Role: ${s.role || 'Speaker'} | Personality: ${s.personality || 'Neutral'} | Share: ${s.share ? Math.round(s.share * 100) + '%' : 'equal'} | Formality: ${s.formality}/100 | Energy: ${s.energy}/100 | Humor: ${s.humor}/100 | Assertiveness: ${s.assertiveness}/100`).join('\n')}

Episode Outline:
${JSON.stringify(project.outline?.segments, null, 2)}

${facts.length > 0 ? `Available Facts (reference by ID in source_fact_ids):\n${facts.map((f) => `- [${f.id}] ${f.content}`).join('\n')}\n\nIMPORTANT: Only reference fact IDs for claims. Uncertain statements must NOT have fact IDs.` : 'No approved facts available. All statements should be presented as opinions or general knowledge.'}

Generate engaging, natural dialogue following the outline structure. Use speaker IDs exactly as shown above.`;
}

// Reuse the resolveLLMProvider pattern from outline route
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
  let provider;
  if (lockedLlmId) {
    provider = await prisma.provider.findFirst({
      where: { id: lockedLlmId, userId, enabled: true, category: 'LLM' },
      include: { secret: true, health: true },
    });
  } else {
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
      benchmark: p.benchmarks.length > 0
        ? { weightedScore: p.benchmarks[0]?.weightedScore || undefined, approved: p.benchmarks[0]?.approved || false }
        : undefined,
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
