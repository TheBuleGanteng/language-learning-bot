import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import type { Provider } from '@/lib/models';

// Server-side caption romanization via the user's selected text model + their
// decrypted key. Light work: transliterate one short line into tone-marked,
// learner-style Latin script. Output only the romanization.

function systemPrompt(targetLanguageName: string): string {
  return (
    `You transliterate ${targetLanguageName} text into tone-marked, learner-style ` +
    `phonetic Latin script (romanization). Output ONLY the romanization of the ` +
    `input — no original script, no translation, no commentary, no quotes.`
  );
}

export async function romanizeText(args: {
  provider: Provider;
  model: string;
  apiKey: string;
  text: string;
  targetLanguageName: string;
}): Promise<string> {
  const { provider, model, apiKey, text, targetLanguageName } = args;
  const trimmed = text.trim();
  if (!trimmed) return text;
  const system = systemPrompt(targetLanguageName);

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model,
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: trimmed }],
    });
    const block = res.content.find((b) => b.type === 'text');
    return block && block.type === 'text' ? block.text.trim() : '';
  }

  if (provider === 'openai') {
    const client = new OpenAI({ apiKey });
    const res = await client.chat.completions.create({
      model,
      max_completion_tokens: 512,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: trimmed },
      ],
    });
    return res.choices[0]?.message?.content?.trim() ?? '';
  }

  // google
  const client = new GoogleGenAI({ apiKey });
  const res = await client.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: trimmed }] }],
    config: { systemInstruction: system },
  });
  const out =
    (res as { text?: string }).text ??
    ((res as { response?: { text?: () => string } }).response?.text?.() ?? '');
  return out.trim();
}
