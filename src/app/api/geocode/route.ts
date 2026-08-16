import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

// --- Types ---

interface GeocodeRequestBody {
  query: string;
  dm_code?: string;
  dun_code?: string;
}

interface GeocodeSuccessResponse {
  dm_code: string | null;
  query: string;
  latitude: number;
  longitude: number;
  accuracy: string;
  source: string;
  formatted_address: string;
  cached: boolean;
  cache_expires_at?: string;
}

interface GeocodeFailResponse {
  dm_code: string | null;
  query: string;
  latitude: null;
  longitude: null;
  accuracy: 'unresolved';
  source: null;
  formatted_address: null;
  cached: boolean;
  tried: string[];
}

type GeocodeResponse = GeocodeSuccessResponse | GeocodeFailResponse;

// --- Constants ---

const SELANGOR_BOUNDS = {
  lng_min: 100.5,
  lng_max: 102.0,
  lat_min: 2.5,
  lat_max: 4.0,
} as const;

const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';

// --- Helpers ---

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/,\s*/g, ', ')
    .trim();
}

async function hashQuery(query: string): Promise<string> {
  const normalized = normalizeQuery(query);
  const data = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function isValidCoords(lat: number, lng: number): boolean {
  return (
    lat >= SELANGOR_BOUNDS.lat_min &&
    lat <= SELANGOR_BOUNDS.lat_max &&
    lng >= SELANGOR_BOUNDS.lng_min &&
    lng <= SELANGOR_BOUNDS.lng_max
  );
}

function mapGoogleLocationType(type: string): string {
  const map: Record<string, string> = {
    ROOFTOP: 'exact',
    RANGE_INTERPOLATED: 'exact',
    GEOMETRIC_CENTER: 'locality',
    APPROXIMATE: 'locality',
  };
  return map[type] || 'locality';
}

function mapNominatimType(type: string): string {
  if (['residential', 'suburb', 'neighbourhood', 'house', 'building', 'yes'].includes(type)) return 'exact';
  if (['village', 'town', 'hamlet', 'city_district', 'quarter'].includes(type)) return 'locality';
  if (['city', 'county', 'admin_level'].some(t => type.startsWith(t))) return 'district';
  return 'locality';
}

// --- Geocoders ---

async function geocodeGoogle(query: string, apiKey: string) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('components', 'country:MY');
  url.searchParams.set('key', apiKey);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  const data = (await res.json()) as any;

  if (data.status === 'OK' && data.results?.length > 0) {
    for (const r of data.results) {
      const lat: number = r.geometry.location.lat;
      const lng: number = r.geometry.location.lng;
      if (isValidCoords(lat, lng)) {
        return {
          latitude: lat,
          longitude: lng,
          accuracy: mapGoogleLocationType(r.geometry.location_type),
          source: 'google' as const,
          formatted_address: r.formatted_address as string,
          place_id: r.place_id as string,
        };
      }
    }
  }
  return null;
}

async function geocodeNominatim(query: string) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('countrycodes', 'my');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'SLGRVTRS-Dashboard/1.0 (research@ritz-analytics.workers.dev)',
    },
    signal: AbortSignal.timeout(8000),
  });
  const data = (await res.json()) as any[];

  if (data.length > 0) {
    const r = data[0];
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    if (isValidCoords(lat, lng)) {
      return {
        latitude: lat,
        longitude: lng,
        accuracy: mapNominatimType(r.type),
        source: 'nominatim' as const,
        formatted_address: r.display_name as string,
        place_id: `${r.osm_type}/${r.osm_id}` as string,
      };
    }
  }
  return null;
}

// --- Cache helpers (D1) ---

interface CachedRow {
  query_hash: string;
  raw_query: string;
  dm_code: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_level: string;
  source: string | null;
  formatted_address: string | null;
  expires_at: string;
}

// --- Route Handler ---

export async function POST(request: Request) {
  try {
    const { env } = await getCloudflareContext();
    const body = (await request.json()) as GeocodeRequestBody;
    const { query, dm_code, dun_code } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'query is required and must be a string' }, { status: 400 });
    }

    // 1. Check D1 cache
    const hash = await hashQuery(query);
    const cached = await env.DB.prepare(
      `SELECT * FROM geocode_cache WHERE query_hash = ? AND expires_at > datetime('now')`
    )
      .bind(hash)
      .first<CachedRow>();

    if (cached) {
      // Increment hit count (fire-and-forget)
      env.DB.prepare(`UPDATE geocode_cache SET hit_count = hit_count + 1 WHERE query_hash = ?`)
        .bind(hash)
        .run()
        .catch(() => {});

      if (cached.latitude !== null && cached.longitude !== null) {
        return NextResponse.json(
          {
            dm_code: cached.dm_code || dm_code || null,
            query,
            latitude: cached.latitude,
            longitude: cached.longitude,
            accuracy: cached.accuracy_level,
            source: cached.source,
            formatted_address: cached.formatted_address,
            cached: true,
            cache_expires_at: cached.expires_at,
          } satisfies GeocodeSuccessResponse,
          { headers: { 'Cache-Control': CACHE_CONTROL } }
        );
      }
      // Cached as unresolved — return cached failure
      if (cached.accuracy_level === 'unresolved') {
        return NextResponse.json(
          {
            dm_code: cached.dm_code || dm_code || null,
            query,
            latitude: null,
            longitude: null,
            accuracy: 'unresolved',
            source: null,
            formatted_address: null,
            cached: true,
            tried: [],
          } satisfies GeocodeFailResponse,
          { headers: { 'Cache-Control': CACHE_CONTROL } }
        );
      }
    }

    // 2. Google Maps (primary)
    const tried: string[] = [];
    let result: {
      latitude: number;
      longitude: number;
      accuracy: string;
      source: 'google' | 'nominatim';
      formatted_address: string;
      place_id: string;
    } | null = null;

    if (env.GOOGLE_GEOCODING_API_KEY) {
      tried.push('google');
      try {
        result = await geocodeGoogle(query, env.GOOGLE_GEOCODING_API_KEY);
      } catch (e) {
        console.error('Google geocoding error:', e);
      }
    }

    // 3. Nominatim (fallback)
    if (!result) {
      tried.push('nominatim');
      try {
        result = await geocodeNominatim(query);
      } catch (e) {
        console.error('Nominatim geocoding error:', e);
      }
    }

    // 4. Cache result
    const isResolved = result !== null;
    const ttl = result && result.source === 'google' ? '+30 days' : (result ? '+90 days' : '+7 days');

    await env.DB.prepare(
      `INSERT OR REPLACE INTO geocode_cache
       (query_hash, raw_query, dm_code, latitude, longitude,
        accuracy_level, source, formatted_address, place_id,
        expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), datetime('now'))`
    )
      .bind(
        hash,
        query,
        dm_code || null,
        result?.latitude ?? null,
        result?.longitude ?? null,
        result?.accuracy || 'unresolved',
        result?.source || null,
        result?.formatted_address || null,
        result?.place_id || null,
        ttl
      )
      .run();

    // 5. Return response
    if (isResolved && result) {
      return NextResponse.json(
        {
          dm_code: dm_code || null,
          query,
          latitude: result.latitude,
          longitude: result.longitude,
          accuracy: result.accuracy,
          source: result.source,
          formatted_address: result.formatted_address,
          cached: false,
        } satisfies GeocodeSuccessResponse,
        { headers: { 'Cache-Control': CACHE_CONTROL } }
      );
    }

    return NextResponse.json(
      {
        dm_code: dm_code || null,
        query,
        latitude: null,
        longitude: null,
        accuracy: 'unresolved',
        source: null,
        formatted_address: null,
        cached: false,
        tried,
      } satisfies GeocodeFailResponse,
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  } catch (error) {
    console.error('Geocode API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
