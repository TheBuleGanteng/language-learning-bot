import Image from 'next/image';
import { withBase } from '@/lib/base-path';

/**
 * Single app-wide background layer, rendered once in the root layout behind all
 * content (authenticated and unauthenticated screens). Uses next/image, which
 * resolves under the prod base path (`/language-learning`) — a raw `<img src>`
 * or CSS `url(/…)` would 404 there. A translucent scrim keeps any text that
 * isn't on an opaque panel legible; content surfaces (cards, tables, navbar,
 * dialogs) carry their own solid backgrounds so the photo only shows through
 * gutters and empty areas.
 */
export function AppWallpaper() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <Image
        src={withBase('/img_wallpaper_login.png')}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px]" />
    </div>
  );
}
