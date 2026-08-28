#!/usr/bin/env node
/**
 * db-sync.mjs — schema sync + Gemini provider seed for deployment builds.
 *
 * Runs ONLY when a DATABASE_URL is present (i.e. inside Vercel builds where the
 * project env vars are available; skipped in CI / local builds without a DB).
 *
 * Why: the production Postgres was created from the July schema (prisma/init.sql)
 * and never gained the columns/enums added later (Project.audio_key/audio_url/
 * thumbnail_key/thumbnail_url, AudioClip.audio_key, AdapterType.GEMINI). Prisma
 * SELECTs all scalar columns, so any query touching Project 500'd against the
 * stale DB. Running `prisma db push` (non-destructive: only adds nullable
 * columns + a new enum value) on every deploy keeps the prod schema in sync
 * with the Prisma client.
 *
 * The Gemini provider row is upserted inline (instead of running prisma/seed.ts,
 * which is TypeScript and needs an extra transpile step). `@prisma/client`
 * resolves fine here because this script runs from the project root where
 * node_modules exists.
 */
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  console.log('[db-sync] DATABASE_URL not set — skipping schema sync & seed.');
  process.exit(0);
}

console.log('[db-sync] DATABASE_URL present — syncing schema and seeding.');

// Push schema (add missing columns/enum values; safe, non-destructive).
console.log('[db-sync] $ npx prisma db push --skip-generate');
execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });

// Upsert the Gemini 3.5 Flash Lite provider (mirrors prisma/seed.ts).
const prisma = new PrismaClient();
try {
  const gemini = await prisma.provider.upsert({
    where: { id: 'gemini-llm-provider' },
    update: {},
    create: {
      id: 'gemini-llm-provider',
      userId: 'default-user',
      name: 'Gemini 3.5 Flash Lite',
      category: 'LLM',
      adapterType: 'GEMINI',
      baseUrl: 'https://generativelanguage.googleapis.com',
      endpointPath: '/v1beta/models',
      model: 'gemini-3.5-flash-lite',
      authType: 'BEARER',
      timeoutMs: 60000,
      enabled: true,
      priority: 90,
      costMetadata: { costPerRequest: 0.0001, currency: 'USD' },
      allowSensitive: true,
    },
  });

  await prisma.providerHealth.upsert({
    where: { providerId: gemini.id },
    update: {},
    create: {
      providerId: gemini.id,
      status: 'UNKNOWN',
    },
  });

  await prisma.providerCapability.upsert({
    where: { providerId_capability: { providerId: gemini.id, capability: 'text-generation' } },
    update: {},
    create: {
      providerId: gemini.id,
      capability: 'text-generation',
      languages: ['km-KH', 'en-US'],
    },
  });

  console.log(`[db-sync] Gemini provider ready: ${gemini.name} (${gemini.model})`);
} finally {
  await prisma.$disconnect();
}

console.log('[db-sync] Schema sync + seed complete.');
