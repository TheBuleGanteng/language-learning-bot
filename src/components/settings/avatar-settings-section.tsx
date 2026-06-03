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
import { Button } from '@/components/ui/button';
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

// 0.5, 1, 1.5, … 30 minutes — stored/transmitted as seconds.
const OPTIONS: number[] = [];
for (let s = MIN_SECONDS; s <= MAX_SECONDS; s += STEP_SECONDS) OPTIONS.push(s);

function minutesLabel(seconds: number): string {
  const mins = seconds / 60;
  return `${mins} min`;
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
  const [draft, setDraft] = useState<number>(DEFAULT_TIMEOUT_SECONDS);
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
        setDraft(v);
      })
      .catch(() => {});
  }, [isSuperuser]);

  if (!isSuperuser) return null;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(withBase('/api/settings/avatar'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarInactivityTimeoutSeconds: draft }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? 'Save failed');
      setSeconds(draft);
      toast.success('Avatar session settings saved');
    } catch (e) {
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
            value={String(draft)}
            onValueChange={(v) => v && setDraft(Number(v))}
          >
            <SelectTrigger id="avatar-inactivity-timeout">
              <SelectValue>{(value: string) => minutesLabel(Number(value))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {OPTIONS.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {minutesLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            How long Kruu Bingo waits for user input before warning the user.
            Applies to all users.
          </p>
        </div>
        <Button onClick={save} disabled={saving || draft === seconds}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  );
}
