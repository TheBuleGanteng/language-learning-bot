'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, X } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { withBase } from '@/lib/base-path';

const NAME_RE = /^[A-Za-z0-9 _-]{2,50}$/;

export function ProfileSection() {
  const [saved, setSaved] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [value, setValue] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(withBase('/api/me'))
      .then((r) => r.json())
      .then((d) => {
        setSaved(d.displayName ?? null);
        setValue(d.displayName ?? '');
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const trimmed = value.trim();
  const valid = NAME_RE.test(trimmed);
  const unchanged = trimmed === (saved ?? '').trim();

  // Debounced availability check — skipped when invalid or unchanged.
  useEffect(() => {
    if (!loaded) return;
    if (!valid || unchanged) {
      setAvailable(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          withBase(`/api/users/display-name/check?name=${encodeURIComponent(trimmed)}`),
        );
        const d = await res.json();
        setAvailable(!!d.available);
      } catch {
        setAvailable(null);
      } finally {
        setChecking(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [trimmed, valid, unchanged, loaded]);

  const canSave = valid && !unchanged && available === true && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch(withBase('/api/users/me/display-name'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: trimmed }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'Failed to save');
      setSaved(d.displayName ?? trimmed);
      setValue(d.displayName ?? trimmed);
      setAvailable(null);
      toast.success('Display name saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save display name');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {loaded && !saved && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200">
          Set a display name before sharing content.
        </div>
      )}
      <Card id="display-name">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your display name is shown on content you share.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5 max-w-sm">
            <Label htmlFor="display-name-input">Display name</Label>
            <div className="relative">
              <Input
                id="display-name-input"
                value={value}
                maxLength={50}
                placeholder="Choose a display name"
                onChange={(e) => setValue(e.target.value)}
                className="pr-8"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2">
                {checking ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : available === true ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : available === false ? (
                  <X className="h-4 w-4 text-red-600" />
                ) : null}
              </span>
            </div>
            {trimmed && !valid && (
              <p className="text-xs text-red-600">
                2–50 characters: letters, numbers, spaces, underscores, hyphens.
              </p>
            )}
            {available === false && <p className="text-xs text-red-600">Name taken</p>}
          </div>
          <Button onClick={save} disabled={!canSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
