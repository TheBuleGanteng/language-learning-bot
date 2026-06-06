'use client';

import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { withBase } from '@/lib/base-path';

interface Props {
  lessonId: string;
  kind: 'pdf' | 'audio' | 'image';
  accept: Record<string, string[]>;
  maxBytes: number;
  /** Default-state instruction text, e.g. "Drop PDF here or click to upload". */
  hint: string;
  /** Right-aligned muted detail, e.g. "Max 20MB" or "Max 50MB · MP3, M4A". */
  sizeHint?: string;
  /**
   * Optional pre-upload check (e.g. per-lesson total). Return an error string to
   * block. `pendingBytes` is the total size of files already accepted earlier in
   * the same multi-file batch, so cumulative limits can be enforced across a
   * whole selection, not just per file.
   */
  validate?: (file: File, pendingBytes: number) => string | null;
  /** Allow selecting/dropping several files at once (per-file isolated upload). */
  multiple?: boolean;
  onUploaded: () => void;
}

interface UploadState {
  name: string;
  index: number;
  total: number;
}

/**
 * Compact single-row drop zone. The whole bar is clickable / droppable.
 * During an upload, the instruction text becomes the filename plus an
 * indeterminate progress bar; the bar height does not change. With
 * `multiple`, a selection is uploaded file-by-file: each file is validated and
 * uploaded independently so one bad/oversized file reports its own error
 * without aborting the rest, and the caller is refreshed once at the end.
 */
export function FileUploader({
  lessonId,
  kind,
  accept,
  maxBytes,
  hint,
  sizeHint,
  validate,
  multiple = false,
  onUploaded,
}: Props) {
  const [uploading, setUploading] = useState<UploadState | null>(null);

  const uploadOne = useCallback(
    async (file: File): Promise<boolean> => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await fetch(withBase(`/api/lessons/${lessonId}/files/upload`), {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(`“${file.name}”: ${(d as { error?: string })?.error ?? 'Upload failed'}`);
        return false;
      }
      return true;
    },
    [lessonId, kind],
  );

  const onDrop = useCallback(
    async (files: File[], rejections: FileRejection[]) => {
      // Single-file mode preserves the original behavior exactly: dropzone's
      // own maxSize filters oversized files into `rejections` (ignored here).
      if (!multiple) {
        const file = files[0];
        if (!file) return;
        if (file.size > maxBytes) {
          toast.error(`File exceeds limit (${Math.round(maxBytes / 1024 / 1024)}MB)`);
          return;
        }
        const validationError = validate?.(file, 0);
        if (validationError) {
          toast.error(validationError);
          return;
        }
        setUploading({ name: file.name, index: 1, total: 1 });
        try {
          if (await uploadOne(file)) {
            toast.success('Uploaded');
            onUploaded();
          }
        } finally {
          setUploading(null);
        }
        return;
      }

      // Multi-file mode: report type-rejected files, then upload the rest one by
      // one. Size + cumulative checks run manually (dropzone maxSize is off in
      // this mode) so each failure surfaces its own message and is isolated.
      for (const r of rejections) {
        toast.error(`“${r.file.name}”: ${r.errors[0]?.message ?? 'Unsupported file'}`);
      }
      if (files.length === 0) return;

      let pendingBytes = 0;
      let ok = 0;
      let failed = rejections.length;
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          setUploading({ name: file.name, index: i + 1, total: files.length });
          if (file.size > maxBytes) {
            toast.error(
              `“${file.name}”: exceeds ${Math.round(maxBytes / 1024 / 1024)}MB per-file limit`,
            );
            failed += 1;
            continue;
          }
          const validationError = validate?.(file, pendingBytes);
          if (validationError) {
            toast.error(`“${file.name}”: ${validationError}`);
            failed += 1;
            continue;
          }
          if (await uploadOne(file)) {
            ok += 1;
            pendingBytes += file.size;
          } else {
            failed += 1;
          }
        }
      } finally {
        setUploading(null);
      }
      if (ok > 0) {
        toast.success(
          `Uploaded ${ok} file${ok === 1 ? '' : 's'}${failed > 0 ? ` · ${failed} failed` : ''}`,
        );
        onUploaded();
      }
    },
    [multiple, maxBytes, validate, uploadOne, onUploaded],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    multiple,
    // In multi-file mode we validate size ourselves so oversized files surface a
    // per-file error instead of being silently dropped by dropzone.
    maxSize: multiple ? undefined : maxBytes,
    disabled: !!uploading,
  });

  const uploadingLabel = uploading
    ? uploading.total > 1
      ? `Uploading “${uploading.name}” (${uploading.index}/${uploading.total})…`
      : `Uploading “${uploading.name}”…`
    : null;

  return (
    <div
      {...getRootProps()}
      className={cn(
        'flex items-center justify-between gap-3 px-4 py-3 rounded-md border-2 border-dashed cursor-pointer transition-colors text-sm',
        uploading
          ? 'border-muted-foreground/30 cursor-progress'
          : isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/30 hover:border-muted-foreground/60 hover:bg-muted/30',
      )}
    >
      <input {...getInputProps()} />
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Upload className="h-5 w-5 text-muted-foreground shrink-0" />
        {uploadingLabel ? (
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="truncate">{uploadingLabel}</span>
            <span className="flex-1 max-w-[160px] h-1.5 rounded-full bg-muted overflow-hidden">
              <span className="block h-full w-1/2 bg-primary animate-pulse" />
            </span>
          </div>
        ) : (
          <span>{isDragActive ? 'Drop to upload' : hint}</span>
        )}
      </div>
      {sizeHint && !uploading && (
        <span className="text-xs text-muted-foreground shrink-0">{sizeHint}</span>
      )}
    </div>
  );
}
