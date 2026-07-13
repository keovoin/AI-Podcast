'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

  if (loading) return <div className="container py-10"><p className="text-muted-foreground">Loading...</p></div>;

  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold mb-2">Export Center</h1>
      <p className="text-muted-foreground mb-8">Download your podcast packages (audio, transcript, show notes, chapters)</p>

      {exports.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">No exports yet. Generate audio and export from a project page.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {exports.map((exp) => (
            <Card key={exp.id}>
              <CardContent className="py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{exp.manifest?.title || 'Untitled'}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline">{exp.format.toUpperCase()}</Badge>
                    {exp.manifest?.duration?.formatted && <Badge variant="secondary">{exp.manifest.duration.formatted}</Badge>}
                    {exp.manifest?.turnCount && <Badge variant="secondary">{exp.manifest.turnCount} turns</Badge>}
                    {exp.sizeBytes && <Badge variant="outline">{(exp.sizeBytes / 1024).toFixed(0)} KB</Badge>}
                    {exp.includesAi && <Badge variant="warning">AI Disclosure</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(exp.createdAt).toLocaleString()}</p>
                </div>
                <Button variant="outline" onClick={() => downloadExport(exp.projectId)}>Download</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
