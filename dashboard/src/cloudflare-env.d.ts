import '@opennextjs/cloudflare';

declare global {
  interface CloudflareEnv {
    DB: D1Database;
    AI: Ai; // Cloudflare Workers AI binding
    GOOGLE_GEOCODING_API_KEY: string;
  }
}

export {};
