#!/usr/bin/env python3
"""Generate D1 SQL LOAD scripts from existing stats JSON files.

Usage:
    python3 scripts/build_d1_load.py [--parl-input=PATH] [--dun-input=PATH] [--output-dir=DIR]

Defaults:
    --parl-input  dashboard/public/stats/parliament.json
    --dun-input   dashboard/public/stats/dun.json
    --output-dir  dashboard/migrations/

Outputs:
    0002_load_parliaments.sql
    0003_load_duns.sql
"""

import json
import argparse
import os
import sys


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
            f"'{p['code_parlimen'].replace('P.', '')}', "  # voter_prefix = '100', '101', etc.
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
            f"'{d['code_dun'].replace('N.', '').zfill(2)}', "  # voter_prefix = '01', '02', etc.
            f"{d['total_voters']}, {d['male']}, {d['female']}, "
            f"{d['male_pct']}, {d['female_pct']}, "
            f"{d['malay_pct']}, {d['chinese_pct']}, {d['indian_pct']}, {d['other_pct']}, "
            f"{d['age_mean']}, {d['age_median']}, "
            f"{d['contact_pct']}, {d.get('dm_count', 0)}, {d.get('locality_count', 0)}"
            f");"
        )

    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description="Generate D1 load SQL from stats JSON")
    parser.add_argument("--parl-input", default="dashboard/public/stats/parliament.json")
    parser.add_argument("--dun-input", default="dashboard/public/stats/dun.json")
    parser.add_argument("--output-dir", default="dashboard/migrations")
    args = parser.parse_args()

    # Load JSON
    with open(args.parl_input) as f:
        parl_data = json.load(f)
    with open(args.dun_input) as f:
        dun_data = json.load(f)

    # Generate SQL
    parl_sql = generate_parl_sql(parl_data)
    dun_sql = generate_dun_sql(dun_data)

    # Write
    os.makedirs(args.output_dir, exist_ok=True)

    parl_path = os.path.join(args.output_dir, "0002_load_parliaments.sql")
    dun_path = os.path.join(args.output_dir, "0003_load_duns.sql")

    with open(parl_path, "w") as f:
        f.write(parl_sql)
    with open(dun_path, "w") as f:
        f.write(dun_sql)

    print(f"Generated {parl_path} ({len(parl_data)} parliaments)")
    print(f"Generated {dun_path} ({len(dun_data)} DUNs)")

    # Quick sanity check
    assert len(parl_data) == 22, f"Expected 22 parliaments, got {len(parl_data)}"
    assert len(dun_data) == 56, f"Expected 56 DUNs, got {len(dun_data)}"
    print(f"\nAll assertions passed: 22 parliaments, 56 DUNs.")


if __name__ == "__main__":
    main()
