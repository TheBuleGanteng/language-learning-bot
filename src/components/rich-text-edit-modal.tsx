'use client';

import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { stripHtml } from '@/lib/strip-html';
import { RichTextEditor } from './rich-text-editor';
import { RenderedHtml } from './rendered-html';

interface Props {
  /** Stored HTML. Plain text is fine. */
  value: string;
  emptyPlaceholder?: string;
  /** Modal title. */
  title: string;
  /** Throw to keep the modal open and surface the error inline. */
  onSave: (newHtml: string) => Promise<void>;
  /** Applied to the display element (font size, italics, etc.). */
  className?: string;
}

export function RichTextEditModal({
  value,
  emptyPlaceholder = 'Click to add',
  title,
  onSave,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setError(null);
    }
  }, [open, value]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const isEmpty = !value || stripHtml(value).trim() === '';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) setOpen(o); }}>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={title}
            className={cn(
              'group inline-flex items-start gap-2 text-left w-full rounded -mx-1 px-1 hover:bg-muted/50 transition-colors',
              className,
            )}
          >
            <span className="flex-1 min-w-0">
              {isEmpty ? (
                <span className="text-muted-foreground italic">{emptyPlaceholder}</span>
              ) : (
                <RenderedHtml html={value} />
              )}
            </span>
            <Pencil className="h-3.5 w-3.5 mt-1 opacity-30 group-hover:opacity-100 transition-opacity shrink-0" />
          </button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <RichTextEditor value={draft} onChange={setDraft} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
