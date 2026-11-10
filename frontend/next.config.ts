import type { NextConfig } from 'next';
const devMode = process.env.INVENTORY_DEV_MODE === '1';
const apiOrigin = process.env.INVENTORY_API_ORIGIN;
const config: NextConfig = {
  ...(devMode
    ? { distDir: process.env.INVENTORY_DEV_DIST_DIR || '.next-dev' }
    : { output: 'export' }),
  turbopack: { root: __dirname },
  images: { unoptimized: true },
  poweredByHeader: false,
  ...(devMode && apiOrigin
    ? {
        async rewrites() {
          return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
        },
      }
    : {}),
};
export default config;
