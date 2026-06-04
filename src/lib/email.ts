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

// Transactional emails are sent in the recipient's base language (C1). The
// caller passes the recipient's locale; we load that locale's `email` catalog.
export async function sendVerificationEmail(
  to: string,
  link: string,
  locale?: string | null,
): Promise<void> {
  if (env.MOCK_EMAIL) {
    logMock('Verification', to, link);
    return;
  }
  try {
    const t = await getTranslations({ locale: normalizeLocale(locale), namespace: 'email.verify' });
    await resend().emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: t('subject'),
      html: [
        `<p>${t('body')}</p>`,
        `<p><a href="${link}">${t('cta')}</a></p>`,
        `<p>${link}</p>`,
      ].join('\n'),
    });
  } catch (err) {
    console.error('Failed to send verification email:', err);
    // Swallow — caller returns generic success to user.
  }
}

export async function sendPasswordResetEmail(
  to: string,
  link: string,
  locale?: string | null,
): Promise<void> {
  if (env.MOCK_EMAIL) {
    logMock('Password reset', to, link);
    return;
  }
  try {
    const t = await getTranslations({ locale: normalizeLocale(locale), namespace: 'email.reset' });
    await resend().emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: t('subject'),
      html: [
        `<p>${t('body')}</p>`,
        `<p><a href="${link}">${t('cta')}</a></p>`,
        `<p>${link}</p>`,
        `<p>${t('ignore')}</p>`,
      ].join('\n'),
    });
  } catch (err) {
    console.error('Failed to send password reset email:', err);
  }
}
