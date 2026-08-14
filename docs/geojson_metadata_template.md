# GeoJSON Inline Metadata Template

This document defines the standard `metadata` block that should be embedded at the `FeatureCollection` level of every derived boundary GeoJSON file in this repository. The metadata enables dashboards and downstream consumers to programmatically display provenance information.

---

## Template

```json
{
  "type": "FeatureCollection",
  "metadata": {
    "title": "",
    "description": "",
    "authority": "Suruhanjaya Pilihan Raya (SPR)",
    "delimitation_year": "",
    "region": "",
    "derived_from": "",
    "data_provider": "",
    "source_url": "",
    "direct_file": "",
    "license": "",
    "crs": "CRS84 (WGS84, EPSG:4326)",
    "notes": "Derived open dataset; not the legal instrument. Small geometric differences from SPR's official gazetted boundaries may exist due to digitization.",
    "repo": "https://github.com/DENGKIL-UX/slgrvtrs",
    "provenance_doc": "docs/provenance.md"
  },
  "features": []
}
```

---

## Example: Selangor Parliament Boundaries

```json
{
  "type": "FeatureCollection",
  "metadata": {
    "title": "Selangor Parliamentary Constituency Boundaries (2018 Delimitation)",
    "description": "22 parliamentary constituencies (P92-P113) in Selangor, Malaysia, as delineated in the 2018 SPR delimitation exercise.",
    "authority": "Suruhanjaya Pilihan Raya (SPR)",
    "delimitation_year": "2018",
    "region": "Selangor, Malaysia",
    "derived_from": "SPR 2018 Peninsular Malaysia delimitation (Gazette notices and official maps)",
    "data_provider": "ElectionData.MY",
    "source_url": "https://electiondata.my/data-catalogue/peninsular-2018-parlimen/",
    "direct_file": "https://lake.electiondata.my/maps/delimitations/peninsular_2018_parlimen.geojson",
    "license": "Open data (see ElectionData.MY terms)",
    "crs": "CRS84 (WGS84, EPSG:4326)",
    "notes": "Derived open dataset; not the legal instrument. Filtered from Peninsular-wide file (166 features) to Selangor only (22 features). Voter-compatible code prefix added as 'voter_prefix' property.",
    "repo": "https://github.com/DENGKIL-UX/slgrvtrs",
    "provenance_doc": "docs/provenance.md"
  },
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [...] },
      "properties": {
        "state": "Selangor",
        "parlimen": "P.102 Bangi",
        "code_parlimen": "P.102",
        "voter_prefix": "102"
      }
    }
  ]
}
```

---

## Example: Selangor DUN Boundaries

```json
{
  "type": "FeatureCollection",
  "metadata": {
    "title": "Selangor State Assembly (DUN) Constituency Boundaries",
    "description": "56 DUN constituencies (N01-N56) in Selangor, Malaysia, with parent Parliament mapping.",
    "authority": "Suruhanjaya Pilihan Raya (SPR)",
    "delimitation_year": "2018",
    "region": "Selangor, Malaysia",
    "derived_from": "SPR delimitation exercises",
    "data_provider": "DOSM KawasanKu (Department of Statistics, Malaysia)",
    "source_url": "https://github.com/dosm-malaysia/kawasanku-front/blob/main/geojson/dun.json",
    "direct_file": "https://raw.githubusercontent.com/dosm-malaysia/kawasanku-front/main/geojson/dun.json",
    "license": "Government open data (DOSM)",
    "crs": "CRS84 (WGS84, EPSG:4326)",
    "notes": "Derived open dataset; not the legal instrument. Filtered from nationwide file (613 features) to Selangor only (56 features). Voter-compatible code prefix added as 'voter_prefix' property.",
    "repo": "https://github.com/DENGKIL-UX/slgrvtrs",
    "provenance_doc": "docs/provenance.md"
  },
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "MultiPolygon", "coordinates": [...] },
      "properties": {
        "state": "Selangor",
        "parlimen": "P.102 Bangi",
        "dun": "N.25 Kajang",
        "code_parlimen": "P.102",
        "code_dun": "N.25",
        "code_state_dun": "10_N.25",
        "voter_prefix": "25",
        "parent_parl": "P.102"
      }
    }
  ]
}
```

---

## Dashboard Integration

MapLibre dashboards (and any web mapping client) can read the `metadata` block and display a "Data Source & Provenance" panel automatically:

```javascript
// Example: Read and display provenance in a React component
const response = await fetch('/boundaries/selangor_parliament.geojson');
const geojson = await response.json();
const { metadata } = geojson;

// Render in UI
<div className="provenance-panel">
  <h4>Data Source</h4>
  <p>Boundaries: {metadata.data_provider}</p>
  <p>Derived from: {metadata.derived_from}</p>
  <p>Delimitation: {metadata.delimitation_year}</p>
  <p className="disclaimer">
    {metadata.notes}
  </p>
  <a href={metadata.provenance_doc}>Full Provenance</a>
</div>
```

---

## Properties Convention for Processed Files

When boundary files are filtered to Selangor and enriched for the MapLibre dashboard, the following additional properties should be added to each feature:

| Property | Type | Description | Example |
|----------|------|-------------|---------|
| `voter_prefix` | string | Numeric code matching voter registry format (without P/N prefix) | `"102"` |
| `parent_parl` | string | Parent Parliament code (DUN files only) | `"P.102"` |

These properties enable direct `==` matching between GeoJSON features and voter data records without runtime string manipulation.
