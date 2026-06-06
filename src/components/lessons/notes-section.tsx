'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileUploader } from './file-uploader';
import { ConfirmDeleteDialog } from './confirm-delete-dialog';
import { PdfThumbnail } from './pdf-thumbnail';
import { withBase } from '@/lib/base-path';

interface Props {
  lessonId: string;
  onCountChange: (n: number) => void;
  /** Only the lesson creator may upload/delete; consumers view shared files. */
  canEdit?: boolean;
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

export function NotesSection({ lessonId, onCountChange, canEdit = true }: Props) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [pending, setPending] = useState<FileRow | null>(null);
  // The PDF currently open in the full scrollable viewer (the existing iframe,
  // now behind a click instead of embedded full-height per file).
  const [viewing, setViewing] = useState<FileRow | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(withBase(`/api/lessons/${lessonId}/files`));
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
          kind="pdf"
          accept={{ 'application/pdf': ['.pdf'] }}
          maxBytes={20 * 1024 * 1024}
          hint="Drop PDF here or click to upload"
          sizeHint="Max 20MB"
          onUploaded={load}
        />
      )}
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No notes yet. Upload your first PDF.
        </p>
      ) : (
        <ul className="space-y-4">
          {files.map((f) => (
            <li key={f.id} className="flex items-start gap-4">
              {/* First-page thumbnail (pdf.js, lazy). Click → full viewer. */}
              <PdfThumbnail
                url={f.url}
                filename={f.filename}
                onClick={() => setViewing(f)}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setViewing(f)}
                    className="text-left text-sm font-medium break-words hover:underline"
                  >
                    {f.filename}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(f.sizeBytes)} · {formatDate(f.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="xs" variant="outline" onClick={() => setViewing(f)}>
                    View
                  </Button>
                  <Button asChild size="xs" variant="outline">
                    <a href={f.url} download={f.filename}>
                      Download
                    </a>
                  </Button>
                  {canEdit && (
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => setPending(f)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Full scrollable viewer — the existing iframe approach, opened on demand
          instead of embedded full-height under every file. */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="flex h-[90svh] w-[95vw] max-w-5xl flex-col overflow-hidden sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{viewing?.filename}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <iframe
              src={viewing.url}
              title={viewing.filename}
              className="w-full flex-1 rounded-md border min-h-0"
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Delete this PDF?"
        description={
          pending ? (
            <>
              This will permanently delete &ldquo;{pending.filename}&rdquo;. This cannot
              be undone.
            </>
          ) : (
            ''
          )
        }
        onConfirm={doDelete}
      />
    </div>
  );
}
