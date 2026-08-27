import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output required for Docker: produces .next/standalone with server.js
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Prisma types are generated at build time via `prisma generate && next build`
    // This allows the build to pass without a live database connection
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
