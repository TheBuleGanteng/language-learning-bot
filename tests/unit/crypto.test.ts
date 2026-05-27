import { describe, it, expect } from 'vitest';
import { encryptString, decryptString, maskKey, sha256Hex, generateToken } from '@/lib/crypto';

describe('crypto', () => {
  describe('encrypt/decrypt round-trip', () => {
    it('round-trips a short string', () => {
      const plain = 'hello world';
      const ct = encryptString(plain);
      expect(ct).not.toBe(plain);
      expect(decryptString(ct)).toBe(plain);
    });

    it('round-trips a realistic API key', () => {
      const plain = 'sk-ant-api03-' + 'x'.repeat(80);
      const ct = encryptString(plain);
      expect(decryptString(ct)).toBe(plain);
    });

    it('round-trips multibyte UTF-8 (Thai script)', () => {
      const plain = 'สวัสดีครับ';
      expect(decryptString(encryptString(plain))).toBe(plain);
    });

    it('produces different ciphertexts for the same plaintext (IV randomness)', () => {
      const plain = 'hello';
      const a = encryptString(plain);
      const b = encryptString(plain);
      expect(a).not.toBe(b);
      expect(decryptString(a)).toBe(plain);
      expect(decryptString(b)).toBe(plain);
    });

    it('throws on tampered ciphertext (auth tag detects mutation)', () => {
      const ct = encryptString('hello');
      const buf = Buffer.from(ct, 'base64');
      buf[buf.length - 1] ^= 0xff;
      const tampered = buf.toString('base64');
      expect(() => decryptString(tampered)).toThrow();
    });
  });

  describe('maskKey', () => {
    it('masks a normal key showing first 4 and last 4', () => {
      expect(maskKey('sk-ant-1234567890ABCDEF')).toBe('sk-a' + '•'.repeat(15) + 'CDEF');
    });

    it('returns empty string for null/undefined/empty', () => {
      expect(maskKey(null)).toBe('');
      expect(maskKey(undefined)).toBe('');
      expect(maskKey('')).toBe('');
    });

    it('fully masks a very short key', () => {
      expect(maskKey('abc')).toBe('•••');
      expect(maskKey('12345678')).toBe('••••••••');
    });
  });

  describe('sha256Hex', () => {
    it('produces a deterministic 64-char hex digest', () => {
      const h = sha256Hex('hello');
      expect(h).toMatch(/^[0-9a-f]{64}$/);
      expect(sha256Hex('hello')).toBe(h);
    });
  });

  describe('generateToken', () => {
    it('returns a token and matching sha256 hash', () => {
      const { token, tokenHash } = generateToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(tokenHash).toBe(sha256Hex(token));
    });

    it('returns a fresh token each call', () => {
      const a = generateToken();
      const b = generateToken();
      expect(a.token).not.toBe(b.token);
    });
  });
});
