'use client';

import { useTranslations } from 'next-intl';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { InfoIcon } from '@/components/ui/info-icon';
import { SPEECH_SPEED_LEVELS, type SpeechSpeed } from '@/lib/speech-speed';
import { cn } from '@/lib/utils';

interface Props {
  value: SpeechSpeed;
  onChange: (level: SpeechSpeed) => void;
  disabled?: boolean;
  className?: string;
  /**
   * Compact mode (avatar page, both mobile and desktop): label beside the slider
   * in a narrow, wrapping column, slider vertically centered against the label,
   * tick labels under the slider. Stacked layout otherwise (settings).
   */
  compact?: boolean;
}

/**
 * Shared "Speed" control: a discrete 3-position slider (Slow → Native) plus an
 * info icon — modeled on the Base language use control. Controls how fast Kruu
 * Bingo speaks. The info popover opens on hover/focus (desktop) AND tap (mobile).
 */
export function SpeechSpeedControl({ value, onChange, disabled, className, compact }: Props) {
  const t = useTranslations('speechSpeed');
  const label = t('label');
  const idx = Math.max(0, SPEECH_SPEED_LEVELS.indexOf(value));

  const info = (
    <InfoIcon label={label}>
      <p className="font-medium">{t(`levels.${value}`)}</p>
      <p className="text-muted-foreground">{t('intro')}</p>
      <div className="mt-1 space-y-1 border-t pt-2">
        {SPEECH_SPEED_LEVELS.map((lvl) => (
          <p key={lvl} className="text-xs leading-snug">
            <span className="font-medium">{t(`levels.${lvl}`)}:</span>{' '}
            <span className="text-muted-foreground">{t(`help.${lvl}`)}</span>
          </p>
        ))}
      </div>
    </InfoIcon>
  );

  const ticks = (
    <div className="flex gap-1 text-[10px] text-muted-foreground sm:text-[11px]">
      {SPEECH_SPEED_LEVELS.map((lvl) => (
        <span
          key={lvl}
          className={cn(
            'min-w-0 flex-1 break-words text-center leading-tight',
            lvl === value && 'font-semibold text-foreground',
          )}
        >
          {t(`levels.${lvl}`)}
        </span>
      ))}
    </div>
  );

  const slider = (
    <Slider
      aria-label={label}
      className={cn(compact && 'col-start-2 row-start-1 min-w-0')}
      tickCount={SPEECH_SPEED_LEVELS.length}
      min={0}
      max={SPEECH_SPEED_LEVELS.length - 1}
      step={1}
      value={idx}
      disabled={disabled}
      onValueChange={(v) => {
        const n = Array.isArray(v) ? v[0] : v;
        const lvl = SPEECH_SPEED_LEVELS[n];
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
        <div className="col-start-1 row-start-1 flex items-center gap-1 text-sm font-medium leading-tight">
          <span className="break-words">{label}</span>
          {info}
        </div>
        {slider}
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
