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
      return 'About half the speed of natural native speech, with clear pauses — easiest for beginners.';
    case 'moderate':
      return 'About three-quarters the speed of natural native speech — slower, but still flowing.';
    case 'native':
      return 'Full natural, fluent native pace.';
  }
}

/**
 * Pacing directive injected into the system prompt. This only changes the
 * SPEAKING PACE, never the wording. The pace is expressed as an explicit
 * percentage of the model's OWN normal, native cadence (a concrete relative
 * anchor works better than vague adjectives like "slowly").
 */
export function speechSpeedDirective(level: SpeechSpeed): string {
  switch (level) {
    case 'slow':
      return 'Speak at roughly 50% of the cadence of normal, native speech — about half your natural speaking rate. Deliberately draw out each phrase and leave a clear pause between phrases and sentences, so a beginner can follow. This is a pace, not a wording change: do not simplify or shorten what you say — only slow down how fast you say it.';
    case 'moderate':
      return 'Speak at roughly 75% of the cadence of normal, native speech — noticeably slower than a native speaker but still smooth and flowing, with small pauses between phrases. This is a pace, not a wording change: do not simplify or shorten what you say — only adjust how fast you say it.';
    case 'native':
      return 'Speak at 100% of the cadence of normal, native speech — your natural, fluent native pace. Do not change your wording — just use a normal speaking speed.';
  }
}
