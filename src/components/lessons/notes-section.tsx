'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FileUploader } from './file-uploader';
import { toast } from 'sonner';

interface Props {
  lessonId: string;
  onCountChange: (n: number) => void;
}

interface FileRow {
  id: string;
  kind: 'pdf' | 'audio';
  filename: string;
  contentType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function NotesSection({ lessonId, onCountChange }: Props) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/lessons/${lessonId}/files`);
    if (!res.ok) return;
    const data = (await res.json()) as { files: FileRow[] };
    const pdfs = data.files.filter((f) => f.kind === 'pdf');
    setFiles(pdfs);
    onCountChange(pdfs.length);
  }, [lessonId, onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  async function doDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/lessons/${lessonId}/files/${deleteId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      toast.success('Deleted');
      load();
    } else {
      toast.error('Delete failed');
    }
    setDeleteId(null);
  }

  return (
    <div className="space-y-4">
      <FileUploader
        lessonId={lessonId}
        kind="pdf"
        accept={{ 'application/pdf': ['.pdf'] }}
        maxBytes={20 * 1024 * 1024}
        hint="Drag a PDF here, or use Choose file. Max 20MB."
        onUploaded={load}
      />
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No notes yet. Upload your first PDF.
        </p>
      ) : (
        <ul className="space-y-6">
          {files.map((f) => (
            <li key={f.id} className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-sm font-medium">{f.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(f.sizeBytes)} · {formatDate(f.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button asChild size="xs" variant="outline">
                    <a href={f.url} download={f.filename}>
                      Download
                    </a>
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setDeleteId(f.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              <iframe
                src={f.url}
                title={f.filename}
                className="w-full h-[600px] border rounded-md"
              />
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this PDF?</AlertDialogTitle>
            <AlertDialogDescription>
              The file will be removed from storage and can&apos;t be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
