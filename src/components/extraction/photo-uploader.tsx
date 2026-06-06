'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import {
  Camera,
  Crop as CropIcon,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
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
import type { ExtractedRow } from '@/lib/extraction';
import { normalizeImageToJpeg } from '@/lib/image/normalize';
import { WebcamCaptureDialog } from './webcam-capture-dialog';

// Soft cap — above this we warn but still allow the batch (§2).
const SOFT_CAP = 10;
// Sanity bound on the *original* upload; normalization downscales the rest, so
// this only guards against decoding pathologically large files.
const MAX_ORIGINAL_BYTES = 30 * 1024 * 1024;

type EntryStatus =
  | 'preparing' // normalizing (EXIF/downscale, HEIC convert)
  | 'prepare_failed'
  | 'ready'
  | 'extracting'
  | 'done'
  | 'failed'; // extraction failed — retryable

interface PhotoEntry {
  id: string;
  name: string;
  status: EntryStatus;
  /** Upright, downscaled JPEG (null until preparing finishes). */
  normalizedBlob: Blob | null;
  /** Cropped output as JPEG, or null when no crop applied. */
  croppedBlob: Blob | null;
  previewUrl: string;
  /** Extracted rows once status === 'done'. */
  rows?: ExtractedRow[];
  error?: string;
  /** Camera shots auto-open the cropper once normalized (skippable). */
  autoCrop?: boolean;
}

interface Props {
  /** Single-image extraction call. Resolves with that image's rows; throws on failure. */
  extractImage: (blob: Blob) => Promise<ExtractedRow[]>;
  /** Hand the merged candidates to the existing review screen. */
  onReview: (rows: ExtractedRow[]) => void;
  /** Lets the parent block closing the modal mid-extraction. */
  onBusyChange?: (busy: boolean) => void;
}

function uploadBlob(entry: PhotoEntry): Blob | null {
  return entry.croppedBlob ?? entry.normalizedBlob;
}

export function PhotoUploader({ extractImage, onReview, onBusyChange }: Props) {
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [cropping, setCropping] = useState<string | null>(null);
  const [showWebcam, setShowWebcam] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const photosRef = useRef<PhotoEntry[]>([]);
  photosRef.current = photos;

  useEffect(() => {
    onBusyChange?.(running);
  }, [running, onBusyChange]);

  // Coarse pointer → phone/tablet: use the native camera + tile chooser.
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Revoke all object URLs on unmount.
  useEffect(() => {
    return () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.previewUrl);
    };
  }, []);

  const normalizeEntry = useCallback(async (id: string, file: Blob) => {
    try {
      const blob = await normalizeImageToJpeg(file);
      let openCrop = false;
      setPhotos((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          URL.revokeObjectURL(p.previewUrl);
          if (p.autoCrop) openCrop = true;
          return {
            ...p,
            status: 'ready',
            normalizedBlob: blob,
            previewUrl: URL.createObjectURL(blob),
          };
        }),
      );
      // Auto-open the cropper for camera shots, one at a time.
      if (openCrop) {
        setCropping((cur) => cur ?? id);
      }
    } catch (err) {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                status: 'prepare_failed',
                error: err instanceof Error ? err.message : 'Could not prepare image',
              }
            : p,
        ),
      );
    }
  }, []);

  const addFiles = useCallback(
    (files: File[], autoCrop: boolean) => {
      if (files.length === 0) return;
      const accepted: { entry: PhotoEntry; file: File }[] = [];
      for (const f of files) {
        if (f.size > MAX_ORIGINAL_BYTES) {
          toast.error(
            `${f.name || 'Image'}: exceeds ${Math.round(MAX_ORIGINAL_BYTES / 1024 / 1024)}MB`,
          );
          continue;
        }
        const id = crypto.randomUUID();
        accepted.push({
          file: f,
          entry: {
            id,
            name: f.name || 'photo.jpg',
            status: 'preparing',
            normalizedBlob: null,
            croppedBlob: null,
            previewUrl: URL.createObjectURL(f),
            autoCrop,
          },
        });
      }
      if (accepted.length === 0) return;

      setPhotos((prev) => {
        const next = [...prev, ...accepted.map((a) => a.entry)];
        if (prev.length <= SOFT_CAP && next.length > SOFT_CAP) {
          toast.warning('Large batches cost more and take longer');
        }
        return next;
      });
      for (const a of accepted) void normalizeEntry(a.entry.id, a.file);
    },
    [normalizeEntry],
  );

  const onDrop = useCallback((files: File[]) => addFiles(files, false), [addFiles]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/gif': ['.gif'],
      'image/heic': ['.heic'],
      'image/heif': ['.heif'],
    },
    multiple: true,
    noClick: true,
    noKeyboard: true,
    disabled: running,
  });

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function applyCrop(id: string, croppedBlob: Blob) {
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        URL.revokeObjectURL(p.previewUrl);
        return {
          ...p,
          croppedBlob,
          previewUrl: URL.createObjectURL(croppedBlob),
          // A re-crop invalidates a prior extraction result.
          status: p.status === 'done' || p.status === 'failed' ? 'ready' : p.status,
          rows: undefined,
        };
      }),
    );
  }

  function resetCrop(id: string) {
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id !== id || !p.normalizedBlob) return p;
        URL.revokeObjectURL(p.previewUrl);
        return {
          ...p,
          croppedBlob: null,
          previewUrl: URL.createObjectURL(p.normalizedBlob),
        };
      }),
    );
  }

  function onCameraInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    addFiles(files, true);
    e.target.value = '';
  }

  function onGalleryInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    addFiles(files, false);
    e.target.value = '';
  }

  function takePhoto() {
    if (coarse) cameraInputRef.current?.click();
    else setShowWebcam(true);
  }

  async function runExtraction(ids?: string[]) {
    const snapshot = photosRef.current;
    const targetIds = new Set(
      ids ??
        snapshot
          .filter((p) => p.status === 'ready' || p.status === 'failed')
          .map((p) => p.id),
    );
    const targets = snapshot.filter((p) => targetIds.has(p.id) && uploadBlob(p) != null);
    if (targets.length === 0) return;

    setRunning(true);
    setProgress({ done: 0, total: targets.length });
    setPhotos((prev) =>
      prev.map((p) => (targetIds.has(p.id) ? { ...p, status: 'extracting' } : p)),
    );

    // Accumulate results locally — reading photosRef right after the loop can be
    // stale (the ref only refreshes on re-render). One image's failure never
    // stops the rest of the batch.
    const thisRunRows: ExtractedRow[] = [];
    let failed = 0;
    let completed = 0;
    for (const target of targets) {
      const blob = uploadBlob(target);
      if (!blob) continue;
      try {
        const rows = await extractImage(blob);
        thisRunRows.push(...rows);
        setPhotos((prev) =>
          prev.map((p) => (p.id === target.id ? { ...p, status: 'done', rows } : p)),
        );
      } catch (err) {
        failed += 1;
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === target.id
              ? {
                  ...p,
                  status: 'failed',
                  error: err instanceof Error ? err.message : 'Extraction failed',
                }
              : p,
          ),
        );
      }
      completed += 1;
      setProgress({ done: completed, total: targets.length });
    }

    setRunning(false);
    setProgress(null);

    // Rows from items already extracted in a prior partial run (not re-attempted).
    const priorRows = snapshot
      .filter((p) => p.status === 'done' && !targetIds.has(p.id))
      .flatMap((p) => p.rows ?? []);
    const merged = [...priorRows, ...thisRunRows];

    if (failed === 0) {
      onReview(merged);
      return;
    }
    const okCount = targets.length - failed;
    toast.error(
      `${okCount} of ${targets.length} photos extracted; ${failed} failed — tap a failed photo to retry.`,
    );
  }

  const cropTarget = cropping ? photos.find((p) => p.id === cropping) : null;
  const preparingCount = photos.filter((p) => p.status === 'preparing').length;
  const readyToExtract = photos.some((p) => p.status === 'ready');
  const failedExtractions = photos.filter((p) => p.status === 'failed');
  const doneCount = photos.filter((p) => p.status === 'done').length;
  const showTileChooser = coarse && photos.length === 0;

  return (
    <div className="space-y-4">
      {/* Hidden native inputs (used by both platforms' buttons). */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onCameraInput}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={onGalleryInput}
      />

      {showTileChooser ? (
        // ---- Mobile: 2-tile chooser ----
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={takePhoto}
            className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/30 px-6 py-10 hover:border-muted-foreground/60 hover:bg-muted/30 transition-colors"
          >
            <Camera className="h-9 w-9 text-muted-foreground/70" />
            <span className="text-sm font-medium">Take a photo</span>
          </button>
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/30 px-6 py-10 hover:border-muted-foreground/60 hover:bg-muted/30 transition-colors"
          >
            <ImagePlus className="h-9 w-9 text-muted-foreground/70" />
            <span className="text-sm font-medium">Upload from gallery</span>
          </button>
        </div>
      ) : coarse ? (
        // ---- Mobile: queue present → "add more" affordance ----
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={takePhoto} disabled={running}>
            <Camera className="mr-2 h-4 w-4" />
            Take a photo
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => galleryInputRef.current?.click()}
            disabled={running}
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            Upload
          </Button>
        </div>
      ) : (
        // ---- Desktop: existing dropzone primary + "Take a photo" ----
        <div
          {...getRootProps()}
          className={cn(
            'flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-md border-2 border-dashed text-sm transition-colors',
            running
              ? 'opacity-60 cursor-not-allowed border-muted-foreground/30'
              : isDragActive
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/30 hover:border-muted-foreground/60 hover:bg-muted/30',
          )}
        >
          <input {...getInputProps()} />
          <Upload className="h-7 w-7 text-muted-foreground" />
          <p>{isDragActive ? 'Drop to upload' : 'Drop photos here or click to upload'}</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={open} disabled={running}>
              <ImageIcon className="mr-2 h-4 w-4" />
              Choose photos
            </Button>
            <Button type="button" variant="outline" onClick={takePhoto} disabled={running}>
              <Camera className="mr-2 h-4 w-4" />
              Take a photo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            JPG, PNG, WebP, GIF, HEIC. Portrait photos are auto-rotated and downscaled.
          </p>
        </div>
      )}

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
                  alt={p.name}
                  className={cn(
                    'w-full h-32 object-cover',
                    p.status === 'preparing' && 'opacity-50',
                  )}
                />
                <StatusBadge status={p.status} />
                <div className="flex items-center gap-1 p-1 border-t">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => setCropping(p.id)}
                    disabled={running || p.status === 'preparing' || p.status === 'prepare_failed'}
                  >
                    <CropIcon className="h-3.5 w-3.5 mr-1" />
                    Crop
                  </Button>
                  {p.croppedBlob && (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => resetCrop(p.id)}
                      disabled={running}
                    >
                      Reset
                    </Button>
                  )}
                  {p.status === 'failed' && (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => runExtraction([p.id])}
                      disabled={running}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Retry
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700 ml-auto"
                    onClick={() => removePhoto(p.id)}
                    disabled={running}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {progress && (
              <span className="mr-auto text-sm text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting {progress.done}/{progress.total}…
              </span>
            )}
            {!running && doneCount > 0 && failedExtractions.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  onReview(
                    photos.filter((p) => p.status === 'done').flatMap((p) => p.rows ?? []),
                  )
                }
              >
                Continue with {doneCount} photo{doneCount === 1 ? '' : 's'}
              </Button>
            )}
            {!running && failedExtractions.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => runExtraction(failedExtractions.map((p) => p.id))}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Retry {failedExtractions.length} failed
              </Button>
            )}
            <Button
              type="button"
              onClick={() => runExtraction()}
              disabled={running || preparingCount > 0 || !readyToExtract}
            >
              {running
                ? 'Extracting…'
                : preparingCount > 0
                  ? 'Preparing…'
                  : `Extract ${photos.filter((p) => p.status === 'ready').length} photo${
                      photos.filter((p) => p.status === 'ready').length === 1 ? '' : 's'
                    }`}
            </Button>
          </div>
        </>
      )}

      {cropTarget && cropTarget.normalizedBlob && (
        <CropDialog
          source={cropTarget.normalizedBlob}
          onApply={(blob) => {
            applyCrop(cropTarget.id, blob);
            setCropping(null);
          }}
          onCancel={() => setCropping(null)}
        />
      )}

      {showWebcam && (
        <WebcamCaptureDialog
          onCapture={(blob) => {
            setShowWebcam(false);
            addFiles([new File([blob], `capture-${crypto.randomUUID()}.jpg`, { type: 'image/jpeg' })], true);
          }}
          onClose={() => setShowWebcam(false)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: EntryStatus }) {
  const map: Record<EntryStatus, { label: string; className: string } | null> = {
    preparing: { label: 'Preparing…', className: 'bg-muted text-muted-foreground' },
    prepare_failed: { label: 'Prep failed', className: 'bg-red-100 text-red-700' },
    ready: null,
    extracting: { label: 'Extracting…', className: 'bg-blue-100 text-blue-700' },
    done: { label: 'Done', className: 'bg-green-100 text-green-700' },
    failed: { label: 'Failed', className: 'bg-red-100 text-red-700' },
  };
  const badge = map[status];
  if (!badge) return null;
  return (
    <span
      className={cn(
        'absolute top-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
        badge.className,
      )}
    >
      {badge.label}
    </span>
  );
}

interface CropDialogProps {
  source: Blob;
  onApply: (blob: Blob) => void;
  onCancel: () => void;
}

function CropDialog({ source, onApply, onCancel }: CropDialogProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  // The source is the upright, normalized JPEG — EXIF is already baked in, so
  // the crop coordinates map directly to canvas pixels.
  const [sourceUrl] = useState(() => URL.createObjectURL(source));

  useEffect(() => {
    return () => URL.revokeObjectURL(sourceUrl);
  }, [sourceUrl]);

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
            <img ref={imgRef} src={sourceUrl} alt="Crop source" className="max-w-full" />
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
