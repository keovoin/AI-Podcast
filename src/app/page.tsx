import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

const FEATURES = [
  {
    icon: '🔌',
    title: 'Provider-Agnostic',
    description:
      'Wire up OpenAI-compatible, custom REST, or Azure Speech providers — commercial or self-hosted — through one consistent adapter layer.',
  },
  {
    icon: '🇰🇭',
    title: 'Khmer-First',
    description:
      'Purpose-built for Khmer: normalization, code-switching detection, Khmer benchmark lab, and Azure km-KH neural voices (Piseth & Sreymom).',
  },
  {
    icon: '🧭',
    title: 'Explainable Routing',
    description:
      'The routing engine scores every provider on quality, Khmer accuracy, reliability, latency, and cost — with full reasoning shown.',
  },
  {
    icon: '🎛️',
    title: 'Multi-Speaker Dialogue',
    description:
      'Generate structured outlines and dialogue with per-speaker personalities, emotions, pacing, and speaking shares.',
  },
  {
    icon: '🎧',
    title: 'Audio Timeline',
    description:
      'Visualize every clip on speaker lanes, scrub the timeline, and regenerate audio per turn with caching.',
  },
  {
    icon: '📦',
    title: 'Export Packages',
    description:
      'One-click ZIP export with audio, transcript, show notes, and chapters — ready to publish anywhere.',
  },
];

const PIPELINE = [
  { step: '1', label: 'Configure providers', desc: 'Add LLM + TTS providers with API keys, budgets, and residency rules.' },
  { step: '2', label: 'Write the brief', desc: 'Topic, audience, language, duration, and routing mode.' },
  { step: '3', label: 'Generate & export', desc: 'Outline → dialogue → audio → ZIP export, all in minutes.' },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Ambient gradient blobs */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-accent/40 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
      </div>

      {/* Nav */}
      <header className="relative z-10 border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-base font-bold tracking-tight">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground shadow-sm"
              aria-hidden="true"
            >
              🎧
            </span>
            AI Podcast Studio
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-2">
            <Link
              href="/projects"
              className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              Projects
            </Link>
            <Link
              href="/providers"
              className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              Providers
            </Link>
            <Link
              href="/projects/new"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              ＋ New Podcast
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6">
        <section className="flex flex-col items-center py-20 text-center sm:py-28">
          <Badge variant="secondary" className="mb-6 px-3 py-1 text-sm">
            🇰🇭 Khmer-first · multi-provider · open source
          </Badge>
          <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
            AI Podcast Studio
            <span className="mt-2 block bg-gradient-to-r from-primary via-accent-foreground to-primary bg-clip-text text-transparent">
              ស្ទូឌីយោផតខាសឆ្លាតវៃ
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-balance text-lg leading-8 text-muted-foreground">
            Provider-agnostic multi-speaker podcast generator with Khmer-first support.
            Configure commercial or self-hosted AI providers, generate structured dialogue,
            and export professional podcasts with transcripts and show notes.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/projects/new"
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-base font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              ✨ Create a Podcast
            </Link>
            <Link
              href="/providers"
              className="inline-flex h-11 items-center justify-center rounded-md border border-input bg-background px-8 text-base font-semibold shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
            >
              Configure Providers
            </Link>
          </div>
        </section>

        {/* Pipeline */}
        <section aria-labelledby="how-it-works" className="py-10">
          <h2 id="how-it-works" className="sr-only">
            How it works
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {PIPELINE.map((p, i) => (
              <div
                key={p.step}
                className="relative rounded-lg border border-border bg-card p-6 shadow-[var(--shadow-card)]"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {p.step}
                  </span>
                  {i < PIPELINE.length - 1 && (
                    <span className="hidden text-muted-foreground/50 sm:inline" aria-hidden="true">
                      →
                    </span>
                  )}
                </div>
                <h3 className="font-semibold">{p.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section aria-labelledby="features" className="py-10 pb-24">
          <h2 id="features" className="text-2xl font-bold tracking-tight">
            Built for production podcasts
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Everything you need to go from idea to published episode — with Khmer as a first-class citizen.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="card-lift rounded-lg border border-border bg-card p-6 shadow-[var(--shadow-card)]"
              >
                <div
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-xl"
                  aria-hidden="true"
                >
                  {f.icon}
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{f.description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/60 py-6">
        <p className="mx-auto max-w-7xl px-4 text-center text-xs text-muted-foreground sm:px-6">
          AI Podcast Studio · ស្ទូឌីយោផតខាសឆ្លាតវៃ · Provider-agnostic, Khmer-first podcast generation
        </p>
      </footer>
    </div>
  );
}
