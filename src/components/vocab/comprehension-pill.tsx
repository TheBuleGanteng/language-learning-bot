'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { withBase } from '@/lib/base-path';
import { toast } from 'sonner';
import {
  COMPREHENSION_LEVELS,
  COMPREHENSION_META,
  type ComprehensionLevel,
} from '@/lib/comprehension';

interface Props {
  itemId: string;
  level: ComprehensionLevel;
  /** Called with the new level after a successful save (so the parent can sync). */
  onChanged?: (level: ComprehensionLevel) => void;
  className?: string;
}

/**
 * A colored comprehension pill that opens a 4-option menu. Selecting a level
 * PATCHes /api/vocab/comprehension for this one item (optimistic, reverts on
 * error). Tappable on desktop + mobile.
 */
export function ComprehensionPill({ itemId, level, onChanged, className }: Props) {
  const [current, setCurrent] = useState<ComprehensionLevel>(level);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Keep in sync if the parent reloads the row with a new value.
  useEffect(() => setCurrent(level), [level]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function choose(next: ComprehensionLevel) {
    setOpen(false);
    if (next === current || busy) return;
    const prev = current;
    setCurrent(next); // optimistic
    setBusy(true);
    try {
      const res = await fetch(withBase('/api/vocab/comprehension'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: [itemId], level: next }),
      });
      if (!res.ok) throw new Error();
      onChanged?.(next);
    } catch {
      setCurrent(prev); // revert
      toast.error('Could not update comprehension');
    } finally {
      setBusy(false);
    }
  }

  const meta = COMPREHENSION_META[current];

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50',
          meta.pill,
          className,
        )}
        aria-label={`Comprehension: ${meta.label}`}
      >
        <span className={cn('inline-block h-1.5 w-1.5 rounded-full', meta.dot)} />
        {meta.label}
      </button>
      {open && (
        <div className="absolute z-30 left-0 top-full mt-1 w-36 rounded-md border bg-popover p-1 shadow-md">
          {COMPREHENSION_LEVELS.map((l) => {
            const m = COMPREHENSION_META[l];
            return (
              <button
                key={l}
                type="button"
                onClick={() => choose(l)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted"
              >
                <span className={cn('inline-block h-2.5 w-2.5 rounded-full', m.dot)} />
                <span className="flex-1">{m.label}</span>
                {l === current && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
