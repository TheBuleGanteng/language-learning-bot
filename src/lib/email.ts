import { Resend } from 'resend';
import { env } from './env';

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
  // eslint-disable-next-line no-console
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

export async function sendVerificationEmail(to: string, link: string): Promise<void> {
  if (env.MOCK_EMAIL) {
    logMock('Verification', to, link);
    return;
  }
  try {
    await resend().emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: 'Verify your email for Language Learning Bot',
      html: [
        `<p>Welcome! Click below to verify your email:</p>`,
        `<p><a href="${link}">${link}</a></p>`,
        `<p>This link expires in 24 hours. If you didn't sign up, ignore this email.</p>`,
      ].join('\n'),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send verification email:', err);
    // Swallow — caller returns generic success to user.
  }
}

export async function sendPasswordResetEmail(to: string, link: string): Promise<void> {
  if (env.MOCK_EMAIL) {
    logMock('Password reset', to, link);
    return;
  }
  try {
    await resend().emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: 'Reset your Language Learning Bot password',
      html: [
        `<p>Click below to reset your password:</p>`,
        `<p><a href="${link}">${link}</a></p>`,
        `<p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>`,
      ].join('\n'),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send password reset email:', err);
  }
}
