// Deterministic name → palette index, so the same lesson/tag name always
// renders with the same pill color across the app and across reloads.
//
// Tailwind class strings appear here statically so the JIT picks them up.

export function djb2Hash(s: string): number {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) ^ s.charCodeAt(i);
  }
  return Math.abs(hash);
}

export interface PillColor {
  bg: string;
  text: string;
  ring: string;
}

// Lesson palette: 12 saturated, distinguishable colors.
export const LESSON_PALETTE: ReadonlyArray<PillColor> = [
  { bg: 'bg-sky-100',     text: 'text-sky-900',     ring: 'ring-sky-300' },
  { bg: 'bg-emerald-100', text: 'text-emerald-900', ring: 'ring-emerald-300' },
  { bg: 'bg-amber-100',   text: 'text-amber-900',   ring: 'ring-amber-300' },
  { bg: 'bg-rose-100',    text: 'text-rose-900',    ring: 'ring-rose-300' },
  { bg: 'bg-violet-100',  text: 'text-violet-900',  ring: 'ring-violet-300' },
  { bg: 'bg-cyan-100',    text: 'text-cyan-900',    ring: 'ring-cyan-300' },
  { bg: 'bg-lime-100',    text: 'text-lime-900',    ring: 'ring-lime-300' },
  { bg: 'bg-orange-100',  text: 'text-orange-900',  ring: 'ring-orange-300' },
  { bg: 'bg-pink-100',    text: 'text-pink-900',    ring: 'ring-pink-300' },
  { bg: 'bg-indigo-100',  text: 'text-indigo-900',  ring: 'ring-indigo-300' },
  { bg: 'bg-teal-100',    text: 'text-teal-900',    ring: 'ring-teal-300' },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-900', ring: 'ring-fuchsia-300' },
];

// Tag palette: muted/softer counterparts so the eye picks out lessons first.
export const TAG_PALETTE: ReadonlyArray<PillColor> = [
  { bg: 'bg-slate-100',   text: 'text-slate-700',   ring: 'ring-slate-200' },
  { bg: 'bg-stone-100',   text: 'text-stone-700',   ring: 'ring-stone-200' },
  { bg: 'bg-zinc-100',    text: 'text-zinc-700',    ring: 'ring-zinc-200' },
  { bg: 'bg-neutral-100', text: 'text-neutral-700', ring: 'ring-neutral-200' },
  { bg: 'bg-blue-50',     text: 'text-blue-800',    ring: 'ring-blue-200' },
  { bg: 'bg-green-50',    text: 'text-green-800',   ring: 'ring-green-200' },
  { bg: 'bg-yellow-50',   text: 'text-yellow-800',  ring: 'ring-yellow-200' },
  { bg: 'bg-red-50',      text: 'text-red-800',     ring: 'ring-red-200' },
  { bg: 'bg-purple-50',   text: 'text-purple-800',  ring: 'ring-purple-200' },
  { bg: 'bg-cyan-50',     text: 'text-cyan-800',    ring: 'ring-cyan-200' },
  { bg: 'bg-pink-50',     text: 'text-pink-800',    ring: 'ring-pink-200' },
  { bg: 'bg-orange-50',   text: 'text-orange-800',  ring: 'ring-orange-200' },
];

export function colorForLesson(name: string): PillColor {
  return LESSON_PALETTE[djb2Hash(name) % LESSON_PALETTE.length]!;
}

export function colorForTag(name: string): PillColor {
  return TAG_PALETTE[djb2Hash(name) % TAG_PALETTE.length]!;
}
