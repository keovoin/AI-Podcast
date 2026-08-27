-- =============================================================================
-- AI Podcast Studio - Database Schema
-- Run this in Neon SQL Editor or any PostgreSQL client
-- =============================================================================

-- Enums
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');
CREATE TYPE "ProviderCategory" AS ENUM ('LLM', 'TTS', 'STT', 'EMBEDDING');
CREATE TYPE "AdapterType" AS ENUM ('OPENAI_COMPATIBLE', 'CUSTOM_REST', 'GEMINI', 'AZURE_SPEECH', 'MOCK');
CREATE TYPE "AuthType" AS ENUM ('BEARER', 'API_KEY_HEADER', 'QUERY_PARAM', 'CUSTOM', 'NONE');
CREATE TYPE "AudioResponseType" AS ENUM ('BINARY', 'BASE64_JSON', 'DOWNLOAD_URL');
CREATE TYPE "KeySource" AS ENUM ('DIRECT', 'ENV_VARIABLE');
CREATE TYPE "HealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'UNHEALTHY', 'UNKNOWN');
CREATE TYPE "RoutingMode" AS ENUM ('AUTO', 'BEST_KHMER', 'CHEAPEST', 'FASTEST', 'PRIVATE_ONLY', 'MANUAL');
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'OUTLINE_READY', 'DIALOGUE_READY', 'GENERATING_AUDIO', 'AUDIO_READY', 'EXPORTED');
CREATE TYPE "JobType" AS ENUM ('OUTLINE', 'DIALOGUE', 'AUDIO_SINGLE', 'AUDIO_FULL', 'EXPORT');
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'RETRYING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- Users
CREATE TABLE "users" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- Providers
CREATE TABLE "providers" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ProviderCategory" NOT NULL,
    "adapter_type" "AdapterType" NOT NULL,
    "base_url" TEXT,
    "endpoint_path" TEXT,
    "model" TEXT,
    "auth_type" "AuthType" NOT NULL DEFAULT 'BEARER',
    "auth_header_name" TEXT,
    "custom_headers" JSONB,
    "timeout_ms" INTEGER NOT NULL DEFAULT 30000,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "cost_metadata" JSONB,
    "monthly_budget" DOUBLE PRECISION,
    "data_residency" TEXT,
    "allow_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "request_template" JSONB,
    "response_json_path" TEXT,
    "audio_response_type" "AudioResponseType",
    "voice_ids" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- Provider Secrets
CREATE TABLE "provider_secrets" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "provider_id" TEXT NOT NULL,
    "encrypted_key" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "key_source" "KeySource" NOT NULL DEFAULT 'DIRECT',
    "env_var_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_secrets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "provider_secrets_provider_id_key" ON "provider_secrets"("provider_id");

-- Provider Capabilities
CREATE TABLE "provider_capabilities" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "provider_id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "languages" JSONB,
    "voice_count" INTEGER,
    "metadata" JSONB,
    CONSTRAINT "provider_capabilities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "provider_capabilities_provider_id_capability_key" ON "provider_capabilities"("provider_id", "capability");

-- Provider Health
CREATE TABLE "provider_health" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "provider_id" TEXT NOT NULL,
    "status" "HealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "last_checked" TIMESTAMP(3),
    "last_latency_ms" INTEGER,
    "avg_latency_ms" DOUBLE PRECISION,
    "success_rate" DOUBLE PRECISION,
    "total_requests" INTEGER NOT NULL DEFAULT 0,
    "failed_requests" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "consecutive_fails" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "provider_health_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "provider_health_provider_id_key" ON "provider_health"("provider_id");

-- Provider Benchmarks
CREATE TABLE "provider_benchmarks" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "test_case" TEXT NOT NULL,
    "audio_url" TEXT,
    "pronunciation" DOUBLE PRECISION,
    "naturalness" DOUBLE PRECISION,
    "cambodian_accent" DOUBLE PRECISION,
    "number_date_accuracy" DOUBLE PRECISION,
    "code_switching" DOUBLE PRECISION,
    "emotion" DOUBLE PRECISION,
    "long_form_stability" DOUBLE PRECISION,
    "weighted_score" DOUBLE PRECISION,
    "notes" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_benchmarks_pkey" PRIMARY KEY ("id")
);

-- Projects
CREATE TABLE "projects" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "topic" TEXT,
    "objective" TEXT,
    "audience" TEXT,
    "language" TEXT NOT NULL DEFAULT 'km',
    "target_duration_seconds" INTEGER,
    "style" TEXT,
    "required_points" JSONB,
    "excluded_points" JSONB,
    "routing_mode" "RoutingMode" NOT NULL DEFAULT 'AUTO',
    "locked_llm_id" TEXT,
    "locked_tts_id" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "audio_key" TEXT,
    "audio_url" TEXT,
    "thumbnail_key" TEXT,
    "thumbnail_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- Speakers
CREATE TABLE "speakers" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "personality" TEXT,
    "viewpoint" TEXT,
    "voice_id" TEXT,
    "formality" INTEGER NOT NULL DEFAULT 50,
    "energy" INTEGER NOT NULL DEFAULT 50,
    "humor" INTEGER NOT NULL DEFAULT 30,
    "assertiveness" INTEGER NOT NULL DEFAULT 50,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "speakers_pkey" PRIMARY KEY ("id")
);

-- Project Speakers
CREATE TABLE "project_speakers" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "project_id" TEXT NOT NULL,
    "speaker_id" TEXT NOT NULL,
    "speaking_share" DOUBLE PRECISION,
    "voice_override" TEXT,
    "reactions" BOOLEAN NOT NULL DEFAULT true,
    "interruptions" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "project_speakers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_speakers_project_id_speaker_id_key" ON "project_speakers"("project_id", "speaker_id");

-- Sources
CREATE TABLE "sources" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "content" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- Facts
CREATE TABLE "facts" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "source_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "facts_pkey" PRIMARY KEY ("id")
);

-- Episode Outlines
CREATE TABLE "episode_outlines" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "project_id" TEXT NOT NULL,
    "segments" JSONB NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "episode_outlines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "episode_outlines_project_id_key" ON "episode_outlines"("project_id");

-- Dialogue Turns
CREATE TABLE "dialogue_turns" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "project_id" TEXT NOT NULL,
    "turn_index" INTEGER NOT NULL,
    "speaker_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "normalized_text" TEXT,
    "delivery" JSONB,
    "source_fact_ids" JSONB,
    "estimated_seconds" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dialogue_turns_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "dialogue_turns_project_id_turn_index_key" ON "dialogue_turns"("project_id", "turn_index");

-- Audio Clips
CREATE TABLE "audio_clips" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "project_id" TEXT NOT NULL,
    "turn_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "voice_id" TEXT NOT NULL,
    "text_hash" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "audio_key" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "start_time_ms" INTEGER,
    "format" TEXT NOT NULL DEFAULT 'mp3',
    "size_bytes" INTEGER,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audio_clips_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "audio_clips_turn_id_key" ON "audio_clips"("turn_id");
CREATE INDEX "audio_clips_text_hash_provider_id_voice_id_idx" ON "audio_clips"("text_hash", "provider_id", "voice_id");

-- Generation Jobs
CREATE TABLE "generation_jobs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "project_id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_steps" INTEGER,
    "completed_steps" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "error" TEXT,
    "idempotency_key" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "generation_jobs_idempotency_key_key" ON "generation_jobs"("idempotency_key");

-- Transcripts
CREATE TABLE "transcripts" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "project_id" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "srt" TEXT,
    "vtt" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "transcripts_project_id_key" ON "transcripts"("project_id");

-- Show Notes
CREATE TABLE "show_notes" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "project_id" TEXT NOT NULL,
    "summary" TEXT,
    "chapters" JSONB,
    "takeaways" JSONB,
    "fact_list" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "show_notes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "show_notes_project_id_key" ON "show_notes"("project_id");

-- Export Packages
CREATE TABLE "export_packages" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "project_id" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "size_bytes" INTEGER,
    "manifest" JSONB,
    "includes_ai_disclosure" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "export_packages_pkey" PRIMARY KEY ("id")
);

-- Audit Logs
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
CREATE INDEX "audit_logs_resource_resource_id_idx" ON "audit_logs"("resource", "resource_id");

-- Foreign Keys
ALTER TABLE "providers" ADD CONSTRAINT "providers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provider_secrets" ADD CONSTRAINT "provider_secrets_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_capabilities" ADD CONSTRAINT "provider_capabilities_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_health" ADD CONSTRAINT "provider_health_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_benchmarks" ADD CONSTRAINT "provider_benchmarks_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_benchmarks" ADD CONSTRAINT "provider_benchmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "speakers" ADD CONSTRAINT "speakers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_speakers" ADD CONSTRAINT "project_speakers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_speakers" ADD CONSTRAINT "project_speakers_speaker_id_fkey" FOREIGN KEY ("speaker_id") REFERENCES "speakers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sources" ADD CONSTRAINT "sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "facts" ADD CONSTRAINT "facts_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "episode_outlines" ADD CONSTRAINT "episode_outlines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dialogue_turns" ADD CONSTRAINT "dialogue_turns_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audio_clips" ADD CONSTRAINT "audio_clips_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audio_clips" ADD CONSTRAINT "audio_clips_turn_id_fkey" FOREIGN KEY ("turn_id") REFERENCES "dialogue_turns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audio_clips" ADD CONSTRAINT "audio_clips_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "show_notes" ADD CONSTRAINT "show_notes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "export_packages" ADD CONSTRAINT "export_packages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma migrations table
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);

-- =============================================================================
-- SEED DATA: Demo user, mock providers, sample speakers, sample project
-- =============================================================================

-- Default user
INSERT INTO "users" ("id", "email", "name", "role") VALUES
('default-user', 'demo@ai-podcast.local', 'Demo User', 'ADMIN')
ON CONFLICT ("id") DO NOTHING;

-- Mock LLM Provider
INSERT INTO "providers" ("id", "user_id", "name", "category", "adapter_type", "model", "auth_type", "timeout_ms", "enabled", "priority", "cost_metadata", "allow_sensitive") VALUES
('mock-llm-provider', 'default-user', 'Mock LLM (Testing)', 'LLM', 'MOCK', 'mock-gpt-4', 'NONE', 30000, true, 80, '{"costPerRequest": 0.001, "currency": "USD"}', true)
ON CONFLICT ("id") DO NOTHING;

-- Gemini Flash Lite LLM Provider (uses GEMINI_API_KEY env var; requires a valid key)
INSERT INTO "providers" ("id", "user_id", "name", "category", "adapter_type", "base_url", "endpoint_path", "model", "auth_type", "timeout_ms", "enabled", "priority", "cost_metadata", "allow_sensitive") VALUES
('gemini-llm-provider', 'default-user', 'Gemini 3.5 Flash Lite', 'LLM', 'GEMINI', 'https://generativelanguage.googleapis.com', '/v1beta/models', 'gemini-3.5-flash-lite', 'BEARER', 60000, true, 90, '{"costPerRequest": 0.0001, "currency": "USD"}', true)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "provider_health" ("id", "provider_id", "status", "last_checked", "last_latency_ms", "avg_latency_ms", "success_rate", "total_requests", "failed_requests") VALUES
('health-gemini', 'gemini-llm-provider', 'UNKNOWN', NOW(), NULL, NULL, NULL, 0, 0)
ON CONFLICT ("provider_id") DO NOTHING;

INSERT INTO "provider_capabilities" ("id", "provider_id", "capability", "languages") VALUES
('cap-gemini', 'gemini-llm-provider', 'text-generation', '["km-KH", "en-US"]')
ON CONFLICT ("provider_id", "capability") DO NOTHING;

INSERT INTO "provider_health" ("id", "provider_id", "status", "last_checked", "last_latency_ms", "avg_latency_ms", "success_rate", "total_requests", "failed_requests") VALUES
('health-llm', 'mock-llm-provider', 'HEALTHY', NOW(), 100, 100, 1.0, 100, 0)
ON CONFLICT ("provider_id") DO NOTHING;

INSERT INTO "provider_capabilities" ("id", "provider_id", "capability", "languages") VALUES
('cap-llm', 'mock-llm-provider', 'text-generation', '["km-KH", "en-US"]')
ON CONFLICT ("provider_id", "capability") DO NOTHING;

-- Mock TTS Provider
INSERT INTO "providers" ("id", "user_id", "name", "category", "adapter_type", "auth_type", "timeout_ms", "enabled", "priority", "voice_ids", "cost_metadata", "allow_sensitive") VALUES
('mock-tts-provider', 'default-user', 'Mock TTS (Testing)', 'TTS', 'MOCK', 'NONE', 30000, true, 80, '["mock-km-male-1", "mock-km-female-1", "mock-en-male-1", "mock-en-female-1"]', '{"costPerRequest": 0.0005, "currency": "USD"}', true)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "provider_health" ("id", "provider_id", "status", "last_checked", "last_latency_ms", "avg_latency_ms", "success_rate", "total_requests", "failed_requests") VALUES
('health-tts', 'mock-tts-provider', 'HEALTHY', NOW(), 50, 50, 1.0, 200, 0)
ON CONFLICT ("provider_id") DO NOTHING;

INSERT INTO "provider_capabilities" ("id", "provider_id", "capability", "languages", "voice_count") VALUES
('cap-tts', 'mock-tts-provider', 'speech-synthesis', '["km-KH", "en-US"]', 4)
ON CONFLICT ("provider_id", "capability") DO NOTHING;

-- Sample Speakers
INSERT INTO "speakers" ("id", "user_id", "name", "role", "personality", "voice_id", "formality", "energy", "humor", "assertiveness") VALUES
('speaker-host', 'default-user', 'Piseth', 'Host', 'Curious, friendly, asks insightful questions', 'mock-km-male-1', 40, 60, 30, 50),
('speaker-guest', 'default-user', 'Sreymom', 'Expert Guest', 'Knowledgeable, thoughtful, explains clearly', 'mock-km-female-1', 50, 50, 20, 60)
ON CONFLICT ("id") DO NOTHING;

-- Sample Project
INSERT INTO "projects" ("id", "user_id", "title", "topic", "objective", "audience", "language", "target_duration_seconds", "style", "routing_mode", "status") VALUES
('sample-project', 'default-user', 'AI in Cambodia', 'The growing AI ecosystem in Cambodia', 'Educate listeners about AI adoption in Cambodia', 'Cambodian tech professionals', 'km', 300, 'conversational', 'AUTO', 'DRAFT')
ON CONFLICT ("id") DO NOTHING;

-- Link speakers to project
INSERT INTO "project_speakers" ("id", "project_id", "speaker_id", "speaking_share", "reactions", "interruptions") VALUES
('ps-1', 'sample-project', 'speaker-host', 0.45, true, false),
('ps-2', 'sample-project', 'speaker-guest', 0.55, true, false)
ON CONFLICT ("project_id", "speaker_id") DO NOTHING;
