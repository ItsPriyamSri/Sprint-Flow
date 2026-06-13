import type { NextConfig } from 'next';
import path from 'path';

// Vercel builds its own optimised output; standalone is only needed for Docker.
const isVercel = Boolean(process.env['VERCEL']);

const nextConfig: NextConfig = {
  ...(isVercel
    ? {}
    : { output: 'standalone', outputFileTracingRoot: path.join(__dirname, '../../') }),
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
