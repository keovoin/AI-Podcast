'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ProviderFormProps {
  providerId?: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const CATEGORIES = ['LLM', 'TTS', 'STT', 'EMBEDDING'];
const ADAPTER_TYPES = ['OPENAI_COMPATIBLE', 'CUSTOM_REST', 'GEMINI', 'AZURE_SPEECH', 'MOCK'];
const AUTH_TYPES = ['BEARER', 'API_KEY_HEADER', 'QUERY_PARAM', 'CUSTOM', 'NONE'];
const AUDIO_RESPONSE_TYPES = ['BINARY', 'BASE64_JSON', 'DOWNLOAD_URL'];

export function ProviderForm({ providerId, onSuccess, onCancel }: ProviderFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    category: 'LLM',
    adapterType: 'OPENAI_COMPATIBLE',
    baseUrl: '',
    endpointPath: '',
    apiKey: '',
    model: '',
    authType: 'BEARER',
    authHeaderName: '',
    customHeaders: '',
    timeoutMs: 30000,
    enabled: true,
    priority: 50,
    monthlyBudget: '',
    dataResidency: '',
    allowSensitive: false,
    requestTemplate: '',
    responseJsonPath: '',
    audioResponseType: '',
    voiceIds: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (providerId) {
      loadProvider(providerId);
    }
  }, [providerId]);

  async function loadProvider(id: string) {
    try {
      const res = await fetch(`/api/providers/${id}`);
      if (res.ok) {
        const data = await res.json();
        setFormData({
          name: data.name || '',
          category: data.category || 'LLM',
          adapterType: data.adapterType || 'OPENAI_COMPATIBLE',
          baseUrl: data.baseUrl || '',
          endpointPath: data.endpointPath || '',
          apiKey: '', // Never load API key from server
          model: data.model || '',
          authType: data.authType || 'BEARER',
          authHeaderName: data.authHeaderName || '',
          customHeaders: data.customHeaders ? JSON.stringify(data.customHeaders) : '',
          timeoutMs: data.timeoutMs || 30000,
          enabled: data.enabled ?? true,
          priority: data.priority ?? 50,
          monthlyBudget: data.monthlyBudget?.toString() || '',
          dataResidency: data.dataResidency || '',
          allowSensitive: data.allowSensitive ?? false,
          requestTemplate: data.requestTemplate ? JSON.stringify(data.requestTemplate, null, 2) : '',
          responseJsonPath: data.responseJsonPath || '',
          audioResponseType: data.audioResponseType || '',
          voiceIds: data.voiceIds ? data.voiceIds.join(', ') : '',
        });
      }
    } catch (e) {
      console.error('Failed to load provider:', e);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        name: formData.name,
        category: formData.category,
        adapterType: formData.adapterType,
        baseUrl: formData.baseUrl || undefined,
        endpointPath: formData.endpointPath || undefined,
        model: formData.model || undefined,
        authType: formData.authType,
        authHeaderName: formData.authHeaderName || undefined,
        timeoutMs: formData.timeoutMs,
        enabled: formData.enabled,
        priority: formData.priority,
        allowSensitive: formData.allowSensitive,
        dataResidency: formData.dataResidency || undefined,
        monthlyBudget: formData.monthlyBudget ? parseFloat(formData.monthlyBudget) : undefined,
        responseJsonPath: formData.responseJsonPath || undefined,
        audioResponseType: formData.audioResponseType || undefined,
      };

      // Only send API key if it was entered
      if (formData.apiKey) {
        payload.apiKey = formData.apiKey;
      }

      // Parse custom headers
      if (formData.customHeaders) {
        try {
          payload.customHeaders = JSON.parse(formData.customHeaders);
        } catch {
          setError('Invalid JSON in custom headers');
          setSaving(false);
          return;
        }
      }

      // Parse request template
      if (formData.requestTemplate) {
        try {
          payload.requestTemplate = JSON.parse(formData.requestTemplate);
        } catch {
          setError('Invalid JSON in request template');
          setSaving(false);
          return;
        }
      }

      // Parse voice IDs
      if (formData.voiceIds) {
        payload.voiceIds = formData.voiceIds.split(',').map((v) => v.trim()).filter(Boolean);
      }

      const url = providerId ? `/api/providers/${providerId}` : '/api/providers';
      const method = providerId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || 'Failed to save provider');
        return;
      }

      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 rounded bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Provider Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="My OpenAI Provider"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Category *</Label>
          <select
            id="category"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            disabled={!!providerId}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="adapterType">Adapter Type *</Label>
          <select
            id="adapterType"
            value={formData.adapterType}
            onChange={(e) => setFormData({ ...formData, adapterType: e.target.value })}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {ADAPTER_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="authType">Authentication Type</Label>
          <select
            id="authType"
            value={formData.authType}
            onChange={(e) => setFormData({ ...formData, authType: e.target.value })}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {AUTH_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="baseUrl">Base URL</Label>
          <Input
            id="baseUrl"
            value={formData.baseUrl}
            onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
            placeholder="https://api.openai.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="endpointPath">Endpoint Path</Label>
          <Input
            id="endpointPath"
            value={formData.endpointPath}
            onChange={(e) => setFormData({ ...formData, endpointPath: e.target.value })}
            placeholder="/v1/chat/completions"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="apiKey">
            API Key {providerId && '(leave blank to keep existing)'}
          </Label>
          <Input
            id="apiKey"
            type="password"
            value={formData.apiKey}
            onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
            placeholder="sk-..."
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          <Input
            id="model"
            value={formData.model}
            onChange={(e) => setFormData({ ...formData, model: e.target.value })}
            placeholder="gpt-4"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="authHeaderName">Auth Header Name</Label>
          <Input
            id="authHeaderName"
            value={formData.authHeaderName}
            onChange={(e) => setFormData({ ...formData, authHeaderName: e.target.value })}
            placeholder="X-API-Key"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="timeoutMs">Timeout (ms)</Label>
          <Input
            id="timeoutMs"
            type="number"
            value={formData.timeoutMs}
            onChange={(e) => setFormData({ ...formData, timeoutMs: parseInt(e.target.value) || 30000 })}
            min={1000}
            max={120000}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority">Priority (0-100)</Label>
          <Input
            id="priority"
            type="number"
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 50 })}
            min={0}
            max={100}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="monthlyBudget">Monthly Budget (USD)</Label>
          <Input
            id="monthlyBudget"
            type="number"
            value={formData.monthlyBudget}
            onChange={(e) => setFormData({ ...formData, monthlyBudget: e.target.value })}
            placeholder="100"
            step="0.01"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dataResidency">Data Residency</Label>
          <Input
            id="dataResidency"
            value={formData.dataResidency}
            onChange={(e) => setFormData({ ...formData, dataResidency: e.target.value })}
            placeholder="private, us, eu, etc."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="voiceIds">Voice IDs (comma-separated)</Label>
          <Input
            id="voiceIds"
            value={formData.voiceIds}
            onChange={(e) => setFormData({ ...formData, voiceIds: e.target.value })}
            placeholder="km-KH-PisethNeural, km-KH-SreymomNeural"
          />
        </div>

        {formData.category === 'TTS' && (
          <div className="space-y-2">
            <Label htmlFor="audioResponseType">Audio Response Type</Label>
            <select
              id="audioResponseType"
              value={formData.audioResponseType}
              onChange={(e) => setFormData({ ...formData, audioResponseType: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Auto-detect</option>
              {AUDIO_RESPONSE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="customHeaders">Custom Headers (JSON)</Label>
        <textarea
          id="customHeaders"
          value={formData.customHeaders}
          onChange={(e) => setFormData({ ...formData, customHeaders: e.target.value })}
          placeholder='{"X-Custom": "value"}'
          className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          rows={2}
        />
      </div>

      {formData.adapterType === 'CUSTOM_REST' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="requestTemplate">{'Request Template (JSON with {{variables}})'}</Label>
            <textarea
              id="requestTemplate"
              value={formData.requestTemplate}
              onChange={(e) => setFormData({ ...formData, requestTemplate: e.target.value })}
              placeholder='{"prompt": "{{prompt}}", "model": "{{model}}"}'
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="responseJsonPath">Response JSON Path</Label>
            <Input
              id="responseJsonPath"
              value={formData.responseJsonPath}
              onChange={(e) => setFormData({ ...formData, responseJsonPath: e.target.value })}
              placeholder="choices.0.message.content"
            />
          </div>
        </>
      )}

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={formData.enabled}
            onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            className="rounded"
          />
          Enabled
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={formData.allowSensitive}
            onChange={(e) => setFormData({ ...formData, allowSensitive: e.target.checked })}
            className="rounded"
          />
          Allow Sensitive Content
        </label>
      </div>

      <div className="flex gap-2 pt-4">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : providerId ? 'Update Provider' : 'Create Provider'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
