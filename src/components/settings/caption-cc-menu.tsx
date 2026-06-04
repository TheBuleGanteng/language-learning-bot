'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Captions, ChevronDown, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { isNonRomanScript } from '@/lib/languages';
import { resolveCaptionLanguage, type CaptionLanguage } from './caption-language-select';
import { cn } from '@/lib/utils';

interface Props {
  /** Captions on/off (mirrors `captionsEnabled`). */
  enabled: boolean;
  onToggle: (next: boolean) => void;
  /** Selected caption language/type (mirrors `caption_language`). */
  captionLanguage: CaptionLanguage;
  onCaptionLanguageChange: (v: CaptionLanguage) => void;
  targetCode: string;
  targetName: string;
  baseName: string;
  /** Disables the on/off toggle (while its save is in flight). */
  toggleDisabled?: boolean;
  /** Disables the language menu (while its save is in flight). */
  langDisabled?: boolean;
  className?: string;
}

/**
 * YouTube-style CC control for the voice page: a CC button that toggles captions
 * on/off, plus a caret that opens a compact menu of caption types (with a
 * checkmark on the active one). The menu opens on hover (desktop) and tap
 * (mobile) — the same Popover `openOnHover` pattern used by the ⓘ info icons.
 * Selecting a type implies captions ON. Reads/writes the same shared values as
 * the settings page, so the two stay in sync.
 */
export function CaptionCcMenu({
  enabled,
  onToggle,
  captionLanguage,
  onCaptionLanguageChange,
  targetCode,
  targetName,
  baseName,
  toggleDisabled,
  langDisabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('captions');

  const active = resolveCaptionLanguage(captionLanguage, targetCode);
  const labelFor = (v: CaptionLanguage) =>
    v === 'base'
      ? baseName
      : v === 'target_romanized'
        ? t('romanizedSuffix', { name: targetName })
        : targetName;

  // Build the offered options; romanized only for non-roman target scripts.
  const options: CaptionLanguage[] = ['base', 'target'];
  if (isNonRomanScript(targetCode)) options.push('target_romanized');

  function select(v: CaptionLanguage) {
    onCaptionLanguageChange(v);
    // Choosing a caption type implies captions ON.
    if (!enabled) onToggle(true);
    setOpen(false);
  }

  return (
    <div
      className={cn(
        'inline-flex items-stretch overflow-hidden rounded-md border',
        enabled ? 'border-primary' : 'border-input',
        className,
      )}
    >
      {/* CC on/off toggle */}
      <button
        type="button"
        aria-pressed={enabled}
        aria-label={enabled ? t('turnOff') : t('turnOn')}
        disabled={toggleDisabled}
        onClick={() => onToggle(!enabled)}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium transition-colors',
          enabled
            ? 'bg-primary text-primary-foreground'
            : 'bg-background text-muted-foreground hover:text-foreground',
          toggleDisabled && 'pointer-events-none opacity-50',
        )}
      >
        <Captions className="h-4 w-4" />
        <span className={cn(enabled && 'underline underline-offset-4')}>CC</span>
      </button>

      {/* Caret → caption-type menu */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          openOnHover
          render={
            <button
              type="button"
              aria-label={t('captionLanguage')}
              disabled={langDisabled}
              className={cn(
                'inline-flex items-center border-l px-1.5 transition-colors',
                enabled
                  ? 'border-primary-foreground/30 bg-primary text-primary-foreground'
                  : 'border-input bg-background text-muted-foreground hover:text-foreground',
                langDisabled && 'pointer-events-none opacity-50',
              )}
            />
          }
        >
          <ChevronDown className="h-4 w-4" />
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="w-auto min-w-44 gap-0.5 p-1">
          {options.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => select(v)}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Check
                className={cn('h-4 w-4 shrink-0', active === v ? 'opacity-100' : 'opacity-0')}
              />
              <span className="whitespace-nowrap">{labelFor(v)}</span>
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
