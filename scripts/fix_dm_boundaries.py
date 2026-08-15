#!/usr/bin/env python3
"""
Fix DMs that fall outside their parent DUN boundary.
Strategy:
  1. For each out-of-bounds DM, find the nearest point ON the DUN polygon edge.
  2. Offset that point slightly inward (toward DUN centroid) to ensure it's inside.
  3. If snapping fails, fall back to DUN centroid.
  4. Update D1 database with corrected coordinates.
  5. Regenerate static dm_centroids.geojson fallback.
"""

import json
import math
import os
import urllib.request
import ssl
import sys

# ============================================================
# Config
# ============================================================
CF_ACCOUNT_ID = os.environ.get('CF_ACCOUNT_ID', '')
DB_ID = os.environ.get('CF_DB_ID', '')
CF_API_TOKEN = os.environ.get('CF_API_TOKEN', '')
D1_QUERY_URL = f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{DB_ID}/query'

# ============================================================
# Geometry helpers
# ============================================================

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
    """Test point against GeoJSON geometry (handles both Polygon and MultiPolygon)."""
    if geom_type == 'Polygon':
        # coords = [exterior_ring, hole1, hole2, ...]
        if point_in_polygon(point, coords[0]):
            for hole in coords[1:]:
                if point_in_polygon(point, hole):
                    return False
            return True
        return False
    elif geom_type == 'MultiPolygon':
        # coords = [[ext_ring1, hole1_1, ...], [ext_ring2, ...], ...]
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


def get_polygon_list(coords, geom_type):
    """Get list of (exterior_ring, [holes]) from coordinates."""
    if geom_type == 'Polygon':
        return [coords]  # coords[0] = exterior, coords[1:] = holes
    elif geom_type == 'MultiPolygon':
        return coords
    return []


def point_in_multipolygon(point, multipolygon_coords):
    for polygon in multipolygon_coords:
        if point_in_polygon(point, polygon[0]):
            in_hole = False
            for hole in polygon[1:]:
                if point_in_polygon(point, hole):
                    in_hole = True
                    break
            if not in_hole:
                return True
    return False


def nearest_point_on_segment(px, py, ax, ay, bx, by):
    """Find the nearest point on line segment (a,b) to point p."""
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return ax, ay
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0, min(1, t))
    return ax + t * dx, ay + t * dy


def nearest_point_on_ring(point, ring):
    """Find nearest point on a polygon ring to the given point."""
    min_dist = float('inf')
    best = None
    px, py = point
    n = len(ring)
    for i in range(n - 1):  # ring is closed, so skip last==first
        ax, ay = ring[i]
        bx, by = ring[i + 1]
        nx, ny = nearest_point_on_segment(px, py, ax, ay, bx, by)
        d = math.sqrt((px - nx)**2 + (py - ny)**2)
        if d < min_dist:
            min_dist = d
            best = (nx, ny)
    return best, min_dist


def snap_to_dun_boundary(dm_point, dun_coords, dun_centroid, geom_type, offset_deg=0.0005):
    """
    Snap a point to the nearest point on the DUN boundary, then offset inward.
    Returns (new_lng, new_lat, method).
    """
    px, py = dm_point
    cx, cy = dun_centroid

    min_dist = float('inf')
    best_boundary_point = None

    polygons = get_polygon_list(dun_coords, geom_type)

    for poly in polygons:
        # Exterior ring
        ring = poly[0]
        # Convert to tuples
        ring_tuples = [(p[0], p[1]) for p in ring]
        if not ring_tuples:
            continue
        bp, dist = nearest_point_on_ring(dm_point, ring_tuples)
        if bp and dist < min_dist:
            min_dist = dist
            best_boundary_point = bp

    if best_boundary_point is None:
        return None, None, 'failed'

    bx, by = best_boundary_point

    # Offset from boundary point toward DUN centroid
    dx = cx - bx
    dy = cy - by
    dist_to_centroid = math.sqrt(dx*dx + dy*dy)
    if dist_to_centroid == 0:
        return bx, by, 'boundary_exact'

    # Normalize and apply offset
    nx = bx + (dx / dist_to_centroid) * offset_deg
    ny = by + (dy / dist_to_centroid) * offset_deg

    # Verify the snapped point is inside
    if point_in_geometry((nx, ny), dun_coords, geom_type):
        return nx, ny, 'snapped_to_boundary'

    # If still outside, try larger offsets
    for mult in [2, 5, 10, 20]:
        nx = bx + (dx / dist_to_centroid) * offset_deg * mult
        ny = by + (dy / dist_to_centroid) * offset_deg * mult
        if point_in_geometry((nx, ny), dun_coords, geom_type):
            return nx, ny, f'snapped_offset_{mult}x'

    return None, None, 'snap_failed'


def d1_query(sql, params=None):
    """Execute a D1 query via HTTP API."""
    body = {"sql": sql, "params": params or []}
    req = urllib.request.Request(
        D1_QUERY_URL,
        data=json.dumps(body).encode(),
        headers={
            'Authorization': f'Bearer {CF_API_TOKEN}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
        result = json.loads(resp.read())
    if not result.get('success'):
        raise Exception(f"D1 query failed: {json.dumps(result, indent=2)}")
    return result


def sql_escape(val):
    """Escape a value for inline SQL."""
    if val is None:
        return 'NULL'
    if isinstance(val, (int, float)):
        return str(val)
    return "'" + str(val).replace("'", "''") + "'"


# ============================================================
# Main
# ============================================================

print("=" * 70)
print("DM BOUNDARY FIX SCRIPT")
print("=" * 70)

# 1. Load DUN boundaries
print("\n[1/5] Loading DUN boundaries...")
with open('dashboard/public/boundaries/selangor_dun.geojson') as f:
    dun_data = json.load(f)

dun_polygons = {}
dun_centroids = {}
for feat in dun_data['features']:
    props = feat['properties']
    code_dun = props.get('code_dun', '')
    geom = feat['geometry']
    dun_polygons[code_dun] = {
        'name': props.get('dun', ''),
        'type': geom['type'],
        'coords': geom['coordinates'],
    }
    # Calculate centroid from all exterior ring points
    all_pts = []
    if geom['type'] == 'Polygon':
        all_pts = geom['coordinates'][0]
    elif geom['type'] == 'MultiPolygon':
        for poly in geom['coordinates']:
            all_pts.extend(poly[0])
    if all_pts:
        dun_centroids[code_dun] = (
            sum(p[0] for p in all_pts) / len(all_pts),
            sum(p[1] for p in all_pts) / len(all_pts),
        )

print(f"  Loaded {len(dun_polygons)} DUN polygons with centroids")

# 2. Load out-of-bounds DMs from previous analysis
print("\n[2/5] Loading out-of-bounds DMs from analysis...")
with open('scripts/pip_results.json') as f:
    pip_data = json.load(f)

outside_dms = pip_data['outside_dms']
print(f"  {len(outside_dms)} DMs to fix")

# 3. Snap each DM to nearest point inside DUN
print("\n[3/5] Snapping DMs to nearest point inside DUN boundary...")
fixes = []
failed = []

for dm in outside_dms:
    dm_code = dm['dm_code']
    dm_name = dm['dm_name']
    old_lng = dm['lng']
    old_lat = dm['lat']
    dun_code = dm['dun_code']

    if dun_code not in dun_polygons:
        failed.append({**dm, 'reason': 'no_dun_polygon'})
        continue

    dun_info = dun_polygons[dun_code]
    coords = dun_info['coords']
    geom_type = dun_info['type']
    centroid = dun_centroids[dun_code]

    # Try snapping to boundary
    new_lng, new_lat, method = snap_to_dun_boundary(
        (old_lng, old_lat), coords, centroid, geom_type
    )

    if new_lng is not None:
        fixes.append({
            'dm_code': dm_code,
            'dm_name': dm_name,
            'dun_code': dun_code,
            'old_lng': old_lng,
            'old_lat': old_lat,
            'new_lng': new_lng,
            'new_lat': new_lat,
            'method': method,
        })
    else:
        # Fallback to DUN centroid
        fixes.append({
            'dm_code': dm_code,
            'dm_name': dm_name,
            'dun_code': dun_code,
            'old_lng': old_lng,
            'old_lat': old_lat,
            'new_lng': centroid[0],
            'new_lat': centroid[1],
            'method': 'dun_centroid_fallback',
        })

print(f"  Snapped: {len(fixes)}")
print(f"  Failed: {len(failed)}")

# Method breakdown
from collections import Counter
methods = Counter(f['method'] for f in fixes)
print(f"  Methods used:")
for m, c in methods.most_common():
    print(f"    {m}: {c}")

# 4. Update D1 database
print("\n[4/5] Updating D1 database...")
BATCH_SIZE = 50
updated = 0

for i in range(0, len(fixes), BATCH_SIZE):
    batch = fixes[i:i+BATCH_SIZE]
    statements = []
    for fix in batch:
        stmt = (
            f"UPDATE dms SET centroid_lng = {fix['new_lng']:.10f}, "
            f"centroid_lat = {fix['new_lat']:.10f} "
            f"WHERE dm_code = {sql_escape(fix['dm_code'])};"
        )
        statements.append(stmt)

    multi_sql = '\n'.join(statements)
    try:
        result = d1_query(multi_sql)
        updated += len(batch)
        print(f"  Batch {i//BATCH_SIZE + 1}: updated {len(batch)} DMs (total: {updated})")
    except Exception as e:
        print(f"  ERROR in batch {i//BATCH_SIZE + 1}: {e}")
        # Try one by one
        for fix in batch:
            stmt = (
                f"UPDATE dms SET centroid_lng = {fix['new_lng']:.10f}, "
                f"centroid_lat = {fix['new_lat']:.10f} "
                f"WHERE dm_code = {sql_escape(fix['dm_code'])};"
            )
            try:
                d1_query(stmt)
                updated += 1
            except Exception as e2:
                print(f"    FAILED {fix['dm_code']}: {e2}")

print(f"  Total updated in D1: {updated}/{len(fixes)}")

# 5. Regenerate static dm_centroids.geojson
print("\n[5/5] Regenerating static dm_centroids.geojson...")

# Fetch ALL DMs (including fixed ones)
all_dms_result = d1_query(
    "SELECT d.dm_code, d.name, d.centroid_lng, d.centroid_lat, d.dun_code, d.total_voters, "
    "d.male, d.female, d.male_malay, d.male_chinese, d.male_indian, d.male_other, "
    "d.female_malay, d.female_chinese, d.female_indian, d.female_other, "
    "d.malay_pct, d.chinese_pct, d.indian_pct, d.other_pct, "
    "d.age_mean, d.age_median, d.contact_pct, d.code_parlimen, d.voter_prefix "
    "FROM dms d WHERE d.centroid_lng IS NOT NULL AND d.centroid_lat IS NOT NULL"
)

all_dms = all_dms_result['result'][0]['results']
print(f"  Fetched {len(all_dms)} DMs from D1")

# Build GeoJSON
features = []
for dm in all_dms:
    feat = {
        'type': 'Feature',
        'geometry': {
            'type': 'Point',
            'coordinates': [dm['centroid_lng'], dm['centroid_lat']],
        },
        'properties': {
            'dm_code': dm['dm_code'],
            'name': dm['name'],
            'dun_code': dm['dun_code'],
            'code_parlimen': dm['code_parlimen'],
            'voter_prefix': dm['voter_prefix'],
            'total_voters': dm['total_voters'],
            'male': dm['male'],
            'female': dm['female'],
            'male_malay': dm['male_malay'],
            'male_chinese': dm['male_chinese'],
            'male_indian': dm['male_indian'],
            'male_other': dm['male_other'],
            'female_malay': dm['female_malay'],
            'female_chinese': dm['female_chinese'],
            'female_indian': dm['female_indian'],
            'female_other': dm['female_other'],
            'malay_pct': dm['malay_pct'],
            'chinese_pct': dm['chinese_pct'],
            'indian_pct': dm['indian_pct'],
            'other_pct': dm['other_pct'],
            'age_mean': dm['age_mean'],
            'age_median': dm['age_median'],
            'contact_pct': dm['contact_pct'],
        },
    }
    features.append(feat)

geojson = {
    'type': 'FeatureCollection',
    'features': features,
}

with open('dashboard/public/boundaries/dm_centroids.geojson', 'w') as f:
    json.dump(geojson, f)

print(f"  Wrote {len(features)} features to dm_centroids.geojson")

# Save fix report
with open('scripts/fix_report.json', 'w') as f:
    json.dump({
        'total_fixed': len(fixes),
        'total_failed': len(failed),
        'methods': dict(methods),
        'fixes': fixes,
        'failed': failed,
    }, f, indent=2)

print(f"\n{'=' * 70}")
print(f"FIX COMPLETE")
print(f"  DMs fixed: {updated}")
print(f"  DMs failed: {len(failed)}")
print(f"  Report saved: scripts/fix_report.json")
print(f"  Static GeoJSON updated: dashboard/public/boundaries/dm_centroids.geojson")
print(f"{'=' * 70}")
