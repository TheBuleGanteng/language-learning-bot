import type { NextConfig } from 'next';
import withPWAInit from '@ducanh2912/next-pwa';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  output: 'standalone',
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

export default isDev ? nextConfig : withPWA(nextConfig);
