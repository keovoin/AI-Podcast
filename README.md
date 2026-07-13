# AI Podcast Studio

A provider-agnostic multi-speaker AI podcast generator with Khmer-first support. Configure commercial or self-hosted AI providers, generate structured dialogue, and export professional podcasts with transcripts and show notes.

## Features

- **Provider-agnostic architecture** - Independent LLM and TTS adapter system
- **OpenAI-compatible LLM adapter** - Works with OpenAI, Azure OpenAI, LM Studio, Ollama, vLLM
- **Custom REST adapters** - Configure any REST API with template-based request/response mapping
- **Azure Speech TTS adapter** - Native Khmer voice support (km-KH-PisethNeural, km-KH-SreymomNeural)
- **Mock providers** - Full workflow testing without paid API keys
- **Encrypted secret storage** - AES-256-GCM encryption, masked responses, server-side only
- **SSRF protection** - Private IP blocking with admin allowlist
- **Explainable routing** - Automatic provider selection with scored breakdown and fallback
- **Khmer Benchmark Lab** - Rate and compare TTS providers for Khmer language quality
- **Structured dialogue** - JSON turn-based format with validation
- **Per-turn audio generation** - Individual clip caching and single-turn regeneration
- **FFmpeg composition** - Combine clips with actual timestamp calculation
- **Full export** - MP3/WAV, transcript, chapters, show notes, sources, manifest

## Quick Start

### Prerequisites

- Node.js 22+
- Docker and Docker Compose
- FFmpeg (included in Docker)

### Development Setup

```bash
# Clone and install
git clone <repo-url>
cd ai-podcast-studio
cp .env.example .env
# Generate an encryption key:
openssl rand -hex 32
# Add the key to .env as ENCRYPTION_MASTER_KEY

# Start infrastructure
docker compose up -d postgres redis minio minio-setup

# Install dependencies
npm install

# Initialize database
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed

# Start development server
npm run dev
```

### Docker (Full Stack)

```bash
docker compose up --build
```

## Project Structure

```
src/
  app/                     # Next.js App Router pages
    api/                   # Server-side API routes
      providers/           # Provider CRUD, test, discover
      routing/             # Routing recommendations
      projects/            # Project workflow
      jobs/                # Job status
    (dashboard)/           # Client-side pages
      providers/           # Provider settings UI
      projects/            # Project management
      benchmark/           # Khmer Benchmark Lab
      speakers/            # Speaker library
  components/
    ui/                    # shadcn/ui components
    providers/             # Provider-specific components
    routing/               # Routing explanation UI
  lib/
    providers/
      adapters/            # LLM and TTS adapter implementations
    routing/               # Routing engine
    crypto/                # AES-256-GCM encryption
    ssrf/                  # SSRF protection
    validation/            # Zod schemas
    normalization/         # Khmer text normalization
    audio/                 # FFmpeg composition
    queue/                 # BullMQ job queue
    storage/               # S3 client
  types/                   # TypeScript type definitions
prisma/
  schema.prisma            # Database schema
  seed.ts                  # Demo data
tests/
  unit/                    # Unit tests
  integration/             # Integration tests
docker-compose.yml         # Infrastructure services
```

## Provider Adapters

### Implemented

| Adapter | Type | Status |
|---------|------|--------|
| OpenAI-compatible LLM | LLM | Operational |
| Custom REST LLM | LLM | Operational |
| Azure Speech TTS | TTS | Operational |
| Custom REST TTS | TTS | Operational |
| Mock LLM | LLM | Operational (testing) |
| Mock TTS | TTS | Operational (testing) |

### Extension Points (Documented)

| Adapter | Type | Status |
|---------|------|--------|
| Kiri TTS | TTS | Extension point defined |
| CAMB.AI TTS | TTS | Extension point defined |
| Google TTS | TTS | Extension point defined |
| OpenAI TTS | TTS | Extension point defined |

### Adding a New Adapter

1. Implement `LLMAdapter` or `TTSAdapter` interface from `src/lib/providers/adapters/base.ts`
2. Register with `registerLLMAdapter()` or `registerTTSAdapter()` from `src/lib/providers/registry.ts`
3. Add adapter type to Prisma enum and Zod schema

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/providers | Create provider |
| GET | /api/providers | List providers |
| GET | /api/providers/:id | Get provider |
| PATCH | /api/providers/:id | Update provider |
| DELETE | /api/providers/:id | Delete provider |
| POST | /api/providers/:id/test | Test connection |
| POST | /api/providers/:id/discover-models | Discover models |
| POST | /api/providers/:id/discover-voices | Discover voices |
| POST | /api/routing/recommend | Get routing recommendation |

## Routing Engine

Automatic provider selection uses hard filters followed by weighted scoring:

```
score = quality * 0.40
      + khmer_accuracy * 0.25
      + reliability * 0.15
      + latency * 0.08
      + cost_efficiency * 0.07
      + feature_fit * 0.05
```

Modes: Auto, Best Khmer, Cheapest, Fastest, Private Only, Manual

Unbenchmarked providers are labeled "Not benchmarked" - never "Best."

## Security

- API keys are encrypted with AES-256-GCM before database storage
- Keys never reach the browser - server-side routes only
- Responses contain masked key values (first 4 + last 4 chars)
- SSRF protection blocks private/link-local IPs by default
- Admin allowlist for intentional self-hosted endpoints
- HTTPS required except localhost
- Audit logging without secrets

## Testing

```bash
# Run unit tests
npm run test

# Run with coverage
npx vitest run --coverage

# Type checking
npm run typecheck
```

Mock providers allow complete workflow testing without paid API credentials.

## Environment Variables

See `.env.example` for all required configuration options.

## Architecture Decisions

1. **Independent adapters** - LLM and TTS are separate concerns; a user may use hosted LLM with external Khmer TTS
2. **Encrypted secrets** - AES-256-GCM with server master key; secrets never reach client
3. **SSRF by default** - Block private IPs unless explicitly allowlisted
4. **Structured dialogue** - JSON turns with schema validation before audio generation
5. **Per-turn caching** - Audio clips cached by provider/model/voice/text hash
6. **Actual timestamps** - Calculated from real clip durations, not estimates
7. **Mock-first testing** - Complete workflow testable without paid APIs

## License

Private - All rights reserved.
