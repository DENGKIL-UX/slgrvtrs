import '@opennextjs/cloudflare';

declare global {
  interface CloudflareEnv {
    DB: D1Database;
    AI: Ai; // Cloudflare Workers AI binding
    TILES: R2Bucket; // R2 bucket for tiles + voter CSVs
    ASSETS: Fetcher;
    GOOGLE_GEOCODING_API_KEY: string;
  }
}

export {};
