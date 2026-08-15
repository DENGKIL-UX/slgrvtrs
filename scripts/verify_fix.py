#!/usr/bin/env python3
"""
Re-run point-in-polygon analysis to verify all DMs are now inside their DUN boundaries.
"""

import json
import math
import os
import urllib.request
import ssl

CF_ACCOUNT_ID = os.environ.get('CF_ACCOUNT_ID', '')
DB_ID = os.environ.get('CF_DB_ID', '')
CF_API_TOKEN = os.environ.get('CF_API_TOKEN', '')
D1_QUERY_URL = f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{DB_ID}/query'


def point_in_polygon(point, polygon):
    x, y = point
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def point_in_geometry(point, coords, geom_type):
    if geom_type == 'Polygon':
        if point_in_polygon(point, coords[0]):
            for hole in coords[1:]:
                if point_in_polygon(point, hole):
                    return False
            return True
        return False
    elif geom_type == 'MultiPolygon':
        for polygon in coords:
            if point_in_polygon(point, polygon[0]):
                in_hole = False
                for hole in polygon[1:]:
                    if point_in_polygon(point, hole):
                        in_hole = True
                        break
                if not in_hole:
                    return True
        return False
    return False


# Load DUN boundaries
with open('dashboard/public/boundaries/selangor_dun.geojson') as f:
    dun_data = json.load(f)

dun_polygons = {}
for feat in dun_data['features']:
    code_dun = feat['properties'].get('code_dun', '')
    dun_polygons[code_dun] = {
        'name': feat['properties'].get('dun', ''),
        'type': feat['geometry']['type'],
        'coords': feat['geometry']['coordinates'],
    }

# Load DM centroids from D1
sql = "SELECT dm_code, name, centroid_lng, centroid_lat, dun_code FROM dms WHERE centroid_lng IS NOT NULL AND centroid_lat IS NOT NULL"
req = urllib.request.Request(
    D1_QUERY_URL,
    data=json.dumps({"sql": sql, "params": []}).encode(),
    headers={'Authorization': f'Bearer {CF_API_TOKEN}', 'Content-Type': 'application/json'},
    method='POST',
)
ctx = ssl.create_default_context()
with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
    result = json.loads(resp.read())
dms = result['result'][0]['results']

# Test
outside = []
inside = 0
for dm in dms:
    point = (dm['centroid_lng'], dm['centroid_lat'])
    dun_code = dm['dun_code']
    if dun_code not in dun_polygons:
        continue
    dun_info = dun_polygons[dun_code]
    if point_in_geometry(point, dun_info['coords'], dun_info['type']):
        inside += 1
    else:
        outside.append(dm)

print(f'Verification: {len(dms)} DMs tested')
print(f'  Inside: {inside}')
print(f'  Outside: {len(outside)}')
if outside:
    print(f'  REMAINING OUTSIDE:')
    for dm in outside[:10]:
        print(f'    {dm["dm_code"]} ({dm["name"]}) -> {dm["dun_code"]} at ({dm["centroid_lng"]:.4f}, {dm["centroid_lat"]:.4f})')
else:
    print('  ALL DMs ARE INSIDE THEIR DUN BOUNDARIES!')
