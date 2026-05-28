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
  delete(key: string): Promise<void>;
  /** Returns a URL the browser can fetch. */
  getUrl(key: string): Promise<string>;
  exists(key: string): Promise<boolean>;
}
