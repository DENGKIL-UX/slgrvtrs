#!/usr/bin/env python3
"""Re-compute per-DUN contact_pct from raw xlsx files and patch dun.json.

Reads all 4 xlsx source files using pandas+calamine (fast), groups by DUN_CODE,
computes contact_pct per DUN, then patches the existing dun.json.
"""

import json
import os

import pandas as pd

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(REPO_ROOT, 'data')
DUN_STATS_PATH = os.path.join(REPO_ROOT, 'dashboard/public/stats/dun.json')

XLSX_FILES = [
    '01_SL_part01.1mil (mcw).xlsx',
    '01_SL_part02.1mil (mcw).xlsx',
    '01_SL_part03.1mil (mcw).xlsx',
    '01_SL_part04-971650 (mcw).xlsx',
]


def main():
    frames = []
    for fname in XLSX_FILES:
        fpath = os.path.join(DATA_DIR, fname)
        if not os.path.exists(fpath):
            print(f'WARNING: {fpath} not found, skipping')
            continue
        print(f'Reading {fname} ...', flush=True)
        df = pd.read_excel(fpath, engine='calamine', usecols=['DUN_CODE', 'CONTACT#'])
        print(f'  {len(df):,} rows', flush=True)
        frames.append(df)

    combined = pd.concat(frames, ignore_index=True)
    print(f'Combined: {len(combined):,} rows')

    # DUN_CODE format: "01.SUNGAI AIR TAWAR" → extract numeric prefix
    combined['dun_num'] = combined['DUN_CODE'].astype(str).str.extract(r'^(\d+)')[0].str.zfill(2)

    # Contact: YES = has contact, anything else (NaN, NO, etc.) = no contact
    combined['has_contact'] = combined['CONTACT#'].astype(str).str.upper().str.strip() == 'YES'

    # Group by DUN and compute contact_pct
    per_dun = combined.groupby('dun_num').agg(
        total=('has_contact', 'count'),
        contact_yes=('has_contact', 'sum'),
    )
    per_dun['contact_pct'] = (per_dun['contact_yes'] / per_dun['total'] * 100).round(2)
    print(f'DUNs in xlsx: {len(per_dun)}')

    # Load existing dun.json
    with open(DUN_STATS_PATH) as f:
        dun_stats = json.load(f)
    print(f'dun.json DUNs: {len(dun_stats)}')

    # Patch
    matched = 0
    unmatched_xlsx = []
    for dun_num, row in per_dun.iterrows():
        if dun_num in dun_stats:
            old = dun_stats[dun_num].get('contact_pct', 'N/A')
            new = float(row['contact_pct'])
            dun_stats[dun_num]['contact_pct'] = new
            matched += 1
            if matched <= 5 or abs(new - (old if isinstance(old, (int, float)) else 999)) > 0.5:
                name = dun_stats[dun_num]['name']
                print(f'  {dun_num} ({name}): {old} -> {new}')
        else:
            unmatched_xlsx.append(dun_num)

    print(f'Matched: {matched}/{len(dun_stats)} DUNs')
    if unmatched_xlsx:
        print(f'Unmatched xlsx DUN codes: {unmatched_xlsx}')

    patched_keys = set(per_dun.index)
    missing = [k for k in dun_stats if k not in patched_keys]
    if missing:
        print(f'WARNING: {len(missing)} dun.json keys had no xlsx data: {missing}')

    # Write
    with open(DUN_STATS_PATH, 'w') as f:
        json.dump(dun_stats, f, indent=2)

    fsize = os.path.getsize(DUN_STATS_PATH)
    print(f'Wrote {len(dun_stats)} DUN stats ({fsize:,} bytes)')

    pcts = [v['contact_pct'] for v in dun_stats.values()]
    print(f'contact_pct range: {min(pcts)} - {max(pcts)}')
    print(f'Unique values: {len(set(pcts))}')
    print(f'Mean: {sum(pcts)/len(pcts):.2f}')


if __name__ == '__main__':
    main()
