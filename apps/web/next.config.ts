import path from 'node:path';
import type { NextConfig } from 'next';

// One .env at the repository root serves every app. In production the
// variables come from the container environment and this file is absent.
try {
  process.loadEnvFile(path.join(__dirname, '../../.env'));
} catch {
  /* no .env: rely on the environment */
}

const nextConfig: NextConfig = {
  output: 'standalone',
  // Trace files from the monorepo root so the standalone build includes packages/*.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@zemmz/shared', '@zemmz/db'],
  serverExternalPackages: ['@prisma/client', '.prisma/client'],
  poweredByHeader: false,
  typedRoutes: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default nextConfig;
