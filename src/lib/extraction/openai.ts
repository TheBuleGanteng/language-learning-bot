import OpenAI from 'openai';
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
    msg.includes('content_policy') ||
    msg.includes('content policy') ||
    msg.includes('moderation') ||
    msg.includes('rejected')
  );
}

export class OpenAIExtractor implements ExtractorProvider {
  readonly providerId = 'openai';
  readonly modelId: string;
  private readonly client: OpenAI;

  constructor(opts: Options) {
    this.modelId = opts.modelId;
    this.client = new OpenAI({ apiKey: opts.apiKey });
  }

  async extract(req: ExtractionRequest): Promise<ExtractionResult> {
    try {
      const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
        ...req.imageBase64s.map((data, i) => {
          const mt = req.imageMimeTypes[i] ?? 'image/jpeg';
          return {
            type: 'image_url' as const,
            image_url: { url: `data:${mt};base64,${data}` },
          };
        }),
        { type: 'text' as const, text: buildExtractionUserPrompt() },
      ];

      const res = await this.client.chat.completions.create({
        model: this.modelId,
        max_completion_tokens: 4096,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      });

      const text = res.choices[0]?.message?.content ?? '';
      if (!text) {
        return {
          status: 'failed',
          errorMessage: 'No text content in OpenAI response.',
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
