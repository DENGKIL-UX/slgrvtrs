#!/usr/bin/env python3
"""Analyze DM centroid anomalies after geocoding.

Checks:
1. DMs geocoded outside Selangor (wrong state in address)
2. DMs whose coords are far from their DUN centroid (>0.1° ≈ 11km)
3. DMs with near-duplicate coordinates
4. DMs where geocoded state doesn't match Selangor
"""

import json
import math
import sys
import urllib.request

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


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def main():
    token = sys.argv[1]

    # Load all DMs with geocode info and DUN centroids
    rows = d1_query(token, "SELECT d.dm_code, d.dun_code, d.centroid_lng as dm_lng, d.centroid_lat as dm_lat, dn.name as dun_name, gc.formatted_address, gc.accuracy_level, gc.source, dc.avg_lng as dun_lng, dc.avg_lat as dun_lat FROM dms d JOIN duns dn ON d.dun_code = dn.code_dun LEFT JOIN geocode_cache gc ON gc.dm_code = d.dm_code LEFT JOIN (SELECT dun_code, avg(centroid_lng) as avg_lng, avg(centroid_lat) as avg_lat FROM dms GROUP BY dun_code) dc ON d.dun_code = dc.dun_code ORDER BY d.dun_code, d.dm_code")

    print(f'=== DM Centroid Anomaly Analysis ({len(rows)} DMs) ===\n')

    # 1. Wrong state in formatted_address
    print('--- 1. DMs geocoded OUTSIDE Selangor ---')
    wrong_state = []
    for r in rows:
        addr = r.get('formatted_address') or ''
        if addr and 'Selangor' not in addr and r.get('accuracy_level') != 'unresolved':
            wrong_state.append(r)
    print(f'Count: {len(wrong_state)}\n')
    for r in wrong_state:
        dist = haversine_km(r['dm_lat'], r['dm_lng'], r['dun_lat'], r['dun_lng'])
        print(f'  {r["dm_code"]:42s} | {r["dun_name"]:20s} | {dist:6.1f}km from DUN | {r["formatted_address"]}')

    # 2. DMs far from their DUN centroid
    print(f'\n--- 2. DMs >5km from DUN centroid ---')
    far_from_dun = []
    for r in rows:
        if r['dm_lng'] and r['dm_lat'] and r['dun_lng'] and r['dun_lat']:
            dist = haversine_km(r['dm_lat'], r['dm_lng'], r['dun_lat'], r['dun_lng'])
            if dist > 5:
                far_from_dun.append({**r, 'dist_km': dist})
    far_from_dun.sort(key=lambda x: -x['dist_km'])
    print(f'Count: {len(far_from_dun)}\n')
    for r in far_from_dun[:30]:
        print(f'  {r["dm_code"]:42s} | {r["dun_name"]:20s} | {r["dist_km"]:6.1f}km | {r.get("formatted_address","")[:70]}')
    if len(far_from_dun) > 30:
        print(f'  ... and {len(far_from_dun) - 30} more')

    # 3. Near-duplicate coordinates (within 0.0001° ≈ 11m)
    print(f'\n--- 3. DMs with near-duplicate coordinates (<50m apart) ---')
    coords_map = {}
    for r in rows:
        if r['dm_lng'] and r['dm_lat']:
            key = (round(r['dm_lng'], 4), round(r['dm_lat'], 4))  # ~11m precision
            if key not in coords_map:
                coords_map[key] = []
            coords_map[key].append(r['dm_code'])
    dupes = {k: v for k, v in coords_map.items() if len(v) > 1}
    print(f'Count: {len(dupes)} coordinate groups\n')
    for (lng, lat), codes in sorted(dupes.items(), key=lambda x: -len(x[1])):
        print(f'  ({lng}, {lat}): {codes}')

    # 4. Summary stats
    print(f'\n--- 4. Summary ---')
    in_selangor = sum(1 for r in rows if (r.get('formatted_address') or '').count('Selangor') > 0 or not r.get('formatted_address'))
    in_kl = sum(1 for r in wrong_state if 'Kuala Lumpur' in (r.get('formatted_address') or ''))
    in_ns = sum(1 for r in wrong_state if 'Negeri Sembilan' in (r.get('formatted_address') or ''))
    in_other = len(wrong_state) - in_kl - in_ns
    print(f'  In Selangor:          {in_selangor}')
    print(f'  In Kuala Lumpur:     {in_kl}')
    print(f'  In Negeri Sembilan:   {in_ns}')
    print(f'  In other states:     {in_other}')
    print(f'  >5km from DUN:        {len(far_from_dun)}')
    print(f'  Duplicate coords:    {sum(len(v) for v in dupes.values())} DMs in {len(dupes)} groups')


if __name__ == '__main__':
    main()
