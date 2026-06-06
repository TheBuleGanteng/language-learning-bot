'use client';

import { Info } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * A small info "(i)" affordance with a click-to-open popover. Used for header
 * hints (e.g. the extraction Confidence column, the DLS login note). Stops
 * propagation so it can live inside an accordion trigger without toggling it.
 */
export function InfoHint({
  text,
  className,
  label = 'More info',
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'inline-flex items-center justify-center text-muted-foreground hover:text-foreground',
          className,
        )}
      >
        <Info className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-64 text-xs leading-relaxed">{text}</PopoverContent>
    </Popover>
  );
}
