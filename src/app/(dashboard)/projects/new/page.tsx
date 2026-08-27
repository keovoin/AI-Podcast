'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Step = 'brief' | 'speakers' | 'review';

interface SpeakerInput {
  name: string;
  role: string;
  personality: string;
  voiceId: string;
  speakingShare: number;
}

const ROUTING_MODES = [
  { value: 'AUTO', label: 'Auto', desc: 'Best overall score' },
  { value: 'BEST_KHMER', label: 'Best Khmer', desc: 'Prioritize Khmer quality' },
  { value: 'CHEAPEST', label: 'Cheapest', desc: 'Lowest cost' },
  { value: 'FASTEST', label: 'Fastest', desc: 'Lowest latency' },
  { value: 'PRIVATE_ONLY', label: 'Private Only', desc: 'Self-hosted only' },
];

const STEP_ORDER: Step[] = ['brief', 'speakers', 'review'];
const STEP_LABELS: Record<Step, string> = {
  brief: 'Brief',
  speakers: 'Speakers',
  review: 'Review',
};

const VOICE_OPTIONS = [
  { value: 'mock-km-male-1', label: 'Piseth (Khmer Male)' },
  { value: 'mock-km-female-1', label: 'Sreymom (Khmer Female)' },
  { value: 'mock-en-male-1', label: 'James (English Male)' },
  { value: 'mock-en-female-1', label: 'Sarah (English Female)' },
];

export default function NewPodcastWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('brief');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Brief state
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [objective, setObjective] = useState('');
  const [audience, setAudience] = useState('');
  const [language, setLanguage] = useState('km');
  const [duration, setDuration] = useState(300);
  const [style, setStyle] = useState('conversational');
  const [routingMode, setRoutingMode] = useState('AUTO');

  // Speakers state
  const [speakers, setSpeakers] = useState<SpeakerInput[]>([
    { name: '', role: 'Host', personality: '', voiceId: 'mock-km-male-1', speakingShare: 0.5 },
    { name: '', role: 'Guest', personality: '', voiceId: 'mock-km-female-1', speakingShare: 0.5 },
  ]);

  function addSpeaker() {
    setSpeakers([...speakers, { name: '', role: '', personality: '', voiceId: '', speakingShare: 0.3 }]);
  }

  function removeSpeaker(index: number) {
    if (speakers.length <= 2) return;
    setSpeakers(speakers.filter((_, i) => i !== index));
  }

  function updateSpeaker(index: number, field: keyof SpeakerInput, value: string | number) {
    const updated = [...speakers];
    (updated[index] as any)[field] = value;
    setSpeakers(updated);
  }

  async function handleCreate() {
    setLoading(true);
    setError(null);

    try {
      const projRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          topic: topic || undefined,
          objective: objective || undefined,
          audience: audience || undefined,
          language,
          targetDuration: duration,
          style: style || undefined,
          routingMode,
        }),
      });

      if (!projRes.ok) {
        const data = await projRes.json();
        throw new Error(data.error || 'Failed to create project');
      }

      const project = await projRes.json();

      // 2. Add speakers
      for (const speaker of speakers) {
        if (!speaker.name) continue;
        const spkRes = await fetch(`/api/projects/${project.id}/speakers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: speaker.name,
            role: speaker.role || undefined,
            personality: speaker.personality || undefined,
            voiceId: speaker.voiceId || undefined,
            speakingShare: speaker.speakingShare,
          }),
        });
        if (!spkRes.ok) {
          console.warn('Failed to add speaker:', speaker.name);
        }
      }

      // 3. Generate outline
      const outlineRes = await fetch(`/api/projects/${project.id}/outline`, {
        method: 'POST',
      });
      if (!outlineRes.ok) {
        const data = await outlineRes.json();
        throw new Error(data.error || 'Failed to generate outline');
      }

      // 4. Generate dialogue
      const dialogueRes = await fetch(`/api/projects/${project.id}/dialogue`, {
        method: 'POST',
      });
      if (!dialogueRes.ok) {
        const data = await dialogueRes.json();
        throw new Error(data.error || 'Failed to generate dialogue');
      }

      router.push(`/projects/${project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const currentStepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Podcast</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a new AI-generated podcast episode — បង្កើតផតខាសថ្មី
        </p>
      </div>

      {/* Stepper — numbered, not color-only */}
      <ol className="flex items-center gap-2" aria-label="Wizard steps">
        {STEP_ORDER.map((s, i) => {
          const active = step === s;
          const complete = i < currentStepIndex;
          return (
            <li key={s} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => i < currentStepIndex && setStep(s)}
                disabled={i > currentStepIndex}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex flex-1 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                  active && 'border-primary/50 bg-primary/10 text-primary',
                  complete && 'border-success/40 bg-success/10 text-success',
                  !active && !complete && 'border-border bg-muted/30 text-muted-foreground',
                  i < currentStepIndex && 'cursor-pointer hover:border-primary/40'
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-current/10 text-xs font-bold"
                >
                  {complete ? '✓' : i + 1}
                </span>
                <span className="hidden sm:inline">{STEP_LABELS[s]}</span>
              </button>
              {i < STEP_ORDER.length - 1 && (
                <span className="text-muted-foreground/50" aria-hidden="true">
                  →
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <span aria-hidden="true">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* STEP 1: Brief */}
      {step === 'brief' && (
        <Card>
          <CardHeader>
            <CardTitle>Episode Brief</CardTitle>
            <CardDescription>Define your podcast topic, audience, and preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="AI in Cambodia" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic">Topic</Label>
              <Input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="The growing AI ecosystem in Cambodia" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="objective">Objective</Label>
                <Input id="objective" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Educate listeners about..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="audience">Target Audience</Label>
                <Input id="audience" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Tech professionals" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select id="language" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="km">Khmer</option>
                  <option value="en">English</option>
                  <option value="km-en">Khmer-English Mix</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (seconds)</Label>
                <Input id="duration" type="number" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 300)} min={30} max={7200} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="style">Style</Label>
                <Select id="style" value={style} onChange={(e) => setStyle(e.target.value)}>
                  <option value="conversational">Conversational</option>
                  <option value="formal">Formal</option>
                  <option value="educational">Educational</option>
                  <option value="debate">Debate</option>
                  <option value="interview">Interview</option>
                  <option value="storytelling">Storytelling</option>
                </Select>
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Provider Routing Mode</legend>
              <div className="flex flex-wrap gap-2">
                {ROUTING_MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setRoutingMode(m.value)}
                    aria-pressed={routingMode === m.value}
                    title={m.desc}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                      routingMode === m.value
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end pt-4">
              <Button onClick={() => setStep('speakers')} disabled={!title.trim()}>
                Next: Speakers →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: Speakers */}
      {step === 'speakers' && (
        <Card>
          <CardHeader>
            <CardTitle>Speakers</CardTitle>
            <CardDescription>Configure at least 2 speakers with distinct voices</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {speakers.map((speaker, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">
                    Speaker {i + 1}
                    {speaker.role && (
                      <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground">
                        {speaker.role}
                      </span>
                    )}
                  </h4>
                  {speakers.length > 2 && (
                    <Button variant="ghost" size="sm" onClick={() => removeSpeaker(i)}>
                      Remove
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`spk-name-${i}`}>Name *</Label>
                    <Input
                      id={`spk-name-${i}`}
                      value={speaker.name}
                      onChange={(e) => updateSpeaker(i, 'name', e.target.value)}
                      placeholder="Piseth"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`spk-role-${i}`}>Role</Label>
                    <Input
                      id={`spk-role-${i}`}
                      value={speaker.role}
                      onChange={(e) => updateSpeaker(i, 'role', e.target.value)}
                      placeholder="Host / Guest / Expert"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`spk-personality-${i}`}>Personality</Label>
                    <Input
                      id={`spk-personality-${i}`}
                      value={speaker.personality}
                      onChange={(e) => updateSpeaker(i, 'personality', e.target.value)}
                      placeholder="Curious, friendly..."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`spk-voice-${i}`}>Voice ID</Label>
                    <Select
                      id={`spk-voice-${i}`}
                      value={speaker.voiceId}
                      onChange={(e) => updateSpeaker(i, 'voiceId', e.target.value)}
                    >
                      {VOICE_OPTIONS.map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`spk-share-${i}`}>Speaking Share</Label>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {Math.round(speaker.speakingShare * 100)}%
                    </span>
                  </div>
                  <input
                    id={`spk-share-${i}`}
                    type="range"
                    min="0.1"
                    max="0.9"
                    step="0.05"
                    value={speaker.speakingShare}
                    onChange={(e) => updateSpeaker(i, 'speakingShare', parseFloat(e.target.value))}
                    className="w-full accent-primary"
                    aria-label={`Speaking share for speaker ${i + 1}`}
                  />
                </div>
              </div>
            ))}
            <Button variant="outline" onClick={addSpeaker}>
              ＋ Add Speaker
            </Button>
            <div className="flex justify-between gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep('brief')}>
                ← Back
              </Button>
              <Button
                onClick={() => setStep('review')}
                disabled={speakers.filter((s) => s.name.trim()).length < 2}
              >
                Next: Review →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Review & Generate */}
      {step === 'review' && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Generate</CardTitle>
            <CardDescription>Confirm the details, then generate your podcast</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary */}
            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Title</span>
                <span className="text-sm font-medium">{title || 'Untitled'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Topic</span>
                <span className="max-w-[60%] truncate text-sm font-medium">{topic || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Language</span>
                <span className="text-sm font-medium">
                  {language === 'km' ? 'Khmer' : language === 'en' ? 'English' : 'Khmer-English Mix'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Duration</span>
                <span className="text-sm font-medium">{Math.round(duration / 60)} min</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Routing</span>
                <span className="text-sm font-medium">
                  {ROUTING_MODES.find((m) => m.value === routingMode)?.label || routingMode}
                </span>
              </div>
            </div>

            {/* Speakers summary */}
            <div>
              <h4 className="mb-2 text-sm font-medium">
                Speakers ({speakers.filter((s) => s.name.trim()).length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {speakers
                  .filter((s) => s.name.trim())
                  .map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-sm">
                      <span aria-hidden="true">🎙️</span>
                      {s.name}
                      <span className="text-xs text-muted-foreground">
                        · {VOICE_OPTIONS.find((v) => v.value === s.voiceId)?.label.split(' (')[0] || s.voiceId}
                      </span>
                    </span>
                  ))}
              </div>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <span aria-hidden="true">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep('speakers')}>
                ← Back
              </Button>
              <Button onClick={handleCreate} disabled={loading || !title.trim() || speakers.filter((s) => s.name.trim()).length < 2}>
                {loading ? 'Generating… (outline + dialogue)' : '✨ Generate Podcast'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
