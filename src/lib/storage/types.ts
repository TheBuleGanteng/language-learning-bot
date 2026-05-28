export interface FileMetadata {
  /** Storage-internal key, e.g. "users/abc/lessons/def/notes/xyz.pdf". */
  key: string;
  /** Browser-loadable URL — signed for GCS, route URL for local. */
  url: string;
  size: number;
  contentType: string;
  uploadedAt: Date;
}

export interface StorageProvider {
  put(key: string, data: Buffer, contentType: string): Promise<FileMetadata>;
  /**
   * Like `put()` but the returned URL is publicly readable, cacheable, and
   * long-lived. Used for non-sensitive content (e.g., vocab images) where
   * the secret is the unguessable path itself. The key MUST start with
   * `public/`; the storage layer enforces this.
   *
   *  - Local FS: same on-disk path, but served by `/api/files/public/...`
   *    which skips the user-owns-key auth check.
   *  - GCS: uploaded with public-read ACL and a long `Cache-Control`;
   *    returns the direct `https://storage.googleapis.com/...` URL.
   */
  putPublic(key: string, data: Buffer, contentType: string): Promise<FileMetadata>;
  delete(key: string): Promise<void>;
  /** Returns a URL the browser can fetch. */
  getUrl(key: string): Promise<string>;
  exists(key: string): Promise<boolean>;
}
