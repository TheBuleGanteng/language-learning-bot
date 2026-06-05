declare module 'heic-convert' {
  interface ConvertOptions {
    /** The input HEIC/HEIF file as a Buffer. */
    buffer: Buffer;
    /** Output format. */
    format: 'JPEG' | 'PNG';
    /** JPEG quality 0–1 (ignored for PNG). */
    quality?: number;
  }
  /** Converts a HEIC/HEIF buffer to JPEG/PNG, resolving with the output bytes. */
  function convert(options: ConvertOptions): Promise<ArrayBuffer>;
  export = convert;
}
