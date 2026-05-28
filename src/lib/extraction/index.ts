import { AnthropicExtractor } from './anthropic';
import { OpenAIExtractor } from './openai';
import { GoogleExtractor } from './google';
import type { ExtractorProvider } from './types';
import type { ExtractionProvider } from './catalog';

interface MakeArgs {
  provider: ExtractionProvider;
  model: string;
  apiKey: string;
}

export function makeExtractor(args: MakeArgs): ExtractorProvider {
  if (args.provider === 'anthropic') {
    return new AnthropicExtractor({ apiKey: args.apiKey, modelId: args.model });
  }
  if (args.provider === 'openai') {
    return new OpenAIExtractor({ apiKey: args.apiKey, modelId: args.model });
  }
  if (args.provider === 'google') {
    return new GoogleExtractor({ apiKey: args.apiKey, modelId: args.model });
  }
  throw new Error(`Unknown extraction provider: ${args.provider as string}`);
}

export type {
  ExtractedRow,
  ExtractionRequest,
  ExtractionResult,
  ExtractorProvider,
} from './types';
export {
  EXTRACTION_MODELS,
  EXTRACTION_PROVIDERS,
  defaultExtractionModel,
  isExtractionProvider,
  isValidExtractionModel,
} from './catalog';
export type { ExtractionProvider, ExtractionModelEntry } from './catalog';
export { parseExtractionResponse } from './parse';
