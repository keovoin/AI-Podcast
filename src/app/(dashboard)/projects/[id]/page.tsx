'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [editingTurn, setEditingTurn] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [targetTurns, setTargetTurns] = useState<string>('');
  // Add-turn form state
  const [addingAfter, setAddingAfter] = useState<number | null>(null);
  const [newTurnSpeaker, setNewTurnSpeaker] = useState('');
  const [newTurnText, setNewTurnText] = useState('');
  const [showAddAtEnd, setShowAddAtEnd] = useState(false);

  useEffect(() => { fetchProject(); }, [id]);

  async function fetchProject() {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (res.ok) {
        setProject(await res.json());
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(`Failed to load project: ${err.error || err.details || `HTTP ${res.status}`}`);
      }
    } catch (e) {
      setActionError(`Network error loading project: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setLoading(false);
    }
  }

  async function callAction(url: string, label: string, method = 'POST', body?: object) {
    setActionLoading(label);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.error || data?.details || `${label} failed (HTTP ${res.status})`);
        return null;
      }
      setActionSuccess(`${label} completed successfully!`);
      await fetchProject();
      return data;
    } catch (e) {
      setActionError(`${label} failed: ${e instanceof Error ? e.message : 'Network error'}`);
      return null;
    } finally {
      setActionLoading(null);
    }
  }

  async function generateOutline() {
    await callAction(`/api/projects/${id}/outline`, 'outline');
  }

  async function generateDialogue() {
    const tt = parseInt(targetTurns, 10);
    const body = !isNaN(tt) && tt > 0 ? { targetTurns: tt } : undefined;
    await callAction(`/api/projects/${id}/dialogue`, 'dialogue', 'POST', body);
  }

  async function addTurn(insertAfter: number | null) {
    if (!newTurnSpeaker || !newTurnText.trim()) {
      setActionError('Select a speaker and enter text for the new turn.');
      return;
    }
    const result = await callAction(`/api/projects/${id}/dialogue`, 'add turn', 'PUT', {
      action: 'add',
      speakerId: newTurnSpeaker,
      text: newTurnText.trim(),
      insertAfter,
    });
    if (result) {
      setNewTurnText('');
      setAddingAfter(null);
      setShowAddAtEnd(false);
    }
  }

  async function deleteTurn(turnIndex: number) {
    if (!confirm('Delete this turn?')) return;
    await callAction(`/api/projects/${id}/dialogue`, 'delete turn', 'PUT', {
      action: 'delete',
      turnIndex,
    });
  }

  async function generateAudio(turnIndex?: number) {
    const label = turnIndex !== undefined ? `audio-${turnIndex}` : 'audio';
    await callAction(`/api/projects/${id}/audio`, label, 'POST', turnIndex !== undefined ? { turnIndex } : undefined);
  }

  async function validate() {
    const result = await callAction(`/api/projects/${id}/validate`, 'validate');
    if (result) {
      if (result.valid) {
        setActionError(null);
        alert(`Validation passed! ${result.stats.turnCount} turns, ${result.stats.totalEstimatedSeconds.toFixed(0)}s estimated.`);
      } else {
        setActionError(`Validation: ${result.errors.length} errors, ${result.warnings.length} warnings. First error: ${result.errors[0]?.message || 'none'}`);
      }
    }
  }

  async function exportProject() {
    setActionLoading('export');
    setActionError(null);
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
        await fetchProject();
      } else {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || 'Export failed');
      }
    } catch (e) {
      setActionError('Export failed: network error');
    } finally {
      setActionLoading(null);
    }
  }

  async function saveTurnEdit(turnIndex: number) {
    await callAction(`/api/projects/${id}/dialogue`, 'save', 'PATCH', { turnIndex, text: editText });
    setEditingTurn(null);
  }

  if (loading) return <div className="container py-10"><p className="text-muted-foreground">Loading...</p></div>;
  if (!project) return <div className="container py-10"><p className="text-destructive">Project not found. Check the URL.</p></div>;

  const speakerNames: Record<string, string> = {};
  project.speakers.forEach((ps) => { speakerNames[ps.speaker.id] = ps.speaker.name; });

  return (
    <div className="container py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">{project.title}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge>{project.status.replace(/_/g, ' ')}</Badge>
            <Badge variant="outline">{project.language}</Badge>
            <Badge variant="outline">{project.routingMode}</Badge>
            {project.targetDuration && <Badge variant="secondary">{Math.round(project.targetDuration / 60)} min</Badge>}
            <Badge variant="secondary">{project.speakers.length} speakers</Badge>
            <Badge variant="secondary">{project.turns.length} turns</Badge>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Actions</CardTitle>
          <CardDescription>Generate content step by step: Outline → Dialogue → Audio → Export</CardDescription>
        </CardHeader>
        <CardContent>
          {actionError && (
            <div className="p-3 rounded bg-destructive/10 text-destructive text-sm mb-4">
              {actionError}
            </div>
          )}
          {actionSuccess && (
            <div className="p-3 rounded bg-green-500/10 text-green-500 text-sm mb-4">
              {actionSuccess}
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <Button onClick={generateOutline} disabled={!!actionLoading} variant="outline">
              {actionLoading === 'outline' ? 'Generating Outline...' : '1. Generate Outline'}
            </Button>
            <div className="flex items-center gap-1">
              <Button onClick={generateDialogue} disabled={!!actionLoading} variant="outline">
                {actionLoading === 'dialogue' ? 'Generating Dialogue...' : '2. Generate Dialogue'}
              </Button>
              <input
                type="number"
                min={2}
                max={100}
                value={targetTurns}
                onChange={(e) => setTargetTurns(e.target.value)}
                placeholder="# turns"
                title="Optional: number of turns to generate"
                className="h-10 w-20 rounded-md border border-input bg-background px-2 py-1 text-sm"
              />
            </div>
            <Button onClick={validate} disabled={!!actionLoading || project.turns.length === 0} variant="outline">
              {actionLoading === 'validate' ? 'Validating...' : '3. Validate'}
            </Button>
            <Button onClick={() => generateAudio()} disabled={!!actionLoading || project.turns.length === 0} variant="outline">
              {actionLoading === 'audio' ? 'Generating Audio...' : '4. Generate Audio'}
            </Button>
            <Button onClick={exportProject} disabled={!!actionLoading || project.turns.length === 0}>
              {actionLoading === 'export' ? 'Exporting...' : '5. Export ZIP'}
            </Button>
          </div>
          {project.speakers.length < 2 && (
            <p className="text-sm text-destructive mt-3">
              You need at least 2 speakers to generate content. Add speakers from the project creation wizard or API.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Speakers */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Speakers ({project.speakers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {project.speakers.length === 0 ? (
            <p className="text-muted-foreground">No speakers assigned to this project.</p>
          ) : (
            <div className="flex gap-4 flex-wrap">
              {project.speakers.map((ps) => (
                <div key={ps.speaker.id} className="p-3 border rounded-lg">
                  <p className="font-medium">{ps.speaker.name}</p>
                  <p className="text-sm text-muted-foreground">{ps.speaker.role || 'Speaker'}</p>
                  <p className="text-xs text-muted-foreground">Voice: {ps.speaker.voiceId || 'default'}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Outline */}
      {project.outline && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Outline ({(project.outline.segments as unknown[]).length} segments)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(project.outline.segments as Array<{ id: string; title: string; duration_seconds: number; lead_speaker_id: string; questions?: string[] }>).map((seg, i) => (
                <div key={seg.id || i} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{seg.title}</span>
                    <Badge variant="secondary">{seg.duration_seconds}s</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Lead: {speakerNames[seg.lead_speaker_id] || seg.lead_speaker_id}
                  </p>
                  {seg.questions && seg.questions.length > 0 && (
                    <ul className="text-xs text-muted-foreground mt-1 list-disc list-inside">
                      {seg.questions.map((q, qi) => <li key={qi}>{q}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogue Editor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Dialogue ({project.turns.length} turns)</CardTitle>
          <CardDescription>Click text to edit. Use 🔄 to regenerate audio, ➕ to insert a turn, 🗑 to delete.</CardDescription>
        </CardHeader>
        <CardContent>
          {project.turns.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center">
              No dialogue yet. Click "1. Generate Outline" then "2. Generate Dialogue" above.
            </p>
          ) : (
            <div className="space-y-2">
              {project.turns.map((turn) => (
                <div
                  key={turn.id}
                  className={`p-3 rounded-lg border ${editingTurn === turn.turnIndex ? 'border-primary' : 'hover:border-primary/50'} transition-colors`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => generateAudio(turn.turnIndex)}
                        disabled={!!actionLoading}
                        title="Regenerate audio for this turn"
                      >
                        {actionLoading === `audio-${turn.turnIndex}` ? '...' : '🔄'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setAddingAfter(turn.turnIndex); setNewTurnSpeaker(project.speakers[0]?.speaker.id || ''); setNewTurnText(''); }}
                        disabled={!!actionLoading}
                        title="Insert a new turn after this one"
                      >
                        ➕
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteTurn(turn.turnIndex)}
                        disabled={!!actionLoading}
                        title="Delete this turn"
                      >
                        🗑
                      </Button>
                    </div>
                  </div>

                  {/* Inline add-turn form (insert after this turn) */}
                  {addingAfter === turn.turnIndex && (
                    <div className="mt-3 p-3 rounded-lg border border-primary/40 bg-primary/5 space-y-2">
                      <p className="text-xs font-medium">Insert new turn after #{turn.turnIndex + 1}</p>
                      <select
                        value={newTurnSpeaker}
                        onChange={(e) => setNewTurnSpeaker(e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        {project.speakers.map((ps) => (
                          <option key={ps.speaker.id} value={ps.speaker.id}>{ps.speaker.name}</option>
                        ))}
                      </select>
                      <textarea
                        value={newTurnText}
                        onChange={(e) => setNewTurnText(e.target.value)}
                        placeholder="Enter the turn text..."
                        className="w-full min-h-[70px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => addTurn(turn.turnIndex)} disabled={!!actionLoading}>
                          {actionLoading === 'add turn' ? 'Adding...' : 'Add Turn'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setAddingAfter(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add turn at the end */}
              {showAddAtEnd ? (
                <div className="p-3 rounded-lg border border-primary/40 bg-primary/5 space-y-2">
                  <p className="text-xs font-medium">Add new turn at the end</p>
                  <select
                    value={newTurnSpeaker}
                    onChange={(e) => setNewTurnSpeaker(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {project.speakers.map((ps) => (
                      <option key={ps.speaker.id} value={ps.speaker.id}>{ps.speaker.name}</option>
                    ))}
                  </select>
                  <textarea
                    value={newTurnText}
                    onChange={(e) => setNewTurnText(e.target.value)}
                    placeholder="Enter the turn text..."
                    className="w-full min-h-[70px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => addTurn(null)} disabled={!!actionLoading}>
                      {actionLoading === 'add turn' ? 'Adding...' : 'Add Turn'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowAddAtEnd(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowAddAtEnd(true); setAddingAfter(null); setNewTurnSpeaker(project.speakers[0]?.speaker.id || ''); setNewTurnText(''); }}
                >
                  ➕ Add Turn
                </Button>
              )}
            </div>
          )}

          {/* When no turns exist, still allow manually adding the first ones */}
          {project.turns.length === 0 && project.speakers.length >= 1 && (
            showAddAtEnd ? (
              <div className="mt-4 p-3 rounded-lg border border-primary/40 bg-primary/5 space-y-2">
                <p className="text-xs font-medium">Add a turn manually</p>
                <select
                  value={newTurnSpeaker}
                  onChange={(e) => setNewTurnSpeaker(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {project.speakers.map((ps) => (
                    <option key={ps.speaker.id} value={ps.speaker.id}>{ps.speaker.name}</option>
                  ))}
                </select>
                <textarea
                  value={newTurnText}
                  onChange={(e) => setNewTurnText(e.target.value)}
                  placeholder="Enter the turn text..."
                  className="w-full min-h-[70px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => addTurn(null)} disabled={!!actionLoading}>
                    {actionLoading === 'add turn' ? 'Adding...' : 'Add Turn'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAddAtEnd(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button
                className="mt-4"
                variant="outline"
                size="sm"
                onClick={() => { setShowAddAtEnd(true); setNewTurnSpeaker(project.speakers[0]?.speaker.id || ''); setNewTurnText(''); }}
              >
                ➕ Add Turn Manually
              </Button>
            )
          )}
        </CardContent>
      </Card>

      {/* Exports */}
      {project.exports.length > 0 && (
        <Card className="mt-6">
          <CardHeader><CardTitle className="text-lg">Exports</CardTitle></CardHeader>
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
