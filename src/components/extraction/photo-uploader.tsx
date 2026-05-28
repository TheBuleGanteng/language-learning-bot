'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Crop as CropIcon, Image as ImageIcon, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const MAX_PHOTOS = 10;
const MAX_BYTES_PER_PHOTO = 10 * 1024 * 1024;

interface PhotoEntry {
  id: string;
  originalFile: File;
  /** Cropped output as JPEG, or null when no crop applied. */
  croppedBlob: Blob | null;
  previewUrl: string;
}

interface Props {
  /** Called when the user clicks "Extract" with the chosen photos. */
  onExtract: (photos: { blob: Blob; mimeType: string; filename: string }[]) => Promise<void>;
  /** Whether the parent is currently mid-extraction (disables the button). */
  busy?: boolean;
}

export function PhotoUploader({ onExtract, busy = false }: Props) {
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [cropping, setCropping] = useState<PhotoEntry | null>(null);

  const onDrop = useCallback(
    (files: File[]) => {
      setPhotos((prev) => {
        const room = MAX_PHOTOS - prev.length;
        if (room <= 0) {
          toast.error(`Max ${MAX_PHOTOS} photos`);
          return prev;
        }
        const next: PhotoEntry[] = [];
        for (const f of files.slice(0, room)) {
          if (f.size > MAX_BYTES_PER_PHOTO) {
            toast.error(
              `${f.name}: exceeds ${Math.round(MAX_BYTES_PER_PHOTO / 1024 / 1024)}MB`,
            );
            continue;
          }
          next.push({
            id: crypto.randomUUID(),
            originalFile: f,
            croppedBlob: null,
            previewUrl: URL.createObjectURL(f),
          });
        }
        if (files.length > room) {
          toast.error(`Max ${MAX_PHOTOS} photos — extra files ignored`);
        }
        return [...prev, ...next];
      });
    },
    [],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    multiple: true,
    noClick: true,
    noKeyboard: true,
    disabled: busy,
  });

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      for (const p of photos) URL.revokeObjectURL(p.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function applyCrop(entry: PhotoEntry, croppedBlob: Blob) {
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id !== entry.id) return p;
        URL.revokeObjectURL(p.previewUrl);
        return {
          ...p,
          croppedBlob,
          previewUrl: URL.createObjectURL(croppedBlob),
        };
      }),
    );
  }

  function resetCrop(entry: PhotoEntry) {
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id !== entry.id) return p;
        URL.revokeObjectURL(p.previewUrl);
        return {
          ...p,
          croppedBlob: null,
          previewUrl: URL.createObjectURL(p.originalFile),
        };
      }),
    );
  }

  async function fireExtract() {
    if (photos.length === 0) return;
    const payload = photos.map((p) => ({
      blob: p.croppedBlob ?? p.originalFile,
      mimeType: p.croppedBlob ? 'image/jpeg' : p.originalFile.type,
      filename: p.originalFile.name,
    }));
    await onExtract(payload);
  }

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          'flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-md border-2 border-dashed text-sm transition-colors',
          busy
            ? 'opacity-60 cursor-not-allowed border-muted-foreground/30'
            : isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/30 hover:border-muted-foreground/60 hover:bg-muted/30',
        )}
      >
        <input {...getInputProps()} />
        <Upload className="h-7 w-7 text-muted-foreground" />
        <p>{isDragActive ? 'Drop to upload' : 'Drop photos here or click to upload'}</p>
        <Button type="button" variant="outline" onClick={open} disabled={busy}>
          <ImageIcon className="mr-2 h-4 w-4" />
          Choose photos
        </Button>
        <p className="text-xs text-muted-foreground">
          Max {MAX_PHOTOS} photos, {Math.round(MAX_BYTES_PER_PHOTO / 1024 / 1024)}MB
          each. JPG, PNG, WebP.
        </p>
      </div>

      {photos.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((p) => (
              <div
                key={p.id}
                className="relative border rounded-md overflow-hidden bg-muted/30"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.previewUrl}
                  alt={p.originalFile.name}
                  className="w-full h-32 object-cover"
                />
                <div className="flex items-center justify-between p-1.5 bg-background/95 border-t text-xs">
                  <span className="truncate flex-1 mr-1">{p.originalFile.name}</span>
                </div>
                <div className="flex items-center gap-1 p-1 border-t">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => setCropping(p)}
                    disabled={busy}
                  >
                    <CropIcon className="h-3.5 w-3.5 mr-1" />
                    Crop
                  </Button>
                  {p.croppedBlob && (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => resetCrop(p)}
                      disabled={busy}
                    >
                      Reset
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700 ml-auto"
                    onClick={() => removePhoto(p.id)}
                    disabled={busy}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={fireExtract} disabled={busy || photos.length === 0}>
              {busy
                ? 'Extracting…'
                : `Extract vocabulary from ${photos.length} photo${photos.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </>
      )}

      {cropping && (
        <CropDialog
          entry={cropping}
          onApply={(blob) => {
            applyCrop(cropping, blob);
            setCropping(null);
          }}
          onCancel={() => setCropping(null)}
        />
      )}
    </div>
  );
}

interface CropDialogProps {
  entry: PhotoEntry;
  onApply: (blob: Blob) => void;
  onCancel: () => void;
}

function CropDialog({ entry, onApply, onCancel }: CropDialogProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  // Render the ORIGINAL image in the crop UI so the user can recover from a
  // previous crop. The blob we apply is freshly derived from the original.
  const [originalUrl] = useState(() => URL.createObjectURL(entry.originalFile));

  useEffect(() => {
    return () => URL.revokeObjectURL(originalUrl);
  }, [originalUrl]);

  async function applyCrop() {
    const img = imgRef.current;
    if (!img || !completedCrop || completedCrop.width <= 0 || completedCrop.height <= 0) {
      toast.error('Drag to draw a crop region first');
      return;
    }
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(completedCrop.width * scaleX);
    canvas.height = Math.round(completedCrop.height * scaleY);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      toast.error('Could not initialize canvas');
      return;
    }
    ctx.drawImage(
      img,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob((b) => res(b), 'image/jpeg', 0.92),
    );
    if (!blob) {
      toast.error('Crop failed');
      return;
    }
    onApply(blob);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Crop photo</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-auto flex justify-center bg-muted/20 rounded-md">
          <ReactCrop
            crop={crop}
            onChange={(_p, percent) => setCrop(percent)}
            onComplete={(c) => setCompletedCrop(c)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={originalUrl}
              alt="Crop source"
              className="max-w-full"
            />
          </ReactCrop>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={applyCrop}>Apply crop</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
