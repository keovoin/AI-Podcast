'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Project {
  id: string;
  title: string;
  topic?: string;
  language: string;
  status: string;
  updatedAt: string;
  speakers: Array<{ speaker: { name: string } }>;
  _count: { turns: number; clips: number };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="container py-10"><p className="text-muted-foreground">Loading...</p></div>;
  }

  return (
    <div className="container py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground mt-1">Your podcast episodes</p>
        </div>
        <Link href="/projects/new">
          <Button>New Podcast</Button>
        </Link>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground mb-4">No projects yet.</p>
            <Link href="/projects/new"><Button>Create Your First Podcast</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{p.title}</h3>
                      <p className="text-sm text-muted-foreground">{p.topic || 'No topic'}</p>
                      <div className="flex gap-2 mt-2">
                        <Badge>{p.status.replace('_', ' ')}</Badge>
                        <Badge variant="outline">{p.language}</Badge>
                        <Badge variant="secondary">{p._count.turns} turns</Badge>
                        {p._count.clips > 0 && <Badge variant="success">{p._count.clips} clips</Badge>}
                      </div>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{p.speakers.map((s) => s.speaker.name).join(', ')}</p>
                      <p>{new Date(p.updatedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
