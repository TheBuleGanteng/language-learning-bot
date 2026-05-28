import type { ImageProviderId } from './types';

export interface ImageModelEntry {
  id: string;
  label: string;
  costUsd: number;
  isDefault?: boolean;
}

/**
 * Image-generation pricing snapshot as of May 2026. Verify on provider
 * pricing pages before deployment — both Google Imagen and OpenAI
 * GPT-Image have been adjusting prices regularly.
 */
export const IMAGE_MODELS: Record<ImageProviderId, ReadonlyArray<ImageModelEntry>> = {
  google: [
    { id: 'imagen-4-fast', label: 'Imagen 4 Fast (recommended)', costUsd: 0.02, isDefault: true },
    { id: 'imagen-4-standard', label: 'Imagen 4 Standard', costUsd: 0.04 },
    { id: 'imagen-4-ultra', label: 'Imagen 4 Ultra (highest quality)', costUsd: 0.06 },
  ],
  openai: [
    { id: 'gpt-image-1-mini', label: 'GPT-Image 1 Mini (cheapest)', costUsd: 0.005 },
    { id: 'gpt-image-1.5-low', label: 'GPT-Image 1.5 Low', costUsd: 0.011 },
    { id: 'gpt-image-1.5-standard', label: 'GPT-Image 1.5 Standard', costUsd: 0.04 },
    { id: 'gpt-image-1.5-high', label: 'GPT-Image 1.5 High (premium)', costUsd: 0.167 },
  ],
};

export const IMAGE_PROVIDERS: ReadonlyArray<ImageProviderId> = ['google', 'openai'];

export function imageModelCost(provider: ImageProviderId, modelId: string): number {
  const list = IMAGE_MODELS[provider];
  if (!list) return 0;
  return list.find((m) => m.id === modelId)?.costUsd ?? 0;
}

export function defaultImageModel(provider: ImageProviderId): string {
  const list = IMAGE_MODELS[provider];
  const def = list.find((m) => m.isDefault) ?? list[0];
  if (!def) throw new Error(`No models declared for image provider ${provider}`);
  return def.id;
}

export function isImageProvider(s: string): s is ImageProviderId {
  return (IMAGE_PROVIDERS as readonly string[]).includes(s);
}

export function isValidImageModel(provider: ImageProviderId, modelId: string): boolean {
  return IMAGE_MODELS[provider].some((m) => m.id === modelId);
}
