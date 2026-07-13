import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Vercel handles output automatically; standalone only for Docker
  ...(process.env.DOCKER_BUILD === '1' ? { output: 'standalone' } : {}),
  // Increase serverless function timeout for audio processing
  serverExternalPackages: ['fluent-ffmpeg'],
};

export default nextConfig;
