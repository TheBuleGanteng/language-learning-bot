import { LocalStorageProvider } from './local';
import { GcsStorageProvider } from './gcs';
import type { StorageProvider } from './types';

let cached: StorageProvider | null = null;

export function storage(): StorageProvider {
  if (cached) return cached;
  const driver = process.env.STORAGE_DRIVER ?? 'local';
  if (driver === 'gcs') {
    const bucket = process.env.GCS_BUCKET;
    if (!bucket) throw new Error('GCS_BUCKET env var is required when STORAGE_DRIVER=gcs');
    cached = new GcsStorageProvider({ bucket });
  } else {
    cached = new LocalStorageProvider({
      baseDir: process.env.LOCAL_STORAGE_DIR ?? './storage',
    });
  }
  return cached;
}

/** Test-only: clear the cached storage instance. */
export function _resetStorageForTests(): void {
  cached = null;
}

export type { StorageProvider, FileMetadata } from './types';
export { LocalStorageProvider } from './local';
export { GcsStorageProvider } from './gcs';
