// R2 proxy API route — serves static assets from Cloudflare R2
// This reduces the Worker bundle size by offloading large GeoJSON/JSON files to R2.
// Falls back to fetching from R2 bucket.

import { NextRequest, NextResponse } from 'next/server';

// R2 paths that are available (mapped from public/)
const R2_PATHS = new Set([
  'boundaries/selangor_parliament.geojson',
  'boundaries/selangor_dun.geojson',
  'boundaries/selangor_outline.geojson',
  'boundaries/dm_centroids.geojson',
  'stats/parliament.json',
  'stats/dun.json',
]);

const CONTENT_TYPES: Record<string, string> = {
  '.geojson': 'application/geo+json',
  '.json': 'application/json',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const r2Key = segments.join('/');

  if (!R2_PATHS.has(r2Key)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Access R2 via environment binding (set by wrangler.jsonc)
  const env = (process as any).env;
  const TILES = env?.TILES as R2Bucket | undefined;

  if (TILES) {
    try {
      const object = await TILES.get(r2Key);
      if (object) {
        const ext = r2Key.substring(r2Key.lastIndexOf('.'));
        const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        if (object.httpMetadata?.cacheExpiry) {
          headers.set('Expires', object.httpMetadata.cacheExpiry.toUTCString());
        }
        return new NextResponse(object.body, { headers });
      }
    } catch (err) {
      console.error(`R2 fetch failed for ${r2Key}:`, err);
    }
  }

  // Fallback: redirect to public/ static file
  return NextResponse.redirect(new URL(`/${r2Key}`, request.url));
}

// Type declaration for R2Bucket binding
declare global {
  interface R2Bucket {
    get(key: string): Promise<R2ObjectBody | null>;
    put(key: string, value: ReadableStream | ArrayBuffer | string, options?: any): Promise<void>;
  }
  interface R2ObjectBody {
    body: ReadableStream;
    httpMetadata?: { cacheExpiry?: Date };
  }
}
