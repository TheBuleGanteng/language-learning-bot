'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { PhotoUploader } from './photo-uploader';
import { ExtractedVocabReview } from './extracted-vocab-review';
import type { ExtractedRow } from '@/lib/extraction';
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
 * Two-phase modal: upload + optional crop, then review + commit. The two
 * phases swap in place; cancelling the review goes back to upload so the
 * user can re-extract with different cropping.
 */
export function ExtractionFlow({
  open,
  onOpenChange,
  defaultLessonId,
  onSaved,
}: Props) {
  const router = useRouter();
  const [extracting, setExtracting] = useState(false);
  const [rows, setRows] = useState<ExtractedRow[] | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    function check() {
      setIsNarrow(window.matchMedia('(max-width: 767px)').matches);
    }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Reset state every time the modal opens so a fresh session always starts
  // on the upload step, not on stale review data from a previous attempt.
  useEffect(() => {
    if (open) {
      setExtracting(false);
      setRows(null);
    }
  }, [open]);

  async function onExtract(
    photos: { blob: Blob; mimeType: string; filename: string }[],
  ) {
    setExtracting(true);
    try {
      const fd = new FormData();
      for (const p of photos) {
        fd.append(
          'images',
          new File([p.blob], p.filename, { type: p.mimeType }),
        );
      }
      const res = await fetch('/api/vocab/extract-from-photos', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? 'Extraction failed');
        return;
      }
      const extracted = (data?.rows ?? []) as ExtractedRow[];
      if (extracted.length === 0) {
        toast.message('No vocabulary extracted from the photos.');
      }
      setRows(extracted);
    } finally {
      setExtracting(false);
    }
  }

  function onSaved_({ inserted, mergedExisting }: { inserted: number; mergedExisting: number }) {
    toast.success(
      `Saved ${inserted} new vocab item${inserted === 1 ? '' : 's'}${
        mergedExisting > 0
          ? ` (${mergedExisting} merged with existing)`
          : ''
      }`,
    );
    onOpenChange(false);
    setRows(null);
    onSaved?.();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !extracting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        {isNarrow ? (
          <>
            <DialogHeader>
              <DialogTitle>Photo extraction unavailable on mobile</DialogTitle>
              <DialogDescription>
                Photo extraction works best on a larger screen. Please use a tablet
                or desktop browser to extract vocabulary from photos.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        ) : rows === null ? (
          <>
            <DialogHeader>
              <DialogTitle>Extract vocabulary from photos</DialogTitle>
              <DialogDescription>
                Upload one or more photos of a vocabulary list. We&apos;ll extract the
                Thai + English pairs for you to review.
              </DialogDescription>
            </DialogHeader>
            {extracting && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-md p-3 bg-muted/30">
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting — this may take 10–30 seconds…
              </div>
            )}
            <PhotoUploader onExtract={onExtract} busy={extracting} />
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
