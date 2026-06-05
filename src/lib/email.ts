import { Resend } from 'resend';
import { getTranslations } from 'next-intl/server';
import { env } from './env';
import { normalizeLocale } from './locales';

// Lazily construct the Resend client so that an unset RESEND_API_KEY (e.g.,
// in MOCK_EMAIL mode or in tests) doesn't blow up at import time.
let _resend: Resend | null = null;
function resend(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set. Set MOCK_EMAIL=1 to log emails instead.');
  }
  if (!_resend) _resend = new Resend(env.RESEND_API_KEY);
  return _resend;
}

function logMock(label: string, to: string, link: string) {
  console.log(
    [
      '',
      '====================================================================',
      `MOCK EMAIL → ${label}`,
      `To: ${to}`,
      `Link: ${link}`,
      '====================================================================',
      '',
    ].join('\n'),
  );
}

/** Outcome of an email send so callers can surface real failures (no false success). */
export interface SendResult {
  ok: boolean;
  error?: string;
}

/**
 * Single send path. CRITICAL: Resend's SDK returns API failures in the resolved
 * `{ data, error }` object — it does NOT throw — so a domain/recipient rejection
 * (e.g. an unverified `from`) was previously invisible. We now inspect `error`
 * and return a real result.
 */
async function deliver(
  label: string,
  to: string,
  link: string,
  subject: string,
  html: string,
): Promise<SendResult> {
  if (env.MOCK_EMAIL) {
    logMock(label, to, link);
    return { ok: true };
  }
  try {
    const { error } = await resend().emails.send({ from: env.EMAIL_FROM, to, subject, html });
    if (error) {
      console.error(`Failed to send ${label} email:`, error);
      return { ok: false, error: error.message ?? 'Email provider rejected the send' };
    }
    return { ok: true };
  } catch (err) {
    console.error(`Failed to send ${label} email:`, err);
    return { ok: false, error: err instanceof Error ? err.message : 'Email send failed' };
  }
}

// Transactional emails are sent in the recipient's base language (C1). The
// caller passes the recipient's locale; we load that locale's `email` catalog.
export async function sendVerificationEmail(
  to: string,
  link: string,
  locale?: string | null,
): Promise<SendResult> {
  const t = await getTranslations({ locale: normalizeLocale(locale), namespace: 'email.verify' });
  return deliver(
    'Verification',
    to,
    link,
    t('subject'),
    [`<p>${t('body')}</p>`, `<p><a href="${link}">${t('cta')}</a></p>`, `<p>${link}</p>`].join('\n'),
  );
}

export async function sendPasswordResetEmail(
  to: string,
  link: string,
  locale?: string | null,
): Promise<SendResult> {
  const t = await getTranslations({ locale: normalizeLocale(locale), namespace: 'email.reset' });
  return deliver(
    'Password reset',
    to,
    link,
    t('subject'),
    [
      `<p>${t('body')}</p>`,
      `<p><a href="${link}">${t('cta')}</a></p>`,
      `<p>${link}</p>`,
      `<p>${t('ignore')}</p>`,
    ].join('\n'),
  );
}
