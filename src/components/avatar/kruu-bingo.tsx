'use client';

import Lottie from 'lottie-react';
// public/ is at the project root; @/* resolves to ./src, so use a relative path.
import idleAnimation from '../../../public/animations/kruu-bingo-idle.json';
import speakingAnimation from '../../../public/animations/kruu-bingo-speaking.json';
import listeningAnimation from '../../../public/animations/kruu-bingo-listening.json';

type AvatarState = 'idle' | 'speaking' | 'listening';

interface KruuBingoProps {
  state: AvatarState;
  size?: number; // px, default 200
}

export function KruuBingo({ state, size = 200 }: KruuBingoProps) {
  const animation =
    state === 'speaking'
      ? speakingAnimation
      : state === 'listening'
        ? listeningAnimation
        : idleAnimation;

  return (
    <div
      style={{ width: size, height: size }}
      aria-label="Kruu Bingo, your Thai language tutor"
      role="img"
    >
      <Lottie
        animationData={animation}
        loop
        autoplay
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
