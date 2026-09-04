import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  webpack(config) {
    // The standard Next.js build runs on Vercel, where Cloudflare's virtual
    // `cloudflare:workers` module is unavailable. Sangat requests are securely
    // forwarded by the route handler, so this build only needs the compatible
    // fallback module at bundle time.
    config.resolve.alias['#db'] = path.resolve(process.cwd(), 'db/vercel.ts');
    return config;
  },
};

export default nextConfig;
