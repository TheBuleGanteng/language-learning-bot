// AI Voice Chat (Kruu Bingo) model catalog. ONLY OpenAI realtime
// speech-to-speech models valid for the `/v1/realtime/client_secrets` +
// `/v1/realtime/calls` flow belong here. Translation/transcription-only models
// (gpt-realtime-translate, gpt-realtime-whisper) are intentionally excluded —
// they are not general speech-to-speech tutors.
//
// Pricing note: realtime pricing is token-based (per 1M audio in/out tokens),
// so `approxUsdPerMinute` is an ESTIMATE derived from typical conversational
// audio density — the same approximation the old flat ~$0.30/min used. Keep
// these in one place so they're easy to refine as real usage data comes in.

export interface VoiceModelEntry {
  id: string;
  label: string;
  /** Approximate conversational cost per minute, USD (estimate — see note). */
  approxUsdPerMinute: number;
  isDefault?: boolean;
}

export const VOICE_MODELS: ReadonlyArray<VoiceModelEntry> = [
  { id: 'gpt-realtime', label: 'GPT Realtime (recommended)', approxUsdPerMinute: 0.3, isDefault: true },
  { id: 'gpt-realtime-1.5', label: 'GPT Realtime 1.5', approxUsdPerMinute: 0.3 },
  // GPT-5-class reasoning — materially pricier. Estimate to refine with real
  // usage data.
  { id: 'gpt-realtime-2', label: 'GPT Realtime 2 (highest quality)', approxUsdPerMinute: 0.6 },
];

const DEFAULT_VOICE_MODEL_ID = 'gpt-realtime';

export function isVoiceModel(id: string): boolean {
  return VOICE_MODELS.some((m) => m.id === id);
}

export function defaultVoiceModel(): string {
  return VOICE_MODELS.find((m) => m.isDefault)?.id ?? DEFAULT_VOICE_MODEL_ID;
}

export function voiceModelCostPerMinute(id: string): number {
  return (
    VOICE_MODELS.find((m) => m.id === id)?.approxUsdPerMinute ??
    VOICE_MODELS.find((m) => m.isDefault)?.approxUsdPerMinute ??
    0.3
  );
}
