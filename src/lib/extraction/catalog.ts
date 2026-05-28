export type ExtractionProvider = 'anthropic' | 'openai' | 'google';

export interface ExtractionModelEntry {
  id: string;
  label: string;
  isDefault?: boolean;
}

export const EXTRACTION_PROVIDERS: ReadonlyArray<ExtractionProvider> = [
  'anthropic',
  'openai',
  'google',
];

/**
 * Vision-capable models considered for photo vocabulary extraction. Pricing
 * isn't tracked here — that lives with the cost-tracking work and gets
 * folded in by a future unified LLM cost tracker.
 */
export const EXTRACTION_MODELS: Record<
  ExtractionProvider,
  ReadonlyArray<ExtractionModelEntry>
> = {
  anthropic: [
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7 (recommended)', isDefault: true },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (cheapest)' },
  ],
  openai: [
    { id: 'gpt-5', label: 'GPT-5' },
    { id: 'gpt-5-mini', label: 'GPT-5 mini' },
  ],
  google: [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
};

export function defaultExtractionModel(p: ExtractionProvider): string {
  const list = EXTRACTION_MODELS[p];
  return list.find((m) => m.isDefault)?.id ?? list[0].id;
}

export function isExtractionProvider(s: string): s is ExtractionProvider {
  return (EXTRACTION_PROVIDERS as readonly string[]).includes(s);
}

export function isValidExtractionModel(
  provider: ExtractionProvider,
  modelId: string,
): boolean {
  return EXTRACTION_MODELS[provider].some((m) => m.id === modelId);
}
