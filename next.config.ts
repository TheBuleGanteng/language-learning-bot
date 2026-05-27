import type { NextConfig } from 'next';
import withPWAInit from '@ducanh2912/next-pwa';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  output: 'standalone',
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
};

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  // App is online-only; service worker provides install/standalone but
  // doesn't precache much.
  cacheOnFrontEndNav: false,
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
  },
});

export default withPWA(nextConfig);
