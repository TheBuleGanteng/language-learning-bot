import { Storage } from '@google-cloud/storage';
import type { FileMetadata, StorageProvider } from './types';

interface GcsOptions {
  bucket: string;
}

const SIGNED_URL_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class GcsStorageProvider implements StorageProvider {
  private readonly storage: Storage;
  private readonly bucketName: string;

  constructor(opts: GcsOptions) {
    this.storage = new Storage();
    this.bucketName = opts.bucket;
  }

  private bucket() {
    return this.storage.bucket(this.bucketName);
  }

  async put(key: string, data: Buffer, contentType: string): Promise<FileMetadata> {
    const file = this.bucket().file(key);
    await file.save(data, {
      contentType,
      resumable: false,
    });
    const [meta] = await file.getMetadata();
    return {
      key,
      url: await this.getUrl(key),
      size: typeof meta.size === 'number' ? meta.size : Number(meta.size ?? data.length),
      contentType,
      uploadedAt: meta.updated ? new Date(meta.updated) : new Date(),
    };
  }

  async delete(key: string): Promise<void> {
    const file = this.bucket().file(key);
    await file.delete({ ignoreNotFound: true });
  }

  async getUrl(key: string): Promise<string> {
    const [url] = await this.bucket().file(key).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + SIGNED_URL_TTL_MS,
    });
    return url;
  }

  async exists(key: string): Promise<boolean> {
    const [exists] = await this.bucket().file(key).exists();
    return exists;
  }
}
