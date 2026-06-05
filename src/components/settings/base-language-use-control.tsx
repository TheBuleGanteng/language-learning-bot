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
   * Compact mode (e.g. the mobile avatar page): puts the label inline with the
   * slider and hides the tick labels below `sm` to save vertical space. Desktop
   * is unchanged.
   */
  compact?: boolean;
}

/**
 * Shared "Base language use" control: a discrete 5-position slider (All →
 * Never) plus an info icon. The info popover opens on hover/focus (desktop) AND
 * click/tap (mobile) — base-ui's PopoverTrigger keeps its click behavior when
 * `openOnHover` is added, so it works on touch where hover doesn't exist. It
 * shows the selected level's meaning and lists all five so each is discoverable.
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

  return (
    <div className={cn('space-y-2', className)}>
      <div className={cn(compact ? 'flex items-center gap-3 sm:block sm:space-y-2' : 'space-y-2')}>
      <div className="flex min-w-0 items-center gap-1.5">
        <Label className="truncate">{label}</Label>
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
      </div>

      <Slider
        aria-label={label}
        className={cn(compact && 'min-w-[7rem] flex-1 sm:w-full')}
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
      </div>

      {/* Equal-width, wrap-safe tick labels so long localized words never push
          the control past the viewport on mobile. Hidden on mobile in compact
          mode (the info tooltip still lists every level). */}
      <div
        className={cn(
          'flex gap-1 text-[10px] text-muted-foreground sm:text-[11px]',
          compact && 'hidden sm:flex',
        )}
      >
        {BASE_LANGUAGE_USE_LEVELS.map((lvl) => (
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
