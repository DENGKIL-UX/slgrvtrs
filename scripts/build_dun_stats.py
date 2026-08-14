#!/usr/bin/env python3
"""Build stats/dun.json from full_analysis.json.

Transforms the dun_analysis dict (keyed by voter code like "01.SUNGAI AIR TAWAR")
into the stats/dun.json format (keyed by voter_prefix like "01") matching the
GeoJSON voter_prefix property.
"""

import json
import os

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

with open(os.path.join(REPO_ROOT, 'analysis/full_analysis.json')) as f:
    analysis = json.load(f)

dun_analysis = analysis['dun_analysis']  # keyed by "01.SUNGAI AIR TAWAR"
data_completeness = analysis.get('data_completeness', {})

# Get contact_pct from per_file_analysis (average across files)
per_file = analysis.get('per_file_analysis', [])
if per_file:
    contact_pcts = [pf.get('contact_pct', 0) for pf in per_file if 'contact_pct' in pf]
    avg_contact = sum(contact_pcts) / len(contact_pcts) if contact_pcts else 0
else:
    avg_contact = data_completeness.get('contact_pct', 0)

stats = {}

for key, val in dun_analysis.items():
    # key format: "01.SUNGAI AIR TAWAR"
    voter_code = key.split('.')[0]  # "01"
    # Pad to 2 digits (DUN codes are 01-56)
    voter_prefix = voter_code.zfill(2)

    # Parliament code from voter data: "92.SABAK BERNAM" → "P.092"
    parl_raw = val['parliament']  # "92.SABAK BERNAM"
    parl_num = parl_raw.split('.')[0].zfill(3)  # "092"
    code_parlimen = f'P.{parl_num}'  # "P.092"

    total = val['voters']
    male = val['male']
    female = val['female']

    # Compute other_pct (Malay + Chinese + Indian + Other = 100%)
    malay_pct = val['malay_pct']
    chinese_pct = val['chinese_pct']
    indian_pct = val['indian_pct']
    other_pct = round(100 - malay_pct - chinese_pct - indian_pct, 2)

    stats[voter_prefix] = {
        'code_dun': f'N.{voter_prefix}',
        'name': key.split('.', 1)[1] if '.' in key else key,
        'code_parlimen': code_parlimen,
        'total_voters': total,
        'male': male,
        'female': female,
        'male_pct': round(male / total * 100, 1),
        'female_pct': round(female / total * 100, 1),
        'malay_pct': malay_pct,
        'chinese_pct': chinese_pct,
        'indian_pct': indian_pct,
        'other_pct': other_pct,
        'age_mean': val['age_mean'],
        'age_median': val['age_median'],
        'contact_pct': round(avg_contact, 2),
        'dm_count': val['dm_count'],
        'locality_count': val.get('locality_count', 0),
    }

out_path = os.path.join(REPO_ROOT, 'dashboard/public/stats/dun.json')
with open(out_path, 'w') as f:
    json.dump(stats, f, indent=2)

fsize = os.path.getsize(out_path)
print(f'Wrote {len(stats)} DUN stats to {out_path} ({fsize:,} bytes)')
print(f'Sample key: {sorted(stats.keys())[0]} → {stats[sorted(stats.keys())[0]]["code_dun"]} {stats[sorted(stats.keys())[0]]["name"]}')
print(f'Sample key: {sorted(stats.keys())[-1]} → {stats[sorted(stats.keys())[-1]]["code_dun"]} {stats[sorted(stats.keys())[-1]]["name"]}')
