// "Speech speed" — how fast the AI tutor speaks. A per-user, 3-level scale
// (Slow → Native). Modeled on base-language-use.ts and shared by the settings
// page, the voice chat pages, and the system-prompt builder.
//
// IMPORTANT: speed is applied by injecting a PACING INSTRUCTION into the session
// instructions — NOT via the OpenAI Realtime `speed` parameter (which only
// changes mechanical playback rate and sounds unnatural).

export const SPEECH_SPEED_LEVELS = ['slow', 'moderate', 'native'] as const;

export type SpeechSpeed = (typeof SPEECH_SPEED_LEVELS)[number];

const DEFAULT_LEVEL: SpeechSpeed = 'moderate';

export const SPEECH_SPEED_LABELS: Record<SpeechSpeed, string> = {
  slow: 'Slow',
  moderate: 'Moderate',
  native: 'Native',
};

export function isSpeechSpeed(v: unknown): v is SpeechSpeed {
  return typeof v === 'string' && (SPEECH_SPEED_LEVELS as readonly string[]).includes(v);
}

export function defaultSpeechSpeed(): SpeechSpeed {
  return DEFAULT_LEVEL;
}

/** User-facing help description for each level (used by the info tooltips). */
export function speechSpeedHelp(level: SpeechSpeed): string {
  switch (level) {
    case 'slow':
      return 'Kruu Bingo speaks slowly and clearly, with small pauses — easiest for beginners.';
    case 'moderate':
      return 'Kruu Bingo speaks at a relaxed, clear, learner-friendly pace.';
    case 'native':
      return 'Kruu Bingo speaks at a natural, fluent native pace.';
  }
}

/**
 * Pacing directive injected into the system prompt. This only changes the
 * SPEAKING PACE, never the wording.
 */
export function speechSpeedDirective(level: SpeechSpeed): string {
  switch (level) {
    case 'slow':
      return 'Speak slowly and clearly, with small pauses between phrases, so a beginner can follow. Do not change your wording — only slow your pace.';
    case 'moderate':
      return 'Speak at a relaxed, clear, learner-friendly pace — not rushed.';
    case 'native':
      return 'Speak at a natural, fluent native pace. Do not change your wording — just use a normal speaking speed.';
  }
}
