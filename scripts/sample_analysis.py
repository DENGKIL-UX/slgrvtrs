#!/usr/bin/env python3
"""Fast sampled analysis - reads 30K rows per file for representative stats."""

import openpyxl
import json
import os
import random
from collections import Counter

EXTRACTED_DIR = "/home/z/my-project/extracted"
OUTPUT = "/home/z/my-project/analysis/sample_stats.json"
SAMPLE_SIZE = 30000

FILES = sorted([f for f in os.listdir(EXTRACTED_DIR) if f.endswith(".xlsx")])

def sample_file(filepath):
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active
    
    # Read header
    rows_iter = ws.iter_rows(values_only=True)
    header = next(rows_iter)
    
    stats = {
        "gender": Counter(), "race": Counter(), "age_sum": 0, "age_count": 0,
        "age_min": 999, "age_max": 0, "age_dist": Counter(),
        "contact_yes": 0, "gps_yes": 0, "total": 0,
        "state_dist": Counter(), "parl_dist": Counter(),
        "dun_dist": Counter(), "dm_dist": Counter(), "locality_dist": Counter(),
        "dob_year_dist": Counter(),
    }
    
    # Read all rows, track for reservoir sampling
    reservoir = []
    idx = 0
    for row in rows_iter:
        idx += 1
        if len(reservoir) < SAMPLE_SIZE:
            reservoir.append(row)
        else:
            j = random.randint(0, idx - 1)
            if j < SAMPLE_SIZE:
                reservoir[j] = row
    
    # Analyze reservoir sample
    for row in reservoir:
        if len(row) < 13:
            continue
        stats["total"] += 1
        
        g = row[2]
        if g: stats["gender"][str(g)] += 1
        
        r = row[3]
        if r: stats["race"][str(r)] += 1
        
        a = row[4]
        if a is not None:
            try:
                age = int(a)
                stats["age_sum"] += age
                stats["age_count"] += 1
                if age < stats["age_min"]: stats["age_min"] = age
                if age > stats["age_max"]: stats["age_max"] = age
                
                # Age brackets
                if age <= 20: br = "18-20"
                elif age <= 29: br = "21-29"
                elif age <= 39: br = "30-39"
                elif age <= 49: br = "40-49"
                elif age <= 59: br = "50-59"
                elif age <= 69: br = "60-69"
                elif age <= 79: br = "70-79"
                elif age <= 89: br = "80-89"
                else: br = "90+"
                stats["age_dist"][br] += 1
            except (ValueError, TypeError):
                pass
        
        c = row[6]
        if c and str(c).upper() == "YES": stats["contact_yes"] += 1
        
        gps = row[7]
        if gps and str(gps).upper() == "YES": stats["gps_yes"] += 1
        
        s = row[12]
        if s: stats["state_dist"][str(s)] += 1
        
        p = row[11]
        if p: stats["parl_dist"][str(p)] += 1
        
        d = row[10]
        if d: stats["dun_dist"][str(d)] += 1
        
        dm = row[9]
        if dm: stats["dm_dist"][str(dm)] += 1
        
        loc = row[8]
        if loc: stats["locality_dist"][str(loc)] += 1
        
        dob = row[5]
        if dob and str(dob) != "DOB":
            try:
                parts = str(dob).split("-")
                if len(parts) == 3:
                    year = int(parts[2])
                    stats["dob_year_dist"][str(year)] += 1
            except:
                pass
    
    wb.close()
    return stats, idx  # idx = total rows in file

def main():
    os.makedirs("/home/z/my-project/analysis", exist_ok=True)
    random.seed(42)
    
    combined = {
        "gender": Counter(), "race": Counter(), "age_sum": 0, "age_count": 0,
        "age_min": 999, "age_max": 0, "age_dist": Counter(),
        "contact_yes": 0, "gps_yes": 0, "total": 0,
        "state_dist": Counter(), "parl_dist": Counter(),
        "dun_dist": Counter(), "dm_dist": Counter(), "locality_dist": Counter(),
        "dob_year_dist": Counter(),
    }
    
    file_rows = {}
    
    for fname in FILES:
        fpath = os.path.join(EXTRACTED_DIR, fname)
        print(f"Sampling: {fname} ...", flush=True)
        stats, total_rows = sample_file(fpath)
        file_rows[fname] = total_rows
        print(f"  Total rows: {total_rows:,}, Sampled: {stats['total']}", flush=True)
        
        combined["gender"] += stats["gender"]
        combined["race"] += stats["race"]
        combined["age_sum"] += stats["age_sum"]
        combined["age_count"] += stats["age_count"]
        combined["age_min"] = min(combined["age_min"], stats["age_min"])
        combined["age_max"] = max(combined["age_max"], stats["age_max"])
        combined["age_dist"] += stats["age_dist"]
        combined["contact_yes"] += stats["contact_yes"]
        combined["gps_yes"] += stats["gps_yes"]
        combined["total"] += stats["total"]
        combined["state_dist"] += stats["state_dist"]
        combined["parl_dist"] += stats["parl_dist"]
        combined["dun_dist"] += stats["dun_dist"]
        combined["dm_dist"] += stats["dm_dist"]
        combined["locality_dist"] += stats["locality_dist"]
        combined["dob_year_dist"] += stats["dob_year_dist"]
    
    # Build report
    n = combined["total"]
    avg_age = combined["age_sum"] / combined["age_count"] if combined["age_count"] else 0
    
    report = {
        "methodology": f"Reservoir sampling of {SAMPLE_SIZE} rows per file (total {n} sampled from {sum(file_rows.values()):,} records), seed=42",
        "actual_total_records": sum(file_rows.values()),
        "sampled_records": n,
        "file_row_counts": file_rows,
        "gender": {k: {"count": v, "pct": round(v/n*100,2)} for k, v in sorted(combined["gender"].items())},
        "race": {k: {"count": v, "pct": round(v/n*100,2)} for k, v in sorted(combined["race"].items())},
        "age_statistics": {
            "mean": round(avg_age, 2),
            "min": combined["age_min"],
            "max": combined["age_max"],
            "median_approx": "N/A (sample-based)",
        },
        "age_brackets": {k: {"count": v, "pct": round(v/n*100,2)} for k, v in sorted(combined["age_dist"].items(), key=lambda x: ["18-20","21-29","30-39","40-49","50-59","60-69","70-79","80-89","90+"].index(x[0]) if x[0] in ["18-20","21-29","30-39","40-49","50-59","60-69","70-79","80-89","90+"] else 99)},
        "data_completeness": {
            "contact_available_pct": round(combined["contact_yes"]/n*100, 2),
            "gps_available_pct": round(combined["gps_yes"]/n*100, 2),
        },
        "state_distribution": {k: v for k, v in sorted(combined["state_dist"].items(), key=lambda x: x[1], reverse=True)},
        "top_parliamentary": {k: v for k, v in sorted(combined["parl_dist"].items(), key=lambda x: x[1], reverse=True)[:20]},
        "top_dun": {k: v for k, v in sorted(combined["dun_dist"].items(), key=lambda x: x[1], reverse=True)[:20]},
        "total_parliamentary_seats": len(combined["parl_dist"]),
        "total_dun_seats": len(combined["dun_dist"]),
        "total_dm_districts": len(combined["dm_dist"]),
        "total_localities": len(combined["locality_dist"]),
        "dob_decade_distribution": {},
    }
    
    # Aggregate DOB by decade
    decade = Counter()
    for yr, cnt in combined["dob_year_dist"].items():
        try:
            d = str((int(yr) // 10) * 10) + "s"
            decade[d] += cnt
        except:
            pass
    report["dob_decade_distribution"] = {k: v for k, v in sorted(decade.items())}
    
    with open(OUTPUT, "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"\nReport saved: {OUTPUT}")
    print(f"Total records (actual): {report['actual_total_records']:,}")
    print(f"Sampled: {n:,}")
    print(f"Gender: {report['gender']}")
    print(f"Race: {report['race']}")
    print(f"Age mean: {report['age_statistics']['mean']}")
    print(f"Parl seats: {report['total_parliamentary_seats']}")
    print(f"DUN seats: {report['total_dun_seats']}")
    print(f"DM districts: {report['total_dm_districts']}")
    print(f"Localities: {report['total_localities']}")

if __name__ == "__main__":
    main()