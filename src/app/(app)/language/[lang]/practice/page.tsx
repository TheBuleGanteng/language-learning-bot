'use client';

import { useParams } from 'next/navigation';
import { VoiceChat } from '@/components/avatar/voice-chat';

/**
 * Deck-less "Free conversation" Kruu Bingo voice chat (§7) — open-ended spoken
 * practice not tied to any deck's vocabulary. Reuses the shared VoiceChat
 * component in `free` mode (which uses the free-conversation system prompt and
 * does not touch any deck's "last studied").
 */
export default function PracticePage() {
  const { lang } = useParams<{ lang: string }>();
  return <VoiceChat mode="free" lang={lang} />;
}
