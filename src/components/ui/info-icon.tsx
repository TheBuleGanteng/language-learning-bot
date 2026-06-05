'use client';

import * as React from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Small ⓘ info trigger whose popover opens on desktop hover/focus AND mobile
 * tap. base-ui's PopoverTrigger keeps its click/tap behavior when `openOnHover`
 * is added, so it works where hover doesn't exist (touch). The popover body is
 * whatever `children` you pass.
 */
export function InfoIcon({
  children,
  label = 'More info',
  side = 'top',
  align = 'center',
  className,
  contentClassName,
}: {
  children: React.ReactNode;
  label?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Alignment of the popover relative to the trigger along the side axis. */
  align?: 'start' | 'center' | 'end';
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        render={
          <button
            type="button"
            aria-label={label}
            className={cn(
              'inline-flex items-center align-middle text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
              className,
            )}
          />
        }
      >
        <Info className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className={cn('w-72 text-sm leading-snug', contentClassName)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
