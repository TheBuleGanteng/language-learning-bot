'use client';

import { Captions } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * YouTube-style CC on/off toggle. Used on the voice chat page and (with a
 * label) in the AI Chat settings section. Purely presentational — the parent
 * owns persistence/auto-save.
 */
export function CaptionsToggle({
  enabled,
  onToggle,
  disabled,
  className,
}: {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={enabled}
      aria-label={enabled ? 'Turn captions off' : 'Turn captions on'}
      disabled={disabled}
      onClick={() => onToggle(!enabled)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors',
        enabled
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-background text-muted-foreground hover:text-foreground',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <Captions className="h-4 w-4" />
      CC
    </button>
  );
}
