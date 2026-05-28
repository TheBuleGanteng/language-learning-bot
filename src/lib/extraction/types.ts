export interface ExtractionRequest {
  /** One or more images, base64-encoded (no data URL prefix). */
  imageBase64s: string[];
  /** Parallel array of MIME types. */
  imageMimeTypes: string[];
}

export interface ExtractedRow {
  /** Romanized Thai as written in the photo (tone marks preserved). */
  targetText: string;
  /** English translation. */
  nativeText: string;
  /** LLM's self-rating of legibility for this row. */
  confidence: 'high' | 'medium' | 'low';
}

export interface ExtractionResult {
  status: 'success' | 'refused' | 'failed';
  rows?: ExtractedRow[];
  errorMessage?: string;
  /** Original provider response, kept for debugging. Not persisted. */
  rawResponse?: unknown;
}

export interface ExtractorProvider {
  readonly providerId: string;
  readonly modelId: string;
  extract(req: ExtractionRequest): Promise<ExtractionResult>;
}
