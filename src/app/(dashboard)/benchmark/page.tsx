'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog } from '@/components/ui/dialog';

interface Provider {
  id: string;
  name: string;
  category: string;
}

interface BenchmarkResult {
  id: string;
  providerId: string;
  testCase: string;
  weightedScore?: number;
  notes?: string;
  approved: boolean;
  createdAt: string;
}

const TEST_CASES = [
  { id: 'conversation', label: 'Natural Conversation' },
  { id: 'formal', label: 'Formal Khmer' },
  { id: 'numbers', label: 'Numbers/Decimals/%' },
  { id: 'dates', label: 'Dates/Time' },
  { id: 'names', label: 'Cambodian Names/Locations' },
  { id: 'codeswitching', label: 'Khmer-English Mix' },
  { id: 'questions', label: 'Questions & Polite Disagreement' },
  { id: 'longform', label: 'Long Sentences' },
];

const DIMENSIONS = [
  { key: 'pronunciation', label: 'Pronunciation', weight: 0.3 },
  { key: 'naturalness', label: 'Naturalness', weight: 0.2 },
  { key: 'cambodianAccent', label: 'Cambodian Accent', weight: 0.15 },
  { key: 'numberDateAcc', label: 'Number/Date Accuracy', weight: 0.1 },
  { key: 'codeSwitching', label: 'Code-Switching', weight: 0.1 },
  { key: 'emotion', label: 'Emotion', weight: 0.05 },
  { key: 'longFormStab', label: 'Long-form Stability', weight: 0.1 },
];

export default function BenchmarkPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedCase, setSelectedCase] = useState(TEST_CASES[0]!.id);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    loadProviders();
    fetchResults();
  }, []);

  async function loadProviders() {
    try {
      const res = await fetch('/api/providers');
      if (res.ok) {
        const data = await res.json();
        // Show ALL providers (not just TTS) so user can benchmark any
        const all = Array.isArray(data) ? data : [];
        setProviders(all);
        if (all.length > 0 && !selectedProvider) {
          setSelectedProvider(all[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProviders(false);
    }
  }

  async function fetchResults() {
    try {
      const res = await fetch('/api/benchmark');
      if (res.ok) setResults(await res.json());
    } catch (e) { console.error(e); }
  }

  async function saveRating() {
    if (!selectedProvider) return;
    setSaving(true);
    try {
      const weighted = DIMENSIONS.reduce((sum, d) => {
        return sum + (scores[d.key] || 3) * d.weight;
      }, 0);

      const res = await fetch('/api/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: selectedProvider,
          testCase: selectedCase,
          ...scores,
          weightedScore: weighted,
          notes,
          approved: weighted >= 3.5,
        }),
      });

      if (res.ok) {
        setScores({});
        setNotes('');
        await fetchResults();
      } else {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.error || 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Khmer Benchmark Lab</h1>
        <p className="mt-1 text-sm text-muted-foreground mb-6">
          Rate provider quality using standardized Khmer test cases. Score 1-5 per dimension.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Rate */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Select Provider & Test Case</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Provider</Label>
                  {loadingProviders ? (
                    <Skeleton className="h-10 w-full" />
                  ) : providers.length === 0 ? (
                    <p className="text-sm text-destructive">No providers configured. Add one in Provider Settings first.</p>
                  ) : (
                    <select
                      value={selectedProvider}
                      onChange={(e) => setSelectedProvider(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Test Case</Label>
                  <select
                    value={selectedCase}
                    onChange={(e) => setSelectedCase(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {TEST_CASES.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rate Quality (1-5)</CardTitle>
              <CardDescription>Score each dimension after testing the provider</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {DIMENSIONS.map((d) => (
                <div key={d.key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <span className="w-44 shrink-0 text-sm">{d.label} ({Math.round(d.weight * 100)}%)</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Button
                        key={n} size="sm"
                        variant={(scores[d.key] || 0) >= n ? 'default' : 'outline'}
                        onClick={() => setScores({ ...scores, [d.key]: n })}
                        aria-pressed={(scores[d.key] || 0) >= n}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{scores[d.key] || '-'}/5</span>
                </div>
              ))}
              <div className="space-y-1">
                <Label>Notes</Label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Additional observations..." />
              </div>
              <Button onClick={saveRating} disabled={saving || !selectedProvider || Object.keys(scores).length === 0}>
                {saving ? 'Saving...' : 'Save Rating'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right: Results */}
        <div>
          <Card>
            <CardHeader><CardTitle className="text-lg">Results</CardTitle></CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <p className="text-sm text-muted-foreground">No benchmark results yet. Rate a provider above.</p>
              ) : (
                <div className="space-y-3">
                  {results.map((r) => (
                    <div key={r.id} className="p-3 border rounded-lg text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{r.testCase}</span>
                        {r.approved ? <Badge variant="success">Approved</Badge> : <Badge variant="warning">Not approved</Badge>}
                      </div>
                      <p className="text-muted-foreground">Score: <strong>{r.weightedScore?.toFixed(2)}</strong>/5</p>
                      {r.notes && <p className="text-xs text-muted-foreground mt-1">{r.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Save error — replaces window.alert */}
      <Dialog
        open={saveError !== null}
        onOpenChange={(open) => {
          if (!open) setSaveError(null);
        }}
        title="Failed to save benchmark"
        description={saveError ?? undefined}
        confirmLabel="OK"
        hideFooter
        onConfirm={() => setSaveError(null)}
      />
    </div>
  );
}