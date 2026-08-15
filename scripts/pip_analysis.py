#!/usr/bin/env python3
"""
Point-in-Polygon analysis: Check all 945 DM centroids against their parent DUN boundaries.
Reports DMs that fall outside their DUN polygon.
"""

import json
import math
import os
import urllib.request
import ssl
import sys

# ============================================================
# Point-in-Polygon (ray casting algorithm)
# ============================================================

def point_in_polygon(point, polygon):
    """
    Ray casting algorithm for point-in-polygon test.
    point: (lng, lat)
    polygon: list of [(lng, lat), ...] forming a ring
    Returns True if point is inside or on the boundary.
    """
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


def point_in_multipolygon(point, multipolygon_coords):
    """
    Test point against MultiPolygon (list of polygons, each with rings).
    First ring is exterior, subsequent rings are holes.
    """
    for polygon in multipolygon_coords:
        # polygon[0] = exterior ring, polygon[1:] = holes
        if point_in_polygon(point, polygon[0]):
            # Check if inside any hole
            in_hole = False
            for hole in polygon[1:]:
                if point_in_polygon(point, hole):
                    in_hole = True
                    break
            if not in_hole:
                return True
    return False


def get_polygon_rings(geometry):
    """
    Extract polygon rings from GeoJSON geometry.
    Returns (type, rings) where type is 'Polygon' or 'MultiPolygon'
    and rings is the coordinate array.
    """
    return geometry['type'], geometry['coordinates']


# ============================================================
# Load DUN boundaries
# ============================================================

print("Loading DUN boundaries...")
with open('dashboard/public/boundaries/selangor_dun.geojson') as f:
    dun_data = json.load(f)

# Build lookup: code_dun -> geometry
# code_dun values are like 'N.01', 'N.02', etc.
dun_polygons = {}
for feat in dun_data['features']:
    props = feat['properties']
    code_dun = props.get('code_dun', '')
    dun_name = props.get('dun', '')
    geom_type, coords = get_polygon_rings(feat['geometry'])
    dun_polygons[code_dun] = {
        'name': dun_name,
        'type': geom_type,
        'coords': coords,
    }

print(f"  Loaded {len(dun_polygons)} DUN polygons")

# ============================================================
# Load DM centroids from D1 via HTTP API
# ============================================================

CF_ACCOUNT_ID = os.environ.get('CF_ACCOUNT_ID', '')
DB_ID = os.environ.get('CF_DB_ID', '')
CF_API_TOKEN = os.environ.get('CF_API_TOKEN', '')

D1_QUERY_URL = f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{DB_ID}/query'

print("Loading DM centroids from D1...")

# Get all DMs with coordinates and dun_code
sql = "SELECT dm_code, name, centroid_lng, centroid_lat, dun_code FROM dms WHERE centroid_lng IS NOT NULL AND centroid_lat IS NOT NULL"

req = urllib.request.Request(
    D1_QUERY_URL,
    data=json.dumps({"sql": sql, "params": []}).encode(),
    headers={
        'Authorization': f'Bearer {CF_API_TOKEN}',
        'Content-Type': 'application/json',
    },
    method='POST',
)

ctx = ssl.create_default_context()
with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
    result = json.loads(resp.read())

dms = result['result'][0]['results']
print(f"  Loaded {len(dms)} DMs with coordinates")

# ============================================================
# Also get DUN centroids for fallback calculation
# ============================================================

print("Loading DUN centroids for fallback reference...")

# Calculate DUN centroids from polygon geometries
dun_centroids = {}
for code_dun, info in dun_polygons.items():
    coords = info['coords']
    all_points = []
    if info['type'] == 'Polygon':
        all_points = coords[0]
    elif info['type'] == 'MultiPolygon':
        for poly in coords:
            all_points.extend(poly[0])
    if all_points:
        avg_lng = sum(p[0] for p in all_points) / len(all_points)
        avg_lat = sum(p[1] for p in all_points) / len(all_points)
        dun_centroids[code_dun] = (avg_lng, avg_lat)

print(f"  Calculated {len(dun_centroids)} DUN centroids")

# ============================================================
# Point-in-Polygon test for all DMs
# ============================================================

print("\nRunning point-in-polygon tests for all DMs...")
print("=" * 70)

outside_dms = []
inside_count = 0
no_dun_found = []

for dm in dms:
    dm_code = dm['dm_code']
    dm_name = dm['name']
    lng = dm['centroid_lng']
    lat = dm['centroid_lat']
    dun_code = dm['dun_code']
    point = (lng, lat)

    if dun_code not in dun_polygons:
        no_dun_found.append(dm)
        continue

    dun_info = dun_polygons[dun_code]
    geom_type = dun_info['type']
    coords = dun_info['coords']

    if geom_type == 'Polygon':
        # coords = [exterior_ring, hole1, hole2, ...]
        is_inside = point_in_polygon(point, coords[0])
        # Check holes
        if is_inside:
            for hole in coords[1:]:
                if point_in_polygon(point, hole):
                    is_inside = False
                    break
    elif geom_type == 'MultiPolygon':
        is_inside = point_in_multipolygon(point, coords)
    else:
        is_inside = False

    if is_inside:
        inside_count += 1
    else:
        # Calculate distance to DUN centroid for context
        dc = dun_centroids.get(dun_code, (0, 0))
        dist_to_dun_centroid = math.sqrt((lng - dc[0])**2 + (lat - dc[1])**2)
        outside_dms.append({
            'dm_code': dm_code,
            'dm_name': dm_name,
            'lng': lng,
            'lat': lat,
            'dun_code': dun_code,
            'dun_name': dun_info['name'],
            'dist_to_dun_centroid': dist_to_dun_centroid,
        })

# ============================================================
# Results
# ============================================================

print(f"\n{'=' * 70}")
print(f"POINT-IN-POLYGON ANALYSIS RESULTS")
print(f"{'=' * 70}")
print(f"Total DMs tested:    {len(dms)}")
print(f"Inside DUN boundary: {inside_count}")
print(f"Outside DUN boundary: {len(outside_dms)}")
print(f"No DUN match:         {len(no_dun_found)}")

if no_dun_found:
    print(f"\n--- DMs with no matching DUN polygon ---")
    for dm in no_dun_found:
        print(f"  {dm['dm_code']} ({dm['name']}) -> dun_code={dm['dun_code']}")

if outside_dms:
    print(f"\n--- DMs OUTSIDE their DUN boundary ({len(outside_dms)}) ---")
    # Sort by distance to DUN centroid (most egregious first)
    outside_dms.sort(key=lambda x: x['dist_to_dun_centroid'], reverse=True)
    for dm in outside_dms:
        dc = dun_centroids.get(dm['dun_code'], (0, 0))
        print(f"  {dm['dm_code']:25s} | {dm['dm_name']:30s} | DUN: {dm['dun_code']} ({dm['dun_name']})")
        print(f"    DM point: ({dm['lng']:.4f}, {dm['lat']:.4f})")
        print(f"    DUN centroid: ({dc[0]:.4f}, {dc[1]:.4f})")
        print(f"    Distance to DUN centroid: {dm['dist_to_dun_centroid']:.4f} degrees")
        print()

    # Summary by DUN
    print(f"--- Summary by DUN ---")
    from collections import Counter
    dun_counts = Counter(dm['dun_code'] for dm in outside_dms)
    for dun_code, count in dun_counts.most_common():
        print(f"  {dun_code}: {count} DM(s) outside")

print(f"\n{'=' * 70}")
print(f"ANALYSIS COMPLETE")
print(f"{'=' * 70}")

# Save results for use by fix script
with open('scripts/pip_results.json', 'w') as f:
    json.dump({
        'total_tested': len(dms),
        'inside': inside_count,
        'outside': len(outside_dms),
        'no_dun_match': len(no_dun_found),
        'outside_dms': outside_dms,
    }, f, indent=2)
print(f"\nResults saved to scripts/pip_results.json")
