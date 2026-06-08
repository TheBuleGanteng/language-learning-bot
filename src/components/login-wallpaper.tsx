import Image from 'next/image';

/**
 * Full-page background for the unauthenticated pages (login / signup / landing).
 * Uses next/image, which prepends the configured `basePath`, so the asset
 * resolves under `/language-learning` in prod (a raw `<img src="/…">` or CSS
 * `url(/…)` would 404 there). A translucent scrim keeps forms legible.
 */
export function LoginWallpaper() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <Image
        src="/img_wallpaper_login.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-background/70 backdrop-blur-[1px]" />
    </div>
  );
}
