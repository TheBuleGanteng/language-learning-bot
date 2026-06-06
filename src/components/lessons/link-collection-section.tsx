'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExternalLink, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from './confirm-delete-dialog';
import { withBase } from '@/lib/base-path';

/** Only render http(s) links as a clickable href (the API also rejects others). */
function safeHref(url: string): string {
  return /^https?:\/\//i.test(url.trim()) ? url : '#';
}

export type LinkCategory = 'dls_audio' | 'quizlet' | 'dls_exercises';

interface LinkRow {
  id: string;
  url: string;
  title: string;
}
interface DraftRow {
  id: string;
  label: string;
  url: string;
}

interface Props {
  lessonId: string;
  category: LinkCategory;
  onCountChange: (n: number) => void;
  /** Only the lesson creator may add/delete; consumers view shared links. */
  canEdit?: boolean;
  /** Render saved links as OG thumbnails (Quizlet) vs plain labeled links (DLS). */
  thumbnails?: boolean;
}

function newDraft(): DraftRow {
  return { id: crypto.randomUUID(), label: '', url: '' };
}

/**
 * A per-lesson link collection for the DLS audio / Quizlet / DLS exercises
 * sections (items 4–7). Reuses the same `lesson_links` endpoints (scoped by
 * `category`) as the general Useful Links accordion, but with a multi-row
 * "starts with one empty row + add link" entry UX. DLS sections render plain
 * labeled links (login wall — no preview); Quizlet renders OG thumbnails.
 */
export function LinkCollectionSection({
  lessonId,
  category,
  onCountChange,
  canEdit = true,
  thumbnails = false,
}: Props) {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([newDraft()]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<LinkRow | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(withBase(`/api/lessons/${lessonId}/links?category=${category}`));
    if (!res.ok) return;
    const data = (await res.json()) as { links: LinkRow[] };
    setLinks(data.links);
    onCountChange(data.links.length);
  }, [lessonId, category, onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  function updateDraft(id: string, field: 'label' | 'url', value: string) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, [field]: value } : d)));
  }
  function addRow() {
    setDrafts((prev) => [...prev, newDraft()]);
  }
  function removeDraft(id: string) {
    setDrafts((prev) => (prev.length <= 1 ? [newDraft()] : prev.filter((d) => d.id !== id)));
  }

  async function saveDrafts() {
    const toSave = drafts.filter((d) => d.url.trim());
    if (toSave.length === 0) {
      toast.error('Add a URL first');
      return;
    }
    setBusy(true);
    let ok = 0;
    try {
      for (const d of toSave) {
        const res = await fetch(withBase(`/api/lessons/${lessonId}/links`), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            url: d.url.trim(),
            title: d.label.trim() || undefined,
            category,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(j?.error ?? 'Add failed');
        } else {
          ok += 1;
        }
      }
    } finally {
      setBusy(false);
    }
    if (ok > 0) {
      setDrafts([newDraft()]);
      await load();
    }
  }

  async function doDelete() {
    if (!pending) return;
    const res = await fetch(withBase(`/api/lessons/${lessonId}/links/${pending.id}`), {
      method: 'DELETE',
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(d.error ?? 'Delete failed. Please try again.');
    }
    await load();
  }

  const redBtn = 'text-red-600 hover:bg-red-50 hover:text-red-700';

  return (
    <div className="space-y-4">
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No links yet.</p>
      ) : thumbnails ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {links.map((l) => (
            <li key={l.id} className="border rounded-md overflow-hidden">
              <LinkThumb url={l.url} title={l.title} />
              <div className="flex items-center justify-between gap-2 p-2 border-t">
                <a
                  href={safeHref(l.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:underline truncate"
                >
                  {l.title}
                </a>
                {canEdit && (
                  <Button size="xs" variant="ghost" className={redBtn} onClick={() => setPending(l)}>
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {links.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-2 border rounded-md p-3"
            >
              <a
                href={safeHref(l.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium hover:underline inline-flex items-center gap-1.5 min-w-0"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{l.title}</span>
              </a>
              {canEdit && (
                <Button size="xs" variant="ghost" className={redBtn} onClick={() => setPending(l)}>
                  Delete
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="space-y-2 border rounded-md p-3 bg-muted/30">
          {drafts.map((d) => (
            <div
              key={d.id}
              className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr_auto] gap-2 md:items-end"
            >
              <div className="space-y-1.5">
                <Label htmlFor={`label-${d.id}`}>Label</Label>
                <Input
                  id={`label-${d.id}`}
                  value={d.label}
                  onChange={(e) => updateDraft(d.id, 'label', e.target.value)}
                  placeholder="Optional label"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`url-${d.id}`}>URL</Label>
                <Input
                  id={`url-${d.id}`}
                  type="url"
                  value={d.url}
                  onChange={(e) => updateDraft(d.id, 'url', e.target.value)}
                  placeholder="https://…"
                />
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => removeDraft(d.id)}
                aria-label="Remove row"
                className="justify-self-end"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={addRow}>
              <Plus className="h-4 w-4 mr-1" />
              add link
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={saveDrafts}
              disabled={busy || !drafts.some((d) => d.url.trim())}
            >
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Delete this link?"
        description={
          pending ? (
            <>
              This will permanently delete the link &ldquo;{pending.title}&rdquo;. This
              cannot be undone.
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

/** Quizlet thumbnail: fetches OG preview via the server proxy; falls back to a
 *  plain card if no image is available (or the fetch fails). */
function LinkThumb({ url, title }: { url: string; title: string }) {
  const [img, setImg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(withBase(`/api/link-preview?url=${encodeURIComponent(url)}`));
        const d = (res.ok ? await res.json() : null) as { image?: string | null } | null;
        if (!cancelled) {
          setImg(d?.image ?? null);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (img) {
    return (
      <a href={safeHref(url)} target="_blank" rel="noopener noreferrer" className="block bg-muted/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt={title} className="w-full h-36 object-cover" />
      </a>
    );
  }
  return (
    <a
      href={safeHref(url)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-36 items-center justify-center bg-muted/30 text-xs text-muted-foreground"
    >
      {loaded ? 'No preview available' : 'Loading preview…'}
    </a>
  );
}
