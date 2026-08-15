#!/usr/bin/env python3
"""Build stats/dun.json from full_analysis.json + raw xlsx files.

Transforms the dun_analysis dict (keyed by voter code like "01.SUNGAI AIR TAWAR")
into the stats/dun.json format (keyed by voter_prefix like "01") matching the
GeoJSON voter_prefix property.

contact_pct is computed PER-DUN from the raw xlsx files (not the global average)
using pandas+calamine. full_analysis.json's dun_analysis lacks per-DUN contact data.
"""

import json
import os

import pandas as pd

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(REPO_ROOT, 'data')

XLSX_FILES = [
    '01_SL_part01.1mil (mcw).xlsx',
    '01_SL_part02.1mil (mcw).xlsx',
    '01_SL_part03.1mil (mcw).xlsx',
    '01_SL_part04-971650 (mcw).xlsx',
]

with open(os.path.join(REPO_ROOT, 'analysis/full_analysis.json')) as f:
    analysis = json.load(f)

dun_analysis = analysis['dun_analysis']  # keyed by "01.SUNGAI AIR TAWAR"

# --- Compute per-DUN contact_pct from raw xlsx files ---
print('Computing per-DUN contact_pct from xlsx ...', flush=True)
frames = []
for fname in XLSX_FILES:
    fpath = os.path.join(DATA_DIR, fname)
    if os.path.exists(fpath):
        df = pd.read_excel(fpath, engine='calamine', usecols=['DUN_CODE', 'CONTACT#'])
        frames.append(df)
        print(f'  {fname}: {len(df):,} rows', flush=True)

combined = pd.concat(frames, ignore_index=True)
combined['dun_num'] = combined['DUN_CODE'].astype(str).str.extract(r'^(\d+)')[0].str.zfill(2)
combined['has_contact'] = combined['CONTACT#'].astype(str).str.upper().str.strip() == 'YES'
per_dun = combined.groupby('dun_num').agg(
    total=('has_contact', 'count'),
    contact_yes=('has_contact', 'sum'),
)
per_dun_contact = (per_dun['contact_yes'] / per_dun['total'] * 100).round(2).to_dict()
print(f'  {len(per_dun_contact)} DUNs with contact data', flush=True)

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
        'contact_pct': per_dun_contact.get(voter_prefix, 0),
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
