#!/usr/bin/env python3
"""Generate DM centroid points using Shapely grid-in-polygon strategy.

For each DUN polygon:
  1. Create a regular grid of points inside the polygon
  2. Sort DMs within that DUN by their voter count (largest first)
  3. Assign each DM to the nearest unoccupied grid point
  4. Output dm_centroids.geojson with ~945 Point features

This produces deterministic, evenly-spaced centroids that respect
DUN boundaries — ideal for proportional bubble visualization.
"""

import json
import math
import os

from shapely.geometry import Point, Polygon, MultiPolygon, shape
from shapely.ops import unary_union

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DUN_GEOJSON = os.path.join(REPO_ROOT, 'dashboard/public/boundaries/selangor_dun.geojson')
DM_STATS = os.path.join(REPO_ROOT, 'dashboard/public/stats/dm.json')
OUT_PATH = os.path.join(REPO_ROOT, 'dashboard/public/boundaries/dm_centroids.geojson')

# Grid spacing in degrees (~350m at latitude 3°N)
GRID_SPACING = 0.004


def grid_points_in_polygon(polygon, spacing):
    """Generate a regular grid of points inside a polygon."""
    minx, miny, maxx, maxy = polygon.bounds
    points = []
    x = minx + spacing / 2
    while x < maxx:
        y = miny + spacing / 2
        while y < maxy:
            p = Point(x, y)
            if polygon.contains(p):
                points.append((x, y))
            y += spacing
        x += spacing
    return points



def main():
    print('=== Generating DM Centroids (Grid-in-Polygon) ===', flush=True)

    # Load DUN GeoJSON
    with open(DUN_GEOJSON) as f:
        dun_geojson = json.load(f)
    print(f'Loaded {len(dun_geojson["features"])} DUN features', flush=True)

    # Load DM stats
    with open(DM_STATS) as f:
        dm_stats = json.load(f)
    print(f'Loaded {len(dm_stats)} DM stats', flush=True)

    # Group DMs by dun_prefix (which matches voter_prefix in GeoJSON)
    duns = {}
    for feat in dun_geojson['features']:
        vp = feat['properties'].get('voter_prefix', '')
        duns[vp] = feat

    # Group DM codes by dun_prefix
    dm_by_dun = {}
    for dm_code, s in dm_stats.items():
        dp = s['dun_prefix']
        if dp not in dm_by_dun:
            dm_by_dun[dp] = []
        dm_by_dun[dp].append(dm_code)

    print(f'DUNs with DMs: {len(dm_by_dun)}', flush=True)

    # Generate centroids
    all_features = []
    total_assigned = 0
    total_unassigned = 0

    for dun_prefix in sorted(dm_by_dun.keys()):
        dm_codes = dm_by_dun[dun_prefix]
        feat = duns.get(dun_prefix)

        if not feat:
            print(f'  WARNING: No DUN polygon for prefix {dun_prefix}, skipping {len(dm_codes)} DMs', flush=True)
            total_unassigned += len(dm_codes)
            continue

        geom = shape(feat['geometry'])

        # Handle both Polygon and MultiPolygon
        if geom.geom_type == 'MultiPolygon':
            polygon = unary_union(geom.geoms)
        else:
            polygon = geom

        # Generate grid points inside this DUN
        grid_pts = grid_points_in_polygon(polygon, GRID_SPACING)
        print(f'  DUN {dun_prefix}: {len(dm_codes)} DMs, {len(grid_pts)} grid points', flush=True)

        if len(grid_pts) < len(dm_codes):
            # Reduce grid spacing and retry
            tighter_pts = grid_points_in_polygon(polygon, GRID_SPACING * 0.5)
            if len(tighter_pts) >= len(dm_codes):
                grid_pts = tighter_pts
                print(f'    Tighter grid: {len(grid_pts)} points', flush=True)

        # Sort DMs by total_voters descending for deterministic assignment
        sorted_dms = sorted(dm_codes, key=lambda c: dm_stats[c]['total_voters'], reverse=True)

        # Use sequential grid point assignment (deterministic, spatially distributed)
        assigned = min(len(sorted_dms), len(grid_pts))

        for i, dm_code in enumerate(sorted_dms):
            s = dm_stats[dm_code]

            if i < len(grid_pts):
                lng, lat = grid_pts[i]
                total_assigned += 1
            else:
                # Fallback: use DUN centroid + small random offset
                c = polygon.centroid
                lng = c.x + (i - len(grid_pts)) * 0.001
                lat = c.y + (i - len(grid_pts)) * 0.001
                total_unassigned += 1

            all_features.append({
                'type': 'Feature',
                'properties': {
                    'dm_code': dm_code,
                    'dun_code': s['dun_code'],
                    'dun_prefix': s['dun_prefix'],
                    'code_parlimen': s['code_parlimen'],
                    'total_voters': s['total_voters'],
                    'male': s['male'],
                    'female': s['female'],
                    'male_pct': s['male_pct'],
                    'female_pct': s['female_pct'],
                    'malay_pct': s['malay_pct'],
                    'chinese_pct': s['chinese_pct'],
                    'indian_pct': s['indian_pct'],
                    'other_pct': s['other_pct'],
                    'age_mean': s['age_mean'],
                    'age_median': s['age_median'],
                    'contact_pct': s['contact_pct'],
                    'male_malay': s['male_malay'],
                    'male_chinese': s['male_chinese'],
                    'male_indian': s['male_indian'],
                    'male_other': s['male_other'],
                    'female_malay': s['female_malay'],
                    'female_chinese': s['female_chinese'],
                    'female_indian': s['female_indian'],
                    'female_other': s['female_other'],
                },
                'geometry': {
                    'type': 'Point',
                    'coordinates': [round(lng, 6), round(lat, 6)],
                },
            })

    # Build GeoJSON
    collection = {
        'type': 'FeatureCollection',
        'features': all_features,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w') as f:
        json.dump(collection, f, indent=2)

    fsize = os.path.getsize(OUT_PATH)
    print(f'\nWrote {len(all_features)} DM centroids to {OUT_PATH} ({fsize:,} bytes)', flush=True)
    print(f'Assigned: {total_assigned}, Fallback: {total_unassigned}', flush=True)

    # Verify
    if all_features:
        sample = all_features[0]
        print(f'Sample: {sample["properties"]["dm_code"]} at {sample["geometry"]["coordinates"]}', flush=True)
    else:
        print('WARNING: No features generated!', flush=True)


if __name__ == '__main__':
    main()
