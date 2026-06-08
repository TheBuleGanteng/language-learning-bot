import Image from 'next/image';
import { withBase } from '@/lib/base-path';

/**
 * Full-page background for the unauthenticated pages (login / signup / landing).
 * The asset must resolve under the prod base path (`/language-learning`). The
 * next/image optimizer does NOT prefix `basePath` onto its `url` param, so we
 * pass a base-path-prefixed `src` via withBase(); otherwise the optimizer
 * requests `/img_wallpaper_login.png` and 400s (the file only exists under the
 * base path). A translucent scrim keeps forms legible.
 */
export function LoginWallpaper() {
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
      <div className="absolute inset-0 bg-background/70 backdrop-blur-[1px]" />
    </div>
  );
}
