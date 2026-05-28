export const EXTRACTION_SYSTEM_PROMPT =
  'You extract vocabulary from textbook photos for a language learner. The user is studying Thai using romanized notation.';

export function buildExtractionUserPrompt(): string {
  return `I'm sharing one or more photos from my Thai language textbook. For each vocabulary word or phrase visible in the photos:

1. Extract the romanized Thai EXACTLY as written in the photo (preserve tone marks, special characters like ɛ, ǎ, ǐ, hyphens, etc.)
2. Provide the English translation
3. Rate your confidence in the extraction as "high", "medium", or "low" based on legibility

Critical instructions:
- ONLY extract entries that appear to be vocabulary list items (typically formatted as: word/phrase + translation, often in a list or table)
- Do NOT extract exercise text, instructions, section headers, page numbers, or illustration captions
- Do NOT invent or extrapolate words not visible in the photos
- Do NOT split a multi-word entry into separate rows (keep phrases together)
- Do NOT combine separate entries into one row
- If text is partially obscured or unclear, rate confidence as "low" and extract your best guess
- Across multiple photos, deduplicate identical entries (same target + same English)

Return your response as a valid JSON object matching this exact schema, with no additional commentary:

{
  "rows": [
    { "targetText": "...", "nativeText": "...", "confidence": "high" | "medium" | "low" }
  ]
}

If no vocabulary is visible in the photos, return { "rows": [] }.`;
}
