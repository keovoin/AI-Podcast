'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Turn {
  id: string;
  turnIndex: number;
  speakerId: string;
  text: string;
  normalizedText?: string;
  delivery?: { emotion?: string; pace?: string; pause_after_ms?: number };
  estimatedSeconds?: number;
  clip?: { durationMs: number; startTimeMs?: number } | null;
}

interface Project {
  id: string;
  title: string;
  topic?: string;
  language: string;
  targetDuration?: number;
  status: string;
  routingMode: string;
  speakers: Array<{ speaker: { id: string; name: string; role?: string; voiceId?: string } }>;
  outline?: { segments: unknown[]; locked: boolean } | null;
  turns: Turn[];
  exports: Array<{ id: string; format: string; createdAt: string; sizeBytes?: number }>;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editingTurn, setEditingTurn] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    fetchProject();
  }, [id]);

  async function fetchProject() {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function generateOutline() {
    setActionLoading('outline');
    try {
      await fetch(`/api/projects/${id}/outline`, { method: 'POST' });
      await fetchProject();
    } finally {
      setActionLoading(null);
    }
  }

  async function generateDialogue() {
    setActionLoading('dialogue');
    try {
      await fetch(`/api/projects/${id}/dialogue`, { method: 'POST' });
      await fetchProject();
    } finally {
      setActionLoading(null);
    }
  }

  async function generateAudio(turnIndex?: number) {
    setActionLoading(turnIndex !== undefined ? `audio-${turnIndex}` : 'audio');
    try {
      await fetch(`/api/projects/${id}/audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(turnIndex !== undefined ? { turnIndex } : {}),
      });
      await fetchProject();
    } finally {
      setActionLoading(null);
    }
  }

  async function exportProject() {
    setActionLoading('export');
    try {
      const res = await fetch(`/api/projects/${id}/export`, { method: 'POST' });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project?.title || 'podcast'}_export.zip`;
        a.click();
        URL.revokeObjectURL(url);
      }
      await fetchProject();
    } finally {
      setActionLoading(null);
    }
  }

  async function saveTurnEdit(turnIndex: number) {
    await fetch(`/api/projects/${id}/dialogue`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnIndex, text: editText }),
    });
    setEditingTurn(null);
    await fetchProject();
  }

  async function regenerateTurn(turnIndex: number) {
    await generateAudio(turnIndex);
  }

  if (loading) return <div className="container py-10"><p className="text-muted-foreground">Loading...</p></div>;
  if (!project) return <div className="container py-10"><p>Project not found</p></div>;

  const speakerNames: Record<string, string> = {};
  project.speakers.forEach((ps) => { speakerNames[ps.speaker.id] = ps.speaker.name; });

  return (
    <div className="container py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{project.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge>{project.status.replace('_', ' ')}</Badge>
            <Badge variant="outline">{project.language}</Badge>
            <Badge variant="outline">{project.routingMode}</Badge>
            {project.targetDuration && <Badge variant="secondary">{Math.round(project.targetDuration / 60)} min</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={generateOutline} disabled={!!actionLoading}>
            {actionLoading === 'outline' ? 'Generating...' : 'Regenerate Outline'}
          </Button>
          <Button variant="outline" onClick={generateDialogue} disabled={!!actionLoading}>
            {actionLoading === 'dialogue' ? 'Generating...' : 'Regenerate Dialogue'}
          </Button>
          <Button variant="outline" onClick={() => generateAudio()} disabled={!!actionLoading}>
            {actionLoading === 'audio' ? 'Generating...' : 'Generate Audio'}
          </Button>
          <Button onClick={exportProject} disabled={!!actionLoading}>
            {actionLoading === 'export' ? 'Exporting...' : 'Export ZIP'}
          </Button>
        </div>
      </div>

      {/* Speakers */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Speakers ({project.speakers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            {project.speakers.map((ps) => (
              <div key={ps.speaker.id} className="p-3 border rounded-lg">
                <p className="font-medium">{ps.speaker.name}</p>
                <p className="text-sm text-muted-foreground">{ps.speaker.role || 'Speaker'}</p>
                <p className="text-xs text-muted-foreground">Voice: {ps.speaker.voiceId || 'default'}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dialogue Editor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Dialogue ({project.turns.length} turns)</CardTitle>
          <CardDescription>Click a turn to edit. Use regenerate to re-synthesize audio for a single turn.</CardDescription>
        </CardHeader>
        <CardContent>
          {project.turns.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center">No dialogue yet. Click "Regenerate Dialogue" above.</p>
          ) : (
            <div className="space-y-2">
              {project.turns.map((turn) => (
                <div
                  key={turn.id}
                  className={`p-3 rounded-lg border ${editingTurn === turn.turnIndex ? 'border-primary' : 'hover:border-primary/50'} transition-colors`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-xs">
                          {speakerNames[turn.speakerId] || turn.speakerId}
                        </Badge>
                        {turn.delivery?.emotion && (
                          <span className="text-xs text-muted-foreground">{turn.delivery.emotion}</span>
                        )}
                        {turn.estimatedSeconds && (
                          <span className="text-xs text-muted-foreground">{turn.estimatedSeconds.toFixed(1)}s</span>
                        )}
                        {turn.clip && (
                          <Badge variant="success" className="text-xs">Audio ready</Badge>
                        )}
                      </div>
                      {editingTurn === turn.turnIndex ? (
                        <div className="space-y-2">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => saveTurnEdit(turn.turnIndex)}>Save</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingTurn(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <p
                          className="text-sm cursor-pointer"
                          onClick={() => { setEditingTurn(turn.turnIndex); setEditText(turn.text); }}
                        >
                          {turn.text}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => regenerateTurn(turn.turnIndex)}
                      disabled={actionLoading === `audio-${turn.turnIndex}`}
                      title="Regenerate audio for this turn only"
                    >
                      {actionLoading === `audio-${turn.turnIndex}` ? '...' : '🔄'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exports */}
      {project.exports.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Exports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {project.exports.map((exp) => (
                <div key={exp.id} className="flex items-center justify-between p-2 border rounded">
                  <span className="text-sm">{new Date(exp.createdAt).toLocaleString()} — {exp.format.toUpperCase()}</span>
                  {exp.sizeBytes && <span className="text-sm text-muted-foreground">{(exp.sizeBytes / 1024).toFixed(0)} KB</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
