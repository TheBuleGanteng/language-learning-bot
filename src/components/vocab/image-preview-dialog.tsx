'use client';

import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { vocabPath } from '@/lib/routes';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: string;
  vocabId: string;
  imageUrl: string | null;
  targetText: string;
  nativeText: string;
}

export function ImagePreviewDialog({
  open,
  onOpenChange,
  lang,
  vocabId,
  imageUrl,
  targetText,
  nativeText,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {targetText}
            <span className="block text-sm font-normal text-muted-foreground">
              {nativeText}
            </span>
          </DialogTitle>
        </DialogHeader>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={nativeText}
            className="w-full max-h-[70vh] object-contain rounded-md border"
          />
        ) : (
          <p className="text-sm text-muted-foreground">No image yet.</p>
        )}
        <div className="flex items-center justify-end gap-2 text-sm">
          <Link
            href={vocabPath(lang, `/${vocabId}`)}
            className="text-blue-700 hover:underline"
          >
            View vocab item
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
