'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Provider {
  id: string;
  name: string;
  category: string;
  hasBenchmark: boolean;
  benchmarkScore?: number;
  benchmarkApproved?: boolean;
}

interface BenchmarkResult {
  id: string;
  providerId: string;
  testCase: string;
  pronunciation?: number;
  naturalness?: number;
  cambodianAccent?: number;
  numberDateAcc?: number;
  codeSwitching?: number;
  emotion?: number;
  longFormStab?: number;
  weightedScore?: number;
  notes?: string;
  approved: boolean;
  createdAt: string;
}

const TEST_CASES = [
  { id: 'conversation', label: 'Natural Conversation', text: '\u179F\u17BD\u179F\u17D2\u178F\u17B8! \u1790\u17D2\u1784\u17C3\u1793\u17C1\u17C7\u17A2\u17B6\u1780\u17B6\u179F\u17A2\u17B6\u178F\u17CB\u179A\u17B6\u17C6\u1784\u17C9\u17B6\u17C6\u1784\u17C9\u17B6\u178A\u17C2\u179A\u17D4' },
  { id: 'formal', label: 'Formal Khmer', text: '\u179F\u17BC\u1798\u1782\u17C0\u179A\u1796\u17D0\u178F\u17CC\u1798\u17B6\u1793\u179C\u17B7\u1785\u17B6\u179A\u178E\u1780\u1789\u17D2\u1789\u17B6\u17A2\u17C6\u1796\u17B8\u1780\u17B6\u179A\u179F\u17D2\u179A\u17B6\u179C\u1787\u17D2\u179A\u17B6\u179C\u17D4' },
  { id: 'numbers', label: 'Numbers/Decimals/%', text: '\u178F\u1798\u17D2\u179B\u17C3\u1793\u17C1\u17C7\u1782\u17BA 45.7% \u1793\u17C3\u1795\u179B\u17B7\u178F\u1795\u179B\u178F\u17D2\u179A\u17BC\u179C\u1794\u17B6\u1793\u1780\u17BE\u1793\u17A1\u17BE\u1784 12.5%\u17D4' },
  { id: 'dates', label: 'Dates/Time', text: '\u1780\u17B6\u179B\u1794\u179A\u17B7\u1785\u17D2\u1786\u17C1\u178A\u1793\u17C5\u1790\u17D2\u1784\u17C3\u1791\u17B8 15/03/2025 \u1798\u17C9\u17C4\u1784 14:30\u17D4' },
  { id: 'names', label: 'Cambodian Names/Locations', text: '\u179B\u17C4\u1780 \u179F\u17BB\u1781\u17B6 \u1793\u17C5\u1797\u17D2\u1793\u17C6\u1796\u17C1\u1789 \u178A\u17C2\u179B\u179F\u17D2\u1790\u17B7\u178F\u1793\u17C5\u1787\u17B7\u178F\u1781\u17B6\u1784\u179C\u178F\u17D2\u178F\u17A2\u1784\u17D2\u1782\u179A\u17D4' },
  { id: 'codeswitching', label: 'Khmer-English Mix', text: '\u1781\u17D2\u1789\u17BB\u17C6\u1794\u17B6\u17A0\u17D2\u179C\u17C2\u179B data science \u1793\u17C5 university \u1793\u17B7\u1784\u178F\u17D2\u179A\u17BC\u179C\u1794\u17B6\u1793 deploy \u179B\u17BE machine learning model\u17D4' },
  { id: 'questions', label: 'Questions & Polite Disagreement', text: '\u1781\u17D2\u1789\u17BB\u17C6\u1798\u17B7\u1793\u1799\u179B\u17CB\u179F\u17D2\u179A\u1794\u1791\u17C1 \u178F\u17C2\u1781\u17D2\u1789\u17BB\u17C6\u1782\u17B7\u178F\u1790\u17B6\u179C\u17B6\u179A\u17C0\u1784\u1793\u17C1\u17C7\u17A2\u17B6\u1785\u179F\u17D2\u1798\u17BB\u1782\u179F\u17D2\u1798\u17B6\u1789\u1787\u17B6\u1784\u17D4' },
  { id: 'longform', label: 'Long Sentences', text: '\u1793\u17C5\u1780\u17D2\u1793\u17BB\u1784\u1796\u17C1\u179B\u178A\u17C2\u179B\u1796\u17D2\u179A\u17C7\u17A2\u17B6\u1791\u17B7\u178F\u17D2\u1799\u179A\u17C7\u1789\u17C9\u17BE\u1784\u17A1\u17BE\u1784\u179C\u17B7\u1789 \u1781\u17D2\u1789\u17BB\u17C6\u178F\u17D2\u179A\u17BC\u179C\u178F\u17C2\u1791\u17B6\u1789\u1780\u17B6\u179A\u17A2\u1794\u17CB\u179A\u17C6 \u178A\u17C4\u1799\u179F\u17B6\u179A\u178F\u17C2\u1798\u17BD\u1799\u1782\u178F\u17CB\u179C\u17B6\u178A\u17C2\u179B\u1787\u17B6\u1780\u17B6\u179A\u179F\u17D2\u179A\u17B6\u179C\u1787\u17D2\u179A\u17B6\u179C\u17A2\u17C6\u1796\u17B8\u179C\u17B7\u179F\u17D0\u1799\u178A\u17C2\u179B\u17A2\u17D2\u1793\u1780\u179F\u17D2\u179A\u17B6\u179C\u1787\u17D2\u179A\u17B6\u179C\u1794\u17B6\u1793\u1792\u17D2\u179C\u17BE\u17D4' },
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
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/providers').then((r) => r.json()).then((data) => {
      const tts = data.filter((p: Provider) => p.category === 'TTS');
      setProviders(tts);
      if (tts.length > 0) setSelectedProvider(tts[0].id);
    });
    fetchResults();
  }, []);

  async function fetchResults() {
    try {
      const res = await fetch('/api/benchmark');
      if (res.ok) setResults(await res.json());
    } catch (e) { console.error(e); }
  }

  async function generateTestAudio() {
    if (!selectedProvider) return;
    setGenerating(true);
    try {
      await fetch(`/api/providers/${selectedProvider}/benchmark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testCase: selectedCase }),
      });
    } finally { setGenerating(false); }
  }

  async function saveRating() {
    if (!selectedProvider) return;
    setSaving(true);
    try {
      const weighted = DIMENSIONS.reduce((sum, d) => {
        return sum + (scores[d.key] || 3) * d.weight;
      }, 0);

      await fetch('/api/benchmark', {
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
      setScores({}); setNotes('');
      await fetchResults();
    } finally { setSaving(false); }
  }

  const currentCase = TEST_CASES.find((c) => c.id === selectedCase);

  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold mb-2">Khmer Benchmark Lab</h1>
      <p className="text-muted-foreground mb-8">
        Compare TTS providers using standardized Khmer test cases. Rate 1-5 for each dimension.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Test & Rate */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Generate Test Audio</CardTitle>
              <CardDescription>Select a provider and test case to generate audio for rating</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>TTS Provider</Label>
                  <select value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Test Case</Label>
                  <select value={selectedCase} onChange={(e) => setSelectedCase(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {TEST_CASES.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="p-3 rounded bg-muted text-sm font-mono">{currentCase?.text}</div>
              <Button onClick={generateTestAudio} disabled={generating || !selectedProvider}>
                {generating ? 'Generating...' : 'Generate Audio'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rate Quality (1-5)</CardTitle>
              <CardDescription>Score each dimension after listening to the generated audio</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {DIMENSIONS.map((d) => (
                <div key={d.key} className="flex items-center gap-4">
                  <span className="w-40 text-sm">{d.label} ({Math.round(d.weight * 100)}%)</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Button
                        key={n} size="sm"
                        variant={(scores[d.key] || 0) >= n ? 'default' : 'outline'}
                        onClick={() => setScores({ ...scores, [d.key]: n })}
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
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Additional observations..." />
              </div>
              <Button onClick={saveRating} disabled={saving || Object.keys(scores).length === 0}>
                {saving ? 'Saving...' : 'Save Rating'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right: Results */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Results</CardTitle></CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <p className="text-sm text-muted-foreground">No benchmark results yet.</p>
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
    </div>
  );
}
