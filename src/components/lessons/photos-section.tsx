'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ImageOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FileUploader } from './file-uploader';
import { ConfirmDeleteDialog } from './confirm-delete-dialog';
import { withBase } from '@/lib/base-path';

interface Props {
  lessonId: string;
  onCountChange: (n: number) => void;
  /** Only the lesson creator may upload/delete; consumers view shared photos. */
  canEdit?: boolean;
}

interface PhotoRow {
  id: string;
  kind: string;
  filename: string;
  sizeBytes: number;
  url: string | null;
  createdAt: string;
}

const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export function PhotosSection({ lessonId, onCountChange, canEdit = true }: Props) {
  const t = useTranslations('photos');
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [pending, setPending] = useState<PhotoRow | null>(null);
  const [lightbox, setLightbox] = useState<PhotoRow | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(withBase(`/api/lessons/${lessonId}/files`));
    if (!res.ok) return;
    const data = (await res.json()) as { files: PhotoRow[] };
    const images = data.files.filter((f) => f.kind === 'image');
    setPhotos(images);
    onCountChange(images.length);
  }, [lessonId, onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  // Close the lightbox on Escape.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLightbox(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const usedBytes = photos.reduce((sum, p) => sum + p.sizeBytes, 0);

  async function doDelete() {
    if (!pending) return;
    const res = await fetch(withBase(`/api/lessons/${lessonId}/files/${pending.id}`), {
      method: 'DELETE',
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(d.error ?? 'Delete failed. Please try again.');
    }
    await load();
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <FileUploader
          lessonId={lessonId}
          kind="image"
          accept={{
            'image/jpeg': ['.jpg', '.jpeg'],
            'image/png': ['.png'],
            'image/webp': ['.webp'],
            'image/gif': ['.gif'],
            'image/heic': ['.heic'],
            'image/heif': ['.heif'],
          }}
          maxBytes={MAX_PHOTO_BYTES}
          hint={t('hint')}
          sizeHint={t('sizeHint')}
          multiple
          validate={(file, pendingBytes) =>
            usedBytes + pendingBytes + file.size > MAX_TOTAL_BYTES
              ? t('totalExceeded')
              : null
          }
          onUploaded={load}
        />
      )}

      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{t('empty')}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((p) => (
            <li key={p.id} className="group relative">
              {p.url ? (
                <button
                  type="button"
                  onClick={() => setLightbox(p)}
                  className="block w-full overflow-hidden rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t('enlarge')}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.filename}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                </button>
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-md border bg-muted text-muted-foreground">
                  <ImageOff className="h-6 w-6" />
                  <span className="sr-only">{t('unavailable')}</span>
                </div>
              )}
              {canEdit && (
                <button
                  type="button"
                  aria-label={t('deletePhoto')}
                  onClick={() => setPending(p)}
                  className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition-opacity hover:bg-black/75 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Lightbox — full-size, dismissible (click / Escape), mobile-friendly. */}
      {lightbox?.url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.filename}
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('close')}
            onClick={() => setLightbox(null)}
            className="absolute right-3 top-3 text-white hover:bg-white/15 hover:text-white"
          >
            <X className="h-5 w-5" />
          </Button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.url}
            alt={lightbox.filename}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-md object-contain"
          />
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={t('deleteTitle')}
        description={t('deleteDesc')}
        onConfirm={doDelete}
      />
    </div>
  );
}
