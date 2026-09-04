import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The Vercel/Next build cannot bundle Cloudflare's virtual runtime module.
  // Vinext continues to use tsconfig.json and the real D1 implementation.
  typescript: {
    tsconfigPath: 'tsconfig.vercel.json',
  },
};

export default nextConfig;
