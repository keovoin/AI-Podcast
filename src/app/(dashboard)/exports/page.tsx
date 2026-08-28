'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface ExportItem {
  id: string;
  projectId: string;
  format: string;
  sizeBytes?: number;
  manifest?: { title?: string; duration?: { formatted?: string }; turnCount?: number };
  includesAi: boolean;
  createdAt: string;
}

export default function ExportsPage() {
  const [exports, setExports] = useState<ExportItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/exports')
      .then((r) => r.json())
      .then(setExports)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function downloadExport(projectId: string) {
    const res = await fetch(`/api/projects/${projectId}/export`, { method: 'POST' });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `podcast_export.zip`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <div className="grid gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-4 flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-44" />
                  <Skeleton className="h-4 w-64" />
                </div>
                <Skeleton className="h-9 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Export Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">Download your podcast packages (audio, transcript, show notes, chapters)</p>
      </div>

      {exports.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <span aria-hidden="true" className="mb-2 block text-3xl">📦</span>
            <p className="font-medium text-foreground">No exports yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Generate audio and export from a project page.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {exports.map((exp) => (
            <Card key={exp.id} className="card-lift">
              <CardContent className="py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium">{exp.manifest?.title || 'Untitled'}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Badge variant="outline">{exp.format.toUpperCase()}</Badge>
                    {exp.manifest?.duration?.formatted && <Badge variant="secondary">{exp.manifest.duration.formatted}</Badge>}
                    {exp.manifest?.turnCount && <Badge variant="secondary">{exp.manifest.turnCount} turns</Badge>}
                    {exp.sizeBytes && <Badge variant="outline">{(exp.sizeBytes / 1024).toFixed(0)} KB</Badge>}
                    {exp.includesAi && <Badge variant="warning">AI Disclosure</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(exp.createdAt).toLocaleString()}</p>
                </div>
                <Button variant="outline" className="shrink-0" onClick={() => downloadExport(exp.projectId)}>Download</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}