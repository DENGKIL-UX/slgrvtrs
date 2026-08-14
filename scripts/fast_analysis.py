#!/usr/bin/env python3
"""Fast analysis using pandas nrows parameter - reads first 50K rows per file."""
import pandas as pd
import json
import os

EXTRACTED_DIR = "/home/z/my-project/extracted"
OUTPUT = "/home/z/my-project/analysis/sample_stats.json"
NROWS = 50000

FILES = sorted([f for f in os.listdir(EXTRACTED_DIR) if f.endswith(".xlsx")])

def main():
    os.makedirs("/home/z/my-project/analysis", exist_ok=True)
    
    all_dfs = []
    file_info = []
    
    for fname in FILES:
        fpath = os.path.join(EXTRACTED_DIR, fname)
        print(f"Reading first {NROWS:,} rows of {fname}...", flush=True)
        df = pd.read_excel(fpath, engine="openpyxl", nrows=NROWS)
        all_dfs.append(df)
        file_info.append({
            "filename": fname,
            "size_mb": round(os.path.getsize(fpath)/(1024*1024), 2),
            "sampled_rows": len(df)
        })
        print(f"  {len(df):,} rows read", flush=True)
    
    combined = pd.concat(all_dfs, ignore_index=True)
    n = len(combined)
    print(f"\nCombined sample: {n:,} rows", flush=True)
    
    # Gender
    gender = combined["GENDER"].value_counts().to_dict()
    
    # Race
    race = combined["RACE"].value_counts().to_dict()
    
    # Age
    combined["AGE"] = pd.to_numeric(combined["AGE"], errors="coerce")
    age_desc = combined["AGE"].describe().to_dict()
    for k in age_desc:
        age_desc[k] = float(age_desc[k]) if k != "count" else int(age_desc[k])
    
    bins = [0, 21, 30, 40, 50, 60, 70, 80, 90, 120]
    labels = ["18-20", "21-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80-89", "90+"]
    combined["AGE_BRACKET"] = pd.cut(combined["AGE"], bins=bins, labels=labels, right=True)
    age_brackets = combined["AGE_BRACKET"].value_counts().sort_index().to_dict()
    
    # Contact & GPS
    contact_yes = int((combined["CONTACT#"].astype(str).str.upper()=="YES").sum())
    gps_yes = int((combined["GPS_COORDINATE"].astype(str).str.upper()=="YES").sum())
    
    # State
    state_dist = combined["STATE_CODE"].value_counts().to_dict()
    
    # Parliament
    parl = combined["PARLIAMENT_CODE"].value_counts().to_dict()
    parl_count = combined["PARLIAMENT_CODE"].nunique()
    
    # DUN
    dun = combined["DUN_CODE"].value_counts().to_dict()
    dun_count = combined["DUN_CODE"].nunique()
    
    # DM
    dm_count = combined["DM_CODE"].nunique()
    
    # Locality
    loc_count = combined["LOCALITY_CODE"].nunique()
    
    # DOB Year
    combined["DOB_YEAR"] = pd.to_datetime(combined["DOB"], format="%d-%b-%Y", errors="coerce").dt.year
    dob_year = combined["DOB_YEAR"].value_counts().sort_index().to_dict()
    
    # Gender x Race
    ct = pd.crosstab(combined["GENDER"], combined["RACE"])
    
    # DOB Decade
    decade = combined["DOB_YEAR"].dropna().apply(lambda y: str(int(y)//10*10)+"s").value_counts().sort_index().to_dict()
    
    report = {
        "methodology": f"First {NROWS:,} rows per file read via pandas nrows parameter. Total sampled: {n:,} out of ~3,971,650 actual records.",
        "sampled_records": n,
        "file_breakdown": file_info,
        "gender": {k: {"count": int(v), "pct": round(v/n*100,2)} for k, v in sorted(gender.items())},
        "race": {k: {"count": int(v), "pct": round(v/n*100,2)} for k, v in sorted(race.items())},
        "age_statistics": {k: round(v, 2) for k, v in age_desc.items()},
        "age_brackets": {str(k): {"count": int(v), "pct": round(v/n*100,2)} for k, v in age_brackets.items()},
        "data_completeness": {
            "contact_available": contact_yes,
            "contact_missing": n - contact_yes,
            "contact_pct": round(contact_yes/n*100, 2),
            "gps_available": gps_yes,
            "gps_missing": n - gps_yes,
            "gps_pct": round(gps_yes/n*100, 2),
        },
        "state_distribution": {k: int(v) for k, v in sorted(state_dist.items(), key=lambda x: x[1], reverse=True)},
        "top_parliamentary": {k: int(v) for k, v in sorted(parl.items(), key=lambda x: x[1], reverse=True)[:30]},
        "top_dun": {k: int(v) for k, v in sorted(dun.items(), key=lambda x: x[1], reverse=True)[:30]},
        "parliamentary_seats_in_sample": parl_count,
        "dun_seats_in_sample": dun_count,
        "dm_districts_in_sample": dm_count,
        "localities_in_sample": loc_count,
        "dob_decade": {str(k): int(v) for k, v in sorted(decade.items())},
        "gender_race_crosstab": {str(g): {str(r): int(v) for r, v in row.items()} for g, row in ct.to_dict(orient="index").items()},
    }
    
    with open(OUTPUT, "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"\nReport saved: {OUTPUT}")
    print(f"Gender: {report['gender']}")
    print(f"Race: {report['race']}")
    print(f"Age mean: {report['age_statistics']['mean']}")
    print(f"Contact%: {report['data_completeness']['contact_pct']}%")
    print(f"GPS%: {report['data_completeness']['gps_pct']}%")
    print(f"Parl seats (in sample): {parl_count}")
    print(f"DUN seats (in sample): {dun_count}")
    print(f"DM districts (in sample): {dm_count}")
    print(f"Localities (in sample): {loc_count}")

if __name__ == "__main__":
    main()