import { z } from 'zod';
import type { ExtractedRow } from './types';

const rowSchema = z
  .object({
    targetText: z.string().min(1).max(500),
    nativeText: z.string().min(1).max(500),
    confidence: z.enum(['high', 'medium', 'low']).default('medium'),
  })
  // Tolerate extra fields the LLM may include
  .passthrough();

const responseSchema = z.object({
  rows: z.array(rowSchema),
});

/**
 * Parse a raw LLM JSON response into the typed row array. Strips markdown
 * code fences and leading/trailing prose if the provider didn't honour
 * a strict JSON-mode response_format.
 */
export function parseExtractionResponse(raw: string): ExtractedRow[] {
  const cleaned = stripCodeFences(raw).trim();
  // Try the full string first; if that fails, try to locate the first
  // {...} block in case the model added commentary around it.
  let candidate = cleaned;
  try {
    return finalize(JSON.parse(candidate));
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found in extraction response');
    candidate = match[0];
  }
  return finalize(JSON.parse(candidate));
}

function finalize(parsed: unknown): ExtractedRow[] {
  const result = responseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Extraction response did not match schema: ${result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return result.data.rows.map((r) => ({
    targetText: r.targetText.trim(),
    nativeText: r.nativeText.trim(),
    confidence: r.confidence,
  }));
}

function stripCodeFences(s: string): string {
  // Remove ```json ... ``` or ``` ... ```
  return s.replace(/^\s*```(?:json|JSON)?\s*\n?/, '').replace(/\n?```\s*$/, '');
}
