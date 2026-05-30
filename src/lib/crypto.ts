import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { env } from './env';

// Derive the key lazily on first use rather than at module load. Module-level
// derivation would call Buffer.from(undefined) and throw during `next build`,
// which imports this module (via sha256Hex etc.) while APP_ENCRYPTION_KEY is
// not yet present. The 32-byte validation still runs — just on first
// encrypt/decrypt at runtime, where the key is set.
let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const key = Buffer.from(env.APP_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `APP_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). ` +
        'Generate one with: openssl rand -base64 32',
    );
  }
  cachedKey = key;
  return key;
}

const IV_LEN = 12;
const TAG_LEN = 16;

export function encryptString(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptString(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function maskKey(key: string | null | undefined): string {
  if (!key) return '';
  if (key.length <= 8) return '•'.repeat(key.length || 4);
  return `${key.slice(0, 4)}${'•'.repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function generateToken(byteLength = 32): { token: string; tokenHash: string } {
  const token = randomBytes(byteLength).toString('base64url');
  return { token, tokenHash: sha256Hex(token) };
}
