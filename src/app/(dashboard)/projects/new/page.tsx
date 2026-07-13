'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
      // 1. Create project
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

      // Redirect to project page
      router.push(`/projects/${project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container max-w-3xl py-10">
      <h1 className="text-3xl font-bold mb-2">New Podcast</h1>
      <p className="text-muted-foreground mb-8">Create a new AI-generated podcast episode</p>

      {/* Progress */}
      <div className="flex gap-2 mb-8">
        {(['brief', 'speakers', 'review'] as Step[]).map((s, i) => (
          <div
            key={s}
            className={`flex-1 h-2 rounded-full ${
              step === s ? 'bg-primary' : i < ['brief', 'speakers', 'review'].indexOf(step) ? 'bg-primary/50' : 'bg-muted'
            }`}
          />
        ))}
      </div>

      {error && (
        <div className="p-4 rounded bg-destructive/10 text-destructive text-sm mb-6">{error}</div>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="objective">Objective</Label>
                <Input id="objective" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Educate listeners about..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="audience">Target Audience</Label>
                <Input id="audience" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Tech professionals" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="km">Khmer</option>
                  <option value="en">English</option>
                  <option value="km-en">Khmer-English Mix</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (seconds)</Label>
                <Input id="duration" type="number" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 300)} min={30} max={7200} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="style">Style</Label>
                <select
                  id="style"
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="conversational">Conversational</option>
                  <option value="formal">Formal</option>
                  <option value="educational">Educational</option>
                  <option value="debate">Debate</option>
                  <option value="interview">Interview</option>
                  <option value="storytelling">Storytelling</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Provider Routing Mode</Label>
              <div className="flex gap-2 flex-wrap">
                {ROUTING_MODES.map((m) => (
                  <Button
                    key={m.value}
                    type="button"
                    size="sm"
                    variant={routingMode === m.value ? 'default' : 'outline'}
                    onClick={() => setRoutingMode(m.value)}
                    title={m.desc}
                  >
                    {m.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="pt-4">
              <Button onClick={() => setStep('speakers')} disabled={!title.trim()}>
                Next: Speakers &rarr;
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
              <div key={i} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Speaker {i + 1}</h4>
                  {speakers.length > 2 && (
                    <Button variant="ghost" size="sm" onClick={() => removeSpeaker(i)}>Remove</Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Name *</Label>
                    <Input value={speaker.name} onChange={(e) => updateSpeaker(i, 'name', e.target.value)} placeholder="Piseth" />
                  </div>
                  <div className="space-y-1">
                    <Label>Role</Label>
                    <Input value={speaker.role} onChange={(e) => updateSpeaker(i, 'role', e.target.value)} placeholder="Host / Guest / Expert" />
                  </div>
                  <div className="space-y-1">
                    <Label>Personality</Label>
                    <Input value={speaker.personality} onChange={(e) => updateSpeaker(i, 'personality', e.target.value)} placeholder="Curious, friendly..." />
                  </div>
                  <div className="space-y-1">
                    <Label>Voice ID</Label>
                    <select
                      value={speaker.voiceId}
                      onChange={(e) => updateSpeaker(i, 'voiceId', e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="mock-km-male-1">Piseth (Khmer Male)</option>
                      <option value="mock-km-female-1">Sreymom (Khmer Female)</option>
                      <option value="mock-en-male-1">James (English Male)</option>
                      <option value="mock-en-female-1">Sarah (English Female)</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Speaking Share: {Math.round(speaker.speakingShare * 100)}%</Label>
                  <input
                    type="range"
                    min="0.1"
                    max="0.9"
                    step="0.05"
                    value={speaker.speakingShare}
                    onChange={(e) => updateSpeaker(i, 'speakingShare', parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            ))}
            <Button variant="outline" onClick={addSpeaker}>+ Add Speaker</Button>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep('brief')}>&larr; Back</Button>
              <Button
                onClick={() => setStep('review')}
                disabled={speakers.filter((s) => s.name.trim()).length < 2}
              >
                Next: Review &rarr;
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
            <CardDescription>Confirm your settings and create the podcast</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-muted space-y-2">
              <p><strong>Title:</strong> {title}</p>
              {topic && <p><strong>Topic:</strong> {topic}</p>}
              <p><strong>Language:</strong> {language === 'km' ? 'Khmer' : language === 'en' ? 'English' : 'Khmer-English Mix'}</p>
              <p><strong>Duration:</strong> {Math.round(duration / 60)} min ({duration}s)</p>
              <p><strong>Style:</strong> {style}</p>
              <p><strong>Routing:</strong> {routingMode}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted space-y-2">
              <p className="font-medium">Speakers ({speakers.filter((s) => s.name).length}):</p>
              {speakers.filter((s) => s.name).map((s, i) => (
                <p key={i} className="text-sm">
                  {s.name} — {s.role || 'Speaker'} ({Math.round(s.speakingShare * 100)}%)
                </p>
              ))}
            </div>
            <div className="p-4 rounded-lg border border-primary/20 bg-primary/5 text-sm">
              <p className="font-medium mb-1">What happens next:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Create project with your settings</li>
                <li>Add speakers to the project</li>
                <li>Generate episode outline using LLM</li>
                <li>Generate structured dialogue turns</li>
                <li>Redirect you to the project editor</li>
              </ol>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep('speakers')}>&larr; Back</Button>
              <Button onClick={handleCreate} disabled={loading}>
                {loading ? 'Generating...' : 'Create Podcast'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
