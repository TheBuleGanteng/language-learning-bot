'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Globe, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { withBase } from '@/lib/base-path';

interface Props {
  vocabId: string;
  initialVisibility: 'private' | 'shared';
}

/** Per-item Shared/Private toggle shown on the vocab detail page (§4d). */
export function VisibilityToggle({ vocabId, initialVisibility }: Props) {
  const [visibility, setVisibility] = useState(initialVisibility);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = visibility === 'shared' ? 'private' : 'shared';
    setBusy(true);
    try {
      const res = await fetch(withBase(`/api/vocab/${vocabId}/visibility`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'Failed to update visibility');
      setVisibility(next);
      toast.success(next === 'shared' ? 'Item shared' : 'Item made private');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update visibility');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium">Visibility</span>
      <Button variant="outline" size="sm" onClick={toggle} disabled={busy} className="gap-1.5">
        {visibility === 'shared' ? (
          <>
            <Globe className="h-4 w-4" /> Shared
          </>
        ) : (
          <>
            <Lock className="h-4 w-4" /> Private
          </>
        )}
      </Button>
    </div>
  );
}
