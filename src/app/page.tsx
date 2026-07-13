import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          AI Podcast Studio
        </h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          Provider-agnostic multi-speaker podcast generator with Khmer-first support.
          Configure commercial or self-hosted AI providers, generate structured dialogue,
          and export professional podcasts with transcripts and show notes.
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Link
            href="/providers"
            className="rounded-md bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            Provider Settings
          </Link>
          <Link
            href="/projects"
            className="text-sm font-semibold leading-6 text-foreground"
          >
            Projects <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
