// Browser-side client for the OpenAI Realtime API over WebRTC.
//
// NOTE: This module talks to a live external API (mic + audio + the user's
// OpenAI key) and therefore cannot be exercised by the local test/build
// gates. It follows the documented Realtime WebRTC handshake and event names;
// runtime behaviour against the live API is not verified in this environment.
// See ERROR_REPORT.md.

const REALTIME_URL = 'https://api.openai.com/v1/realtime/calls';
// Fallback per-minute estimate when the caller doesn't supply a model-specific
// one (kept for back-compat; the avatar page now passes the selected voice
// model's estimate from src/lib/voice-models.ts).
const APPROX_USD_PER_MINUTE = 0.3;

export interface RealtimeSessionConfig {
  /** Short-lived ephemeral token from /api/avatar/token (NOT the raw key). */
  ephemeralToken: string;
  systemPrompt: string;
  /**
   * Approximate USD/min for the selected voice model (from voice-models.ts).
   * Falls back to the flat estimate when omitted so cost logging stays
   * consistent with what the user was shown in settings.
   */
  costPerMinute?: number;
  onSpeaking: () => void;
  onListening: () => void;
  onTranscript: (text: string, role: 'user' | 'assistant') => void;
  onError: (error: Error) => void;
  onSessionEnd: () => void;
  /** Optional — fired when the assistant finishes a turn (back to idle). */
  onIdle?: () => void;
}

export class RealtimeSession {
  private config: RealtimeSessionConfig;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private startedAt = 0;
  private endedAt = 0;
  private turnCount = 0;
  private assistantBuffer = '';

  constructor(config: RealtimeSessionConfig) {
    this.config = config;
  }

  /** Open the session. Must be called from within a user gesture (mic + iOS). */
  async start(): Promise<void> {
    try {
      // Request mic inside the user gesture (iOS Safari requirement).
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const pc = new RTCPeerConnection();
      this.pc = pc;

      // Remote audio playback. Created here (user gesture) so iOS allows it.
      this.audioEl = document.createElement('audio');
      this.audioEl.autoplay = true;
      pc.ontrack = (e) => {
        if (this.audioEl) this.audioEl.srcObject = e.streams[0];
        this.config.onSpeaking();
      };

      for (const track of this.micStream.getTracks()) {
        pc.addTrack(track, this.micStream);
      }

      const dc = pc.createDataChannel('oai-events');
      this.dc = dc;
      dc.onopen = () => this.configureSession();
      dc.onmessage = (e) => this.handleEvent(e.data);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch(REALTIME_URL, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${this.config.ephemeralToken}`,
          'Content-Type': 'application/sdp',
        },
      });
      if (!res.ok) {
        throw new Error(`Realtime handshake failed (${res.status})`);
      }
      const answer = await res.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });

      this.startedAt = Date.now();
    } catch (err) {
      const error =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? new Error('Microphone permission denied. Enable it to talk to Kruu Bingo.')
          : err instanceof Error
            ? err
            : new Error(String(err));
      this.cleanup();
      this.config.onError(error);
      throw error;
    }
  }

  private configureSession() {
    // Set the tutor persona + enable input transcription and server VAD.
    this.send({
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: this.config.systemPrompt,
        audio: {
          input: {
            transcription: { model: 'whisper-1' },
            turn_detection: { type: 'server_vad' },
          },
        },
      },
    });
    // Kick off the greeting.
    this.send({ type: 'response.create' });
  }

  private handleEvent(raw: string) {
    let evt: { type?: string; transcript?: string; delta?: string };
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    switch (evt.type) {
      case 'input_audio_buffer.speech_started':
        this.config.onListening();
        break;
      case 'response.audio.delta':
      case 'output_audio_buffer.started':
        this.config.onSpeaking();
        break;
      // AI/model transcript. GA renamed these to response.output_audio_transcript.*;
      // handle both GA and legacy beta names so captions work either way.
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
        this.assistantBuffer += evt.delta ?? '';
        break;
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
        if (this.assistantBuffer) {
          this.config.onTranscript(this.assistantBuffer, 'assistant');
          this.assistantBuffer = '';
        } else if (evt.transcript) {
          this.config.onTranscript(evt.transcript, 'assistant');
        }
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (evt.transcript) {
          this.turnCount += 1;
          this.config.onTranscript(evt.transcript, 'user');
        }
        break;
      case 'response.done':
        this.config.onIdle?.();
        break;
      case 'error': {
        const detail = (evt as { error?: { message?: string } }).error?.message ?? 'Realtime API error';
        console.error('Realtime API error event:', JSON.stringify(evt));
        this.config.onError(new Error(detail));
        break;
      }
    }
  }

  private send(obj: unknown) {
    if (this.dc && this.dc.readyState === 'open') {
      this.dc.send(JSON.stringify(obj));
    }
  }

  /**
   * Re-apply the persona/instruction text to the live session without tearing
   * down the connection — used when the user changes "Base language use"
   * mid-conversation. No-op until the data channel is open.
   */
  updateInstructions(newSystemPrompt: string): void {
    if (!this.dc || this.dc.readyState !== 'open') return;
    this.config.systemPrompt = newSystemPrompt;
    this.send({
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: newSystemPrompt,
      },
    });
  }

  /** Send a typed message (fallback for noisy environments / accessibility). */
  sendTextMessage(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.turnCount += 1;
    this.config.onTranscript(trimmed, 'user');
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: trimmed }],
      },
    });
    this.send({ type: 'response.create' });
  }

  async stop(): Promise<void> {
    this.endedAt = Date.now();
    this.cleanup();
    this.config.onSessionEnd();
  }

  private cleanup() {
    try {
      this.dc?.close();
    } catch {
      /* noop */
    }
    try {
      this.pc?.close();
    } catch {
      /* noop */
    }
    this.micStream?.getTracks().forEach((t) => t.stop());
    if (this.audioEl) {
      this.audioEl.srcObject = null;
      this.audioEl = null;
    }
    this.dc = null;
    this.pc = null;
    this.micStream = null;
  }

  getDurationSeconds(): number {
    if (!this.startedAt) return 0;
    const end = this.endedAt || Date.now();
    return Math.max(0, Math.round((end - this.startedAt) / 1000));
  }

  getTurnCount(): number {
    return this.turnCount;
  }

  /** Current session cost estimate in USD (duration-based; an estimate). */
  getEstimatedCost(): number {
    const perMinute = this.config.costPerMinute ?? APPROX_USD_PER_MINUTE;
    return (this.getDurationSeconds() / 60) * perMinute;
  }
}
