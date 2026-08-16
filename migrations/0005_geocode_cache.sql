-- Migration 0005: Geocode cache table for DM centroid coordinates
-- Phase 5A: Google Maps (primary) → Nominatim (fallback) → D1 cache

CREATE TABLE IF NOT EXISTS geocode_cache (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    query_hash       TEXT    NOT NULL,
    raw_query        TEXT    NOT NULL,
    dm_code          TEXT,
    latitude         REAL,
    longitude        REAL,
    accuracy_level   TEXT    DEFAULT 'unresolved',
    source           TEXT    DEFAULT NULL,
    formatted_address TEXT,
    place_id         TEXT,
    response_json    TEXT,
    country_code     TEXT    DEFAULT 'MY',
    state            TEXT    DEFAULT 'Selangor',
    hit_count        INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_geocode_query_hash
    ON geocode_cache(query_hash);

CREATE INDEX IF NOT EXISTS idx_geocode_dm_code
    ON geocode_cache(dm_code);

CREATE INDEX IF NOT EXISTS idx_geocode_expires
    ON geocode_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_geocode_source
    ON geocode_cache(source);
