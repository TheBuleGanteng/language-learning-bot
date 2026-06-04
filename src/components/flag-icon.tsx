import { Languages } from 'lucide-react';
import {
  TH,
  GB,
  CN,
  JP,
  ES,
  FR,
  DE,
  US,
  TW,
  KR,
  ID,
  type FlagComponent,
} from 'country-flag-icons/react/3x2';

// SVG flags (NOT emoji — emoji flags don't render on Windows). Keyed by ISO
// 3166-1 alpha-2. Covers both the target-language catalog (languages.ts) and
// the base-language locale catalog (locales.ts: US, CN, TW, KR, ID).
const FLAGS: Record<string, FlagComponent> = {
  th: TH,
  gb: GB,
  cn: CN,
  jp: JP,
  es: ES,
  fr: FR,
  de: DE,
  us: US,
  tw: TW,
  kr: KR,
  id: ID,
};

/**
 * Renders a language's flag as an SVG. Falls back to a neutral Lucide
 * `Languages` icon when the country code is missing or unsupported.
 */
export function FlagIcon({
  country,
  title,
  className,
}: {
  country?: string;
  title?: string;
  className?: string;
}) {
  const Flag = country ? FLAGS[country.toLowerCase()] : undefined;
  if (!Flag) return <Languages className={className} aria-hidden />;
  return <Flag title={title} className={className} />;
}
