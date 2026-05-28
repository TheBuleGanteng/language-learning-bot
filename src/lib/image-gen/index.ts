import { GoogleImagenProvider } from './google';
import { OpenAIImageProvider } from './openai';
import { imageModelCost } from './catalog';
import type { ImageGenProvider, ImageProviderId } from './types';

interface MakeArgs {
  provider: ImageProviderId;
  model: string;
  apiKey: string;
}

export function makeImageProvider(args: MakeArgs): ImageGenProvider {
  if (args.provider === 'google') {
    return new GoogleImagenProvider({
      apiKey: args.apiKey,
      modelId: args.model,
      estimatedCostUsd: imageModelCost('google', args.model),
    });
  }
  if (args.provider === 'openai') {
    return new OpenAIImageProvider({
      apiKey: args.apiKey,
      modelId: args.model,
      estimatedCostUsd: imageModelCost('openai', args.model),
    });
  }
  throw new Error(`Unknown image provider: ${args.provider as string}`);
}

export type { ImageGenProvider, ImageGenRequest, ImageGenResult, ImageProviderId } from './types';
export {
  IMAGE_MODELS,
  IMAGE_PROVIDERS,
  imageModelCost,
  defaultImageModel,
  isImageProvider,
  isValidImageModel,
} from './catalog';
export type { ImageModelEntry } from './catalog';
export { buildImagePrompt } from './prompt';
