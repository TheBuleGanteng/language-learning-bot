// Hardcoded LLM provider/model catalog. Verify currency at each provider's
// pricing page before deploying. Last updated: May 2026.

export const PROVIDERS = ['anthropic', 'openai', 'google'] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface ModelOption {
  id: string;
  label: string;
  isDefault?: boolean;
}

export const MODELS: Record<Provider, ModelOption[]> = {
  anthropic: [
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7 (highest quality)' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (recommended)', isDefault: true },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fastest, cheapest)' },
  ],
  openai: [
    { id: 'gpt-5.5', label: 'GPT-5.5 (highest quality)' },
    { id: 'gpt-5.4', label: 'GPT-5.4 (balanced)' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini (recommended)', isDefault: true },
    { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano (cheapest)' },
  ],
  google: [
    { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro (highest quality)' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (recommended)', isDefault: true },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite (cheapest)' },
  ],
};

export function defaultModelFor(p: Provider): string {
  const def = MODELS[p].find((m) => m.isDefault);
  if (!def) throw new Error(`No default model declared for provider ${p}`);
  return def.id;
}

export function isProvider(s: string): s is Provider {
  return (PROVIDERS as readonly string[]).includes(s);
}

export function isValidModelForProvider(provider: Provider, modelId: string): boolean {
  return MODELS[provider].some((m) => m.id === modelId);
}
