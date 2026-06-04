'use client';

import { useParams } from 'next/navigation';
import { VoiceChat } from '@/components/avatar/voice-chat';

/**
 * Deck-grounded Kruu Bingo voice practice. The full voice UI lives in the shared
 * VoiceChat component (also used by the deck-less "Free conversation" view, §7).
 */
export default function AvatarPage() {
  const { lang, deckId } = useParams<{ lang: string; deckId: string }>();
  return <VoiceChat mode="deck" lang={lang} deckId={deckId} />;
}
