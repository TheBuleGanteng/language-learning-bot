'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { withBase } from '@/lib/base-path';
import { toast } from 'sonner';

interface Props {
  itemId: string;
  starred: boolean;
  /** Called with the new starred state after a successful toggle. */
  onChanged?: (starred: boolean) => void;
  className?: string;
}

/**
 * A star icon — hollow when not starred, solid amber when starred. Tapping
 * toggles via PATCH /api/vocab/star (optimistic, reverts on error). Tappable on
 * desktop + mobile + flashcards.
 */
export function StarToggle({ itemId, starred, onChanged, className }: Props) {
  const [on, setOn] = useState(starred);
  const [busy, setBusy] = useState(false);

  useEffect(() => setOn(starred), [starred]);

  async function toggle() {
    if (busy) return;
    const next = !on;
    setOn(next); // optimistic
    setBusy(true);
    try {
      const res = await fetch(withBase('/api/vocab/star'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: [itemId], starred: next }),
      });
      if (!res.ok) throw new Error();
      onChanged?.(next);
    } catch {
      setOn(!next); // revert
      toast.error('Could not update star');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      disabled={busy}
      aria-label={on ? 'Unstar' : 'Star'}
      aria-pressed={on}
      className={cn(
        'inline-flex items-center justify-center rounded p-1 transition-colors disabled:opacity-50',
        on ? 'text-amber-500 hover:text-amber-600' : 'text-muted-foreground/50 hover:text-amber-500',
        className,
      )}
    >
      <Star className={cn('h-4 w-4', on && 'fill-current')} />
    </button>
  );
}
