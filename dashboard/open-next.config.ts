import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const cloudflareConfig = defineCloudflareConfig({
  // Disable deferred incremental cache — avoids issues with Next.js 16
  // on Cloudflare Workers. Matches pip-melaka reference config.
  incrementalCache: { deferred: false } as any,
} as any);

export default {
  ...cloudflareConfig,
  // Use the standard Next.js build (not bun-specific)
  buildCommand: "npm run build",
} as any;
