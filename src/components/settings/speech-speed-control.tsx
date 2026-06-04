'use client';

import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { InfoIcon } from '@/components/ui/info-icon';
import {
  SPEECH_SPEED_LEVELS,
  SPEECH_SPEED_LABELS,
  speechSpeedHelp,
  type SpeechSpeed,
} from '@/lib/speech-speed';
import { cn } from '@/lib/utils';

interface Props {
  value: SpeechSpeed;
  onChange: (level: SpeechSpeed) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Shared "Speech speed" control: a discrete 3-position slider (Slow → Native)
 * plus an info icon — modeled exactly on the Base language use control. Controls
 * how fast Kruu Bingo speaks. The info popover opens on hover/focus (desktop)
 * AND tap (mobile).
 */
export function SpeechSpeedControl({ value, onChange, disabled, className }: Props) {
  const idx = Math.max(0, SPEECH_SPEED_LEVELS.indexOf(value));

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-1.5">
        <Label>Speech speed</Label>
        <InfoIcon label="About speech speed">
          <p className="font-medium">{SPEECH_SPEED_LABELS[value]}</p>
          <p className="text-muted-foreground">
            Controls how fast Kruu Bingo speaks. &quot;Slow&quot; is easiest for beginners.
          </p>
          <div className="mt-1 space-y-1 border-t pt-2">
            {SPEECH_SPEED_LEVELS.map((lvl) => (
              <p key={lvl} className="text-xs leading-snug">
                <span className="font-medium">{SPEECH_SPEED_LABELS[lvl]}:</span>{' '}
                <span className="text-muted-foreground">{speechSpeedHelp(lvl)}</span>
              </p>
            ))}
          </div>
        </InfoIcon>
      </div>

      <Slider
        aria-label="Speech speed"
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

      <div className="flex justify-between text-[11px] text-muted-foreground">
        {SPEECH_SPEED_LEVELS.map((lvl) => (
          <span key={lvl} className={cn(lvl === value && 'font-semibold text-foreground')}>
            {SPEECH_SPEED_LABELS[lvl]}
          </span>
        ))}
      </div>
    </div>
  );
}
