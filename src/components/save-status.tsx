'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

export type SaveStatusState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Tracks the in-flight + result state of an auto-saving field. The
 * "saved" / "error" states auto-revert to "idle" after a short delay
 * so the indicator fades on its own — no manual reset needed.
 */
export function useFieldAutoSave() {
  const [status, setStatus] = useState<SaveStatusState>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  async function run(fn: () => Promise<void>) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setStatus('saving');
    try {
      await fn();
      setStatus('saved');
      timeoutRef.current = setTimeout(() => setStatus('idle'), 1500);
    } catch {
      setStatus('error');
      timeoutRef.current = setTimeout(() => setStatus('idle'), 2000);
    }
  }

  return { status, run };
}

export function SaveStatus({ status }: { status: SaveStatusState }) {
  if (status === 'idle') return null;
  if (status === 'saving') {
    return <span className="text-xs text-muted-foreground">Saving…</span>;
  }
  if (status === 'saved') {
    return (
      <span className="text-xs text-green-600 inline-flex items-center gap-1">
        <Check className="h-3 w-3" /> Saved
      </span>
    );
  }
  return <span className="text-xs text-red-600">Failed to save</span>;
}
