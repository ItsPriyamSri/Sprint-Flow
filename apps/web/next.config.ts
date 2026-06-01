import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // Required for the production Docker image (copies .next/standalone)
  output: 'standalone',
  // Point tracing root to the monorepo root so workspace packages are bundled
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@sprintflow/ui', '@sprintflow/shared'],

  // Security headers for the web frontend
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
