import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Enable Cloudflare bindings (D1, R2, AI) in local `next dev`.
// MUST run before defining nextConfig. No-op in production builds.
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  // NO output: 'standalone' — OpenNext handles bundling for Cloudflare Workers
  // See: CLOUDFLARE_DEPLOYMENT.md §11, pip-melaka reference
  images: { unoptimized: true },
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  // Allow cross-origin access from the z.ai preview host so the in-IDE
  // "Preview Panel" can fetch Next.js dev resources (chunks, HMR, etc.)
  allowedDevOrigins: [
    "preview-chat-fcc1f2f5-c8fd-43c9-9739-0d169e3240ea.space-z.ai",
    "*.space-z.ai",
    "localhost:3000",
  ],
};

export default nextConfig;
