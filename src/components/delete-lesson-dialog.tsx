'use client';

import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { DeletionSummary } from '@/lib/lesson-deletion';
import { withBase } from '@/lib/base-path';

interface DeleteLessonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessonId: string;
  /** Display name used until the preview (authoritative) loads. */
  lessonName?: string;
  /** Called after a successful delete with the deletion summary. */
  onDeleted: (summary: DeletionSummary) => void;
}

export function DeleteLessonDialog({
  open, onOpenChange, lessonId, lessonName, onDeleted,
}: DeleteLessonDialogProps) {
  const t = useTranslations('lessonDelete');
  const tc = useTranslations('common');
  const [preview, setPreview] = useState<DeletionSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Fetch the deletion preview each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreview(null);
    setLoadError(null);
    setDeleteError(null);
    setDeleting(false);
    fetch(withBase(`/api/lessons/${lessonId}/deletion-preview`))
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? t('loadFailed'));
        }
        return res.json() as Promise<DeletionSummary>;
      })
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : t('loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [open, lessonId, t]);

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(withBase(`/api/lessons/${lessonId}`), { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? t('deleteFailed'));
      }
      const summary = (await res.json()) as DeletionSummary;
      toast.success(t('deletedToast', { name: summary.lessonName }));
      onOpenChange(false);
      onDeleted(summary);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : t('deleteFailed'));
      setDeleting(false);
    }
  }

  const displayName = preview?.lessonName ?? lessonName ?? 'this lesson';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!deleting) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title', { name: displayName })}</DialogTitle>
          <DialogDescription>{t('reviewDesc')}</DialogDescription>
        </DialogHeader>

        <div className="py-2 text-sm">
          {loadError ? (
            <p className="text-red-600">{loadError}</p>
          ) : !preview ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tc('loading')}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="font-medium">{t('permanentlyDelete')}</p>
                <ul className="mt-1 list-disc pl-5 space-y-0.5 text-muted-foreground">
                  <li>{t('pdfs', { count: preview.pdfCount })}</li>
                  <li>{t('audio', { count: preview.audioCount })}</li>
                  <li>{t('links', { count: preview.linkCount })}</li>
                  <li>{t('vocabDeleted', { count: preview.vocabDeletedCount })}</li>
                  <li>{t('images', { count: preview.imageCount })}</li>
                </ul>
              </div>
              <div>
                <p className="font-medium">{t('andReassign')}</p>
                <ul className="mt-1 list-disc pl-5 space-y-0.5 text-muted-foreground">
                  <li>
                    {t('vocabReassigned', { count: preview.vocabReassignedCount })}
                    <br />
                    <span className="text-xs">{t('reassignNote', { name: displayName })}</span>
                  </li>
                </ul>
              </div>
              <p className="text-amber-600">{t('cannotUndo')}</p>
              {deleteError && <p className="text-red-600">{deleteError}</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            {tc('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting || !preview || !!loadError}
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {tc('deleting')}
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                {t('deleteLesson')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
