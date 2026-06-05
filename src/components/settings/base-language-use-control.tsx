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

  // The tooltip lists only the levels whose tick labels are still visible on the
  // slider (all / moderate / never); the intermediate frequent/rarely stops were
  // de-labelled to declutter, so their explanation lines are omitted here too.
  const explainedLevels = BASE_LANGUAGE_USE_LEVELS.filter(
    (lvl) => lvl === 'all' || lvl === 'moderate' || lvl === 'never',
  );
  const info = (
    <InfoIcon label={label} align="end">
      <p className="font-medium">{t(`levels.${value}`)}</p>
      <p className="text-muted-foreground">{t(`help.${value}`, names)}</p>
      <div className="mt-1 space-y-1 border-t pt-2">
        {explainedLevels.map((lvl) => (
          <p key={lvl} className="text-xs leading-snug">
            <span className="font-medium">{t(`levels.${lvl}`)}:</span>{' '}
            <span className="text-muted-foreground">{t(`help.${lvl}`, names)}</span>
          </p>
        ))}
      </div>
    </InfoIcon>
  );

  // Per-tick labels — only the endpoints and midpoint are labelled; the
  // intermediate steps (frequent / rarely) render a tick mark but no text
  // (null), so the slider stays readable. Labels are centered under their tick
  // by the Slider itself.
  const tickLabels = BASE_LANGUAGE_USE_LEVELS.map((lvl) =>
    lvl === 'all' || lvl === 'moderate' || lvl === 'never' ? t(`levels.${lvl}`) : null,
  );

  const slider = (
    <Slider
      aria-label={label}
      className={cn(compact && 'col-start-2 row-start-1 min-w-0')}
      tickCount={BASE_LANGUAGE_USE_LEVELS.length}
      tickLabels={tickLabels}
      activeIndex={idx}
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
          'grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-x-3',
          className,
        )}
      >
        {/* Label cell (col 1) — narrow + wrapping so the slider gets the width.
            `h-8` matches the slider's control row so the label's text centers on
            the track (the tick labels hang below, outside this height). */}
        <div className="flex h-8 items-center gap-1 text-sm font-medium leading-tight">
          <span className="break-words">{label}</span>
          {info}
        </div>
        {/* Slider (col 2) — its tick labels live inside, under each tick. */}
        {slider}
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
    </div>
  );
}
