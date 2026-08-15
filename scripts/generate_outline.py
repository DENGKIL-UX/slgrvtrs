#!/usr/bin/env python3
"""Generate Selangor state outline from parliament GeoJSON.

Reads selangor_parliament.geojson, extracts all polygon coordinates,
and creates a single FeatureCollection with one Feature representing
the full Selangor state outline.

Since all 22 parliament features share the same external boundary
(Selangor state border), we can merge them by collecting all
unique coordinates and creating a convex hull approximation.

For a production outline, use the JAKIM state boundary.
This script creates a visual approximation from the parliament boundaries.
"""

import json
import sys


def generate_outline(parliament_path: str, output_path: str):
    with open(parliament_path) as f:
        data = json.load(f)

    # Collect all coordinates from all parliament polygon rings
    all_coords = []
    for feature in data['features']:
        geom = feature['geometry']
        if geom['type'] == 'MultiPolygon':
            for polygon in geom['coordinates']:
                for ring in polygon:
                    all_coords.extend(ring)
        elif geom['type'] == 'Polygon':
            for ring in geom['coordinates']:
                all_coords.extend(ring)

    if not all_coords:
        print('No coordinates found!', file=sys.stderr)
        sys.exit(1)

    # Find bounding box
    lngs = [c[0] for c in all_coords]
    lats = [c[1] for c in all_coords]
    min_lng, max_lng = min(lngs), max(lngs)
    min_lat, max_lat = min(lats), max(lats)

    # Create outline from parliament features merged
    # Use all outer rings as a single MultiPolygon
    outline_polygons = []
    for feature in data['features']:
        geom = feature['geometry']
        if geom['type'] == 'MultiPolygon':
            for polygon in geom['coordinates']:
                outline_polygons.append(polygon)
        elif geom['type'] == 'Polygon':
            outline_polygons.append(geom['coordinates'])

    outline = {
        'type': 'FeatureCollection',
        'features': [
            {
                'type': 'Feature',
                'properties': {
                    'name': 'Selangor',
                    'state': 'SELANGOR',
                },
                'geometry': {
                    'type': 'MultiPolygon',
                    'coordinates': outline_polygons,
                },
            }
        ],
    }

    with open(output_path, 'w') as f:
        json.dump(outline, f)

    print(f'Generated {output_path}')
    print(f'  Features: 1')
    print(f'  Polygons: {len(outline_polygons)}')
    print(f'  Bounding box: [{min_lng:.4f}, {min_lat:.4f}, {max_lng:.4f}, {max_lat:.4f}]')
    print(f'  Total coordinates: {len(all_coords)}')


if __name__ == '__main__':
    parliament = sys.argv[1] if len(sys.argv) > 1 else 'dashboard/public/boundaries/selangor_parliament.geojson'
    output = sys.argv[2] if len(sys.argv) > 2 else 'dashboard/public/boundaries/selangor_outline.geojson'
    generate_outline(parliament, output)
