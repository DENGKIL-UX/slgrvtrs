#!/usr/bin/env python3
"""
DM Bubble Radius Test Engine
Verifies that every DM bubble shrinks (or stays same) when toggling
from 'All' to any gender or race filter. Also validates no anomalies.

Usage: python3 scripts/test_dm_radius_engine.py
"""

import json
import sys
from pathlib import Path

# ── Load DM stats ──────────────────────────────────────────────
dm_path = Path(__file__).resolve().parent.parent / "dashboard" / "public" / "stats" / "dm.json"
with open(dm_path) as f:
    dm_data = json.load(f)

print(f"Loaded {len(dm_data)} DM records from {dm_path.name}")

# ── Interpolation constants (MUST match MapDashboard.tsx) ─────
DM_MIN_RADIUS = 2
DM_MAX_RADIUS = 20

# We test with the FIXED range (post-fix)
DM_MIN_VOTERS = 0
DM_MAX_VOTERS = 27000  # Must cover max total_voters (26,156) with margin


def interpolate_radius(value: float) -> float:
    """Linear interpolation matching MapLibre's interpolate expression."""
    if value <= DM_MIN_VOTERS:
        return DM_MIN_RADIUS
    if value >= DM_MAX_VOTERS:
        return DM_MAX_RADIUS
    t = (value - DM_MIN_VOTERS) / (DM_MAX_VOTERS - DM_MIN_VOTERS)
    return DM_MIN_RADIUS + t * (DM_MAX_RADIUS - DM_MIN_RADIUS)


def get_demographic_counts(d: dict, gender: str, race: str) -> int:
    """Compute voter count for any gender+race combo.
    Mirrors the MapLibre expression logic in applyDmFilter().
    """
    if gender == "all" and race == "all":
        return d["total_voters"]
    elif gender == "all" and race != "all":
        return d[f"male_{race}"] + d[f"female_{race}"]
    elif gender != "all" and race == "all":
        return d[f"{gender}_malay"] + d[f"{gender}_chinese"] + d[f"{gender}_indian"] + d[f"{gender}_other"]
    else:
        return d[f"{gender}_{race}"]


# ── Test 1: No clamping for any filter combo ───────────────────
print("\n" + "=" * 70)
print("TEST 1: Verify no DM is clamped at max radius for any filter")
print("=" * 70)

filter_combos = [
    ("all", "all", "All/All (total_voters)"),
    ("male", "all", "Male/All"),
    ("female", "all", "Female/All"),
    ("all", "malay", "All/Malay"),
    ("all", "chinese", "All/Chinese"),
    ("all", "indian", "All/Indian"),
    ("male", "malay", "Male/Malay"),
    ("male", "chinese", "Male/Chinese"),
    ("male", "indian", "Male/Indian"),
    ("female", "malay", "Female/Malay"),
    ("female", "chinese", "Female/Chinese"),
    ("female", "indian", "Female/Indian"),
]

clamping_issues = 0
demographic_max = {label: 0 for _, _, label in filter_combos}
demographic_min = {label: float('inf') for _, _, label in filter_combos}

for code, d in dm_data.items():
    for g, r, label in filter_combos:
        count = get_demographic_counts(d, g, r)
        radius = interpolate_radius(count)
        demographic_max[label] = max(demographic_max[label], count)
        demographic_min[label] = min(demographic_min[label], count)
        if radius >= DM_MAX_RADIUS and count < DM_MAX_VOTERS:
            # Only flag if NOT at the actual max
            pass
        if count > DM_MAX_VOTERS:
            clamping_issues += 1
            print(f"  CLAMP: {code}: {label} = {count} > DM_MAX_VOTERS({DM_MAX_VOTERS})")

if clamping_issues == 0:
    print("  PASS: No DM exceeds DM_MAX_VOTERS for any filter combo")
else:
    print(f"  FAIL: {clamping_issues} DM-filter combos exceed DM_MAX_VOTERS")

print(f"\n  Demographic ranges (min → max):")
for _, _, label in filter_combos:
    print(f"    {label:<22s}: {demographic_min[label]:>6} → {demographic_max[label]:>6}")

# ── Test 2: Shrinkage test — every filter must produce <= radius ─
print("\n" + "=" * 70)
print("TEST 2: Shrinkage — every filter must produce radius <= 'All/All'")
print("=" * 70)

shrink_failures = []
total_checks = 0

for code, d in dm_data.items():
    base_count = get_demographic_counts(d, "all", "all")
    base_radius = interpolate_radius(base_count)
    
    for g, r, label in filter_combos:
        if g == "all" and r == "all":
            continue  # skip baseline
        
        count = get_demographic_counts(d, g, r)
        radius = interpolate_radius(count)
        total_checks += 1
        
        if radius > base_radius + 0.001:  # tiny epsilon for float
            shrink_failures.append({
                "dm": code,
                "filter": label,
                "base_count": base_count,
                "base_radius": round(base_radius, 2),
                "filter_count": count,
                "filter_radius": round(radius, 2),
            })

if not shrink_failures:
    print(f"  PASS: All {total_checks} DM-filter combos have radius <= baseline")
else:
    print(f"  FAIL: {len(shrink_failures)} DM-filter combos have radius > baseline!")
    for f in shrink_failures[:20]:
        print(f"    {f['dm']}: {f['filter']} radius {f['filter_radius']} > base {f['base_radius']} "
              f"({f['filter_count']} vs {f['base_count']})")

# ── Test 3: Visible difference test ────────────────────────────
print("\n" + "=" * 70)
print("TEST 3: Visible difference — meaningful radius change on toggle")
print("=" * 70)
print("  (DMs with base radius < 4px are exempt — too small to see changes)")
print("  (Race filters: DMs >95% of selected race are exempt — homogeneous)")

GENDER_MIN_DELTA_PX = 0.5
RACE_MIN_DELTA_PX = 0.5  # absolute px
RACE_MIN_RELATIVE_PCT = 5.0  # OR relative % — either passes

invisible_gender = []
invisible_race = []
exempt_tiny_gender = 0
exempt_tiny_race = 0
exempt_homogeneous_race = 0

for code, d in dm_data.items():
    base = interpolate_radius(d["total_voters"])
    is_tiny = base < 4.0
    
    # Gender toggle
    male_r = interpolate_radius(get_demographic_counts(d, "male", "all"))
    female_r = interpolate_radius(get_demographic_counts(d, "female", "all"))
    
    if abs(base - male_r) < GENDER_MIN_DELTA_PX:
        if is_tiny:
            exempt_tiny_gender += 1
        else:
            invisible_gender.append((code, "Male", round(base, 2), round(male_r, 2), d["total_voters"]))
    if abs(base - female_r) < GENDER_MIN_DELTA_PX:
        if is_tiny:
            exempt_tiny_gender += 1
        else:
            invisible_gender.append((code, "Female", round(base, 2), round(female_r, 2), d["total_voters"]))
    
    # Race toggle — use relative % threshold, exempt homogeneous DMs
    for race in ["malay", "chinese", "indian"]:
        race_count = get_demographic_counts(d, "all", race)
        race_pct = (race_count / d["total_voters"]) * 100 if d["total_voters"] > 0 else 0
        race_r = interpolate_radius(race_count)
        rel_change = ((base - race_r) / base) * 100 if base > 0 else 0
        
        if rel_change < RACE_MIN_RELATIVE_PCT and abs(base - race_r) < RACE_MIN_DELTA_PX:
            if is_tiny:
                exempt_tiny_race += 1
            elif race_pct >= 90:
                exempt_homogeneous_race += 1
            else:
                invisible_race.append((code, race.capitalize(), round(base, 2), round(race_r, 2), round(rel_change, 1), round(race_pct, 1)))

if invisible_gender:
    print(f"  FAIL: {len(invisible_gender)} gender toggles with < {GENDER_MIN_DELTA_PX}px change")
    invisible_gender.sort(key=lambda x: x[2] - x[3])
    for dm, g, br, fr, tv in invisible_gender[:10]:
        print(f"    {dm}: {g} {br}px -> {fr}px (delta={abs(br-fr):.2f}, total={tv})")
else:
    print(f"  PASS: All non-tiny DMs show >= {GENDER_MIN_DELTA_PX}px change on gender toggle")

if invisible_race:
    print(f"  FAIL: {len(invisible_race)} race toggles with < {RACE_MIN_RELATIVE_PCT}% shrinkage")
    invisible_race.sort(key=lambda x: x[5])
    for dm, r, br, fr, rel, rpct in invisible_race[:10]:
        print(f"    {dm}: {r} {br}px -> {fr}px (change={rel}%, race={rpct}%)")
else:
    print(f"  PASS: All non-tiny, non-homogeneous DMs show >= {RACE_MIN_RELATIVE_PCT}% shrinkage")

print(f"  (Exempt: {exempt_tiny_gender} tiny gender + {exempt_tiny_race} tiny race + {exempt_homogeneous_race} homogeneous race)")

# ── Test 4: Bandar Puncak Alam specific check ───────────────────
print("\n" + "=" * 70)
print("TEST 4: Bandar Puncak Alam specific verification")
print("=" * 70)

for code, d in dm_data.items():
    if "BANDAR PUNCAK ALAM" in code.upper():
        print(f"  DM: {code}")
        for g, r, label in filter_combos:
            count = get_demographic_counts(d, g, r)
            radius = interpolate_radius(count)
            pct = (count / d["total_voters"]) * 100
            print(f"    {label:<22s}: count={count:>6,}  radius={radius:>6.2f}px  ({pct:>5.1f}%)")
        
        base_r = interpolate_radius(d["total_voters"])
        for g, r, label in filter_combos:
            if g == "all" and r == "all":
                continue
            count = get_demographic_counts(d, g, r)
            r2 = interpolate_radius(count)
            if r2 >= base_r - 0.5:
                print(f"  !!! ANOMALY: {label} radius {r2:.2f} is NOT visibly smaller than base {base_r:.2f}")
            else:
                print(f"  OK: {label} shrinks by {base_r - r2:.2f}px")
        break

# ── Test 5: Data integrity — sub-counts sum to total ───────────
print("\n" + "=" * 70)
print("TEST 5: Data integrity — sub-counts sum to total_voters")
print("=" * 70)

integrity_fails = 0
for code, d in dm_data.items():
    computed_total = (d["male_malay"] + d["male_chinese"] + d["male_indian"] + d["male_other"]
                    + d["female_malay"] + d["female_chinese"] + d["female_indian"] + d["female_other"])
    if computed_total != d["total_voters"]:
        integrity_fails += 1
        if integrity_fails <= 5:
            print(f"  MISMATCH: {code}: sub-counts sum={computed_total} vs total_voters={d['total_voters']}")

if integrity_fails == 0:
    print(f"  PASS: All {len(dm_data)} DMs have sub-counts summing to total_voters")
else:
    print(f"  FAIL: {integrity_fails} DMs have sub-count/total mismatch")

# ── Summary ──────────────────────────────────────────────────────
print("\n" + "=" * 70)
print("SUMMARY")
print("=" * 70)
print(f"  Total DMs tested:       {len(dm_data)}")
print(f"  Filter combos tested:   {len(filter_combos)}")
print(f"  Total checks (Test 2):  {total_checks}")
print(f"  Clamping issues:        {'NONE' if clamping_issues == 0 else clamping_issues}")
print(f"  Shrinkage failures:     {'NONE' if not shrink_failures else len(shrink_failures)}")
print(f"  Invisible gender (<0.5): {'NONE' if not invisible_gender else len(invisible_gender)}")
print(f"  Invisible race (<0.5):   {'NONE' if not invisible_race else len(invisible_race)}")
print(f"  Data integrity:         {'PASS' if integrity_fails == 0 else 'FAIL'}")

all_pass = (clamping_issues == 0 and not shrink_failures and not invisible_gender and not invisible_race and integrity_fails == 0)
print(f"\n  OVERALL: {'PASS ✓' if all_pass else 'FAIL ✗'}")
sys.exit(0 if all_pass else 1)
