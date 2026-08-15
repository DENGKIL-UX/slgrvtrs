#!/usr/bin/env python3
"""Build stats/dm.json from raw XLSX voter data.

Reads XLSX files one at a time (to limit memory), groups by DM_CODE,
and computes per-DM statistics incrementally.

Output: dashboard/public/stats/dm.json  (keyed by dm_code)
"""

import gc
import json
import os
from collections import defaultdict

import pandas as pd
import numpy as np

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(REPO_ROOT, 'data')
OUT_PATH = os.path.join(REPO_ROOT, 'dashboard/public/stats/dm.json')

XLSX_FILES = sorted([f for f in os.listdir(DATA_DIR) if f.endswith('.xlsx')])

USECOLS = ['GENDER', 'RACE', 'AGE', 'CONTACT#', 'DM_CODE', 'DUN_CODE', 'PARLIAMENT_CODE']


def process_file(fpath, accum):
    """Read one XLSX, aggregate into accum dict, then discard."""
    print(f'  Reading {os.path.basename(fpath)} ...', flush=True)
    df = pd.read_excel(fpath, engine='openpyxl', usecols=USECOLS)
    print(f'    {len(df):,} rows read', flush=True)

    df['DM_CODE'] = df['DM_CODE'].astype(str).str.strip()
    df = df.dropna(subset=['DM_CODE'])
    df['AGE'] = pd.to_numeric(df['AGE'], errors='coerce')
    df['CONTACT_YES'] = df['CONTACT#'].astype(str).str.upper() == 'YES'

    for dm_code, g in df.groupby('DM_CODE'):
        n = len(g)
        a = accum[dm_code]
        a['total'] += n
        a['male'] += int((g['GENDER'] == 'M').sum())
        a['female'] += int((g['GENDER'] == 'F').sum())
        a['malay'] += int((g['RACE'] == 'M').sum())
        a['chinese'] += int((g['RACE'] == 'C').sum())
        a['indian'] += int((g['RACE'] == 'I').sum())
        a['male_malay'] += int(((g['GENDER'] == 'M') & (g['RACE'] == 'M')).sum())
        a['male_chinese'] += int(((g['GENDER'] == 'M') & (g['RACE'] == 'C')).sum())
        a['male_indian'] += int(((g['GENDER'] == 'M') & (g['RACE'] == 'I')).sum())
        a['female_malay'] += int(((g['GENDER'] == 'F') & (g['RACE'] == 'M')).sum())
        a['female_chinese'] += int(((g['GENDER'] == 'F') & (g['RACE'] == 'C')).sum())
        a['female_indian'] += int(((g['GENDER'] == 'F') & (g['RACE'] == 'I')).sum())

        ages = g['AGE'].dropna()
        if len(ages) > 0:
            a['age_sum'] += float(ages.sum())
            a['age_count'] += len(ages)

        a['contact_yes'] += int(g['CONTACT_YES'].sum())

        if not a['dun_code']:
            v = g['DUN_CODE'].dropna()
            if len(v) > 0:
                a['dun_code'] = str(v.iloc[0]).strip()
        if not a['parl_code']:
            v = g['PARLIAMENT_CODE'].dropna()
            if len(v) > 0:
                a['parl_code'] = str(v.iloc[0]).strip()

    del df
    gc.collect()
    print(f'    Done, {len(accum)} DMs so far', flush=True)


def make_accum():
    return defaultdict(lambda: {
        'total': 0, 'male': 0, 'female': 0,
        'malay': 0, 'chinese': 0, 'indian': 0,
        'age_sum': 0.0, 'age_count': 0,
        'contact_yes': 0,
        'dun_code': '', 'parl_code': '',
        'male_malay': 0, 'male_chinese': 0, 'male_indian': 0,
        'female_malay': 0, 'female_chinese': 0, 'female_indian': 0,
    })


def main():
    print('=== Building DM Stats ===', flush=True)
    print(f'Files: {XLSX_FILES}', flush=True)

    accum = make_accum()

    for fname in XLSX_FILES:
        fpath = os.path.join(DATA_DIR, fname)
        if not os.path.exists(fpath):
            print(f'  SKIP: {fpath} not found', flush=True)
            continue
        process_file(fpath, accum)

    # Build final stats
    print(f'\nBuilding final stats for {len(accum)} DMs...', flush=True)
    stats = {}
    total_voters_all = 0

    for dm_code in sorted(accum.keys()):
        d = accum[dm_code]
        total = d['total']
        if total == 0:
            continue
        total_voters_all += total

        male = d['male']
        female = d['female']
        malay = d['malay']
        chinese = d['chinese']
        indian = d['indian']

        male_pct = round(male / total * 100, 1)
        female_pct = round(female / total * 100, 1)
        malay_pct = round(malay / total * 100, 2)
        chinese_pct = round(chinese / total * 100, 2)
        indian_pct = round(indian / total * 100, 2)
        other_pct = round(max(0, 100 - malay_pct - chinese_pct - indian_pct), 2)

        age_count = d['age_count']
        age_mean = round(d['age_sum'] / age_count, 2) if age_count > 0 else 0
        age_median = round(age_mean, 1)  # approx

        contact_pct = round(d['contact_yes'] / total * 100, 2) if total > 0 else 0

        dun_code = d['dun_code']
        parl_code = d['parl_code']
        dun_prefix = dun_code.replace('N.', '').strip() if dun_code.startswith('N.') else dun_code

        mm, mc, mi = d['male_malay'], d['male_chinese'], d['male_indian']
        fm, fc, fi = d['female_malay'], d['female_chinese'], d['female_indian']

        stats[dm_code] = {
            'dm_code': dm_code,
            'dun_code': dun_code,
            'dun_prefix': dun_prefix,
            'code_parlimen': parl_code,
            'total_voters': total,
            'male': male,
            'female': female,
            'male_pct': male_pct,
            'female_pct': female_pct,
            'malay_pct': malay_pct,
            'chinese_pct': chinese_pct,
            'indian_pct': indian_pct,
            'other_pct': other_pct,
            'age_mean': age_mean,
            'age_median': age_median,
            'contact_pct': contact_pct,
            'male_malay': mm,
            'male_chinese': mc,
            'male_indian': mi,
            'male_other': max(0, male - mm - mc - mi),
            'female_malay': fm,
            'female_chinese': fc,
            'female_indian': fi,
            'female_other': max(0, female - fm - fc - fi),
        }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w') as f:
        json.dump(stats, f, indent=2)

    fsize = os.path.getsize(OUT_PATH)
    print(f'\nWrote {len(stats)} DM stats to {OUT_PATH} ({fsize:,} bytes)')
    print(f'Total voters: {total_voters_all:,} | Expected: ~3,971,650 | Delta: {abs(total_voters_all - 3971650):,}')

    for k in sorted(stats.keys())[:3]:
        s = stats[k]
        print(f'  {k}: {s["dun_code"]} -> {s["total_voters"]:,} voters')


if __name__ == '__main__':
    main()
