'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
import { Checkbox } from '@/components/ui/checkbox';
import { withBase } from '@/lib/base-path';

// Part 5.1 — the bulk version of the single-lesson granular share dialog. The
// same per-element tickboxes (Vocabulary / Notes / Images / Audio / Links /
// DLS audio / Quizlet / DLS exercises), all ticked by default. On confirm the
// chosen config is applied to every selected lesson the user created.
const CATEGORIES = [
  'vocabulary',
  'notes',
  'images',
  'audio',
  'links',
  'dls_audio',
  'quizlet',
  'dls_exercises',
] as const;
type Category = (typeof CATEGORIES)[number];
type Flags = Record<Category, boolean>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessonIds: string[];
  onDone: () => void;
}

export function LessonsBulkShareDialog({ open, onOpenChange, lessonIds, onDone }: Props) {
  const t = useTranslations('lessonShare');
  const tc = useTranslations('common');
  // All elements ticked by default (Part 5.1).
  const [flags, setFlags] = useState<Flags>(
    () => Object.fromEntries(CATEGORIES.map((c) => [c, true])) as Flags,
  );
  const [busy, setBusy] = useState(false);

  const allChecked = CATEGORIES.every((c) => flags[c]);
  const someChecked = CATEGORIES.some((c) => flags[c]);

  function toggleAll(next: boolean) {
    setFlags(Object.fromEntries(CATEGORIES.map((c) => [c, next])) as Flags);
  }

  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch(withBase('/api/lessons/bulk-share'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonIds, shareConfig: flags }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'Failed to update');
      const skipped =
        d.skipped > 0 ? ` ${d.skipped} skipped (not your content).` : '';
      toast.success(`Updated ${d.updated} lesson${d.updated === 1 ? '' : 's'}.${skipped}`);
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share / Unshare lessons</DialogTitle>
          <DialogDescription>
            Choose which materials to share across the selected lessons. Only lessons you created are
            affected; others are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 py-1">
          <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 font-medium hover:bg-muted">
            <Checkbox
              checked={allChecked}
              indeterminate={someChecked && !allChecked}
              onCheckedChange={(c) => toggleAll(c === true)}
            />
            <span>{t('all')}</span>
          </label>
          {CATEGORIES.map((c) => (
            <label
              key={c}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 pl-6 hover:bg-muted"
            >
              <Checkbox
                checked={flags[c]}
                onCheckedChange={(v) => setFlags((p) => ({ ...p, [c]: v === true }))}
              />
              <span className="flex-1">{t(c)}</span>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {tc('cancel')}
          </Button>
          <Button onClick={confirm} disabled={busy || lessonIds.length === 0}>
            {busy ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
