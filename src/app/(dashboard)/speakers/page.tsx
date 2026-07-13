'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Speaker {
  id: string;
  name: string;
  role?: string;
  personality?: string;
  voiceId?: string;
  formality: number;
  energy: number;
  humor: number;
  assertiveness: number;
}

export default function SpeakersPage() {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', role: '', personality: '', voiceId: 'mock-km-male-1',
    formality: 50, energy: 50, humor: 30, assertiveness: 50,
  });

  useEffect(() => { fetchSpeakers(); }, []);

  async function fetchSpeakers() {
    try {
      const res = await fetch('/api/speakers');
      if (res.ok) setSpeakers(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleSave() {
    const url = editId ? `/api/speakers/${editId}` : '/api/speakers';
    const method = editId ? 'PATCH' : 'POST';
    await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setShowForm(false); setEditId(null);
    setForm({ name: '', role: '', personality: '', voiceId: 'mock-km-male-1', formality: 50, energy: 50, humor: 30, assertiveness: 50 });
    fetchSpeakers();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this speaker?')) return;
    await fetch(`/api/speakers/${id}`, { method: 'DELETE' });
    fetchSpeakers();
  }

  function startEdit(s: Speaker) {
    setForm({ name: s.name, role: s.role || '', personality: s.personality || '', voiceId: s.voiceId || '', formality: s.formality, energy: s.energy, humor: s.humor, assertiveness: s.assertiveness });
    setEditId(s.id); setShowForm(true);
  }

  if (loading) return <div className="container py-10"><p className="text-muted-foreground">Loading...</p></div>;

  return (
    <div className="container py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Speaker Library</h1>
          <p className="text-muted-foreground mt-1">Reusable speaker profiles</p>
        </div>
        <Button onClick={() => { setShowForm(true); setEditId(null); }}>Add Speaker</Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader><CardTitle>{editId ? 'Edit' : 'New'} Speaker</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Role</Label><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Host / Guest" /></div>
              <div className="space-y-1"><Label>Personality</Label><Input value={form.personality} onChange={(e) => setForm({ ...form, personality: e.target.value })} placeholder="Curious, friendly..." /></div>
              <div className="space-y-1">
                <Label>Voice</Label>
                <select value={form.voiceId} onChange={(e) => setForm({ ...form, voiceId: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="mock-km-male-1">Piseth (Khmer Male)</option>
                  <option value="mock-km-female-1">Sreymom (Khmer Female)</option>
                  <option value="mock-en-male-1">James (English Male)</option>
                  <option value="mock-en-female-1">Sarah (English Female)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div><Label>Formality: {form.formality}</Label><input type="range" min="0" max="100" value={form.formality} onChange={(e) => setForm({ ...form, formality: +e.target.value })} className="w-full" /></div>
              <div><Label>Energy: {form.energy}</Label><input type="range" min="0" max="100" value={form.energy} onChange={(e) => setForm({ ...form, energy: +e.target.value })} className="w-full" /></div>
              <div><Label>Humor: {form.humor}</Label><input type="range" min="0" max="100" value={form.humor} onChange={(e) => setForm({ ...form, humor: +e.target.value })} className="w-full" /></div>
              <div><Label>Assertiveness: {form.assertiveness}</Label><input type="range" min="0" max="100" value={form.assertiveness} onChange={(e) => setForm({ ...form, assertiveness: +e.target.value })} className="w-full" /></div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={!form.name.trim()}>Save</Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {speakers.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No speakers yet.</CardContent></Card>
        ) : speakers.map((s) => (
          <Card key={s.id}>
            <CardContent className="py-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-sm text-muted-foreground">{s.role || 'Speaker'} &middot; {s.personality || 'No personality set'} &middot; Voice: {s.voiceId || 'default'}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => startEdit(s)}>Edit</Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(s.id)}>Delete</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
