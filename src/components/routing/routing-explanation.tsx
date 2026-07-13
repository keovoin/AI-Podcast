'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
      const res = await fetch('/api/routing/recommend', {
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
        const data = await res.json();
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
    <Card>
      <CardHeader>
        <CardTitle>Provider Routing</CardTitle>
        <CardDescription>
          Automatic provider selection with explainable scoring
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={category === 'LLM' ? 'default' : 'outline'}
                onClick={() => setCategory('LLM')}
              >
                LLM
              </Button>
              <Button
                size="sm"
                variant={category === 'TTS' ? 'default' : 'outline'}
                onClick={() => setCategory('TTS')}
              >
                TTS
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Mode</label>
            <div className="flex gap-1 flex-wrap">
              {ROUTING_MODES.map((m) => (
                <Button
                  key={m.value}
                  size="sm"
                  variant={mode === m.value ? 'default' : 'outline'}
                  onClick={() => setMode(m.value)}
                  title={m.description}
                >
                  {m.label}
                </Button>
              ))}
            </div>
          </div>

          {mode === 'MANUAL' && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Lock Provider</label>
              <select
                value={lockedProvider || ''}
                onChange={(e) => setLockedProvider(e.target.value || null)}
                className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
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
            <Button onClick={getRecommendation} disabled={loading}>
              {loading ? 'Analyzing...' : 'Get Recommendation'}
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded bg-destructive/10 text-destructive text-sm mb-4">
            {error}
          </div>
        )}

        {recommendation && (
          <div className="space-y-4">
            {/* Selected Provider */}
            <div className="p-4 rounded-lg border bg-primary/5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-lg">{recommendation.providerName}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    {recommendation.model && (
                      <Badge variant="secondary">Model: {recommendation.model}</Badge>
                    )}
                    {recommendation.voiceId && (
                      <Badge variant="secondary">Voice: {recommendation.voiceId}</Badge>
                    )}
                    {!recommendation.benchmarked && (
                      <Badge variant="warning">Not benchmarked</Badge>
                    )}
                    {recommendation.estimatedCost !== undefined && (
                      <Badge variant="outline">
                        Est. cost: ${recommendation.estimatedCost.toFixed(4)}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">
                    {recommendation.score.total.toFixed(1)}
                  </div>
                  <div className="text-xs text-muted-foreground">Score / 100</div>
                </div>
              </div>

              {/* Reasons */}
              <div className="mt-3">
                <h5 className="text-xs font-medium text-muted-foreground mb-1">Reasons:</h5>
                <ul className="text-sm space-y-0.5">
                  {recommendation.reasons.map((reason, i) => (
                    <li key={i} className="flex items-center gap-1">
                      <span className="text-primary">&#x2022;</span> {reason}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Score Breakdown */}
              <div className="mt-4 grid grid-cols-3 md:grid-cols-6 gap-2">
                {[
                  { label: 'Quality', value: recommendation.score.quality, weight: '40%' },
                  { label: 'Khmer', value: recommendation.score.khmerAccuracy, weight: '25%' },
                  { label: 'Reliability', value: recommendation.score.reliability, weight: '15%' },
                  { label: 'Latency', value: recommendation.score.latency, weight: '8%' },
                  { label: 'Cost', value: recommendation.score.costEfficiency, weight: '7%' },
                  { label: 'Features', value: recommendation.score.featureFit, weight: '5%' },
                ].map((item) => (
                  <div key={item.label} className="text-center p-2 rounded bg-muted">
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
                  Lock this provider
                </Button>
              </div>
            </div>

            {/* Fallback Order */}
            {recommendation.fallbackOrder.length > 0 && (
              <div>
                <h5 className="text-sm font-medium mb-2">Fallback Order:</h5>
                <div className="space-y-1">
                  {recommendation.fallbackOrder.map((entry, i) => (
                    <div
                      key={entry.providerId}
                      className="flex items-center justify-between p-2 rounded border"
                    >
                      <span className="text-sm">
                        #{i + 2} {entry.providerName}
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
                <h5 className="text-sm font-medium mb-2">Excluded Providers:</h5>
                <div className="space-y-1">
                  {recommendation.excluded.map((item) => (
                    <div
                      key={item.providerId}
                      className="flex items-center justify-between p-2 rounded border border-destructive/20"
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
