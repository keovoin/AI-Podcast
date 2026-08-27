'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface Provider {
  id: string;
  name: string;
  category: string;
}

interface RoutingScore {
  quality: number;
  khmerAccuracy: number;
  reliability: number;
  latency: number;
  costEfficiency: number;
  featureFit: number;
  total: number;
}

interface RoutingRecommendation {
  providerId: string;
  providerName: string;
  model?: string;
  voiceId?: string;
  score: RoutingScore;
  reasons: string[];
  estimatedCost?: number;
  benchmarked: boolean;
  fallbackOrder: Array<{ providerId: string; providerName: string; score: number }>;
  excluded: Array<{ providerId: string; providerName: string; reason: string }>;
}

const ROUTING_MODES = [
  { value: 'AUTO', label: 'Auto', description: 'Best overall score' },
  { value: 'BEST_KHMER', label: 'Best Khmer', description: 'Prioritize Khmer accuracy' },
  { value: 'CHEAPEST', label: 'Cheapest', description: 'Lowest cost' },
  { value: 'FASTEST', label: 'Fastest', description: 'Lowest latency' },
  { value: 'PRIVATE_ONLY', label: 'Private Only', description: 'Self-hosted only' },
  { value: 'MANUAL', label: 'Manual', description: 'Choose manually' },
];

export function RoutingExplanation({ providers }: { providers: Provider[] }) {
  const [mode, setMode] = useState('AUTO');
  const [category, setCategory] = useState<'LLM' | 'TTS'>('LLM');
  const [recommendation, setRecommendation] = useState<RoutingRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedProvider, setLockedProvider] = useState<string | null>(null);

  async function getRecommendation() {
    setLoading(true);
    setError(null);
    try {
      // The routing API lives at POST /api/routing (route.ts). Using /api/routing/recommend
      // would 404 — that was a bug in the original implementation.
      const res = await fetch('/api/routing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          mode,
          language: 'km',
          lockedProviderId: mode === 'MANUAL' ? lockedProvider : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'No recommendation available');
        setRecommendation(null);
        return;
      }

      const data = await res.json();
      setRecommendation(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to get recommendation');
    } finally {
      setLoading(false);
    }
  }

  function lockProvider(providerId: string) {
    setLockedProvider(providerId);
    setMode('MANUAL');
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Provider Routing</CardTitle>
        <CardDescription>
          Automatic provider selection with explainable scoring
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4">
          {/* Category toggle group */}
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-muted-foreground">Category</legend>
            <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
              {(['LLM', 'TTS'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  aria-pressed={category === c}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    category === c
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Mode toggle */}
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-muted-foreground">Mode</legend>
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
              {ROUTING_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  aria-pressed={mode === m.value}
                  title={m.description}
                  className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                    mode === m.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </fieldset>

          {mode === 'MANUAL' && (
            <div className="space-y-1.5">
              <label htmlFor="locked-provider" className="text-xs font-medium text-muted-foreground">
                Lock Provider
              </label>
              <select
                id="locked-provider"
                value={lockedProvider || ''}
                onChange={(e) => setLockedProvider(e.target.value || null)}
                className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select provider...</option>
                {providers
                  .filter((p) => p.category === category)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="flex items-end">
            <Button onClick={getRecommendation} disabled={loading} aria-busy={loading}>
              {loading ? 'Analyzing…' : 'Get Recommendation'}
            </Button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <span aria-hidden="true">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="mt-4 space-y-3" aria-label="Loading recommendation" role="status">
            <Skeleton className="h-24 w-full" />
            <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </div>
        )}

        {recommendation && !loading && (
          <div className="mt-4 space-y-4 animate-fade-in">
            {/* Selected Provider */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-lg font-semibold">{recommendation.providerName}</h4>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {recommendation.model && (
                      <Badge variant="secondary">Model: {recommendation.model}</Badge>
                    )}
                    {recommendation.voiceId && (
                      <Badge variant="secondary">Voice: {recommendation.voiceId}</Badge>
                    )}
                    {!recommendation.benchmarked && (
                      <Badge variant="warning" dot>
                        <span aria-hidden="true">!</span>
                        <span>Not benchmarked</span>
                      </Badge>
                    )}
                    {recommendation.estimatedCost !== undefined && (
                      <Badge variant="outline">
                        Est. cost: ${recommendation.estimatedCost.toFixed(4)}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{recommendation.score.total.toFixed(1)}</div>
                  <div className="text-xs text-muted-foreground">Score / 100</div>
                </div>
              </div>

              {/* Reasons */}
              <div className="mt-3">
                <h5 className="mb-1 text-xs font-medium text-muted-foreground">Reasons:</h5>
                <ul className="space-y-0.5 text-sm">
                  {recommendation.reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="mt-0.5 text-primary" aria-hidden="true">
                        ✓
                      </span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Score Breakdown */}
              <div className="mt-4 grid grid-cols-3 gap-2 md:grid-cols-6">
                {[
                  { label: 'Quality', value: recommendation.score.quality, weight: '40%' },
                  { label: 'Khmer', value: recommendation.score.khmerAccuracy, weight: '25%' },
                  { label: 'Reliability', value: recommendation.score.reliability, weight: '15%' },
                  { label: 'Latency', value: recommendation.score.latency, weight: '8%' },
                  { label: 'Cost', value: recommendation.score.costEfficiency, weight: '7%' },
                  { label: 'Features', value: recommendation.score.featureFit, weight: '5%' },
                ].map((item) => (
                  <div key={item.label} className="rounded-md bg-muted/60 p-2 text-center">
                    <div className="text-lg font-semibold">{item.value.toFixed(0)}</div>
                    <div className="text-xs text-muted-foreground">{item.label}</div>
                    <div className="text-xs text-muted-foreground">({item.weight})</div>
                  </div>
                ))}
              </div>

              {/* Lock button */}
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => lockProvider(recommendation.providerId)}
                >
                  🔒 Lock this provider
                </Button>
              </div>
            </div>

            {/* Fallback Order */}
            {recommendation.fallbackOrder.length > 0 && (
              <div>
                <h5 className="mb-2 text-sm font-medium">Fallback Order:</h5>
                <div className="space-y-1">
                  {recommendation.fallbackOrder.map((entry, i) => (
                    <div
                      key={entry.providerId}
                      className="flex items-center justify-between rounded-md border border-border p-2"
                    >
                      <span className="text-sm">
                        <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-medium">
                          {i + 2}
                        </span>
                        {entry.providerName}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        Score: {entry.score.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Excluded Providers */}
            {recommendation.excluded.length > 0 && (
              <div>
                <h5 className="mb-2 text-sm font-medium">Excluded Providers:</h5>
                <div className="space-y-1">
                  {recommendation.excluded.map((item) => (
                    <div
                      key={item.providerId}
                      className="flex items-center justify-between gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-2"
                    >
                      <span className="text-sm">{item.providerName}</span>
                      <span className="text-sm text-muted-foreground">{item.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
