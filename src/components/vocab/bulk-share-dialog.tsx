'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { withBase } from '@/lib/base-path';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vocabIds: string[];
  /** Called after a successful update so the caller can refresh the list. */
  onDone: () => void;
}

export function VocabBulkShareDialog({ open, onOpenChange, vocabIds, onDone }: Props) {
  const [visibility, setVisibility] = useState<'shared' | 'private'>('shared');
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch(withBase('/api/vocab/bulk-visibility'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: vocabIds, visibility }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'Failed to update');
      const msg =
        d.skipped > 0
          ? `Updated ${d.updated} items. ${d.skipped} items skipped (not your content).`
          : `Updated ${d.updated} items.`;
      toast.success(msg);
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {visibility === 'shared' ? 'Share selected items?' : 'Unshare selected items?'}
          </DialogTitle>
          <DialogDescription>
            Items you didn&apos;t create are skipped automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="vocab-visibility"
              checked={visibility === 'shared'}
              onChange={() => setVisibility('shared')}
            />
            Share selected
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="vocab-visibility"
              checked={visibility === 'private'}
              onChange={() => setVisibility('private')}
            />
            Unshare selected
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={busy || vocabIds.length === 0}>
            {busy ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
