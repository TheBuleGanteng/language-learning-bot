import type { NextConfig } from 'next';
import withPWAInit from '@ducanh2912/next-pwa';
import createNextIntlPlugin from 'next-intl/plugin';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const isDev = process.env.NODE_ENV === 'development';

// next-intl (App Router, no i18n routing) — points at the request config that
// resolves the locale per request.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  output: 'standalone',
  // Keep packages with native/wasm assets out of the webpack bundle — they're
  // loaded from node_modules at runtime. heic-convert ships a libheif wasm;
  // sharp is a native addon.
  serverExternalPackages: ['heic-convert', 'sharp'],
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
};

// next-pwa relies on webpack. In dev we want Turbopack (Next 16 default), so
// only apply the PWA wrapper for production builds. The build script uses
// --webpack to switch off Turbopack for that pass.
const withPWA = withPWAInit({
  dest: 'public',
  disable: isDev,
  register: true,
  cacheOnFrontEndNav: false,
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
  },
});

export default isDev ? withNextIntl(nextConfig) : withNextIntl(withPWA(nextConfig));
