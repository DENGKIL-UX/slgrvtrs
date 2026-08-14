#!/usr/bin/env python3
"""Filter ElectionData DUN GeoJSON to Selangor-only and add join properties."""

import json
import os

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Read ElectionData DUN source
with open(os.path.join(REPO_ROOT, 'boundaries/research/electiondata_2018_dun.geojson')) as f:
    data = json.load(f)

sel = [f for f in data['features'] if f['properties']['state'] == 'Selangor']
print(f'Found {len(sel)} Selangor DUN features')

# Add join properties and feature IDs
for i, f in enumerate(sel):
    code = f['properties']['code_dun']  # "N.25"
    f['properties']['voter_prefix'] = code.replace('N.', '')  # "25"
    f['properties']['parent_parl'] = f['properties']['code_parlimen']  # "P.102"
    f['id'] = i + 1  # Integer ID for feature-state (top-level, NOT in properties)

result = {
    "type": "FeatureCollection",
    "metadata": {
        "title": "Selangor DUN Constituency Boundaries (2018 Delimitation)",
        "authority": "Suruhanjaya Pilihan Raya (SPR)",
        "derived_from": "SPR 2018 Peninsular Malaysia delimitation",
        "data_provider": "ElectionData.MY",
        "source_url": "https://electiondata.my",
        "license": "Open data (see ElectionData.MY terms)",
        "notes": "Derived open dataset; not the legal instrument."
    },
    "features": sel
}

out_path = os.path.join(REPO_ROOT, 'dashboard/public/boundaries/selangor_dun.geojson')
with open(out_path, 'w') as f:
    json.dump(result, f)

fsize = os.path.getsize(out_path)
print(f'Wrote {len(sel)} DUN features to {out_path} ({fsize:,} bytes, {fsize/1024:.0f} KB)')
