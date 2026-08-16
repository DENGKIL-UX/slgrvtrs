import '@opennextjs/cloudflare';

declare global {
  interface CloudflareEnv {
    DB: D1Database;
    GOOGLE_GEOCODING_API_KEY: string;
  }
}

export {};
