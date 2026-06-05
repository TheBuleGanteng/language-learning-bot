'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
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
  /** Optional pre-upload check (e.g. per-lesson total). Return an error string to block. */
  validate?: (file: File) => string | null;
  onUploaded: () => void;
}

/**
 * Compact single-row drop zone. The whole bar is clickable / droppable.
 * During an upload, the instruction text becomes the filename plus an
 * indeterminate progress bar; the bar height does not change.
 */
export function FileUploader({
  lessonId,
  kind,
  accept,
  maxBytes,
  hint,
  sizeHint,
  validate,
  onUploaded,
}: Props) {
  const [uploading, setUploading] = useState<string | null>(null);

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (file.size > maxBytes) {
        toast.error(`File exceeds limit (${Math.round(maxBytes / 1024 / 1024)}MB)`);
        return;
      }
      const validationError = validate?.(file);
      if (validationError) {
        toast.error(validationError);
        return;
      }
      setUploading(file.name);
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('kind', kind);
        const res = await fetch(withBase(`/api/lessons/${lessonId}/files/upload`), {
          method: 'POST',
          body: fd,
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast.error(d?.error ?? 'Upload failed');
          return;
        }
        toast.success('Uploaded');
        onUploaded();
      } finally {
        setUploading(null);
      }
    },
    [lessonId, kind, maxBytes, validate, onUploaded],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    multiple: false,
    maxSize: maxBytes,
    disabled: !!uploading,
  });

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
        {uploading ? (
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="truncate">Uploading &ldquo;{uploading}&rdquo;…</span>
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
