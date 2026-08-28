'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ProviderForm } from '@/components/providers/provider-form';
import { RoutingExplanation } from '@/components/routing/routing-explanation';
import { Dialog } from '@/components/ui/dialog';

interface Provider {
  id: string;
  name: string;
  category: string;
  adapterType: string;
  enabled: boolean;
  model?: string;
  hasApiKey: boolean;
  health?: {
    status: string;
    lastLatencyMs?: number;
    successRate?: number;
  };
  hasBenchmark: boolean;
  benchmarkScore?: number;
  benchmarkApproved?: boolean;
  createdAt: string;
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null);

  useEffect(() => {
    fetchProviders();
  }, []);

  async function fetchProviders() {
    try {
      const res = await fetch('/api/providers');
      if (res.ok) {
        const data = await res.json();
        setProviders(Array.isArray(data) ? data : []);
      } else {
        const errData = await res.json().catch(() => ({}));
        setFetchError(errData.error || `Failed to load providers (${res.status})`);
        setProviders([]);
      }
    } catch (error) {
      console.error('Failed to fetch providers:', error);
      setFetchError('Cannot connect to API. Make sure the database is set up.');
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }

  async function testConnection(id: string) {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/providers/${id}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult(data);
      // Refresh provider list to update health badge
      await fetchProviders();
    } catch (error) {
      setTestResult({ error: 'Test failed', details: String(error) });
    } finally {
      setTestingId(null);
    }
  }

  async function toggleProvider(id: string, enabled: boolean) {
    try {
      await fetch(`/api/providers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      });
      await fetchProviders();
    } catch (error) {
      console.error('Failed to toggle provider:', error);
    }
  }

  async function deleteProvider(id: string) {
    try {
      await fetch(`/api/providers/${id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await fetchProviders();
    } catch (error) {
      console.error('Failed to delete provider:', error);
      setDeleteTarget(null);
    }
  }

  function getStatusBadge(health?: { status: string }) {
    if (!health) return <Badge variant="outline">Unknown</Badge>;
    switch (health.status) {
      case 'HEALTHY':
        return <Badge variant="success">Healthy</Badge>;
      case 'DEGRADED':
        return <Badge variant="warning">Degraded</Badge>;
      case 'UNHEALTHY':
        return <Badge variant="destructive">Unhealthy</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  }

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-2 h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-56" />
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-9 w-16" />
                    <Skeleton className="h-9 w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Provider Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure LLM and TTS providers for podcast generation
          </p>
        </div>
        <Button onClick={() => { setShowForm(true); setEditingId(null); }}>
          Add Provider
        </Button>
      </div>

      {fetchError && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <span aria-hidden="true">⚠️</span>
          <div>
            <p className="font-medium">Database Error</p>
            <p>{fetchError}</p>
            <p className="mt-2 text-xs">Make sure you ran the SQL init script in your Neon dashboard. See the README for setup instructions.</p>
          </div>
        </div>
      )}

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Provider' : 'New Provider'}</CardTitle>
            <CardDescription>
              Configure a commercial or self-hosted AI provider
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProviderForm
              providerId={editingId}
              onSuccess={() => {
                setShowForm(false);
                setEditingId(null);
                fetchProviders();
              }}
              onCancel={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Routing Explanation - only show if providers exist */}
      {providers.length > 0 && (
        <RoutingExplanation providers={providers} />
      )}

      {/* Provider List */}
      <div className="grid gap-4">
        {providers.length === 0 && !fetchError ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-muted-foreground">
                No providers configured. Click "Add Provider" to get started.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Tip: For your AI Router endpoint, use "OPENAI_COMPATIBLE" adapter type with base URL: https://airouter-kh.fly.dev/v1
              </p>
            </CardContent>
          </Card>
        ) : (
          providers.map((provider) => (
            <Card key={provider.id} className="card-lift">
              <CardContent className="py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{provider.name}</h3>
                        <Badge variant="secondary">{provider.category}</Badge>
                        <Badge variant="outline">{provider.adapterType}</Badge>
                        {getStatusBadge(provider.health)}
                        {!provider.hasBenchmark && (
                          <Badge variant="warning">Not benchmarked</Badge>
                        )}
                        {provider.benchmarkApproved && (
                          <Badge variant="success">Approved</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {provider.model && `Model: ${provider.model}`}
                        {provider.hasApiKey && ' | API Key: ****'}
                        {provider.health?.lastLatencyMs != null &&
                          ` | Latency: ${provider.health.lastLatencyMs}ms`}
                        {provider.benchmarkScore != null &&
                          ` | Score: ${provider.benchmarkScore.toFixed(1)}/5`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection(provider.id)}
                      disabled={testingId === provider.id}
                    >
                      {testingId === provider.id ? 'Testing...' : 'Test'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleProvider(provider.id, provider.enabled)}
                    >
                      {provider.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingId(provider.id);
                        setShowForm(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteTarget(provider)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {testResult && testingId === null && (
                  <div className="mt-3 p-3 rounded bg-muted text-sm overflow-auto">
                    <pre className="whitespace-pre-wrap">{JSON.stringify(testResult, null, 2)}</pre>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Confirm delete — replaces window.confirm */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete provider?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" will be permanently removed, including its secrets, health and benchmark data. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => deleteTarget && deleteProvider(deleteTarget.id)}
      />
    </div>
  );
}
