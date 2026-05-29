'use client';

import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { DeletionSummary } from '@/lib/lesson-deletion';

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
    fetch(`/api/lessons/${lessonId}/deletion-preview`)
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? 'Failed to load deletion preview');
        }
        return res.json() as Promise<DeletionSummary>;
      })
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load preview');
      });
    return () => {
      cancelled = true;
    };
  }, [open, lessonId]);

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Failed to delete lesson');
      }
      const summary = (await res.json()) as DeletionSummary;
      toast.success(
        `Lesson '${summary.lessonName}' deleted. ${summary.vocabDeletedCount} vocab ${
          summary.vocabDeletedCount === 1 ? 'item' : 'items'
        } removed, ${summary.vocabReassignedCount} vocab ${
          summary.vocabReassignedCount === 1 ? 'item' : 'items'
        } kept.`,
      );
      onOpenChange(false);
      onDeleted(summary);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete lesson');
      setDeleting(false);
    }
  }

  const displayName = preview?.lessonName ?? lessonName ?? 'this lesson';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!deleting) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{displayName}&rdquo;?</DialogTitle>
          <DialogDescription>
            Review what will be removed before confirming.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 text-sm">
          {loadError ? (
            <p className="text-red-600">{loadError}</p>
          ) : !preview ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="font-medium">This will permanently delete:</p>
                <ul className="mt-1 list-disc pl-5 space-y-0.5 text-muted-foreground">
                  <li>{preview.pdfCount} PDF {preview.pdfCount === 1 ? 'note' : 'notes'}</li>
                  <li>{preview.audioCount} audio {preview.audioCount === 1 ? 'file' : 'files'}</li>
                  <li>{preview.linkCount} useful {preview.linkCount === 1 ? 'link' : 'links'}</li>
                  <li>
                    {preview.vocabDeletedCount} vocab{' '}
                    {preview.vocabDeletedCount === 1 ? 'item' : 'items'} (only in this lesson)
                  </li>
                  <li>
                    {preview.imageCount} generated{' '}
                    {preview.imageCount === 1 ? 'image' : 'images'} (for those vocab items)
                  </li>
                </ul>
              </div>
              <div>
                <p className="font-medium">And reassign:</p>
                <ul className="mt-1 list-disc pl-5 space-y-0.5 text-muted-foreground">
                  <li>
                    {preview.vocabReassignedCount} vocab{' '}
                    {preview.vocabReassignedCount === 1 ? 'item' : 'items'} shared with other
                    lessons
                    <br />
                    <span className="text-xs">
                      (kept, but no longer associated with &ldquo;{displayName}&rdquo;)
                    </span>
                  </li>
                </ul>
              </div>
              <p className="text-amber-600">⚠ This action cannot be undone.</p>
              {deleteError && <p className="text-red-600">{deleteError}</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting || !preview || !!loadError}
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Delete lesson
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
