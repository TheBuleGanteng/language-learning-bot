export interface ImageGenRequest {
  /** Full English prompt sent to the provider — already templated. */
  prompt: string;
}

export interface ImageGenResult {
  status: 'success' | 'refused' | 'failed';
  /** PNG bytes; present when status='success'. */
  imageBuffer?: Buffer;
  /** Always 'image/png' for v1 — both providers emit PNG by default. */
  contentType?: string;
  /** Present when status='refused' or 'failed'. */
  errorMessage?: string;
  /** Original provider response, kept for debugging. Not persisted. */
  rawProviderResponse?: unknown;
}

export interface ImageGenProvider {
  readonly providerId: string;
  readonly modelId: string;
  /** Estimated USD cost per image, looked up from the model catalog. */
  readonly estimatedCostUsd: number;
  generate(req: ImageGenRequest): Promise<ImageGenResult>;
}

export type ImageProviderId = 'google' | 'openai';
