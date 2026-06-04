import type { Provider } from '@/lib/models';

// Caption romanization is light work (transliterate one short line), so the
// catalog is intentionally a small set of cheap, capable text models — one per
// provider, matching ids in the chat catalog (src/lib/models.ts). The user's
// per-provider API key powers the call, and it's billed to ai_spend_log.
//
// `usdPer1kChars` is a rough estimate of the per-1K-character cost (input +
// output combined for a short caption) — refine with real pricing as needed.

export interface RomanizationModelEntry {
  id: string;
  label: string;
  provider: Provider;
  usdPer1kChars: number;
  isDefault?: boolean;
}

export const ROMANIZATION_MODELS: ReadonlyArray<RomanizationModelEntry> = [
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5 (recommended)',
    provider: 'anthropic',
    usdPer1kChars: 0.002,
    isDefault: true,
  },
  { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano', provider: 'openai', usdPer1kChars: 0.001 },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    provider: 'google',
    usdPer1kChars: 0.001,
  },
];

const DEFAULT_ID = 'claude-haiku-4-5';

export function isRomanizationModel(id: string): boolean {
  return ROMANIZATION_MODELS.some((m) => m.id === id);
}

export function defaultRomanizationModel(): string {
  return ROMANIZATION_MODELS.find((m) => m.isDefault)?.id ?? DEFAULT_ID;
}

export function romanizationModelProvider(id: string): Provider {
  return (
    ROMANIZATION_MODELS.find((m) => m.id === id)?.provider ??
    ROMANIZATION_MODELS.find((m) => m.isDefault)?.provider ??
    'anthropic'
  );
}

export function romanizationModelCostPer1kChars(id: string): number {
  return (
    ROMANIZATION_MODELS.find((m) => m.id === id)?.usdPer1kChars ??
    ROMANIZATION_MODELS.find((m) => m.isDefault)?.usdPer1kChars ??
    0.002
  );
}
