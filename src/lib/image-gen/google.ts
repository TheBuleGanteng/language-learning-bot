import { GoogleGenAI } from '@google/genai';
import type { ImageGenProvider, ImageGenRequest, ImageGenResult } from './types';

interface GoogleImagenOptions {
  apiKey: string;
  modelId: string;
  estimatedCostUsd: number;
}

/** Map our catalog IDs to the actual API model name. */
const MODEL_MAP: Record<string, string> = {
  'imagen-4-fast': 'imagen-4.0-fast-generate-001',
  'imagen-4-standard': 'imagen-4.0-generate-001',
  'imagen-4-ultra': 'imagen-4.0-ultra-generate-001',
};

/** Heuristic for whether an error indicates a safety refusal vs. an outage. */
function isSafetyRefusal(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    msg.includes('safety') ||
    msg.includes('blocked') ||
    msg.includes('responsibleai') ||
    msg.includes('content policy') ||
    msg.includes('prohibited')
  );
}

export class GoogleImagenProvider implements ImageGenProvider {
  readonly providerId = 'google';
  readonly modelId: string;
  readonly estimatedCostUsd: number;
  private readonly apiModel: string;
  private readonly client: GoogleGenAI;

  constructor(opts: GoogleImagenOptions) {
    this.modelId = opts.modelId;
    this.estimatedCostUsd = opts.estimatedCostUsd;
    this.apiModel = MODEL_MAP[opts.modelId] ?? opts.modelId;
    this.client = new GoogleGenAI({ apiKey: opts.apiKey });
  }

  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    try {
      const res = await this.client.models.generateImages({
        model: this.apiModel,
        prompt: req.prompt,
        config: { numberOfImages: 1, aspectRatio: '1:1' },
      });
      // Be tolerant to SDK shape drift — the property is well-known but
      // typed loosely; fall back to a stringified inspection if shape
      // diverges from expectations.
      const images = (res as { generatedImages?: Array<{ image?: { imageBytes?: string } }> })
        .generatedImages;
      const b64 = images?.[0]?.image?.imageBytes;
      if (!b64) {
        return {
          status: 'refused',
          errorMessage:
            'No image returned (the prompt may have been filtered by Google safety).',
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
