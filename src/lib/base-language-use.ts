// "Base language use" — how much the AI tutor mixes the user's base (native)
// language into the conversation. A per-user, 5-level scale from "All" (most
// base language) to "Never" (target language only). Shared by the settings
// page, the voice chat page, and the system-prompt builder.

export const BASE_LANGUAGE_USE_LEVELS = [
  'all',
  'frequent',
  'moderate',
  'rarely',
  'never',
] as const;

export type BaseLanguageUse = (typeof BASE_LANGUAGE_USE_LEVELS)[number];

const DEFAULT_LEVEL: BaseLanguageUse = 'moderate';

export const BASE_LANGUAGE_USE_LABELS: Record<BaseLanguageUse, string> = {
  all: 'All',
  frequent: 'Frequent',
  moderate: 'Moderate',
  rarely: 'Rarely',
  never: 'Never',
};

export function isBaseLanguageUse(v: unknown): v is BaseLanguageUse {
  return typeof v === 'string' && (BASE_LANGUAGE_USE_LEVELS as readonly string[]).includes(v);
}

export function defaultBaseLanguageUse(): BaseLanguageUse {
  return DEFAULT_LEVEL;
}

export interface LanguageNames {
  /** Target (studied) language name, e.g. "Thai". */
  target: string;
  /** Base (native) language name, e.g. "English". */
  base: string;
}

/** User-facing help description for each level (used by the info tooltips). */
export function baseLanguageUseHelp(level: BaseLanguageUse, names: LanguageNames): string {
  const { target, base } = names;
  switch (level) {
    case 'all':
      return `Everything is said in both ${target} and ${base}. Every ${target} phrase is followed by its ${base} translation.`;
    case 'frequent':
      return `The tutor uses ${base} often to support you, with ${target} woven in.`;
    case 'moderate':
      return `The tutor sometimes uses ${base} to clarify, aiming for a balance of ${target} and ${base}.`;
    case 'rarely':
      return `The tutor mostly uses ${target}; it only falls back to ${base} if you ask.`;
    case 'never':
      return `The tutor speaks only in ${target} and does not use ${base}.`;
  }
}

/**
 * Prompt directive injected into the system prompt. This only sets the RATIO
 * between {target} and {base}; the CRITICAL LANGUAGE RULE forbidding other
 * languages still applies separately.
 */
export function baseLanguageUseDirective(level: BaseLanguageUse, names: LanguageNames): string {
  const { target, base } = names;
  switch (level) {
    case 'all':
      return `Speak every sentence in ${target}, then immediately repeat it in ${base}. Always provide the ${base} translation.`;
    case 'frequent':
      return `Use ${base} frequently to scaffold understanding. Lead in ${base} and introduce ${target} gradually.`;
    case 'moderate':
      return `Balance ${target} and ${base}. Use ${base} to clarify when the student seems unsure, but keep meaningful ${target} in every turn.`;
    case 'rarely':
      return `Speak primarily in ${target}. Only use ${base} if the student explicitly asks for a translation or clarification.`;
    case 'never':
      return `Speak ONLY in ${target}. Do not use ${base} at all, even if asked — rephrase in simpler ${target} instead.`;
  }
}
