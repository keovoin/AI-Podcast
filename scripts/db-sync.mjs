#!/usr/bin/env node
/**
 * db-sync.mjs — schema sync + seed runner for deployment builds.
 *
 * Runs ONLY when a DATABASE_URL is present (i.e. inside Vercel builds where the
 * project env vars are available; skipped in CI / local builds without a DB).
 *
 * Why: the production Postgres was created from the July schema (prisma/init.sql)
 * and never gained the columns/enums added later (Project.audio_key/audio_url/
 * thumbnail_key/thumbnail_url, AudioClip.audio_key, AdapterType.GEMINI). Prisma
 * SELECTs all scalar columns, so any query touching Project 500'd against the
 * stale DB. Running `prisma db push` (non-destructive: only adds nullable
 * columns + a new enum value) plus the idempotent seed on every deploy keeps
 * the prod schema in sync with the Prisma client and seeds the Gemini provider.
 *
 * Fail-fast: if the sync fails, the deploy fails loudly instead of shipping a
 * build that 500s at runtime.
 */
import { execSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.log('[db-sync] DATABASE_URL not set — skipping schema sync & seed.');
  process.exit(0);
}

console.log('[db-sync] DATABASE_URL present — syncing schema and seeding.');

const commands = [
  // Push schema (add missing columns/enum values; safe, non-destructive).
  'npx prisma db push --skip-generate',
  // Bundle the TypeScript seed with esbuild (already a devDependency), then run it.
  'node -e "require(\'esbuild\').buildSync({entryPoints:[\'prisma/seed.ts\'],bundle:true,platform:\'node\',target:\'node20\',outfile:\'/tmp/ai-podcast-seed.mjs\',external:[\'@prisma/client\',\'prisma\'],format:\'esm\'})"',
  'node /tmp/ai-podcast-seed.mjs',
];

for (const cmd of commands) {
  console.log(`[db-sync] $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

console.log('[db-sync] Schema sync + seed complete.');
