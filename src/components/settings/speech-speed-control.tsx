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
   * Compact mode (mobile avatar page): label inline with the slider, tick labels
   * hidden below `sm` to save vertical space. Desktop is unchanged.
   */
  compact?: boolean;
}

/**
 * Shared "Speed" control: a discrete 3-position slider (Slow → Native) plus an
 * info icon — modeled exactly on the Base language use control. Controls how fast
 * Kruu Bingo speaks. The info popover opens on hover/focus (desktop) AND tap
 * (mobile).
 */
export function SpeechSpeedControl({ value, onChange, disabled, className, compact }: Props) {
  const t = useTranslations('speechSpeed');
  const idx = Math.max(0, SPEECH_SPEED_LEVELS.indexOf(value));

  return (
    <div className={cn('space-y-2', className)}>
      <div className={cn(compact ? 'flex items-center gap-3 sm:block sm:space-y-2' : 'space-y-2')}>
        <div className="flex min-w-0 items-center gap-1.5">
          <Label className="truncate">{t('label')}</Label>
          <InfoIcon label={t('about')}>
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
        </div>

        <Slider
          aria-label={t('label')}
          className={cn(compact && 'min-w-[7rem] flex-1 sm:w-full')}
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
      </div>

      <div
        className={cn(
          'flex gap-1 text-[10px] text-muted-foreground sm:text-[11px]',
          compact && 'hidden sm:flex',
        )}
      >
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
    </div>
  );
}
