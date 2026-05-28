'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlayCircle } from 'lucide-react';
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
import { toast } from 'sonner';

interface Props {
  lessonId: string;
  onCountChange: (n: number) => void;
}

interface LinkRow {
  id: string;
  url: string;
  title: string;
  notes: string | null;
  kind: 'generic' | 'youtube';
  youtubeVideoId: string | null;
  createdAt: string;
}

export function LinksSection({ lessonId, onCountChange }: Props) {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedYt, setExpandedYt] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch(`/api/lessons/${lessonId}/links`);
    if (!res.ok) return;
    const data = (await res.json()) as { links: LinkRow[] };
    setLinks(data.links);
    onCountChange(data.links.length);
  }, [lessonId, onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/lessons/${lessonId}/links`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          title: title.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error ?? 'Add failed');
        return;
      }
      setUrl('');
      setTitle('');
      setNotes('');
      load();
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/lessons/${lessonId}/links/${deleteId}`, {
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

  function toggleYt(id: string) {
    setExpandedYt((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={onAdd}
        className="space-y-2 border rounded-md p-3 bg-muted/30"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="link-url">URL</Label>
            <Input
              id="link-url"
              type="url"
              required
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="link-title">Title (auto-filled for YouTube)</Label>
            <Input
              id="link-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="link-notes">Notes (optional)</Label>
          <Input
            id="link-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm" disabled={busy || !url.trim()}>
          {busy ? 'Adding…' : 'Add link'}
        </Button>
      </form>

      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No links yet.</p>
      ) : (
        <ul className="space-y-3">
          {links.map((l) => (
            <li key={l.id} className="border rounded-md p-3">
              {l.kind === 'youtube' && l.youtubeVideoId ? (
                expandedYt.has(l.id) ? (
                  <div className="space-y-2">
                    <div className="aspect-video w-full">
                      <iframe
                        src={`https://www.youtube-nocookie.com/embed/${l.youtubeVideoId}`}
                        title={l.title}
                        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full rounded-md border"
                      />
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{l.title}</p>
                        {l.notes && (
                          <p className="text-xs text-muted-foreground mt-1">{l.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => toggleYt(l.id)}
                        >
                          Collapse
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setDeleteId(l.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleYt(l.id)}
                      className="relative shrink-0 group"
                      aria-label="Play"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://img.youtube.com/vi/${l.youtubeVideoId}/hqdefault.jpg`}
                        alt=""
                        className="w-40 h-24 object-cover rounded-md border"
                      />
                      <PlayCircle className="absolute inset-0 m-auto h-10 w-10 text-white drop-shadow-lg opacity-90 group-hover:opacity-100 transition-opacity" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleYt(l.id)}
                        className="text-sm font-medium hover:underline text-left"
                      >
                        {l.title}
                      </button>
                      <p className="text-xs text-muted-foreground truncate">{l.url}</p>
                      {l.notes && (
                        <p className="text-xs text-muted-foreground mt-1">{l.notes}</p>
                      )}
                    </div>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => setDeleteId(l.id)}
                    >
                      Delete
                    </Button>
                  </div>
                )
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium hover:underline"
                    >
                      {l.title}
                    </a>
                    <p className="text-xs text-muted-foreground truncate">{l.url}</p>
                    {l.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{l.notes}</p>
                    )}
                  </div>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setDeleteId(l.id)}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this link?</AlertDialogTitle>
            <AlertDialogDescription>
              The link will be removed from this lesson.
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
