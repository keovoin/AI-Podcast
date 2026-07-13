'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

export default function TimelinePage() {
  const params = useParams();
  const id = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then(setProject)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const speakerNames: Record<string, string> = {};
  const speakerColorMap: Record<string, string> = {};
  project?.speakers.forEach((ps, i) => {
    speakerNames[ps.speaker.id] = ps.speaker.name;
    speakerColorMap[ps.speaker.id] = SPEAKER_COLORS[i % SPEAKER_COLORS.length]!;
  });

  const totalDurationMs = project?.turns.reduce((sum, t) => {
    const clipMs = t.clip?.durationMs || (t.estimatedSeconds || 5) * 1000;
    const pauseMs = t.delivery?.pause_after_ms || 300;
    return sum + clipMs + pauseMs;
  }, 0) || 0;

  function togglePlay() {
    if (playing) {
      if (timerRef.current) clearInterval(timerRef.current);
      setPlaying(false);
    } else {
      setPlaying(true);
      timerRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= totalDurationMs) {
            clearInterval(timerRef.current!);
            setPlaying(false);
            return 0;
          }
          return prev + 100;
        });
      }, 100);
    }
  }

  function seekTo(ms: number) {
    setCurrentTime(Math.max(0, Math.min(ms, totalDurationMs)));
  }

  function formatTime(ms: number) {
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `${min}:${String(sec).padStart(2, '0')}`;
  }

  function getActiveTurnIndex(): number {
    if (!project) return -1;
    let cumulative = 0;
    for (const turn of project.turns) {
      const clipMs = turn.clip?.durationMs || (turn.estimatedSeconds || 5) * 1000;
      const pauseMs = turn.delivery?.pause_after_ms || 300;
      if (currentTime >= cumulative && currentTime < cumulative + clipMs) return turn.turnIndex;
      cumulative += clipMs + pauseMs;
    }
    return -1;
  }

  if (loading) return <div className="container py-10"><p className="text-muted-foreground">Loading...</p></div>;
  if (!project) return <div className="container py-10"><p>Project not found</p></div>;

  const activeTurn = getActiveTurnIndex();

  return (
    <div className="container py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{project.title} — Timeline</h1>
          <p className="text-muted-foreground">Visual audio timeline with per-turn clips</p>
        </div>
        <Link href={`/projects/${id}`}><Button variant="outline">&larr; Back to Editor</Button></Link>
      </div>

      {/* Transport Controls */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <Button onClick={togglePlay} size="sm">
              {playing ? '⏸ Pause' : '▶ Play'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => seekTo(0)}>⏮ Reset</Button>
            <span className="font-mono text-sm">{formatTime(currentTime)} / {formatTime(totalDurationMs)}</span>
            {/* Progress bar */}
            <div className="flex-1 h-2 bg-muted rounded-full cursor-pointer relative" onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              seekTo(pct * totalDurationMs);
            }}>
              <div className="absolute h-2 bg-primary rounded-full transition-all" style={{ width: `${totalDurationMs > 0 ? (currentTime / totalDurationMs) * 100 : 0}%` }} />
            </div>
            <Badge variant="secondary">{project.turns.length} turns</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Timeline Visualization */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-lg">Audio Timeline</CardTitle></CardHeader>
        <CardContent>
          <div className="relative">
            {/* Speaker lanes */}
            {project.speakers.map((ps) => {
              const speakerTurns = project.turns.filter((t) => t.speakerId === ps.speaker.id);
              return (
                <div key={ps.speaker.id} className="mb-4">
                  <p className="text-xs font-medium text-muted-foreground mb-1">{ps.speaker.name}</p>
                  <div className="relative h-10 bg-muted/50 rounded overflow-hidden">
                    {speakerTurns.map((turn) => {
                      let offset = 0;
                      for (const t of project.turns) {
                        if (t.turnIndex === turn.turnIndex) break;
                        offset += (t.clip?.durationMs || (t.estimatedSeconds || 5) * 1000) + (t.delivery?.pause_after_ms || 300);
                      }
                      const duration = turn.clip?.durationMs || (turn.estimatedSeconds || 5) * 1000;
                      const left = totalDurationMs > 0 ? (offset / totalDurationMs) * 100 : 0;
                      const width = totalDurationMs > 0 ? (duration / totalDurationMs) * 100 : 0;

                      return (
                        <div
                          key={turn.id}
                          className={`absolute top-1 bottom-1 rounded border ${speakerColorMap[turn.speakerId]} ${activeTurn === turn.turnIndex ? 'ring-2 ring-primary' : ''} cursor-pointer transition-all`}
                          style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                          title={`Turn ${turn.turnIndex}: ${turn.text.slice(0, 50)}...`}
                          onClick={() => seekTo(offset)}
                        >
                          <span className="text-[9px] px-1 truncate block leading-8">{turn.text.slice(0, 20)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {/* Playhead */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none" style={{ left: `${totalDurationMs > 0 ? (currentTime / totalDurationMs) * 100 : 0}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Turn List with timestamps */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Clips</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1">
            {project.turns.map((turn) => {
              let offset = 0;
              for (const t of project.turns) {
                if (t.turnIndex === turn.turnIndex) break;
                offset += (t.clip?.durationMs || (t.estimatedSeconds || 5) * 1000) + (t.delivery?.pause_after_ms || 300);
              }
              const duration = turn.clip?.durationMs || (turn.estimatedSeconds || 5) * 1000;

              return (
                <div
                  key={turn.id}
                  className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${activeTurn === turn.turnIndex ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted'}`}
                  onClick={() => seekTo(offset)}
                >
                  <span className="text-xs font-mono text-muted-foreground w-12">{formatTime(offset)}</span>
                  <Badge variant="secondary" className="text-xs w-20 justify-center">{speakerNames[turn.speakerId]}</Badge>
                  <span className="text-sm flex-1 truncate">{turn.text}</span>
                  <span className="text-xs text-muted-foreground">{(duration / 1000).toFixed(1)}s</span>
                  {turn.clip ? <Badge variant="success" className="text-xs">Ready</Badge> : <Badge variant="outline" className="text-xs">Est.</Badge>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
