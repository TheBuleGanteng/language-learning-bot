'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PhotoUploader } from './photo-uploader';
import { ExtractedVocabReview } from './extracted-vocab-review';
import type { ExtractedRow } from '@/lib/extraction';
import { withBase } from '@/lib/base-path';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set (lesson page entry), every extracted row pre-fills this lesson. */
  defaultLessonId?: string;
  /** Called once new rows are saved so the caller can refresh its view. */
  onSaved?: () => void;
}

/**
 * Two-phase modal: capture/upload + optional crop staging (PhotoUploader),
 * then review + commit. The two phases swap in place; cancelling the review
 * goes back to the staging queue so the user can re-extract.
 */
export function ExtractionFlow({
  open,
  onOpenChange,
  defaultLessonId,
  onSaved,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<ExtractedRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset state every time the modal opens so a fresh session always starts on
  // the staging step, not on stale review data from a previous attempt.
  useEffect(() => {
    if (open) {
      setRows(null);
      setBusy(false);
    }
  }, [open]);

  /**
   * Extract a single image through the existing extraction endpoint (one image
   * per request). Throws on failure so the uploader can isolate that photo and
   * keep processing the rest of the batch.
   */
  const extractImage = useCallback(async (blob: Blob): Promise<ExtractedRow[]> => {
    const fd = new FormData();
    fd.append('images', new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
    const res = await fetch(withBase('/api/vocab/extract-from-photos'), {
      method: 'POST',
      body: fd,
    });
    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      rows?: ExtractedRow[];
      error?: string;
    };
    if (!res.ok || data.status !== 'success') {
      throw new Error(data.error ?? 'Extraction failed');
    }
    return data.rows ?? [];
  }, []);

  function onReview(extracted: ExtractedRow[]) {
    setRows(extracted);
  }

  function onSaved_({ inserted, mergedExisting }: { inserted: number; mergedExisting: number }) {
    toast.success(
      `Saved ${inserted} new vocab item${inserted === 1 ? '' : 's'}${
        mergedExisting > 0 ? ` (${mergedExisting} merged with existing)` : ''
      }`,
    );
    onOpenChange(false);
    setRows(null);
    onSaved?.();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        {rows === null ? (
          <>
            <DialogHeader>
              <DialogTitle>Extract vocabulary from photos</DialogTitle>
              <DialogDescription>
                Take or upload one or more photos of a vocabulary list. We&apos;ll
                extract the Thai + English pairs for you to review.
              </DialogDescription>
            </DialogHeader>
            <PhotoUploader
              extractImage={extractImage}
              onReview={onReview}
              onBusyChange={setBusy}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Review extracted vocabulary</DialogTitle>
              <DialogDescription>
                Edit any cells that need correcting, apply tags / lessons, then save.
              </DialogDescription>
            </DialogHeader>
            <ExtractedVocabReview
              initial={rows}
              defaultLessonId={defaultLessonId}
              onSaved={onSaved_}
              onCancel={() => setRows(null)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
