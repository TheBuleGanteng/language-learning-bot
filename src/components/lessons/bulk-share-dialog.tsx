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
  lessonIds: string[];
  onDone: () => void;
}

export function LessonsBulkShareDialog({ open, onOpenChange, lessonIds, onDone }: Props) {
  const [visibility, setVisibility] = useState<'shared' | 'private'>('shared');
  const [cascade, setCascade] = useState(true);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch(withBase('/api/lessons/bulk-visibility'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: lessonIds, visibility, cascade }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'Failed to update');
      const skipped = d.skipped > 0 ? ` ${d.skipped} lessons skipped (not your content).` : '';
      toast.success(
        `Updated ${d.updated} lessons. Affected ${d.affectedVocabCount ?? 0} vocab items.${skipped}`,
      );
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share / Unshare lessons</DialogTitle>
          <DialogDescription>
            Choose an action and how far it should cascade into lesson contents.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1 text-sm">
          <fieldset className="space-y-2">
            <legend className="font-medium">Action</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="lesson-visibility"
                checked={visibility === 'shared'}
                onChange={() => setVisibility('shared')}
              />
              Share selected lessons
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="lesson-visibility"
                checked={visibility === 'private'}
                onChange={() => setVisibility('private')}
              />
              Unshare selected lessons
            </label>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="font-medium">Cascade</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="lesson-cascade"
                checked={cascade}
                onChange={() => setCascade(true)}
              />
              Include all contents (vocab items and their images)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="lesson-cascade"
                checked={!cascade}
                onChange={() => setCascade(false)}
              />
              Lesson structure only (do not change vocab visibility)
            </label>
            <p className="text-xs text-muted-foreground">
              Tags are never unshared automatically.
            </p>
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={busy || lessonIds.length === 0}>
            {busy ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
