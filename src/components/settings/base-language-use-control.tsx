'use client';

import { useTranslations } from 'next-intl';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { InfoIcon } from '@/components/ui/info-icon';
import { BASE_LANGUAGE_USE_LEVELS, type BaseLanguageUse } from '@/lib/base-language-use';
import { cn } from '@/lib/utils';

interface Props {
  value: BaseLanguageUse;
  onChange: (level: BaseLanguageUse) => void;
  /** Resolved target (studied) language name, e.g. "Thai". */
  targetLanguage: string;
  /** Resolved base (native) language name, e.g. "English". */
  baseLanguage: string;
  disabled?: boolean;
  className?: string;
  /**
   * Compact mode (e.g. the avatar page, both mobile and desktop): puts the label
   * beside the slider in a narrow, wrapping column, with the slider vertically
   * centered against the label and the tick labels under the slider — saving
   * vertical space. Stacked layout otherwise (e.g. settings).
   */
  compact?: boolean;
}

/**
 * Shared "Base language use" control: a discrete 5-position slider (All →
 * Never) plus an info icon. The info popover opens on hover/focus (desktop) AND
 * click/tap (mobile). It shows the selected level's meaning and lists all five.
 */
export function BaseLanguageUseControl({
  value,
  onChange,
  targetLanguage,
  baseLanguage,
  disabled,
  className,
  compact,
}: Props) {
  const t = useTranslations('baseLanguageUse');
  const names = { target: targetLanguage, base: baseLanguage };
  const label = t('labelShort', { base: baseLanguage });
  const idx = Math.max(0, BASE_LANGUAGE_USE_LEVELS.indexOf(value));

  const info = (
    <InfoIcon label={label}>
      <p className="font-medium">{t(`levels.${value}`)}</p>
      <p className="text-muted-foreground">{t(`help.${value}`, names)}</p>
      <div className="mt-1 space-y-1 border-t pt-2">
        {BASE_LANGUAGE_USE_LEVELS.map((lvl) => (
          <p key={lvl} className="text-xs leading-snug">
            <span className="font-medium">{t(`levels.${lvl}`)}:</span>{' '}
            <span className="text-muted-foreground">{t(`help.${lvl}`, names)}</span>
          </p>
        ))}
      </div>
    </InfoIcon>
  );

  // Tick labels — equal-width, wrap-safe so long localized words never overflow.
  // The intermediate steps (frequent / rarely) show only a tick mark on the
  // slider, not a text label (the spans are kept blank to preserve alignment).
  const labelledTicks = new Set(['all', 'moderate', 'never']);
  const ticks = (
    <div className="flex gap-1 text-[10px] text-muted-foreground sm:text-[11px]">
      {BASE_LANGUAGE_USE_LEVELS.map((lvl) => (
        <span
          key={lvl}
          className={cn(
            'min-w-0 flex-1 break-words text-center leading-tight',
            lvl === value && 'font-semibold text-foreground',
          )}
        >
          {labelledTicks.has(lvl) ? t(`levels.${lvl}`) : ''}
        </span>
      ))}
    </div>
  );

  const slider = (
    <Slider
      aria-label={label}
      className={cn(compact && 'col-start-2 row-start-1 min-w-0')}
      tickCount={BASE_LANGUAGE_USE_LEVELS.length}
      min={0}
      max={BASE_LANGUAGE_USE_LEVELS.length - 1}
      step={1}
      value={idx}
      disabled={disabled}
      onValueChange={(v) => {
        const n = Array.isArray(v) ? v[0] : v;
        const lvl = BASE_LANGUAGE_USE_LEVELS[n];
        if (lvl && lvl !== value) onChange(lvl);
      }}
    />
  );

  if (compact) {
    return (
      <div
        className={cn(
          'grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1',
          className,
        )}
      >
        {/* Label cell (col 1) — narrow + wrapping so the slider gets the width. */}
        <div className="col-start-1 row-start-1 flex items-center gap-1 text-sm font-medium leading-tight">
          <span className="break-words">{label}</span>
          {info}
        </div>
        {/* Slider (col 2, row 1) — `items-center` centers it against the label. */}
        {slider}
        {/* Tick labels under the slider (col 2, row 2). */}
        <div className="col-start-2 row-start-2">{ticks}</div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-1.5">
        <Label>{label}</Label>
        {info}
      </div>
      {slider}
      {ticks}
    </div>
  );
}
