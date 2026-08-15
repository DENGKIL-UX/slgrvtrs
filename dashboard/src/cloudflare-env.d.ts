import '@opennextjs/cloudflare';

declare global {
  interface CloudflareEnv {
    DB: D1Database;
  }
}

export {};
