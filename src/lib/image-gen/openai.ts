import OpenAI from 'openai';
import type { ImageGenProvider, ImageGenRequest, ImageGenResult } from './types';

interface OpenAIImageOptions {
  apiKey: string;
  modelId: string;
  estimatedCostUsd: number;
}

/**
 * Map our catalog IDs to the actual OpenAI model name + quality tier.
 * gpt-image-1.5 expects a separate `quality` ('low' | 'medium' | 'high');
 * gpt-image-1-mini does not.
 */
function resolveApiCall(modelId: string): {
  model: string;
  quality?: 'low' | 'medium' | 'high';
} {
  switch (modelId) {
    case 'gpt-image-1-mini':
      return { model: 'gpt-image-1-mini' };
    case 'gpt-image-1.5-low':
      return { model: 'gpt-image-1.5', quality: 'low' };
    case 'gpt-image-1.5-standard':
      return { model: 'gpt-image-1.5', quality: 'medium' };
    case 'gpt-image-1.5-high':
      return { model: 'gpt-image-1.5', quality: 'high' };
    default:
      // Best-effort fallback: pass the catalog ID directly and skip quality.
      return { model: modelId };
  }
}

function isSafetyRefusal(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    msg.includes('safety') ||
    msg.includes('content_policy') ||
    msg.includes('content policy') ||
    msg.includes('moderation') ||
    msg.includes('rejected')
  );
}

export class OpenAIImageProvider implements ImageGenProvider {
  readonly providerId = 'openai';
  readonly modelId: string;
  readonly estimatedCostUsd: number;
  private readonly client: OpenAI;

  constructor(opts: OpenAIImageOptions) {
    this.modelId = opts.modelId;
    this.estimatedCostUsd = opts.estimatedCostUsd;
    this.client = new OpenAI({ apiKey: opts.apiKey });
  }

  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    const { model, quality } = resolveApiCall(this.modelId);
    try {
      const res = await this.client.images.generate({
        model,
        prompt: req.prompt,
        size: '1024x1024',
        n: 1,
        ...(quality ? { quality } : {}),
      });
      const b64 = res.data?.[0]?.b64_json;
      if (!b64) {
        return {
          status: 'refused',
          errorMessage:
            'OpenAI returned no image (likely a content-policy filter).',
          rawProviderResponse: res,
        };
      }
      return {
        status: 'success',
        imageBuffer: Buffer.from(b64, 'base64'),
        contentType: 'image/png',
        rawProviderResponse: res,
      };
    } catch (err) {
      if (isSafetyRefusal(err)) {
        return {
          status: 'refused',
          errorMessage: err instanceof Error ? err.message : String(err),
          rawProviderResponse: err,
        };
      }
      return {
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        rawProviderResponse: err,
      };
    }
  }
}
