#!/usr/bin/env python3
"""Generate D1 SQL LOAD scripts from existing stats JSON files.

Usage:
    python3 scripts/build_d1_load.py [options]

Defaults:
    --parl-input      dashboard/public/stats/parliament.json
    --dun-input       dashboard/public/stats/dun.json
    --dm-input        dashboard/public/stats/dm.json
    --centroids-input dashboard/public/boundaries/dm_centroids.geojson
    --output-dir      dashboard/migrations/

Outputs:
    0002_load_parliaments.sql
    0003_load_duns.sql
    0004_load_dms.sql
"""

import json
import argparse
import os


def sql_escape(s: str) -> str:
    """Escape single quotes for SQL string literals."""
    return s.replace("'", "''")


def generate_parl_sql(data: dict) -> str:
    lines = ["-- Auto-generated from parliament.json", "-- Do NOT edit manually.", ""]

    for _prefix, p in sorted(data.items()):
        lines.append(
            f"INSERT OR REPLACE INTO parliaments "
            f"(code_parlimen, name, voter_prefix, total_voters, male, female, "
            f"male_pct, female_pct, malay_pct, chinese_pct, indian_pct, other_pct, "
            f"age_mean, age_median, contact_pct, child_dun_count) VALUES ("
            f"'{sql_escape(p['code_parlimen'])}', "
            f"'{sql_escape(p['name'])}', "
            f"'{p['code_parlimen'].replace('P.', '')}', "
            f"{p['total_voters']}, {p['male']}, {p['female']}, "
            f"{p['male_pct']}, {p['female_pct']}, "
            f"{p['malay_pct']}, {p['chinese_pct']}, {p['indian_pct']}, {p['other_pct']}, "
            f"{p['age_mean']}, {p['age_median']}, "
            f"{p['contact_pct']}, {p.get('child_dun_count', 0)}"
            f");"
        )

    return "\n".join(lines) + "\n"


def generate_dun_sql(data: dict) -> str:
    lines = ["-- Auto-generated from dun.json", "-- Do NOT edit manually.", ""]

    for _prefix, d in sorted(data.items()):
        lines.append(
            f"INSERT OR REPLACE INTO duns "
            f"(code_dun, name, code_parlimen, voter_prefix, total_voters, male, female, "
            f"male_pct, female_pct, malay_pct, chinese_pct, indian_pct, other_pct, "
            f"age_mean, age_median, contact_pct, dm_count, locality_count) VALUES ("
            f"'{sql_escape(d['code_dun'])}', "
            f"'{sql_escape(d['name'])}', "
            f"'{sql_escape(d['code_parlimen'])}', "
            f"'{d['code_dun'].replace('N.', '').zfill(2)}', "
            f"{d['total_voters']}, {d['male']}, {d['female']}, "
            f"{d['male_pct']}, {d['female_pct']}, "
            f"{d['malay_pct']}, {d['chinese_pct']}, {d['indian_pct']}, {d['other_pct']}, "
            f"{d['age_mean']}, {d['age_median']}, "
            f"{d['contact_pct']}, {d.get('dm_count', 0)}, {d.get('locality_count', 0)}"
            f");"
        )

    return "\n".join(lines) + "\n"


def generate_dm_sql(dm_data: dict, centroids: dict | None) -> str:
    """Generate INSERT statements for the dms table.

    dm_data: dict keyed by dm_code (e.g. "01.BANDAR COUNTRY HOME 1")
    centroids: dict mapping dm_code -> [lng, lat] from dm_centroids.geojson
    """
    lines = [
        "-- Auto-generated from dm.json + dm_centroids.geojson",
        "-- Do NOT edit manually.",
        "",
    ]

    # Build centroid lookup
    coord_map: dict[str, tuple[float, float]] = {}
    if centroids:
        for feat in centroids.get('features', []):
            props = feat.get('properties', {})
            geom = feat.get('geometry')
            code = props.get('dm_code', '')
            if code and geom and geom.get('coordinates'):
                coord_map[code] = (geom['coordinates'][0], geom['coordinates'][1])

    cols = (
        "dm_code, name, dun_code, code_parlimen, voter_prefix, dun_prefix, "
        "total_voters, male, female, male_pct, female_pct, "
        "malay_pct, chinese_pct, indian_pct, other_pct, "
        "age_mean, age_median, contact_pct, "
        "centroid_lng, centroid_lat, "
        "male_malay, male_chinese, male_indian, male_other, "
        "female_malay, female_chinese, female_indian, female_other"
    )

    count = 0
    for _key, d in sorted(dm_data.items()):
        dm_code = d['dm_code']

        # Name: part after the first dot
        name = dm_code.split('.', 1)[1] if '.' in dm_code else dm_code

        # dun_code: "14.RAWANG" -> "N.14" (D1 FK format)
        raw_dun = d.get('dun_code', '')
        dun_num = raw_dun.split('.')[0].zfill(2) if raw_dun else ''
        dun_code_fk = f'N.{dun_num}'

        # code_parlimen: "97.SELAYANG" -> "P.097" (D1 FK format)
        raw_parl = d.get('code_parlimen', '')
        parl_num = raw_parl.split('.')[0].zfill(3) if raw_parl else ''
        parl_code_fk = f'P.{parl_num}'

        # voter_prefix: Parliament numeric prefix (for joining to parliaments table)
        voter_prefix = parl_num

        # dun_prefix: DUN numeric prefix
        dun_prefix = dun_num

        # Centroid coordinates
        coords = coord_map.get(dm_code)
        lng = coords[0] if coords else 'NULL'
        lat = coords[1] if coords else 'NULL'

        # Cross-tab counts
        male_malay = d.get('male_malay', 0)
        male_chinese = d.get('male_chinese', 0)
        male_indian = d.get('male_indian', 0)
        male_other = d.get('male_other', 0)
        female_malay = d.get('female_malay', 0)
        female_chinese = d.get('female_chinese', 0)
        female_indian = d.get('female_indian', 0)
        female_other = d.get('female_other', 0)

        lng_str = str(lng) if lng != 'NULL' else 'NULL'
        lat_str = str(lat) if lat != 'NULL' else 'NULL'

        lines.append(
            f"INSERT OR REPLACE INTO dms ({cols}) VALUES ("
            f"'{sql_escape(dm_code)}', "
            f"'{sql_escape(name)}', "
            f"'{dun_code_fk}', "
            f"'{parl_code_fk}', "
            f"'{voter_prefix}', "
            f"'{dun_prefix}', "
            f"{d['total_voters']}, {d['male']}, {d['female']}, "
            f"{d['male_pct']}, {d['female_pct']}, "
            f"{d['malay_pct']}, {d['chinese_pct']}, {d['indian_pct']}, {d['other_pct']}, "
            f"{d['age_mean']}, {d['age_median']}, {d['contact_pct']}, "
            f"{lng_str}, {lat_str}, "
            f"{male_malay}, {male_chinese}, {male_indian}, {male_other}, "
            f"{female_malay}, {female_chinese}, {female_indian}, {female_other}"
            f");"
        )
        count += 1

    return "\n".join(lines) + "\n", count


def main():
    parser = argparse.ArgumentParser(description="Generate D1 load SQL from stats JSON")
    parser.add_argument("--parl-input", default="dashboard/public/stats/parliament.json")
    parser.add_argument("--dun-input", default="dashboard/public/stats/dun.json")
    parser.add_argument("--dm-input", default="dashboard/public/stats/dm.json")
    parser.add_argument("--centroids-input", default="dashboard/public/boundaries/dm_centroids.geojson")
    parser.add_argument("--output-dir", default="dashboard/migrations")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    # --- Parliaments ---
    with open(args.parl_input) as f:
        parl_data = json.load(f)
    parl_sql = generate_parl_sql(parl_data)
    parl_path = os.path.join(args.output_dir, "0002_load_parliaments.sql")
    with open(parl_path, "w") as f:
        f.write(parl_sql)
    print(f"Generated {parl_path} ({len(parl_data)} parliaments)")

    # --- DUNs ---
    with open(args.dun_input) as f:
        dun_data = json.load(f)
    dun_sql = generate_dun_sql(dun_data)
    dun_path = os.path.join(args.output_dir, "0003_load_duns.sql")
    with open(dun_path, "w") as f:
        f.write(dun_sql)
    print(f"Generated {dun_path} ({len(dun_data)} DUNs)")

    # --- DMs ---
    with open(args.dm_input) as f:
        dm_data = json.load(f)

    centroids = None
    if os.path.exists(args.centroids_input):
        with open(args.centroids_input) as f:
            centroids = json.load(f)
        print(f"Loaded {len(centroids.get('features', []))} centroid coordinates")
    else:
        print(f"WARNING: {args.centroids_input} not found, centroids will be NULL")

    dm_sql, dm_count = generate_dm_sql(dm_data, centroids)
    dm_path = os.path.join(args.output_dir, "0004_load_dms.sql")
    with open(dm_path, "w") as f:
        f.write(dm_sql)
    print(f"Generated {dm_path} ({dm_count} DMs)")

    # Sanity checks
    assert len(parl_data) == 22, f"Expected 22 parliaments, got {len(parl_data)}"
    assert len(dun_data) == 56, f"Expected 56 DUNs, got {len(dun_data)}"
    assert dm_count == 945, f"Expected 945 DMs, got {dm_count}"
    print(f"\nAll assertions passed: 22 parliaments, 56 DUNs, 945 DMs.")


if __name__ == "__main__":
    main()
