interface BuildPromptArgs {
  /** English word/phrase from the vocab's native_text column. */
  nativeText: string;
  /** Display name of the target language ("Thai", "Spanish", etc.) — context only. */
  targetLanguageName: string;
  /** Optional user-customized prompt; takes precedence over the default template. */
  override?: string | null;
}

const NO_TEXT_RULE =
  'Style: clean cartoon illustration, square aspect ratio, centered subject, ' +
  'simple background. NO text, letters, words, numbers, or signs of any kind in the image.';

export function buildImagePrompt(args: BuildPromptArgs): string {
  if (args.override && args.override.trim()) {
    return `${args.override.trim()}\n\n${NO_TEXT_RULE}`;
  }
  return `Generate a simple, friendly cartoon illustration depicting the concept of:
"${args.nativeText}" (vocabulary word for a learner of ${args.targetLanguageName})

Style requirements:
- Clean cartoon illustration
- Vivid colors but not garish
- Centered subject, white or simple background
- Square aspect ratio (1:1)
- NO text, letters, words, numbers, or signs of any kind in the image
- Concrete visual depiction, even for abstract concepts
- Neutral and inclusive depiction of people if applicable (no gender, ethnic, or age stereotypes)
- Family-friendly content

The image should help a language learner remember this word.`;
}
