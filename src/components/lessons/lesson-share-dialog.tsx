'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { withBase } from '@/lib/base-path';

// The material categories on a lesson: vocab, notes (pdf), images, audio, links.
const CATEGORIES = ['vocabulary', 'notes', 'images', 'audio', 'links'] as const;
type Category = (typeof CATEGORIES)[number];
type Flags = Record<Category, boolean>;

interface CategoryCount {
  total: number;
  shared: number;
}
interface ShareState {
  lessonVisibility: 'shared' | 'private';
  categories: Record<Category, CategoryCount>;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lessonId: string;
  /** Called after a successful save so the caller can refresh its indicator. */
  onSaved?: () => void;
}

export function LessonShareDialog({ open, onOpenChange, lessonId, onSaved }: Props) {
  const t = useTranslations('lessonShare');
  const tc = useTranslations('common');
  const [state, setState] = useState<ShareState | null>(null);
  const [flags, setFlags] = useState<Flags>({
    vocabulary: true,
    notes: true,
    images: true,
    audio: true,
    links: true,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(withBase(`/api/lessons/${lessonId}/share`));
        if (!res.ok) throw new Error();
        const data: ShareState = await res.json();
        if (cancelled) return;
        setState(data);
        // Private (not yet shared) → default all ticked. Already shared → reflect
        // current state (empty categories default ticked so re-saving keeps them).
        const allTicked = data.lessonVisibility === 'private';
        const next = {} as Flags;
        for (const c of CATEGORIES) {
          const { total, shared } = data.categories[c];
          next[c] = allTicked ? true : total === 0 ? true : shared >= total;
        }
        setFlags(next);
      } catch {
        if (!cancelled) toast.error(t('loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, lessonId, t]);

  const allChecked = CATEGORIES.every((c) => flags[c]);
  const someChecked = CATEGORIES.some((c) => flags[c]);

  function toggleAll(next: boolean) {
    setFlags({ vocabulary: next, notes: next, images: next, audio: next, links: next });
  }

  function categoryStatus(c: Category): 'shared' | 'partial' | 'private' | 'none' {
    const cc = state?.categories[c];
    if (!cc || cc.total === 0) return 'none';
    if (cc.shared >= cc.total) return 'shared';
    if (cc.shared === 0) return 'private';
    return 'partial';
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(withBase(`/api/lessons/${lessonId}/share`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flags),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? t('saveFailed'));
      }
      toast.success(t('saved'));
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('desc')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-4 text-sm text-muted-foreground">{tc('loading')}</p>
        ) : (
          <div className="space-y-1 py-1">
            {/* All — toggles every category; indeterminate when mixed. */}
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 font-medium hover:bg-muted">
              <Checkbox
                checked={allChecked}
                indeterminate={someChecked && !allChecked}
                onCheckedChange={(c) => toggleAll(c === true)}
              />
              <span>{t('all')}</span>
            </label>
            {CATEGORIES.map((c) => {
              const status = categoryStatus(c);
              return (
                <label
                  key={c}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 pl-6 hover:bg-muted"
                >
                  <Checkbox
                    checked={flags[c]}
                    onCheckedChange={(v) => setFlags((p) => ({ ...p, [c]: v === true }))}
                  />
                  <span className="flex-1">{t(c)}</span>
                  <span
                    className={cn(
                      'text-xs',
                      status === 'shared'
                        ? 'text-green-600 dark:text-green-500'
                        : status === 'partial'
                          ? 'text-amber-600 dark:text-amber-500'
                          : 'text-muted-foreground',
                    )}
                  >
                    {status === 'none' ? '—' : t(`status_${status}`)}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {tc('cancel')}
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
