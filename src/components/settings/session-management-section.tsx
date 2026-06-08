'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InfoIcon } from '@/components/ui/info-icon';
import { withBase } from '@/lib/base-path';

// Superuser-only (the parent User-management card is already gated). Edits the
// GLOBAL session policy applied to ALL users: idle timeout + how long before the
// cutoff the "stay logged in?" popup appears. Values shown/edited in minutes.
export function SessionManagementSection() {
  const [idleMin, setIdleMin] = useState('');
  const [warnMin, setWarnMin] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(withBase('/api/session/config'))
      .then((r) => (r.ok ? r.json() : null))
      .then((c: { idleTimeoutSeconds: number; warningSeconds: number } | null) => {
        if (!c) return;
        setIdleMin(String(Math.round(c.idleTimeoutSeconds / 60)));
        setWarnMin(String(Math.round(c.warningSeconds / 60)));
        setLoaded(true);
      })
      .catch(() => {});
  }, []);

  async function save() {
    const idle = Number(idleMin);
    const warn = Number(warnMin);
    if (!Number.isFinite(idle) || idle < 1) {
      toast.error('Idle timeout must be at least 1 minute');
      return;
    }
    if (!Number.isFinite(warn) || warn < 1) {
      toast.error('Warning lead time must be at least 1 minute');
      return;
    }
    if (warn >= idle) {
      toast.error('Warning lead time must be shorter than the idle timeout');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(withBase('/api/session/config'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idleTimeoutSeconds: Math.round(idle * 60),
          warningSeconds: Math.round(warn * 60),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'Save failed');
      toast.success('Session settings saved for all users');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Applies to all users. Idle sessions are signed out automatically; a warning popup lets
        users stay logged in before that happens.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="session-idle">Idle timeout (minutes)</Label>
            <InfoIcon label="About the idle timeout">
              How long a session can sit with no user activity before it is signed out.
            </InfoIcon>
          </div>
          <Input
            id="session-idle"
            type="number"
            min="1"
            step="1"
            value={idleMin}
            onChange={(e) => setIdleMin(e.target.value)}
            disabled={!loaded || busy}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="session-warning">Warning lead time (minutes)</Label>
            <InfoIcon label="About the warning lead time">
              How long before the cutoff the &quot;your session will expire&quot; popup appears.
              Must be shorter than the idle timeout.
            </InfoIcon>
          </div>
          <Input
            id="session-warning"
            type="number"
            min="1"
            step="1"
            value={warnMin}
            onChange={(e) => setWarnMin(e.target.value)}
            disabled={!loaded || busy}
          />
        </div>
      </div>
      <Button size="sm" onClick={save} disabled={!loaded || busy}>
        {busy ? 'Saving…' : 'Save session settings'}
      </Button>
    </div>
  );
}
