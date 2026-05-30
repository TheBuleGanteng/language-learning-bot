import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import type { FileMetadata, StorageProvider } from './types';

interface LocalStorageOptions {
  baseDir: string;
}

export class LocalStorageProvider implements StorageProvider {
  private readonly baseDirAbs: string;

  constructor(opts: LocalStorageOptions) {
    this.baseDirAbs = resolve(opts.baseDir);
  }

  /**
   * Resolve a storage key to an absolute path under baseDir.
   * Throws if the resolved path escapes baseDir (defense against `..` keys).
   */
  resolveKey(key: string): string {
    const target = resolve(this.baseDirAbs, key);
    if (target !== this.baseDirAbs && !target.startsWith(this.baseDirAbs + '/')) {
      throw new Error('Path traversal rejected');
    }
    return target;
  }

  async put(key: string, data: Buffer, contentType: string): Promise<FileMetadata> {
    const abs = this.resolveKey(key);
    await fs.mkdir(dirname(abs), { recursive: true });
    await fs.writeFile(abs, data);
    const stat = await fs.stat(abs);
    return {
      key,
      url: await this.getUrl(key),
      size: stat.size,
      contentType,
      uploadedAt: stat.mtime,
    };
  }

  async putPublic(key: string, data: Buffer, contentType: string): Promise<FileMetadata> {
    if (!key.startsWith('public/')) {
      throw new Error('putPublic key must start with "public/"');
    }
    // Same on-disk layout — the public/* prefix is the marker that the
    // file route should skip the owner-auth check.
    return this.put(key, data, contentType);
  }

  async delete(key: string): Promise<void> {
    const abs = this.resolveKey(key);
    await fs.unlink(abs).catch((err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    });
  }

  async getUrl(key: string): Promise<string> {
    return this.publicUrl(key);
  }

  publicUrl(key: string): string {
    // The `/api/files/[...path]` route reads from disk + auth-checks.
    // We URI-encode each path segment (key may contain spaces or unicode).
    const segments = key.split('/').map((s) => encodeURIComponent(s));
    return `/api/files/${segments.join('/')}`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      const abs = this.resolveKey(key);
      await fs.access(abs);
      return true;
    } catch {
      return false;
    }
  }

  /** For the file-streaming route — read the file as a Buffer. */
  async read(key: string): Promise<Buffer> {
    const abs = this.resolveKey(key);
    return fs.readFile(abs);
  }

  /** Used by the streaming route for Content-Length. */
  async stat(key: string) {
    const abs = this.resolveKey(key);
    return fs.stat(abs);
  }

  /** Absolute path for a key, useful for streaming. */
  absPath(key: string): string {
    return this.resolveKey(key);
  }

  /** Base dir, exposed for security checks in the file route. */
  get baseDir(): string {
    return this.baseDirAbs;
  }
}
