'use client';

import { useCallback, useEffect, useState } from 'react';
import AudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';
import { Button } from '@/components/ui/button';
import { FileUploader } from './file-uploader';
import { ConfirmDeleteDialog } from './confirm-delete-dialog';

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

export function AudioSection({ lessonId, onCountChange }: Props) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [pending, setPending] = useState<FileRow | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/lessons/${lessonId}/files`);
    if (!res.ok) return;
    const data = (await res.json()) as { files: FileRow[] };
    const audio = data.files.filter((f) => f.kind === 'audio');
    setFiles(audio);
    onCountChange(audio.length);
  }, [lessonId, onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  async function doDelete() {
    if (!pending) return;
    const res = await fetch(`/api/lessons/${lessonId}/files/${pending.id}`, {
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
      <FileUploader
        lessonId={lessonId}
        kind="audio"
        accept={{
          'audio/mpeg': ['.mp3'],
          'audio/mp4': ['.m4a'],
          'audio/x-m4a': ['.m4a'],
          'audio/wav': ['.wav'],
          'audio/x-wav': ['.wav'],
          'audio/ogg': ['.ogg'],
        }}
        maxBytes={50 * 1024 * 1024}
        hint="Drop audio file here or click to upload"
        sizeHint="Max 50MB · MP3, M4A, WAV, OGG"
        onUploaded={load}
      />
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No audio yet. Upload your first track.
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
                    onClick={() => setPending(f)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              <div className="rhap-shadcn">
                <AudioPlayer src={f.url} customAdditionalControls={[]} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDeleteDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Delete this audio?"
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
