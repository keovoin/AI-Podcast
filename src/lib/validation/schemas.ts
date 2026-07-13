import { z } from 'zod';

// Provider validation schemas

export const providerCategorySchema = z.enum(['LLM', 'TTS', 'STT', 'EMBEDDING']);

export const adapterTypeSchema = z.enum(['OPENAI_COMPATIBLE', 'CUSTOM_REST', 'AZURE_SPEECH', 'MOCK']);

export const authTypeSchema = z.enum(['BEARER', 'API_KEY_HEADER', 'QUERY_PARAM', 'CUSTOM', 'NONE']);

export const audioResponseTypeSchema = z.enum(['BINARY', 'BASE64_JSON', 'DOWNLOAD_URL']);

export const routingModeSchema = z.enum(['AUTO', 'BEST_KHMER', 'CHEAPEST', 'FASTEST', 'PRIVATE_ONLY', 'MANUAL']);

export const costMetadataSchema = z.object({
  costPerRequest: z.number().min(0).optional(),
  costPerToken: z.number().min(0).optional(),
  costPerCharacter: z.number().min(0).optional(),
  currency: z.string().default('USD'),
});

export const providerCreateSchema = z.object({
  name: z.string().min(1).max(100),
  category: providerCategorySchema,
  adapterType: adapterTypeSchema,
  baseUrl: z.string().max(2000).optional(),
  endpointPath: z.string().max(500).optional(),
  apiKey: z.string().min(1).max(1000).optional(),
  model: z.string().max(200).optional(),
  authType: authTypeSchema.default('BEARER'),
  authHeaderName: z.string().max(100).optional(),
  customHeaders: z.record(z.string()).optional(),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(100).default(50),
  costMetadata: costMetadataSchema.optional(),
  monthlyBudget: z.number().min(0).optional(),
  dataResidency: z.string().max(100).optional(),
  allowSensitive: z.boolean().default(false),
  requestTemplate: z.record(z.unknown()).optional(),
  responseJsonPath: z.string().max(500).optional(),
  audioResponseType: audioResponseTypeSchema.optional().nullable(),
  voiceIds: z.array(z.string()).optional(),
});

export const providerUpdateSchema = providerCreateSchema.partial().omit({ category: true });

export const routingRequestSchema = z.object({
  category: providerCategorySchema,
  mode: routingModeSchema.default('AUTO'),
  language: z.string().max(10).optional(),
  requiredVoiceCount: z.number().int().min(1).max(20).optional(),
  sensitiveContent: z.boolean().optional(),
  maxBudget: z.number().min(0).optional(),
  preferredProviderId: z.string().optional(),
  lockedProviderId: z.string().optional(),
});

// Dialogue validation schemas

export const dialogueDeliverySchema = z.object({
  emotion: z.string().min(1).max(50),
  pace: z.enum(['slow', 'normal', 'fast']),
  pause_after_ms: z.number().int().min(0).max(5000),
});

export const dialogueTurnSchema = z.object({
  id: z.string().regex(/^turn_\d{4}$/),
  speaker_id: z.string().min(1),
  text: z.string().min(1).max(5000),
  delivery: dialogueDeliverySchema,
  source_fact_ids: z.array(z.string()),
  estimated_seconds: z.number().min(0.5).max(120),
});

export const episodeDialogueSchema = z.object({
  episode: z.object({
    title: z.string().min(1).max(200),
    language: z.string().min(2).max(10),
    target_duration_seconds: z.number().int().min(30).max(7200),
  }),
  turns: z.array(dialogueTurnSchema).min(2),
});

export const outlineSegmentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  duration_seconds: z.number().int().min(10).max(3600),
  lead_speaker_id: z.string().min(1),
  questions: z.array(z.string()),
  locked: z.boolean().default(false),
});

export const episodeOutlineSchema = z.object({
  segments: z.array(outlineSegmentSchema).min(1),
  total_duration_seconds: z.number().int().min(30).max(7200),
});

// Project validation schemas

export const projectCreateSchema = z.object({
  title: z.string().min(1).max(200),
  topic: z.string().max(500).optional(),
  objective: z.string().max(1000).optional(),
  audience: z.string().max(200).optional(),
  language: z.string().default('km'),
  targetDuration: z.number().int().min(30).max(7200).optional(),
  style: z.string().max(200).optional(),
  requiredPoints: z.array(z.string()).optional(),
  excludedPoints: z.array(z.string()).optional(),
  routingMode: routingModeSchema.default('AUTO'),
});

export const speakerCreateSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.string().max(200).optional(),
  personality: z.string().max(500).optional(),
  viewpoint: z.string().max(500).optional(),
  voiceId: z.string().max(200).optional(),
  formality: z.number().int().min(0).max(100).default(50),
  energy: z.number().int().min(0).max(100).default(50),
  humor: z.number().int().min(0).max(100).default(30),
  assertiveness: z.number().int().min(0).max(100).default(50),
});

// Type exports
export type ProviderCreateInput = z.infer<typeof providerCreateSchema>;
export type ProviderUpdateInput = z.infer<typeof providerUpdateSchema>;
export type RoutingRequestInput = z.infer<typeof routingRequestSchema>;
export type DialogueTurnInput = z.infer<typeof dialogueTurnSchema>;
export type EpisodeDialogueInput = z.infer<typeof episodeDialogueSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type SpeakerCreateInput = z.infer<typeof speakerCreateSchema>;
