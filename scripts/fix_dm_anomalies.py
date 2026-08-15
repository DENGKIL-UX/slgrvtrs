#!/usr/bin/env python3
"""Fix DM centroid anomalies after geocoding.

Strategy:
1. Wrong-state DMs → revert to DUN centroid average
2. DMs >15km from DUN centroid → revert to DUN centroid average
3. Duplicate coordinates → add deterministic jitter (~150m radius)
4. Re-geocode clearly wrong DMs with Nominatim as second opinion
"""

import json
import math
import sys
import urllib.parse
import urllib.request
import time

CF_ACCOUNT_ID = '20b9d9b232ee8f29aa3e626530f0da09'
CF_DATABASE_ID = '59afb76e-a3a2-4e2a-b18d-857f9f5704fb'
D1_API = f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_DATABASE_ID}/query'

def d1_query(cf_token, sql):
    payload = json.dumps({'sql': sql, 'params': []}).encode()
    req = urllib.request.Request(D1_API, data=payload, headers={
        'Authorization': f'Bearer {cf_token}',
        'Content-Type': 'application/json',
    })
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    return data['result'][0]['results']

def d1_batch(cf_token, stmts):
    sql_parts = []
    for s in stmts:
        sql_parts.append(s)
    combined = '; '.join(sql_parts)
    payload = json.dumps({'sql': combined, 'params': []}).encode()
    req = urllib.request.Request(D1_API, data=payload, headers={
        'Authorization': f'Bearer {cf_token}',
        'Content-Type': 'application/json',
    })
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    return data.get('success', False)

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def deterministic_jitter(dm_code, index, total, radius_deg=0.0015):
    """Spread points in a spiral pattern around center.
    radius_deg ~150m at equator."""
    if total <= 1:
        return 0.0, 0.0
    # Use dm_code hash for deterministic but varied angles
    h = hash(dm_code)
    angle_offset = (h % 3600) / 10.0  # 0-360 degrees, deterministic per DM
    golden_angle = 137.508
    angle = math.radians(angle_offset + index * golden_angle)
    # Spread radius proportional to sqrt(index) for even distribution
    r = radius_deg * math.sqrt((index + 1) / total)
    return r * math.cos(angle), r * math.sin(angle)

def geocode_nominatim(query):
    params = urllib.parse.urlencode({
        'q': query, 'countrycodes': 'my', 'format': 'jsonv2',
        'limit': '1', 'addressdetails': '1', 'bounded': '1',
        'viewbox': '100.5,4.0,102.0,2.5',
    })
    url = f'https://nominatim.openstreetmap.org/search?{params}'
    req = urllib.request.Request(url, headers={
        'User-Agent': 'SLGRVTRS-Dashboard/1.0 (research@ritz-analytics.workers.dev)',
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        if data and len(data) > 0:
            lat = float(data[0]['lat'])
            lng = float(data[0]['lon'])
            if 100.5 <= lng <= 102.0 and 2.5 <= lat <= 4.0:
                if 'Selangor' in data[0].get('display_name', ''):
                    return lat, lng, data[0].get('display_name', '')
    except:
        pass
    return None

def main():
    token = sys.argv[1]
    if not token:
        print('Usage: python fix_dm_anomalies.py <cf_token>')
        sys.exit(1)

    # Load all DMs with geocode info
    print('Loading DM data from D1...')
    rows = d1_query(token, "SELECT d.dm_code, d.dun_code, d.centroid_lng as dm_lng, d.centroid_lat as dm_lat, dn.name as dun_name, gc.formatted_address, gc.accuracy_level FROM dms d JOIN duns dn ON d.dun_code = dn.code_dun LEFT JOIN geocode_cache gc ON gc.dm_code = d.dm_code ORDER BY d.dun_code, d.dm_code")
    print(f'  Loaded {len(rows)} DMs')

    # Step 1: Compute DUN centroid averages
    print('\nStep 1: Computing DUN centroid averages...')
    dun_centroids = {}
    for r in rows:
        d = r['dun_code']
        if d not in dun_centroids:
            dun_centroids[d] = {'lngs': [], 'lats': [], 'name': r['dun_name']}
        if r['dm_lng'] and r['dm_lat']:
            dun_centroids[d]['lngs'].append(r['dm_lng'])
            dun_centroids[d]['lats'].append(r['dm_lat'])

    dun_avg = {}
    for d, v in dun_centroids.items():
        if v['lngs']:
            dun_avg[d] = {
                'lng': sum(v['lngs']) / len(v['lngs']),
                'lat': sum(v['lats']) / len(v['lats']),
            }

    # Step 2: Identify DMs to fix
    print('\nStep 2: Identifying anomalies...')
    fix_wrong_state = []
    fix_far_from_dun = []
    fix_all = []  # combined list of dm_code -> new coords

    for r in rows:
        dm = r['dm_code']
        addr = r.get('formatted_address') or ''
        lng, lat = r['dm_lng'], r['dm_lat']
        if not lng or not lat:
            continue

        # Check wrong state
        is_wrong_state = addr and 'Selangor' not in addr
        dist = 0
        if r['dun_code'] in dun_avg:
            dist = haversine_km(lat, lng, dun_avg[r['dun_code']]['lat'], dun_avg[r['dun_code']]['lng'])

        is_far = dist > 15

        if is_wrong_state or is_far:
            fix_all.append({
                'dm_code': dm,
                'reason': [],
                'old_lng': lng,
                'old_lat': lat,
            })
            if is_wrong_state:
                fix_all[-1]['reason'].append(f'wrong_state: {addr[:50]}')
            if is_far:
                fix_all[-1]['reason'].append(f'{dist:.1f}km_from_DUN')

    print(f'  Wrong state or >15km from DUN: {len(fix_all)} DMs')

    # Step 3: Try Nominatim re-geocoding for wrong-state DMs (with bounded viewbox)
    print('\nStep 3: Re-geocoding wrong-state DMs via Nominatim (bounded to Selangor)...')
    nominatim_fixed = 0
    nominatim_failed = []

    for i, fix in enumerate(fix_all):
        dm = fix['dm_code']
        # Extract name
        name = dm.split('.', 1)[1] if '.' in dm else dm
        name = name.title()
        dun_name = ''
        for r in rows:
            if r['dm_code'] == dm:
                dun_name = r['dun_name'].title()
                break
        query = f'{name}, {dun_name}, Selangor, Malaysia'

        result = geocode_nominatim(query)
        if result:
            lat, lng, addr = result
            d = fix['dm_code']
            # Verify it's closer to DUN
            if d in dun_avg:
                new_dist = haversine_km(lat, lng, dun_avg[d]['lat'], dun_avg[d]['lng'])
                if new_dist < fix['old_lat'] and new_dist < 20:
                    fix['new_lng'] = lng
                    fix['new_lat'] = lat
                    fix['source'] = f'nominatim: {addr[:50]}'
                    nominatim_fixed += 1
                    print(f'  FIXED: {dm} -> {lat:.6f}, {lng:.6f} ({addr[:50]})')
                    continue
        nominatim_failed.append(fix)
        time.sleep(1.1)  # Nominatim rate limit

    print(f'  Nominatim fixed: {nominatim_fixed}')
    print(f'  Nominatim failed: {len(nominatim_failed)} (will use DUN centroid)')

    # Step 4: Fall back to DUN centroid for remaining
    print('\nStep 4: Using DUN centroid for remaining...')
    for fix in nominatim_failed:
        d = fix['dm_code']
        # Get DUN code
        for r in rows:
            if r['dm_code'] == d:
                d_code = r['dun_code']
                break
        if d_code in dun_avg:
            fix['new_lng'] = dun_avg[d_code]['lng']
            fix['new_lat'] = dun_avg[d_code]['lat']
            fix['source'] = f'dun_centroid_fallback'
        else:
            # Keep original if no DUN avg available
            fix['new_lng'] = fix['old_lng']
            fix['new_lat'] = fix['old_lat']
            fix['source'] = 'kept_original'

    # Step 5: Handle duplicate coordinates (add jitter)
    print('\nStep 5: Adding jitter to duplicate coordinates...')
    coord_groups = {}
    for r in rows:
        dm = r['dm_code']
        lng, lat = r['dm_lng'], r['dm_lat']
        if not lng or not lat:
            continue
        key = (round(lng, 4), round(lat, 4))
        if key not in coord_groups:
            coord_groups[key] = []
        coord_groups[key].append(dm)

    jitter_count = 0
    jitter_fixes = {}
    for (lng, lat), dms in coord_groups.items():
        if len(dms) > 1:
            for i, dm in enumerate(dms):
                dlng, dlat = deterministic_jitter(dm, i, len(dms))
                jitter_fixes[dm] = (lng + dlng, lat + dlat)
            jitter_count += len(dms)

    print(f'  Jittered {jitter_count} DMs in {len([k for k,v in coord_groups.items() if len(v)>1])} groups')

    # Step 6: Build and execute SQL updates
    print('\nStep 6: Writing fixes to D1...')
    all_fixes = {}

    # Add wrong-state/far fixes
    for fix in fix_all:
        if 'new_lng' in fix:
            all_fixes[fix['dm_code']] = (fix['new_lng'], fix['new_lat'])

    # Override with jitter for all DMs (including non-fixed ones)
    for dm, (lng, lat) in jitter_fixes.items():
        if dm not in all_fixes:
            all_fixes[dm] = (lng, lat)
        else:
            # Apply jitter on top of the fix
            base_lng, base_lat = all_fixes[dm]
            # Find this DM's index in its jitter group
            for (glng, glat), dms in coord_groups.items():
                if dm in dms:
                    idx = dms.index(dm)
                    dlng, dlat = deterministic_jitter(dm, idx, len(dms))
                    all_fixes[dm] = (base_lng + dlng, base_lat + dlat)
                    break

    # Build SQL
    sql_parts = []
    for dm, (lng, lat) in sorted(all_fixes.items()):
        sql_parts.append(f"UPDATE dms SET centroid_lng = {lng}, centroid_lat = {lat}, updated_at = datetime('now') WHERE dm_code = '{dm.replace("'", "''")}'")

    # Execute in batches of 20
    batch_size = 20
    total = len(sql_parts)
    for i in range(0, total, batch_size):
        batch = sql_parts[i:i+batch_size]
        ok = d1_batch(token, batch)
        if not ok:
            print(f'  WARNING: batch failed at {i}')
        if (i + batch_size) % 100 == 0 or i + batch_size >= total:
            print(f'    Progress: {min(i + batch_size, total)}/{total}')

    print(f'\n  Updated {total} DM coordinates')

    # Step 7: Update geocode_cache for fixed DMs
    print('\nStep 7: Updating geocode_cache for reverted DMs...')
    cache_updates = []
    for fix in fix_all:
        if fix.get('source', '').startswith('dun_centroid') or fix.get('source', '').startswith('nominatim'):
            dm = fix['dm_code']
            cache_updates.append(
                f"UPDATE geocode_cache SET accuracy_level = 'dun_centroid', source = 'fix_script', latitude = {fix['new_lng']}, longitude = {fix['new_lat']}, updated_at = datetime('now') WHERE dm_code = '{dm.replace("'", "''")}'"
            )

    for i in range(0, len(cache_updates), 20):
        batch = cache_updates[i:i+20]
        d1_batch(token, batch)
    print(f'  Updated {len(cache_updates)} cache entries')

    print(f'\n=== ANOMALY FIX COMPLETE ===')
    print(f'  Wrong-state/far fixes: {len(fix_all)}')
    print(f'    Nominatim re-geocoded: {nominatim_fixed}')
    print(f'    DUN centroid fallback: {len(nominatim_failed)}')
    print(f'  Duplicate jitter: {jitter_count} DMs')
    print(f'  Total DMs updated: {total}')


if __name__ == '__main__':
    main()
