import Anthropic from '@anthropic-ai/sdk';
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
    msg.includes('refused') ||
    msg.includes('content policy') ||
    msg.includes('safety') ||
    msg.includes('prohibited')
  );
}

/** Whitelist of mime types Anthropic's vision API accepts. */
type AnthropicImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

function isSupportedMediaType(s: string): s is AnthropicImageMediaType {
  return s === 'image/jpeg' || s === 'image/png' || s === 'image/gif' || s === 'image/webp';
}

export class AnthropicExtractor implements ExtractorProvider {
  readonly providerId = 'anthropic';
  readonly modelId: string;
  private readonly client: Anthropic;

  constructor(opts: Options) {
    this.modelId = opts.modelId;
    this.client = new Anthropic({ apiKey: opts.apiKey });
  }

  async extract(req: ExtractionRequest): Promise<ExtractionResult> {
    try {
      const userContent: Anthropic.MessageParam['content'] = [
        ...req.imageBase64s.map((data, i) => {
          const mt = req.imageMimeTypes[i] ?? 'image/jpeg';
          const mediaType: AnthropicImageMediaType = isSupportedMediaType(mt)
            ? mt
            : 'image/jpeg';
          return {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: mediaType,
              data,
            },
          };
        }),
        { type: 'text' as const, text: buildExtractionUserPrompt() },
      ];

      const res = await this.client.messages.create({
        model: this.modelId,
        max_tokens: 4096,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      });

      const textBlock = res.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        return {
          status: 'failed',
          errorMessage: 'No text content in Anthropic response.',
          rawResponse: res,
        };
      }

      try {
        const rows = parseExtractionResponse(textBlock.text);
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
