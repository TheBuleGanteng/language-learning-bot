'use client';

import { cn } from '@/lib/utils';

type AvatarState = 'idle' | 'speaking' | 'listening';

interface KruuBingoProps {
  state: AvatarState;
  size?: number; // px, default 200
}

/**
 * Kruu Bingo avatar.
 *
 * NOTE: This is a CSS/SVG placeholder. The spec (§7) calls for a Lottie
 * character from LottieFiles, but no asset could be fetched in this
 * environment, so a lightweight animated placeholder is used instead.
 * `lottie-react` is installed and ready: drop idle/speaking/listening JSON
 * into public/animations/ and swap this implementation for a <Lottie> player.
 * See ERROR_REPORT.md.
 */
export function KruuBingo({ state, size = 200 }: KruuBingoProps) {
  const ring =
    state === 'speaking'
      ? 'ring-green-400 animate-pulse'
      : state === 'listening'
        ? 'ring-blue-400 animate-pulse'
        : 'ring-muted';

  return (
    <div
      role="img"
      aria-label="Kruu Bingo, your Thai language tutor"
      className="flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <div
        className={cn(
          'relative flex items-center justify-center rounded-full bg-primary/10 ring-4 transition-all duration-300',
          ring,
        )}
        style={{ width: size * 0.8, height: size * 0.8 }}
      >
        {/* Simple friendly face */}
        <svg
          viewBox="0 0 100 100"
          width={size * 0.5}
          height={size * 0.5}
          aria-hidden="true"
        >
          <circle cx="35" cy="42" r="6" className="fill-foreground" />
          <circle cx="65" cy="42" r="6" className="fill-foreground" />
          {state === 'speaking' ? (
            <ellipse cx="50" cy="66" rx="14" ry="10" className="fill-foreground" />
          ) : (
            <path
              d="M34 64 Q50 76 66 64"
              className="stroke-foreground"
              strokeWidth="5"
              fill="none"
              strokeLinecap="round"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
