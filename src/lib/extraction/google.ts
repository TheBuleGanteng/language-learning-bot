import { GoogleGenAI } from '@google/genai';
import type { ExtractionRequest, ExtractionResult, ExtractorProvider } from './types';
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionUserPrompt } from './prompt';
import { parseExtractionResponse } from './parse';

interface Options {
  apiKey: string;
  modelId: string;
}

function isSafetyRefusal(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    msg.includes('safety') ||
    msg.includes('blocked') ||
    msg.includes('responsibleai') ||
    msg.includes('prohibited')
  );
}

export class GoogleExtractor implements ExtractorProvider {
  readonly providerId = 'google';
  readonly modelId: string;
  private readonly client: GoogleGenAI;

  constructor(opts: Options) {
    this.modelId = opts.modelId;
    this.client = new GoogleGenAI({ apiKey: opts.apiKey });
  }

  async extract(req: ExtractionRequest): Promise<ExtractionResult> {
    try {
      const parts = [
        ...req.imageBase64s.map((data, i) => ({
          inlineData: {
            mimeType: req.imageMimeTypes[i] ?? 'image/jpeg',
            data,
          },
        })),
        { text: buildExtractionUserPrompt() },
      ];

      const res = await this.client.models.generateContent({
        model: this.modelId,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: EXTRACTION_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
        },
      });

      // The SDK exposes `.text` as a string getter on the response.
      const text =
        (res as { text?: string }).text ??
        ((res as { response?: { text?: () => string } }).response?.text?.() ?? '');

      if (!text) {
        return {
          status: 'failed',
          errorMessage: 'No text content in Google response.',
          rawResponse: res,
        };
      }

      try {
        const rows = parseExtractionResponse(text);
        return { status: 'success', rows, rawResponse: res };
      } catch (parseErr) {
        return {
          status: 'failed',
          errorMessage:
            parseErr instanceof Error ? parseErr.message : 'Failed to parse response',
          rawResponse: res,
        };
      }
    } catch (err) {
      if (isSafetyRefusal(err)) {
        return {
          status: 'refused',
          errorMessage: err instanceof Error ? err.message : String(err),
          rawResponse: err,
        };
      }
      return {
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        rawResponse: err,
      };
    }
  }
}
