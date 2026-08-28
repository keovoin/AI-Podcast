'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface UsageData {
  providers: Array<{
    id: string;
    name: string;
    category: string;
    totalRequests: number;
    failedRequests: number;
    successRate: number;
    avgLatencyMs: number;
    costPerRequest?: number;
    estimatedSpend: number;
    monthlyBudget?: number;
  }>;
  totals: {
    totalRequests: number;
    totalSpend: number;
    avgLatency: number;
  };
  recentAudit: Array<{
    id: string;
    action: string;
    resource: string;
    createdAt: string;
    metadata?: Record<string, unknown>;
  }>;
}

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/usage')
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-6 text-center">
                <Skeleton className="mx-auto h-8 w-20" />
                <Skeleton className="mx-auto mt-2 h-4 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!data) return <div className="space-y-6"><p className="text-muted-foreground">Failed to load usage data.</p></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Usage & Cost</h1>
        <p className="mt-1 text-sm text-muted-foreground mb-6">Track provider usage, latency, and estimated costs</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="card-lift">
          <CardContent className="py-6 text-center">
            <p className="text-3xl font-bold tabular-nums">{data.totals.totalRequests}</p>
            <p className="text-sm text-muted-foreground">Total Requests</p>
          </CardContent>
        </Card>
        <Card className="card-lift">
          <CardContent className="py-6 text-center">
            <p className="text-3xl font-bold tabular-nums">${data.totals.totalSpend.toFixed(4)}</p>
            <p className="text-sm text-muted-foreground">Estimated Spend</p>
          </CardContent>
        </Card>
        <Card className="card-lift">
          <CardContent className="py-6 text-center">
            <p className="text-3xl font-bold tabular-nums">{Math.round(data.totals.avgLatency)}ms</p>
            <p className="text-sm text-muted-foreground">Avg Latency</p>
          </CardContent>
        </Card>
      </div>

      {/* Provider breakdown */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Provider Usage</CardTitle>
          <CardDescription>Per-provider statistics and cost tracking</CardDescription>
        </CardHeader>
        <CardContent>
          {data.providers.length === 0 ? (
            <p className="text-muted-foreground text-sm">No provider usage recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {data.providers.map((p) => (
                <div key={p.id} className="p-4 border rounded-lg flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{p.name}</span>
                      <Badge variant="outline">{p.category}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                      <span>{p.totalRequests} requests</span>
                      <span>{p.failedRequests} failed</span>
                      <span>Avg: {Math.round(p.avgLatencyMs)}ms</span>
                      <span>Success: {(p.successRate * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <p className="font-medium tabular-nums">${p.estimatedSpend.toFixed(4)}</p>
                    {p.monthlyBudget && (
                      <p className="text-xs text-muted-foreground">
                        Budget: ${p.monthlyBudget} ({((p.estimatedSpend / p.monthlyBudget) * 100).toFixed(0)}% used)
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit log */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentAudit.length === 0 ? (
            <p className="text-muted-foreground text-sm">No activity yet.</p>
          ) : (
            <div className="space-y-2">
              {data.recentAudit.map((log) => (
                <div key={log.id} className="flex items-center justify-between py-1 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{log.action}</Badge>
                    <span className="text-sm">{log.resource}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}