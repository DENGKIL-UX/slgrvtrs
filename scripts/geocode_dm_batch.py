#!/usr/bin/env python3
"""
Phase 5A: Batch geocode all 945 DM centroids.

Primary: Google Maps Geocoding API (45 QPS)
Fallback: Nominatim (1 QPS)
Storage: Cloudflare D1 (geocode_cache table + dms table update)

Usage:
    python scripts/geocode_dm_batch.py --google-key YOUR_KEY --cf-token CF_TOKEN
    python scripts/geocode_dm_batch.py --google-key YOUR_KEY --cf-token CF_TOKEN --dry-run
    python scripts/geocode_dm_batch.py --google-key YOUR_KEY --cf-token CF_TOKEN --force --limit 10
"""

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

# --- Configuration ---

CF_ACCOUNT_ID = '20b9d9b232ee8f29aa3e626530f0da09'
CF_DATABASE_ID = '59afb76e-a3a2-4e2a-b18d-857f9f5704fb'
D1_HTTP_API = f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_DATABASE_ID}/query'

SELANGOR_BOUNDS = {'lng_min': 100.5, 'lng_max': 102.0, 'lat_min': 2.5, 'lat_max': 4.0}

# Malay transliteration fixes
MALAY_FIXES = {
    'SEKSIEN': 'Seksyen', 'SEXSIEN': 'Seksyen', 'SEKSYEN': 'Seksyen',
    'KAMPUNG': 'Kampung',
    'TAMAN': 'Taman',
    'BANDAR': 'Bandar',
    'JALAN': 'Jalan',
    'PERSIARAN': 'Persiaran',
    'LEBUH': 'Lebuh',
    'MUKIM': 'Mukim',
    'LOT': 'Lot',
    'BLOK': 'Blok',
    'PUSAT': 'Pusat',
}

# --- Rate Limiters ---

class RateLimiter:
    """Token-bucket-style rate limiter with sleep."""
    def __init__(self, qps: float):
        self.min_interval = 1.0 / qps
        self.last_request = 0.0

    def wait(self):
        now = time.monotonic()
        elapsed = now - self.last_request
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self.last_request = time.monotonic()


class Progress:
    """Simple progress printer."""
    def __init__(self, total: int):
        self.total = total
        self.done = 0
        self.google_ok = 0
        self.nominatim_ok = 0
        self.unresolved = 0
        self.cached_skip = 0

    def tick(self, source: str):
        self.done += 1
        if source == 'google':
            self.google_ok += 1
        elif source == 'nominatim':
            self.nominatim_ok += 1
        elif source == 'unresolved':
            self.unresolved += 1
        elif source == 'cached':
            self.cached_skip += 1

        if self.done % 50 == 0 or self.done == self.total:
            print(f'  [{self.done}/{self.total}] google={self.google_ok} nominatim={self.nominatim_ok} unresolved={self.unresolved} cached={self.cached_skip}')


# --- Helpers ---

def hash_query(query: str) -> str:
    normalized = re.sub(r'\s+', ' ', query.lower())
    normalized = re.sub(r',\s*', ', ', normalized).strip()
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()


def load_dms_from_d1(cf_token):
    """Load all DMs with DUN names from D1."""
    payload = json.dumps({
        'sql': '''SELECT d.dm_code, d.name as dm_name, d.dun_code, d.dun_prefix,
                  d.centroid_lng, d.centroid_lat,
                  dn.name as dun_name
                  FROM dms d
                  LEFT JOIN duns dn ON d.dun_code = dn.code_dun
                  ORDER BY d.dm_code''',
        'params': []
    }).encode('utf-8')

    req = urllib.request.Request(D1_HTTP_API,
        data=payload,
        headers={
            'Authorization': f'Bearer {cf_token}',
            'Content-Type': 'application/json',
        })
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())

    if not data.get('success'):
        print(f'ERROR: D1 query failed: {data}')
        sys.exit(1)

    return data['result'][0]['results']


def load_cached_hashes(cf_token):
    """Load all non-expired query hashes from geocode_cache."""
    payload = json.dumps({
        'sql': "SELECT query_hash FROM geocode_cache WHERE expires_at > datetime('now')",
        'params': []
    }).encode('utf-8')

    req = urllib.request.Request(D1_HTTP_API,
        data=payload,
        headers={
            'Authorization': f'Bearer {cf_token}',
            'Content-Type': 'application/json',
        })
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())

    if not data.get('success'):
        return set()

    return {row['query_hash'] for row in data['result'][0]['results']}


def build_geocode_query(dm_code, dun_name):
    """Construct geocoding query from DM code and DUN name."""
    # Strip numeric prefix: "01.BANDAR COUNTRY HOME 1" -> "BANDAR COUNTRY HOME 1"
    if '.' in dm_code:
        name = dm_code.split('.', 1)[1]
    else:
        name = dm_code

    # Apply Malay transliteration fixes
    for old, new in MALAY_FIXES.items():
        name = name.replace(old, new)

    # Title-case it properly
    name = name.title()

    # Build hierarchical query
    if dun_name:
        dun_clean = dun_name.title()
        return f'{name}, {dun_clean}, Selangor, Malaysia'
    return f'{name}, Selangor, Malaysia'


def is_valid_coords(lat, lng):
    return (SELANGOR_BOUNDS['lng_min'] <= lng <= SELANGOR_BOUNDS['lng_max'] and
            SELANGOR_BOUNDS['lat_min'] <= lat <= SELANGOR_BOUNDS['lat_max'])


def geocode_google(query, api_key):
    """Geocode using Google Maps API. Returns result dict or None."""
    params = urllib.parse.urlencode({
        'address': query,
        'components': 'country:MY',
        'key': api_key,
    })
    url = f'https://maps.googleapis.com/maps/api/geocode/json?{params}'

    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        print(f'    Google network error: {e}')
        return None

    if data.get('status') == 'OK' and data.get('results'):
        for r in data['results']:
            lat = r['geometry']['location']['lat']
            lng = r['geometry']['location']['lng']
            if is_valid_coords(lat, lng):
                loc_type = r['geometry'].get('location_type', 'APPROXIMATE')
                accuracy_map = {
                    'ROOFTOP': 'exact',
                    'RANGE_INTERPOLATED': 'exact',
                    'GEOMETRIC_CENTER': 'locality',
                    'APPROXIMATE': 'locality',
                }
                return {
                    'latitude': lat,
                    'longitude': lng,
                    'accuracy': accuracy_map.get(loc_type, 'locality'),
                    'source': 'google',
                    'formatted_address': r.get('formatted_address', ''),
                    'place_id': r.get('place_id', ''),
                }
    return None


def geocode_nominatim(query):
    """Geocode using Nominatim. Returns result dict or None."""
    params = urllib.parse.urlencode({
        'q': query,
        'countrycodes': 'my',
        'format': 'jsonv2',
        'limit': '1',
        'addressdetails': '1',
    })
    url = f'https://nominatim.openstreetmap.org/search?{params}'

    req = urllib.request.Request(url, headers={
        'User-Agent': 'SLGRVTRS-Dashboard/1.0 (research@ritz-analytics.workers.dev)',
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        print(f'    Nominatim network error: {e}')
        return None

    if isinstance(data, list) and len(data) > 0:
        r = data[0]
        lat = float(r['lat'])
        lng = float(r['lon'])
        if is_valid_coords(lat, lng):
            n_type = r.get('type', '')
            exact_types = {'residential', 'suburb', 'neighbourhood', 'house', 'building', 'yes'}
            locality_types = {'village', 'town', 'hamlet', 'city_district', 'quarter'}
            if n_type in exact_types:
                accuracy = 'exact'
            elif n_type in locality_types:
                accuracy = 'locality'
            else:
                accuracy = 'locality'
            return {
                'latitude': lat,
                'longitude': lng,
                'accuracy': accuracy,
                'source': 'nominatim',
                'formatted_address': r.get('display_name', ''),
                'place_id': f"{r.get('osm_type', '')}/{r.get('osm_id', '')}",
            }
    return None


def sql_escape(val):
    """Escape a string value for SQL inlining."""
    if val is None:
        return 'NULL'
    if isinstance(val, (int, float)):
        return repr(val)
    return "'" + str(val).replace("'", "''") + "'"


def write_cache_to_d1(cf_token, results):
    """Write geocode results to D1 geocode_cache table.
    D1 HTTP API accepts a single {sql, params} object per request.
    We batch multiple INSERTs into one multi-statement SQL string."""
    if not results:
        return

    batch_size = 20
    total = len(results)
    for i in range(0, total, batch_size):
        batch = results[i:i + batch_size]
        # Build multi-statement SQL with inlined values
        sql_parts = []
        for r in batch:
            sql_parts.append(
                "INSERT OR REPLACE INTO geocode_cache "
                "(query_hash, raw_query, dm_code, latitude, longitude, "
                " accuracy_level, source, formatted_address, place_id, "
                " country_code, state, expires_at, updated_at) VALUES ("
                f"{sql_escape(r['query_hash'])}, {sql_escape(r['raw_query'])}, "
                f"{sql_escape(r['dm_code'])}, {sql_escape(r['latitude'])}, {sql_escape(r['longitude'])}, "
                f"{sql_escape(r['accuracy'])}, {sql_escape(r['source'])}, {sql_escape(r['formatted_address'])}, "
                f"{sql_escape(r['place_id'])}, 'MY', 'Selangor', "
                f"datetime('now', {sql_escape(r['ttl'])}), datetime('now'))"
            )
        combined_sql = '; '.join(sql_parts)

        payload = json.dumps({'sql': combined_sql, 'params': []}).encode('utf-8')
        req = urllib.request.Request(D1_HTTP_API,
            data=payload,
            headers={
                'Authorization': f'Bearer {cf_token}',
                'Content-Type': 'application/json',
            })
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read())
                if not data.get('success'):
                    errors = data.get('errors', [])
                    # Log first error detail for debugging
                    err_msg = errors[0].get('message', str(errors)) if errors else 'unknown'
                    print(f'  WARNING: batch write failed at offset {i}: {err_msg}')
        except Exception as e:
            print(f'  WARNING: batch write error at offset {i}: {e}')

        if (i + batch_size) % 100 == 0 or i + batch_size >= total:
            print(f'    Cache write progress: {min(i + batch_size, total)}/{total}')


def update_dm_centroids(cf_token, updates):
    """Update dms.centroid_lng/centroid_lat with geocoded coordinates."""
    if not updates:
        return

    batch_size = 20
    total = len(updates)
    for i in range(0, total, batch_size):
        batch = updates[i:i + batch_size]
        sql_parts = []
        for u in batch:
            sql_parts.append(
                f"UPDATE dms SET centroid_lng = {u['longitude']}, "
                f"centroid_lat = {u['latitude']}, updated_at = datetime('now') "
                f"WHERE dm_code = {sql_escape(u['dm_code'])}"
            )
        combined_sql = '; '.join(sql_parts)

        payload = json.dumps({'sql': combined_sql, 'params': []}).encode('utf-8')
        req = urllib.request.Request(D1_HTTP_API,
            data=payload,
            headers={
                'Authorization': f'Bearer {cf_token}',
                'Content-Type': 'application/json',
            })
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read())
                if not data.get('success'):
                    errors = data.get('errors', [])
                    err_msg = errors[0].get('message', str(errors)) if errors else 'unknown'
                    print(f'  WARNING: DM update failed at offset {i}: {err_msg}')
        except Exception as e:
            print(f'  WARNING: DM update error at offset {i}: {e}')

        if (i + batch_size) % 100 == 0 or i + batch_size >= total:
            print(f'    DM update progress: {min(i + batch_size, total)}/{total}')


def regenerate_geojson(cf_token, dms, output_path):
    """Regenerate dm_centroids.geojson from D1 data."""
    features = []
    for dm in dms:
        lng = dm.get('centroid_lng')
        lat = dm.get('centroid_lat')
        if lng is None or lat is None or (lng == 0 and lat == 0):
            continue

        props = {
            'dm_code': dm['dm_code'],
            'dun_code': dm.get('dun_code', ''),
            'dun_prefix': dm.get('dun_prefix', ''),
            'code_parlimen': dm.get('code_parlimen', ''),
            'total_voters': dm.get('total_voters', 0),
            'male': dm.get('male', 0),
            'female': dm.get('female', 0),
            'male_pct': dm.get('male_pct', 0),
            'female_pct': dm.get('female_pct', 0),
            'malay_pct': dm.get('malay_pct', 0),
            'chinese_pct': dm.get('chinese_pct', 0),
            'indian_pct': dm.get('indian_pct', 0),
            'other_pct': dm.get('other_pct', 0),
            'age_mean': dm.get('age_mean', 0),
            'age_median': dm.get('age_median', 0),
            'contact_pct': dm.get('contact_pct', 0),
            'male_malay': dm.get('male_malay', 0),
            'male_chinese': dm.get('male_chinese', 0),
            'male_indian': dm.get('male_indian', 0),
            'male_other': dm.get('male_other', 0),
            'female_malay': dm.get('female_malay', 0),
            'female_chinese': dm.get('female_chinese', 0),
            'female_indian': dm.get('female_indian', 0),
            'female_other': dm.get('female_other', 0),
        }

        features.append({
            'type': 'Feature',
            'geometry': {
                'type': 'Point',
                'coordinates': [lng, lat],
            },
            'properties': props,
        })

    geojson = {
        'type': 'FeatureCollection',
        'features': features,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(',', ':'))

    print(f'  Regenerated {output_path}: {len(features)} features')


def load_dms_with_all_fields(cf_token):
    """Load all DMs with full field set for GeoJSON regeneration."""
    payload = json.dumps({
        'sql': 'SELECT * FROM dms ORDER BY dm_code',
        'params': []
    }).encode('utf-8')

    req = urllib.request.Request(D1_HTTP_API,
        data=payload,
        headers={
            'Authorization': f'Bearer {cf_token}',
            'Content-Type': 'application/json',
        })
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())

    if not data.get('success'):
        print(f'ERROR: D1 query failed: {data}')
        sys.exit(1)

    return data['result'][0]['results']


# --- Main ---

def main():
    parser = argparse.ArgumentParser(description='Phase 5A: Batch geocode DM centroids')
    parser.add_argument('--google-key', help='Google Maps Geocoding API key')
    parser.add_argument('--cf-token', help='Cloudflare API token for D1 access')
    parser.add_argument('--geojson-only', action='store_true',
                        help='Only regenerate dm_centroids.geojson from D1 (skip geocoding)')
    parser.add_argument('--force', action='store_true', help='Re-geocode even if cached')
    parser.add_argument('--limit', type=int, default=0, help='Max DMs to process (0 = all)')
    parser.add_argument('--dry-run', action='store_true', help='Preview what would be geocoded')
    parser.add_argument('--google-qps', type=float, default=45, help='Google QPS (default: 45)')
    parser.add_argument('--nominatim-qps', type=float, default=1, help='Nominatim QPS (default: 1)')
    parser.add_argument('--source', choices=['google', 'nominatim', 'auto'], default='auto',
                        help='Geocoding source: google, nominatim, or auto (try google first)')
    parser.add_argument('--skip-update-dms', action='store_true',
                        help='Skip updating dms table (only populate cache)')
    parser.add_argument('--skip-geojson', action='store_true',
                        help='Skip regenerating static GeoJSON file')
    args = parser.parse_args()

    # Validate required args
    if not args.geojson_only:
        if not args.google_key or not args.cf_token:
            parser.error('--google-key and --cf-token required (unless --geojson-only)')
    if args.geojson_only and not args.cf_token:
        parser.error('--cf-token required for --geojson-only')

    # --geojson-only mode: just regenerate static file from D1
    if args.geojson_only:
        print('GeoJSON-only mode: regenerating dm_centroids.geojson from D1...')
        all_dms = load_dms_with_all_fields(args.cf_token)
        repo_root = Path(__file__).resolve().parent.parent
        geojson_path = repo_root / 'dashboard' / 'public' / 'boundaries' / 'dm_centroids.geojson'
        regenerate_geojson(args.cf_token, all_dms, geojson_path)
        return

    google_limiter = RateLimiter(args.google_qps)
    nominatim_limiter = RateLimiter(args.nominatim_qps)

    # Load DMs
    print('Loading DMs from D1...')
    dms = load_dms_from_d1(args.cf_token)
    print(f'  Loaded {len(dms)} DMs')

    # Load cached hashes (to skip already-geocoded)
    cached_hashes = set()
    if not args.force:
        print('Loading cached hashes...')
        cached_hashes = load_cached_hashes(args.cf_token)
        print(f'  Found {len(cached_hashes)} cached entries')

    # Filter DMs to process
    to_process = []
    for dm in dms:
        query = build_geocode_query(dm['dm_code'], dm.get('dun_name'))
        h = hash_query(query)
        if not args.force and h in cached_hashes:
            continue
        to_process.append({**dm, '_query': query, '_hash': h})

    if args.limit > 0:
        to_process = to_process[:args.limit]

    print(f'\nDMs to geocode: {len(to_process)}')

    if args.dry_run:
        print('\n--- DRY RUN ---')
        for dm in to_process[:20]:
            print(f'  {dm["dm_code"]} -> "{dm["_query"]}"')
        if len(to_process) > 20:
            print(f'  ... and {len(to_process) - 20} more')
        print(f'\nTotal: {len(to_process)} DMs would be geocoded')
        return

    if not to_process:
        print('Nothing to geocode. Use --force to re-geocode all.')
        return

    # Geocode
    print(f'\nGeocoding {len(to_process)} DMs (source: {args.source})...')
    progress = Progress(len(to_process))
    cache_results = []
    dm_updates = []
    unresolved_list = []

    for dm in to_process:
        query = dm['_query']
        dm_code = dm['dm_code']
        result = None
        tried = []

        # Try Google
        if args.source in ('google', 'auto'):
            google_limiter.wait()
            tried.append('google')
            result = geocode_google(query, args.google_key)

        # Try Nominatim
        if not result and args.source in ('nominatim', 'auto'):
            nominatim_limiter.wait()
            tried.append('nominatim')
            result = geocode_nominatim(query)

        if result:
            progress.tick(result['source'])
            ttl = '+30 days' if result['source'] == 'google' else '+90 days'
            cache_results.append({
                'query_hash': dm['_hash'],
                'raw_query': query,
                'dm_code': dm_code,
                'latitude': result['latitude'],
                'longitude': result['longitude'],
                'accuracy': result['accuracy'],
                'source': result['source'],
                'formatted_address': result['formatted_address'],
                'place_id': result['place_id'],
                'ttl': ttl,
            })
            dm_updates.append({
                'dm_code': dm_code,
                'latitude': result['latitude'],
                'longitude': result['longitude'],
            })
        else:
            progress.tick('unresolved')
            unresolved_list.append(dm_code)
            cache_results.append({
                'query_hash': dm['_hash'],
                'raw_query': query,
                'dm_code': dm_code,
                'latitude': None,
                'longitude': None,
                'accuracy': 'unresolved',
                'source': None,
                'formatted_address': None,
                'place_id': None,
                'ttl': '+7 days',
            })

    # Write cache to D1
    print(f'\nWriting {len(cache_results)} results to D1 geocode_cache...')
    write_cache_to_d1(args.cf_token, cache_results)

    # Update DM centroids
    if not args.skip_update_dms and dm_updates:
        print(f'Updating {len(dm_updates)} DM centroids in dms table...')
        update_dm_centroids(args.cf_token, dm_updates)

    # Regenerate static GeoJSON
    if not args.skip_geojson:
        print('\nRegenerating dm_centroids.geojson...')
        all_dms = load_dms_with_all_fields(args.cf_token)
        repo_root = Path(__file__).resolve().parent.parent
        geojson_path = repo_root / 'dashboard' / 'public' / 'boundaries' / 'dm_centroids.geojson'
        regenerate_geojson(args.cf_token, all_dms, geojson_path)

    # Summary
    print(f'\n=== BATCH GEOCODING COMPLETE ===')
    print(f'  Total processed: {len(to_process)}')
    print(f'  Google resolved: {progress.google_ok}')
    print(f'  Nominatim resolved: {progress.nominatim_ok}')
    print(f'  Unresolved: {progress.unresolved}')
    print(f'  Cache hits skipped: {progress.cached_skip}')
    print(f'  Resolution rate: {((progress.google_ok + progress.nominatim_ok) / len(to_process) * 100):.1f}%')

    if unresolved_list:
        print(f'\n  Unresolved DMs ({len(unresolved_list)}):')
        for code in unresolved_list[:20]:
            print(f'    - {code}')
        if len(unresolved_list) > 20:
            print(f'    ... and {len(unresolved_list) - 20} more')


if __name__ == '__main__':
    main()
