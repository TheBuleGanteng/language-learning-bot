'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isNonRomanScript } from '@/lib/languages';

export type CaptionLanguage = 'base' | 'target' | 'target_romanized';

/**
 * Degrade an invalid stored value defensively (§8): if 'target_romanized' is
 * selected but the target language is roman-script, treat it as 'target'.
 */
export function resolveCaptionLanguage(
  value: string | null | undefined,
  targetCode: string | null | undefined,
): CaptionLanguage {
  if (value === 'base') return 'base';
  if (value === 'target_romanized') {
    return isNonRomanScript(targetCode) ? 'target_romanized' : 'target';
  }
  return 'target';
}

interface Props {
  value: CaptionLanguage;
  onChange: (v: CaptionLanguage) => void;
  targetCode: string;
  targetName: string;
  baseName: string;
  disabled?: boolean;
  className?: string;
}

/** Caption-language picker: Base / Target / Target (romanized, non-roman only). */
export function CaptionLanguageSelect({
  value,
  onChange,
  targetCode,
  targetName,
  baseName,
  disabled,
  className,
}: Props) {
  const romanizedOffered = isNonRomanScript(targetCode);
  const effective = resolveCaptionLanguage(value, targetCode);

  const labelFor = (v: CaptionLanguage) =>
    v === 'base' ? baseName : v === 'target_romanized' ? `${targetName} (romanized)` : targetName;

  return (
    <Select
      value={effective}
      onValueChange={(v) => v && onChange(v as CaptionLanguage)}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue>{(v: string) => labelFor(v as CaptionLanguage)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="base">{baseName}</SelectItem>
        <SelectItem value="target">{targetName}</SelectItem>
        {romanizedOffered && (
          <SelectItem value="target_romanized">{targetName} (romanized)</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
