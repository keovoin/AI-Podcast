'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface Clip {
  id: string;
  turnId: string;
  durationMs: number;
  startTimeMs?: number;
  voiceId: string;
}

interface Turn {
  id: string;
  turnIndex: number;
  speakerId: string;
  text: string;
  estimatedSeconds?: number;
  delivery?: { emotion?: string; pace?: string; pause_after_ms?: number };
  clip?: Clip | null;
}

interface Project {
  id: string;
  title: string;
  language: string;
  status: string;
  speakers: Array<{ speaker: { id: string; name: string } }>;
  turns: Turn[];
}

const SPEAKER_COLORS = [
  'bg-blue-500/20 border-blue-500/50',
  'bg-purple-500/20 border-purple-500/50',
  'bg-green-500/20 border-green-500/50',
  'bg-orange-500/20 border-orange-500/50',
  'bg-pink-500/20 border-pink-500/50',
];

const TICK_MS = 100;

export default function TimelinePage() {
  const params = useParams();
  const id = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load project
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setProject(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load project');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Build speaker maps once (O(n) instead of O(n²) lookups inline)
  const { speakerNames, speakerColorMap } = useMemo(() => {
    const names: Record<string, string> = {};
    const colors: Record<string, string> = {};
    project?.speakers.forEach((ps, i) => {
      names[ps.speaker.id] = ps.speaker.name;
      colors[ps.speaker.id] = SPEAKER_COLORS[i % SPEAKER_COLORS.length]!;
    });
    return { speakerNames: names, speakerColorMap: colors };
  }, [project]);

  // Precompute per-turn offsets (O(n) cumulative pass — fixes the O(n²) loops)
  const turnOffsets = useMemo(() => {
    if (!project) return new Map<number, number>();
    const map = new Map<number, number>();
    let cumulative = 0;
    for (const t of project.turns) {
      map.set(t.turnIndex, cumulative);
      const clipMs = t.clip?.durationMs || (t.estimatedSeconds || 5) * 1000;
      const pauseMs = t.delivery?.pause_after_ms || 300;
      cumulative += clipMs + pauseMs;
    }
    return map;
  }, [project]);

  const totalDurationMs = useMemo(() => {
    if (!project) return 0;
    return project.turns.reduce((sum, t) => {
      const clipMs = t.clip?.durationMs || (t.estimatedSeconds || 5) * 1000;
      const pauseMs = t.delivery?.pause_after_ms || 300;
      return sum + clipMs + pauseMs;
    }, 0);
  }, [project]);

  // Timer lifecycle — always cleaned up on unmount (fixes the setInterval leak)
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const togglePlay = useCallback(() => {
    if (playing) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setPlaying(false);
    } else {
      setPlaying(true);
      timerRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= totalDurationMs) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            setPlaying(false);
            return 0;
          }
          return prev + TICK_MS;
        });
      }, TICK_MS);
    }
  }, [playing, totalDurationMs]);

  const seekTo = useCallback(
    (ms: number) => {
      setCurrentTime(Math.max(0, Math.min(ms, totalDurationMs)));
    },
    [totalDurationMs]
  );

  const stopPlayback = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPlaying(false);
    setCurrentTime(0);
  }, []);

  function formatTime(ms: number) {
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `${min}:${String(sec).padStart(2, '0')}`;
  }

  // Active turn from cumulative offsets (binary-search friendly; linear is fine for <100 turns)
  const activeTurn = useMemo(() => {
    if (!project) return -1;
    let cumulative = 0;
    for (const turn of project.turns) {
      const clipMs = turn.clip?.durationMs || (turn.estimatedSeconds || 5) * 1000;
      if (currentTime >= cumulative && currentTime < cumulative + clipMs) return turn.turnIndex;
      cumulative += clipMs + (turn.delivery?.pause_after_ms || 300);
    }
    return -1;
  }, [project, currentTime]);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-destructive">
        {error || 'Project not found'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{project.title} — Timeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">Visual audio timeline with per-turn clips</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/projects/${id}`}>← Back to Editor</Link>
        </Button>
      </div>

      {/* Transport Controls */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-4">
            <Button
              onClick={togglePlay}
              size="sm"
              aria-label={playing ? 'Pause playback' : 'Play timeline'}
              aria-pressed={playing}
            >
              {playing ? '⏸ Pause' : '▶ Play'}
            </Button>
            <Button variant="outline" size="sm" onClick={stopPlayback} aria-label="Reset timeline to start">
              ⏮ Reset
            </Button>
            <span className="font-mono text-sm tabular-nums">
              {formatTime(currentTime)} / {formatTime(totalDurationMs)}
            </span>
            {/* Progress bar — clickable seek */}
            <div
              role="slider"
              aria-label="Timeline position"
              aria-valuemin={0}
              aria-valuemax={totalDurationMs}
              aria-valuenow={Math.round(currentTime)}
              aria-valuetext={`${formatTime(currentTime)} of ${formatTime(totalDurationMs)}`}
              tabIndex={0}
              className="relative h-2 min-w-[200px] flex-1 cursor-pointer rounded-full bg-muted"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                seekTo(pct * totalDurationMs);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') seekTo(currentTime + 1000);
                if (e.key === 'ArrowLeft') seekTo(currentTime - 1000);
              }}
            >
              <div
                className="absolute h-2 rounded-full bg-primary transition-all"
                style={{ width: `${totalDurationMs > 0 ? (currentTime / totalDurationMs) * 100 : 0}%` }}
              />
            </div>
            <Badge variant="secondary">{project.turns.length} turns</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Timeline Visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Audio Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {/* Speaker lanes */}
            {project.speakers.map((ps) => {
              const speakerTurns = project.turns.filter((t) => t.speakerId === ps.speaker.id);
              return (
                <div key={ps.speaker.id} className="mb-4">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">{ps.speaker.name}</p>
                  <div className="relative h-10 overflow-hidden rounded-md bg-muted/50">
                    {speakerTurns.map((turn) => {
                      const offset = turnOffsets.get(turn.turnIndex) ?? 0;
                      const duration = turn.clip?.durationMs || (turn.estimatedSeconds || 5) * 1000;
                      const left = totalDurationMs > 0 ? (offset / totalDurationMs) * 100 : 0;
                      const width = totalDurationMs > 0 ? (duration / totalDurationMs) * 100 : 0;

                      return (
                        <button
                          key={turn.id}
                          type="button"
                          onClick={() => seekTo(offset)}
                          aria-label={`Seek to turn ${turn.turnIndex}: ${turn.text.slice(0, 50)}`}
                          className={cn(
                            'absolute top-1 bottom-1 cursor-pointer overflow-hidden rounded border text-left transition-all',
                            speakerColorMap[turn.speakerId],
                            activeTurn === turn.turnIndex && 'ring-2 ring-primary'
                          )}
                          style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                        >
                          <span className="block truncate px-1 text-[9px] leading-8">
                            {turn.text.slice(0, 20)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {/* Playhead */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-red-500"
              style={{ left: `${totalDurationMs > 0 ? (currentTime / totalDurationMs) * 100 : 0}%` }}
              aria-hidden="true"
            />
          </div>
        </CardContent>
      </Card>

      {/* Turn List with timestamps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Clips</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {project.turns.map((turn) => {
              const offset = turnOffsets.get(turn.turnIndex) ?? 0;
              const duration = turn.clip?.durationMs || (turn.estimatedSeconds || 5) * 1000;

              return (
                <button
                  key={turn.id}
                  type="button"
                  onClick={() => seekTo(offset)}
                  aria-current={activeTurn === turn.turnIndex ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors',
                    activeTurn === turn.turnIndex
                      ? 'border border-primary/30 bg-primary/10'
                      : 'hover:bg-muted'
                  )}
                >
                  <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    {formatTime(offset)}
                  </span>
                  <Badge variant="secondary" className="w-20 shrink-0 justify-center text-xs">
                    {speakerNames[turn.speakerId]}
                  </Badge>
                  <span className="flex-1 truncate text-sm">{turn.text}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {(duration / 1000).toFixed(1)}s
                  </span>
                  {turn.clip ? (
                    <Badge variant="success" className="shrink-0 text-xs" dot>
                      <span>Ready</span>
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      Est.
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
