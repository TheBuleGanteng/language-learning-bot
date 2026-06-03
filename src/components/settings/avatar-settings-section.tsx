'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { withBase } from '@/lib/base-path';

type Role = 'regular' | 'admin' | 'superuser';

const DEFAULT_TIMEOUT_SECONDS = 120;
const MIN_SECONDS = 30;
const MAX_SECONDS = 1800;
const STEP_SECONDS = 30;

// 30s, 60s, … 1800s in 30s steps — stored/transmitted as seconds.
const OPTIONS: number[] = [];
for (let s = MIN_SECONDS; s <= MAX_SECONDS; s += STEP_SECONDS) OPTIONS.push(s);

// Human-readable duration: 30 → "30 sec.", 60 → "1 min.", 90 → "1 min. 30 sec.".
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  const parts: string[] = [];
  if (mins > 0) parts.push(`${mins} min.`);
  if (rem > 0) parts.push(`${rem} sec.`);
  return parts.length > 0 ? parts.join(' ') : '0 sec.';
}

/**
 * Superuser-only "Avatar session settings" section. Self-fetches the caller's
 * role (so the section can hide itself for non-superusers, mirroring
 * RoleManagementSection) and the current global timeout value. The value is
 * shown in minutes but stored/transmitted in seconds.
 */
export function AvatarSettingsSection() {
  const [role, setRole] = useState<Role | null>(null);
  const [seconds, setSeconds] = useState<number>(DEFAULT_TIMEOUT_SECONDS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(withBase('/api/me'))
      .then((r) => r.json())
      .then((d) => setRole(d.role as Role))
      .catch(() => {});
  }, []);

  const isSuperuser = role === 'superuser';

  useEffect(() => {
    if (!isSuperuser) return;
    fetch(withBase('/api/settings/avatar'))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const v = Number(d.avatarInactivityTimeoutSeconds) || DEFAULT_TIMEOUT_SECONDS;
        setSeconds(v);
      })
      .catch(() => {});
  }, [isSuperuser]);

  if (!isSuperuser) return null;

  // Auto-save on change: optimistically update, PATCH, revert + toast on error.
  async function onChange(next: number) {
    if (next === seconds) return;
    const prev = seconds;
    setSeconds(next);
    setSaving(true);
    try {
      const res = await fetch(withBase('/api/settings/avatar'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarInactivityTimeoutSeconds: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? 'Save failed');
      toast.success('Inactivity timeout saved');
    } catch (e) {
      setSeconds(prev);
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card id="avatar-settings">
      <CardHeader>
        <CardTitle>Avatar session settings</CardTitle>
        <CardDescription>
          Global settings for Kruu Bingo practice sessions. Applies to all users.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5 max-w-xs">
          <Label htmlFor="avatar-inactivity-timeout">Inactivity timeout</Label>
          <Select
            value={String(seconds)}
            onValueChange={(v) => v && onChange(Number(v))}
            disabled={saving}
          >
            <SelectTrigger id="avatar-inactivity-timeout">
              <SelectValue>{(value: string) => formatDuration(Number(value))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {OPTIONS.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {formatDuration(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            How long Kruu Bingo waits for user input before warning the user.
            Applies to all users.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
