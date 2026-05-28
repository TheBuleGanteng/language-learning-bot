'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  lessonId: string;
  kind: 'pdf' | 'audio';
  accept: Record<string, string[]>;
  maxBytes: number;
  hint: string;
  onUploaded: () => void;
}

export function FileUploader({ lessonId, kind, accept, maxBytes, hint, onUploaded }: Props) {
  const [uploading, setUploading] = useState<string | null>(null);

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (file.size > maxBytes) {
        toast.error(`File exceeds limit (${Math.round(maxBytes / 1024 / 1024)}MB)`);
        return;
      }
      setUploading(file.name);
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('kind', kind);
        const res = await fetch(`/api/lessons/${lessonId}/files/upload`, {
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
    [lessonId, kind, maxBytes, onUploaded],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept,
    multiple: false,
    maxSize: maxBytes,
    noClick: true,
    noKeyboard: true,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        'border-2 border-dashed rounded-md p-6 text-center text-sm transition-colors',
        isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
      )}
    >
      <input {...getInputProps()} />
      <Upload className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
      <p className="text-muted-foreground">{hint}</p>
      <div className="mt-3">
        <Button type="button" size="sm" variant="outline" onClick={open} disabled={!!uploading}>
          {uploading ? `Uploading ${uploading}…` : 'Choose file'}
        </Button>
      </div>
    </div>
  );
}
