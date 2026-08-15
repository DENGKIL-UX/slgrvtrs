#!/usr/bin/env python3
"""Verify parliament.json contact_pct matches raw xlsx data."""

import json
import pandas as pd

REPO = '/home/z/my-project/slgrvtrs-repo'

frames = []
for fname in ['01_SL_part01.1mil (mcw).xlsx', '01_SL_part02.1mil (mcw).xlsx',
               '01_SL_part03.1mil (mcw).xlsx', '01_SL_part04-971650 (mcw).xlsx']:
    df = pd.read_excel(f'{REPO}/data/{fname}', engine='calamine',
                       usecols=['PARLIAMENT_CODE', 'CONTACT#'])
    frames.append(df)

c = pd.concat(frames, ignore_index=True)
c['has_contact'] = c['CONTACT#'].astype(str).str.upper().str.strip() == 'YES'
c['parl_num'] = c['PARLIAMENT_CODE'].astype(str).str.extract(r'^(\d+)')[0].str.zfill(3)

g = c.groupby('parl_num').agg(total=('has_contact', 'count'), yes=('has_contact', 'sum'))
g['pct'] = (g['yes'] / g['total'] * 100).round(2)

with open(f'{REPO}/dashboard/public/stats/parliament.json') as f:
    parl = json.load(f)

diffs = 0
for pnum in sorted(g.index):
    jkey = pnum  # parliament.json keys are '092'..'113'
    xlsx_pct = g.loc[pnum, 'pct']
    json_pct = parl.get(jkey, {}).get('contact_pct', -999)
    name = parl.get(jkey, {}).get('name', '?')
    if json_pct == -999:
        print(f'{jkey} {name}: MISSING in json')
        diffs += 1
    elif abs(xlsx_pct - json_pct) >= 0.1:
        diffs += 1
        print(f'{jkey} {name}: xlsx={xlsx_pct} json={json_pct}')

print(f'Diffs: {diffs}/22')
if diffs == 0:
    print('All 22 Parliament contact_pct values match raw xlsx data.')
