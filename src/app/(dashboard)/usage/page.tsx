'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

  if (loading) return <div className="container py-10"><p className="text-muted-foreground">Loading...</p></div>;
  if (!data) return <div className="container py-10"><p>Failed to load usage data.</p></div>;

  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold mb-2">Usage & Cost</h1>
      <p className="text-muted-foreground mb-8">Track provider usage, latency, and estimated costs</p>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-3xl font-bold">{data.totals.totalRequests}</p>
            <p className="text-sm text-muted-foreground">Total Requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-3xl font-bold">${data.totals.totalSpend.toFixed(4)}</p>
            <p className="text-sm text-muted-foreground">Estimated Spend</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-3xl font-bold">{Math.round(data.totals.avgLatency)}ms</p>
            <p className="text-sm text-muted-foreground">Avg Latency</p>
          </CardContent>
        </Card>
      </div>

      {/* Provider breakdown */}
      <Card className="mb-8">
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
                <div key={p.id} className="p-4 border rounded-lg flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      <Badge variant="outline">{p.category}</Badge>
                    </div>
                    <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                      <span>{p.totalRequests} requests</span>
                      <span>{p.failedRequests} failed</span>
                      <span>Avg: {Math.round(p.avgLatencyMs)}ms</span>
                      <span>Success: {(p.successRate * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">${p.estimatedSpend.toFixed(4)}</p>
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
