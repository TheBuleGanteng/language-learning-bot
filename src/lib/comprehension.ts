// Per-word comprehension level, derived from FSRS memory stability or set
// manually. Pure + tested so the mapping has no DB/UI coupling.

export const COMPREHENSION_LEVELS = ['not_tested', 'low', 'medium', 'high'] as const;
export type ComprehensionLevel = (typeof COMPREHENSION_LEVELS)[number];

// Tunable. Stability is FSRS memory stability in days.
export const COMPREHENSION_STABILITY_THRESHOLDS = { lowMax: 7, mediumMax: 30 } as const;

export function isComprehensionLevel(v: unknown): v is ComprehensionLevel {
  return typeof v === 'string' && (COMPREHENSION_LEVELS as readonly string[]).includes(v);
}

/** Shared label + Tailwind color classes for the four levels (pure data; no React). */
export const COMPREHENSION_META: Record<
  ComprehensionLevel,
  { label: string; pill: string; dot: string }
> = {
  not_tested: {
    label: 'Not tested',
    pill: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
    dot: 'bg-gray-400',
  },
  low: {
    label: 'Low',
    pill: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    dot: 'bg-red-500',
  },
  medium: {
    label: 'Medium',
    pill: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
    dot: 'bg-yellow-500',
  },
  high: {
    label: 'High',
    pill: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
    dot: 'bg-green-500',
  },
};

/**
 * Map FSRS state to a comprehension level:
 *   not_tested  if never reviewed (reps === 0, or no FSRS row / null stability),
 *   low         if stability <  lowMax,
 *   medium      if lowMax <= stability < mediumMax,
 *   high        if stability >= mediumMax.
 *
 * Because the basis is *stability* (which only changes on review), the level is
 * stable between reviews — no time-decay churn. Recomputing from a fresh review
 * deterministically overwrites any prior (incl. manual) value.
 */
export function comprehensionFromStability(
  stability: number | null,
  reps: number,
): ComprehensionLevel {
  if (reps <= 0 || stability == null) return 'not_tested';
  const { lowMax, mediumMax } = COMPREHENSION_STABILITY_THRESHOLDS;
  if (stability < lowMax) return 'low';
  if (stability < mediumMax) return 'medium';
  return 'high';
}
