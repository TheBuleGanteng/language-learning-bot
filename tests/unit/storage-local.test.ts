import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalStorageProvider } from '@/lib/storage';

let baseDir: string;
let provider: LocalStorageProvider;

beforeEach(async () => {
  baseDir = await fs.mkdtemp(join(tmpdir(), 'lang-storage-'));
  provider = new LocalStorageProvider({ baseDir });
});

afterEach(async () => {
  await fs.rm(baseDir, { recursive: true, force: true });
});

describe('LocalStorageProvider', () => {
  it('put / exists / getUrl / delete round-trip', async () => {
    const key = 'users/u1/lessons/L1/notes/sample.pdf';
    const buf = Buffer.from('hello pdf', 'utf8');

    const meta = await provider.put(key, buf, 'application/pdf');
    expect(meta.key).toBe(key);
    expect(meta.size).toBe(buf.length);
    expect(meta.contentType).toBe('application/pdf');

    expect(await provider.exists(key)).toBe(true);

    const url = await provider.getUrl(key);
    expect(url.startsWith('/api/files/')).toBe(true);
    expect(url).toContain('sample.pdf');

    await provider.delete(key);
    expect(await provider.exists(key)).toBe(false);
  });

  it('rejects path traversal in keys', async () => {
    await expect(
      provider.put('../escape.txt', Buffer.from('x'), 'text/plain'),
    ).rejects.toThrow(/Path traversal/);
    await expect(
      provider.put('users/u1/../../../etc/passwd', Buffer.from('x'), 'text/plain'),
    ).rejects.toThrow(/Path traversal/);
  });

  it('delete on a missing key is a no-op (no throw)', async () => {
    await expect(provider.delete('users/u1/missing.bin')).resolves.toBeUndefined();
  });

  it('URI-encodes path segments in getUrl', async () => {
    const key = 'users/u1/lessons/L1/notes/some file.pdf';
    const url = await provider.getUrl(key);
    // Spaces -> %20; the path separators remain literal slashes.
    expect(url).toBe('/api/files/users/u1/lessons/L1/notes/some%20file.pdf');
  });

  it('exists() reports false for unknown keys', async () => {
    expect(await provider.exists('users/u1/nope.pdf')).toBe(false);
  });

  it('putPublic accepts keys under public/ and produces a public URL', async () => {
    const key = 'public/users/u1/vocab/v1/abc.png';
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const meta = await provider.putPublic(key, buf, 'image/png');
    expect(meta.key).toBe(key);
    expect(meta.url).toBe('/api/files/public/users/u1/vocab/v1/abc.png');
    expect(await provider.exists(key)).toBe(true);
  });

  it('putPublic rejects keys outside public/', async () => {
    await expect(
      provider.putPublic('users/u1/private.png', Buffer.from('x'), 'image/png'),
    ).rejects.toThrow(/public\//);
  });
});
