import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NO output: 'standalone' — OpenNext handles bundling for Cloudflare Workers
  // See: CLOUDFLARE_DEPLOYMENT.md §11, pip-melaka reference
  images: { unoptimized: true },
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
