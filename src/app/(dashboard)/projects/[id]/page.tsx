'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

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
  thumbnailUrl?: string | null;
}

const PIPELINE_STEPS = [
  { key: 'outline', label: '1. Outline' },
  { key: 'dialogue', label: '2. Dialogue' },
  { key: 'validate', label: '3. Validate' },
  { key: 'audio', label: '4. Audio' },
  { key: 'export', label: '5. Export' },
];

/** Single shared add-turn form — replaces the 3 duplicated copies */
function AddTurnForm({
  speakers,
  insertLabel,
  onAdd,
  onCancel,
  busy,
}: {
  speakers: Array<{ speaker: { id: string; name: string } }>;
  insertLabel: string;
  onAdd: (speakerId: string, text: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [speakerId, setSpeakerId] = useState(speakers[0]?.speaker.id || '');
  const [text, setText] = useState('');

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3 animate-fade-in">
      <p className="text-xs font-medium text-primary">{insertLabel}</p>
      <Select
        value={speakerId}
        onChange={(e) => setSpeakerId(e.target.value)}
        aria-label="Select speaker"
      >
        {speakers.map((s) => (
          <option key={s.speaker.id} value={s.speaker.id}>
            {s.speaker.name}
          </option>
        ))}
      </Select>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter the turn text..."
        aria-label="New turn text"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            if (!speakerId || !text.trim()) return;
            onAdd(speakerId, text.trim());
            setText('');
          }}
          disabled={busy || !speakerId || !text.trim()}
        >
          {busy ? 'Adding...' : 'Add Turn'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
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
  const [addingAfter, setAddingAfter] = useState<number | null>(null);
  const [showAddAtEnd, setShowAddAtEnd] = useState(false);
  // Dialogs replacing window.alert/confirm
  const [deleteTurnTarget, setDeleteTurnTarget] = useState<number | null>(null);
  const [validationDialog, setValidationDialog] = useState<{ open: boolean; message: string }>({ open: false, message: '' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setProject(data);
        } else {
          const err = await res.json().catch(() => ({}));
          if (!cancelled) setActionError(`Failed to load project: ${err.error || err.details || `HTTP ${res.status}`}`);
        }
      } catch (e) {
        if (!cancelled) setActionError(`Network error loading project: ${e instanceof Error ? e.message : 'unknown'}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const fetchProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}`);
    if (res.ok) setProject(await res.json());
  }, [id]);

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

  async function addTurn(insertAfter: number | null, speakerId: string, text: string) {
    const result = await callAction(`/api/projects/${id}/dialogue`, 'add turn', 'PUT', {
      action: 'add',
      speakerId,
      text,
      insertAfter,
    });
    if (result) {
      setAddingAfter(null);
      setShowAddAtEnd(false);
    }
  }

  async function deleteTurn(turnIndex: number) {
    await callAction(`/api/projects/${id}/dialogue`, 'delete turn', 'PUT', {
      action: 'delete',
      turnIndex,
    });
    setDeleteTurnTarget(null);
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
        setValidationDialog({
          open: true,
          message: `Validation passed! ${result.stats.turnCount} turns, ${result.stats.totalEstimatedSeconds.toFixed(0)}s estimated.`,
        });
      } else {
        setActionError(
          `Validation: ${result.errors.length} errors, ${result.warnings.length} warnings. First error: ${result.errors[0]?.message || 'none'}`
        );
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

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-destructive">
        Project not found. Check the URL.
      </div>
    );
  }

  const speakerNames: Record<string, string> = {};
  project.speakers.forEach((ps) => {
    speakerNames[ps.speaker.id] = ps.speaker.name;
  });

  const pipelineStatus = (() => {
    const hasOutline = !!project.outline;
    const hasDialogue = project.turns.length > 0;
    const hasAudio = project.turns.some((t) => t.clip);
    const hasExport = project.exports.length > 0;
    return { hasOutline, hasDialogue, hasAudio, hasExport };
  })();

  const stepState = (key: string): 'done' | 'current' | 'todo' => {
    switch (key) {
      case 'outline':
        return pipelineStatus.hasOutline ? 'done' : actionLoading === 'outline' ? 'current' : 'todo';
      case 'dialogue':
        return pipelineStatus.hasDialogue ? 'done' : actionLoading === 'dialogue' ? 'current' : 'todo';
      case 'validate':
        return pipelineStatus.hasDialogue ? (pipelineStatus.hasAudio ? 'done' : 'todo') : 'todo';
      case 'audio':
        return pipelineStatus.hasAudio ? 'done' : actionLoading === 'audio' ? 'current' : 'todo';
      case 'export':
        return pipelineStatus.hasExport ? 'done' : actionLoading === 'export' ? 'current' : 'todo';
      default:
        return 'todo';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with thumbnail */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {project.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.thumbnailUrl}
              alt=""
              className="hidden h-20 w-20 shrink-0 rounded-lg border border-border object-cover sm:block"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{project.title}</h1>
            {project.topic && <p className="mt-0.5 text-sm text-muted-foreground">{project.topic}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge>{project.status.replace(/_/g, ' ')}</Badge>
              <Badge variant="outline">{project.language.toUpperCase()}</Badge>
              <Badge variant="outline">{project.routingMode.replace(/_/g, ' ')}</Badge>
              {project.targetDuration && (
                <Badge variant="secondary">{Math.round(project.targetDuration / 60)} min</Badge>
              )}
              <Badge variant="secondary">{project.speakers.length} speakers</Badge>
              <Badge variant="secondary">{project.turns.length} turns</Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${id}/timeline`}>🎬 Timeline</Link>
          </Button>
        </div>
      </div>

      {/* Action buttons + pipeline stepper */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Production Pipeline</CardTitle>
          <CardDescription>
            Generate content step by step: Outline → Dialogue → Audio → Export
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Pipeline stepper — non-color status via check/current markers */}
          <ol className="mb-5 flex flex-wrap items-center gap-2" aria-label="Production pipeline status">
            {PIPELINE_STEPS.map((s, i) => {
              const state = stepState(s.key);
              return (
                <li key={s.key} className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                      state === 'done' && 'border-success/40 bg-success/10 text-success',
                      state === 'current' && 'border-primary/40 bg-primary/10 text-primary',
                      state === 'todo' && 'border-border bg-muted/40 text-muted-foreground'
                    )}
                    aria-current={state === 'current' ? 'step' : undefined}
                  >
                    <span aria-hidden="true">
                      {state === 'done' ? '✓' : state === 'current' ? '◐' : i + 1}
                    </span>
                    {s.label}
                  </span>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <span className="text-muted-foreground/50" aria-hidden="true">
                      →
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          {actionError && (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <span aria-hidden="true">⚠️</span>
              <span>{actionError}</span>
            </div>
          )}
          {actionSuccess && (
            <div role="status" className="mb-4 flex items-start gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
              <span aria-hidden="true">✓</span>
              <span>{actionSuccess}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={generateOutline} disabled={!!actionLoading} variant="outline">
              {actionLoading === 'outline' ? 'Generating Outline…' : '1. Generate Outline'}
            </Button>
            <div className="flex items-center gap-1">
              <Button onClick={generateDialogue} disabled={!!actionLoading} variant="outline">
                {actionLoading === 'dialogue' ? 'Generating Dialogue…' : '2. Generate Dialogue'}
              </Button>
              <input
                type="number"
                min={2}
                max={100}
                value={targetTurns}
                onChange={(e) => setTargetTurns(e.target.value)}
                placeholder="# turns"
                aria-label="Optional number of turns"
                className="h-10 w-20 rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button
              onClick={validate}
              disabled={!!actionLoading || project.turns.length === 0}
              variant="outline"
            >
              {actionLoading === 'validate' ? 'Validating…' : '3. Validate'}
            </Button>
            <Button
              onClick={() => generateAudio()}
              disabled={!!actionLoading || project.turns.length === 0}
              variant="outline"
            >
              {actionLoading === 'audio' ? 'Generating Audio…' : '4. Generate Audio'}
            </Button>
            <Button
              onClick={exportProject}
              disabled={!!actionLoading || project.turns.length === 0}
            >
              {actionLoading === 'export' ? 'Exporting…' : '5. Export ZIP'}
            </Button>
          </div>
          {project.speakers.length < 2 && (
            <p className="mt-3 text-sm text-destructive">
              You need at least 2 speakers to generate content. Add speakers from the project creation wizard or API.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Episode audio player */}
      {project.status === 'AUDIO_READY' || project.status === 'EXPORTED' ? (
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/60 bg-primary/5">
            <CardTitle className="text-lg">🎧 Episode Audio</CardTitle>
            <CardDescription>Stream the generated episode (WAV, 16 kHz mono) — supports seeking via HTTP Range.</CardDescription>
          </CardHeader>
          <CardContent className="pt-5">
            <audio
              controls
              preload="metadata"
              className="w-full"
              src={`/api/projects/${id}/audio`}
            >
              Your browser does not support the audio element.
            </audio>
            <p className="mt-2 text-xs text-muted-foreground">
              Re-generate audio to update the episode. Single-turn regeneration is available in the turns list below.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Speakers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Speakers ({project.speakers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {project.speakers.length === 0 ? (
            <p className="text-muted-foreground">No speakers assigned to this project.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {project.speakers.map((ps) => (
                <div key={ps.speaker.id} className="min-w-[180px] flex-1 rounded-lg border border-border bg-muted/30 p-3 sm:flex-none">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm">
                      🎙️
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{ps.speaker.name}</p>
                      <p className="text-sm text-muted-foreground">{ps.speaker.role || 'Speaker'}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Voice: {ps.speaker.voiceId || 'default'}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Outline */}
      {project.outline && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Outline ({(project.outline.segments as unknown[]).length} segments)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(project.outline.segments as Array<{ id: string; title: string; duration_seconds: number; lead_speaker_id: string; questions?: string[] }>).map((seg, i) => (
                <div key={seg.id || i} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{seg.title}</span>
                    <Badge variant="secondary">{seg.duration_seconds}s</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Lead: {speakerNames[seg.lead_speaker_id] || seg.lead_speaker_id}
                  </p>
                  {seg.questions && seg.questions.length > 0 && (
                    <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                      {seg.questions.map((q, qi) => (
                        <li key={qi}>{q}</li>
                      ))}
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
          <CardDescription>
            Click text to edit. Use 🔄 to regenerate audio, ＋ to insert a turn, 🗑 to delete.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {project.turns.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
              <span aria-hidden="true" className="mb-2 text-3xl">💬</span>
              <p className="text-sm font-medium text-foreground">No dialogue yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Click &quot;1. Generate Outline&quot; then &quot;2. Generate Dialogue&quot; above.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {project.turns.map((turn) => (
                <div
                  key={turn.id}
                  className={cn(
                    'rounded-lg border border-border p-3 transition-colors',
                    editingTurn === turn.turnIndex ? 'border-primary' : 'hover:border-primary/50'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {speakerNames[turn.speakerId] || turn.speakerId}
                        </Badge>
                        {turn.delivery?.emotion && (
                          <span className="text-xs text-muted-foreground">{turn.delivery.emotion}</span>
                        )}
                        {turn.estimatedSeconds && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {turn.estimatedSeconds.toFixed(1)}s
                          </span>
                        )}
                        {turn.clip && (
                          <Badge variant="success" className="text-xs" dot>
                            <span>Audio ready</span>
                          </Badge>
                        )}
                      </div>
                      {editingTurn === turn.turnIndex ? (
                        <div className="space-y-2">
                          <Textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            aria-label={`Edit text for turn ${turn.turnIndex}`}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => saveTurnEdit(turn.turnIndex)}>
                              Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingTurn(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p
                          className="cursor-pointer text-sm"
                          onClick={() => {
                            setEditingTurn(turn.turnIndex);
                            setEditText(turn.text);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              setEditingTurn(turn.turnIndex);
                              setEditText(turn.text);
                            }
                          }}
                        >
                          {turn.text}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => generateAudio(turn.turnIndex)}
                        disabled={!!actionLoading}
                        aria-label={`Regenerate audio for turn ${turn.turnIndex}`}
                        title="Regenerate audio for this turn"
                      >
                        {actionLoading === `audio-${turn.turnIndex}` ? '…' : '🔄'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setAddingAfter(turn.turnIndex);
                          setShowAddAtEnd(false);
                        }}
                        disabled={!!actionLoading}
                        aria-label={`Insert a new turn after turn ${turn.turnIndex}`}
                        title="Insert a new turn after this one"
                      >
                        ＋
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteTurnTarget(turn.turnIndex)}
                        disabled={!!actionLoading}
                        aria-label={`Delete turn ${turn.turnIndex}`}
                        title="Delete this turn"
                      >
                        🗑
                      </Button>
                    </div>
                  </div>

                  {addingAfter === turn.turnIndex && (
                    <AddTurnForm
                      speakers={project.speakers}
                      insertLabel={`Insert new turn after #${turn.turnIndex + 1}`}
                      onAdd={(speakerId, text) => addTurn(turn.turnIndex, speakerId, text)}
                      onCancel={() => setAddingAfter(null)}
                      busy={actionLoading === 'add turn'}
                    />
                  )}
                </div>
              ))}

              {showAddAtEnd ? (
                <AddTurnForm
                  speakers={project.speakers}
                  insertLabel="Add new turn at the end"
                  onAdd={(speakerId, text) => addTurn(null, speakerId, text)}
                  onCancel={() => setShowAddAtEnd(false)}
                  busy={actionLoading === 'add turn'}
                />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowAddAtEnd(true);
                    setAddingAfter(null);
                  }}
                >
                  ＋ Add Turn
                </Button>
              )}
            </div>
          )}

          {project.turns.length === 0 && project.speakers.length >= 1 && (
            <div className="mt-4">
              {showAddAtEnd ? (
                <AddTurnForm
                  speakers={project.speakers}
                  insertLabel="Add a turn manually"
                  onAdd={(speakerId, text) => addTurn(null, speakerId, text)}
                  onCancel={() => setShowAddAtEnd(false)}
                  busy={actionLoading === 'add turn'}
                />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowAddAtEnd(true);
                    setAddingAfter(null);
                  }}
                >
                  ＋ Add Turn Manually
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exports */}
      {project.exports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Exports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {project.exports.map((exp) => (
                <div key={exp.id} className="flex items-center justify-between rounded-md border border-border p-2">
                  <span className="text-sm">
                    {new Date(exp.createdAt).toLocaleString()} — {exp.format.toUpperCase()}
                  </span>
                  {exp.sizeBytes && (
                    <span className="text-sm text-muted-foreground">{(exp.sizeBytes / 1024).toFixed(0)} KB</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm delete turn — replaces window.confirm */}
      <Dialog
        open={deleteTurnTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTurnTarget(null);
        }}
        title="Delete turn?"
        description={
          deleteTurnTarget !== null
            ? `Turn #${deleteTurnTarget + 1} will be permanently removed. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => deleteTurnTarget !== null && deleteTurn(deleteTurnTarget)}
      />

      {/* Validation result — replaces window.alert */}
      <Dialog
        open={validationDialog.open}
        onOpenChange={(open) => setValidationDialog((v) => ({ ...v, open }))}
        title="Validation complete"
        description={validationDialog.message}
        confirmLabel="OK"
        cancelLabel=""
        hideFooter={false}
        onConfirm={() => setValidationDialog({ open: false, message: '' })}
      />
    </div>
  );
}
