'use client';

import { useEffect, useRef, useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props {
  value: string | null;
  placeholder?: string;
  /** Throw to keep the editor open and surface the error inline. */
  onSave: (newValue: string) => Promise<void>;
  multiline?: boolean;
  /** Applied to the display element (font size, weight, etc.). */
  className?: string;
  /** Optional label for screen readers. */
  ariaLabel?: string;
}

export function InlineEdit({
  value,
  placeholder = 'Click to add',
  onSave,
  multiline = false,
  className,
  ariaLabel,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Keep draft in sync with prop changes (after a successful save the parent
  // re-renders with the new value; we want the next edit to start from that).
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  // Click-outside cancels (does NOT save). Tracks mousedown so clicks on
  // outer-page buttons feel responsive (don't have to wait for mouseup).
  useEffect(() => {
    if (!editing) return;
    function onDocMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        cancel();
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
    // cancel is stable enough that we don't need it as a dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function startEdit() {
    setDraft(value ?? '');
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraft(value ?? '');
    setError(null);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      void save();
    } else if (e.key === 'Enter' && multiline && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void save();
    }
  }

  if (editing) {
    return (
      <div ref={wrapperRef} className="inline-flex items-start gap-2 w-full">
        {multiline ? (
          <textarea
            autoFocus
            aria-label={ariaLabel}
            className="min-h-[80px] flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            disabled={saving}
          />
        ) : (
          <Input
            autoFocus
            aria-label={ariaLabel}
            className="flex-1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            disabled={saving}
          />
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={save}
          disabled={saving}
          aria-label="Save"
        >
          <Check className="h-4 w-4 text-green-600" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={cancel}
          disabled={saving}
          aria-label="Cancel"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </Button>
        {error && <span className="text-sm text-red-600 self-center">{error}</span>}
      </div>
    );
  }

  const isEmpty = !value || value.trim() === '';
  return (
    <button
      type="button"
      onClick={startEdit}
      aria-label={ariaLabel ?? 'Edit'}
      className={cn(
        'group inline-flex items-center gap-2 text-left rounded -mx-1 px-1 hover:bg-muted/50 transition-colors',
        className,
      )}
    >
      <span className={isEmpty ? 'text-muted-foreground italic' : ''}>
        {isEmpty ? placeholder : value}
      </span>
      <Pencil className="h-3.5 w-3.5 opacity-30 group-hover:opacity-100 transition-opacity shrink-0" />
    </button>
  );
}
