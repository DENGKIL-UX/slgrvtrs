#!/usr/bin/env python3
"""Fix the 2 remaining DMs whose DUN centroids are outside the polygon (concave polygons)."""

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


def nearest_point_on_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return ax, ay
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0, min(1, t))
    return ax + t * dx, ay + t * dy


def nearest_point_on_ring(point, ring):
    min_dist = float('inf')
    best = None
    px, py = point
    n = len(ring)
    for i in range(n - 1):
        ax, ay = ring[i]
        bx, by = ring[i + 1]
        nx, ny = nearest_point_on_segment(px, py, ax, ay, bx, by)
        d = math.sqrt((px - nx)**2 + (py - ny)**2)
        if d < min_dist:
            min_dist = d
            best = (nx, ny)
    return best, min_dist


def get_polygon_list(coords, geom_type):
    if geom_type == 'Polygon':
        return [coords]
    elif geom_type == 'MultiPolygon':
        return coords
    return []


def find_interior_point(coords, geom_type, original_point):
    """
    Find a guaranteed interior point using mid-segment approach.
    For each edge midpoint, try offsetting inward slightly.
    """
    polygons = get_polygon_list(coords, geom_type)
    px, py = original_point

    best_point = None
    best_dist = float('inf')

    for poly in polygons:
        ring = poly[0]
        ring_tuples = [(p[0], p[1]) for p in ring]
        n = len(ring_tuples)

        # Try midpoints of edges
        for i in range(n - 1):
            ax, ay = ring_tuples[i]
            bx, by = ring_tuples[i + 1]
            # Midpoint
            mx, my = (ax + bx) / 2, (ay + by) / 2

            # Normal pointing inward (rotate edge 90 degrees)
            ex, ey = bx - ax, by - ay
            # Two possible normals
            for sign in [1, -1]:
                nx, ny = -ey * sign, ex * sign
                length = math.sqrt(nx*nx + ny*ny)
                if length == 0:
                    continue
                nx, ny = nx / length, ny / length

                # Try small offsets
                for offset in [0.001, 0.002, 0.005, 0.01]:
                    test_x = mx + nx * offset
                    test_y = my + ny * offset
                    if point_in_geometry((test_x, test_y), coords, geom_type):
                        d = math.sqrt((test_x - px)**2 + (test_y - py)**2)
                        if d < best_dist:
                            best_dist = d
                            best_point = (test_x, test_y)
                        break

    return best_point


def d1_query(sql, params=None):
    body = {"sql": sql, "params": params or []}
    req = urllib.request.Request(
        D1_QUERY_URL,
        data=json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {CF_API_TOKEN}', 'Content-Type': 'application/json'},
        method='POST',
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
        result = json.loads(resp.read())
    if not result.get('success'):
        raise Exception(f"D1 query failed: {json.dumps(result, indent=2)}")
    return result


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

# The 2 remaining outside DMs
to_fix = [
    {'dm_code': '06.KAMPUNG JAWA', 'dun_code': 'N.49'},
    {'dm_code': '16.BANDAR BARU AMPANG', 'dun_code': 'N.19'},
]

for dm_info in to_fix:
    dm_code = dm_info['dm_code']
    dun_code = dm_info['dun_code']
    dun = dun_polygons[dun_code]

    # Get current DM point from D1
    result = d1_query(f"SELECT centroid_lng, centroid_lat FROM dms WHERE dm_code = '{dm_code}'")
    dm = result['result'][0]['results'][0]
    point = (dm['centroid_lng'], dm['centroid_lat'])

    print(f"Fixing {dm_code} (DUN {dun_code})...")
    print(f"  Current: ({point[0]:.6f}, {point[1]:.6f})")

    # Find interior point
    interior = find_interior_point(dun['coords'], dun['type'], point)

    if interior:
        print(f"  New: ({interior[0]:.6f}, {interior[1]:.6f})")
        # Verify
        is_inside = point_in_geometry(interior, dun['coords'], dun['type'])
        print(f"  Verified inside: {is_inside}")

        if is_inside:
            d1_query(
                f"UPDATE dms SET centroid_lng = {interior[0]:.10f}, centroid_lat = {interior[1]:.10f} WHERE dm_code = '{dm_code}'"
            )
            print(f"  Updated D1")
        else:
            print(f"  ERROR: point still outside!")
    else:
        print(f"  ERROR: could not find interior point")

# Regenerate static GeoJSON
print("\nRegenerating dm_centroids.geojson...")
all_dms_result = d1_query(
    "SELECT d.dm_code, d.name, d.centroid_lng, d.centroid_lat, d.dun_code, d.total_voters, "
    "d.male, d.female, d.male_malay, d.male_chinese, d.male_indian, d.male_other, "
    "d.female_malay, d.female_chinese, d.female_indian, d.female_other, "
    "d.malay_pct, d.chinese_pct, d.indian_pct, d.other_pct, "
    "d.age_mean, d.age_median, d.contact_pct, d.code_parlimen, d.voter_prefix "
    "FROM dms d WHERE d.centroid_lng IS NOT NULL AND d.centroid_lat IS NOT NULL"
)
all_dms = all_dms_result['result'][0]['results']

features = []
for dm in all_dms:
    features.append({
        'type': 'Feature',
        'geometry': {'type': 'Point', 'coordinates': [dm['centroid_lng'], dm['centroid_lat']]},
        'properties': {
            'dm_code': dm['dm_code'], 'name': dm['name'], 'dun_code': dm['dun_code'],
            'code_parlimen': dm['code_parlimen'], 'voter_prefix': dm['voter_prefix'],
            'total_voters': dm['total_voters'], 'male': dm['male'], 'female': dm['female'],
            'male_malay': dm['male_malay'], 'male_chinese': dm['male_chinese'],
            'male_indian': dm['male_indian'], 'male_other': dm['male_other'],
            'female_malay': dm['female_malay'], 'female_chinese': dm['female_chinese'],
            'female_indian': dm['female_indian'], 'female_other': dm['female_other'],
            'malay_pct': dm['malay_pct'], 'chinese_pct': dm['chinese_pct'],
            'indian_pct': dm['indian_pct'], 'other_pct': dm['other_pct'],
            'age_mean': dm['age_mean'], 'age_median': dm['age_median'], 'contact_pct': dm['contact_pct'],
        },
    })

geojson = {'type': 'FeatureCollection', 'features': features}
with open('dashboard/public/boundaries/dm_centroids.geojson', 'w') as f:
    json.dump(geojson, f)
print(f"Wrote {len(features)} features")

# Final verification
print("\nFinal verification...")
result = d1_query("SELECT dm_code, name, centroid_lng, centroid_lat, dun_code FROM dms WHERE centroid_lng IS NOT NULL AND centroid_lat IS NOT NULL")
dms = result['result'][0]['results']
outside = 0
for dm in dms:
    point = (dm['centroid_lng'], dm['centroid_lat'])
    dun_code = dm['dun_code']
    if dun_code in dun_polygons:
        dun = dun_polygons[dun_code]
        if not point_in_geometry(point, dun['coords'], dun['type']):
            outside += 1
            print(f"  STILL OUTSIDE: {dm['dm_code']} ({dm['name']})")

print(f"\nResult: {len(dms) - outside}/{len(dms)} DMs inside DUN boundaries")
