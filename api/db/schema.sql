-- PostgreSQL schema for Beijing Travel App data cache
-- Idempotent: safe to run multiple times with CREATE TABLE IF NOT EXISTS
-- Run with: psql $DATABASE_URL -f api/db/schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── travel_places ────────────────────────────────────────────────────────────
-- Persisted POI entities: attractions and restaurants from Amap.
-- Unique by (source, source_id); stable data kept for weeks.
CREATE TABLE IF NOT EXISTS travel_places (
    id              SERIAL PRIMARY KEY,
    source          TEXT      NOT NULL DEFAULT 'amap',
    source_id       TEXT      NOT NULL,
    city            TEXT      NOT NULL DEFAULT '北京',
    adcode          TEXT      NOT NULL DEFAULT '110000',
    category        TEXT      NOT NULL,           -- 'attraction' | 'restaurant'
    name            TEXT      NOT NULL,
    district        TEXT,
    address         TEXT,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    rating          DOUBLE PRECISION,
    cost            DOUBLE PRECISION,
    open_hours      TEXT,
    tags_json       JSONB,
    photo_urls_json JSONB,
    normalized_json JSONB,
    source_updated_at TIMESTAMPTZ,
    refreshed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_travel_places_category ON travel_places(category);
CREATE INDEX IF NOT EXISTS idx_travel_places_expires ON travel_places(expires_at);

-- ── hotel_properties ─────────────────────────────────────────────────────────
-- Stable hotel identity: name, address, coordinates, geo-match, tags.
-- Price / room / booking fields do NOT live here; they belong in hotel_search_cache.
CREATE TABLE IF NOT EXISTS hotel_properties (
    id                     SERIAL PRIMARY KEY,
    source                 TEXT      NOT NULL DEFAULT 'fliggy',
    source_hotel_id        TEXT      NOT NULL,
    stable_hotel_id        TEXT,                      -- internal stable UUID
    name                   TEXT      NOT NULL,
    city                   TEXT,
    district               TEXT,
    address                TEXT,
    star                   DOUBLE PRECISION,
    star_label             TEXT,
    rating                 DOUBLE PRECISION,
    review_count           INTEGER,
    image_url              TEXT,
    tags_json              JSONB,
    facilities_json        JSONB,
    -- verified Amap coordinate
    latitude               DOUBLE PRECISION,
    longitude              DOUBLE PRECISION,
    coordinate_source      TEXT,
    coordinate_verified    BOOLEAN   DEFAULT FALSE,
    geo_status             TEXT      DEFAULT 'unresolved',
    amap_poi_id            TEXT,
    geo_confidence         DOUBLE PRECISION,
    geocoded_at            TIMESTAMPTZ,
    normalized_json        JSONB,
    refreshed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at             TIMESTAMPTZ NOT NULL,
    UNIQUE (source, source_hotel_id)
);
CREATE INDEX IF NOT EXISTS idx_hotel_properties_expires ON hotel_properties(expires_at);

-- ── hotel_search_cache ───────────────────────────────────────────────────────
-- Date-bound query snapshots: search params + response (hotels + meta).
-- query_hash covers destination, dates, max-price, stars, keyword, poi_name, sort.
CREATE TABLE IF NOT EXISTS hotel_search_cache (
    id              SERIAL PRIMARY KEY,
    query_hash      TEXT      NOT NULL UNIQUE,
    request_json    JSONB     NOT NULL,             -- normalized query, no keys
    response_json   JSONB     NOT NULL,             -- hotels[] + meta
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,           -- fresh boundary
    stale_until     TIMESTAMPTZ NOT NULL            -- last stale display boundary
);
CREATE INDEX IF NOT EXISTS idx_hotel_search_expires ON hotel_search_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_hotel_search_stale ON hotel_search_cache(stale_until);

-- ── route_cache ──────────────────────────────────────────────────────────────
-- Travel routes: transit / driving / walking between two points.
CREATE TABLE IF NOT EXISTS route_cache (
    id              SERIAL PRIMARY KEY,
    route_key       TEXT      NOT NULL UNIQUE,
    origin_lng      DOUBLE PRECISION NOT NULL,
    origin_lat      DOUBLE PRECISION NOT NULL,
    dest_lng        DOUBLE PRECISION NOT NULL,
    dest_lat        DOUBLE PRECISION NOT NULL,
    mode            TEXT      NOT NULL,             -- 'transit' | 'driving' | 'walking'
    distance_meters DOUBLE PRECISION,
    duration_minutes INTEGER,
    price           DOUBLE PRECISION,
    detail_json     JSONB,
    source          TEXT      NOT NULL DEFAULT 'amap',
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    stale_until     TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_route_key ON route_cache(route_key);
CREATE INDEX IF NOT EXISTS idx_route_expires ON route_cache(expires_at);

-- ── cache_entries ─────────────────────────────────────────────────────────────
-- Lightweight generic cache tier for all query types (places, routes, blind-box).
-- Enriched data lives in table-specific tables below; this table only stores
-- the tier status and a pointer (query_hash), never credentials or keys.
CREATE TABLE IF NOT EXISTS cache_entries (
    id              SERIAL PRIMARY KEY,
    query_hash      TEXT      NOT NULL UNIQUE,
    source          TEXT      NOT NULL,
    category        TEXT      NOT NULL,
    params_json     JSONB,
    payload_json    JSONB,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    stale_until     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cache_entries_expires ON cache_entries(expires_at);
CREATE INDEX IF NOT EXISTS idx_cache_entries_stale ON cache_entries(stale_until);

-- ── refresh_jobs ─────────────────────────────────────────────────────────────
-- Deduplication of background refresh tasks.
-- Partial unique index: only pending/running rows are constrained by dedupe_key.
-- Done/failed rows are free to accumulate as history.
CREATE TABLE IF NOT EXISTS refresh_jobs (
    id              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type        TEXT      NOT NULL,             -- 'place' | 'hotel' | 'route'
    dedupe_key      TEXT      NOT NULL,
    payload_json    JSONB,
    status          TEXT      NOT NULL DEFAULT 'pending',
    attempts        INTEGER   NOT NULL DEFAULT 0,
    available_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error_code TEXT,
    last_error_message TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_jobs_status ON refresh_jobs(status, available_at);
-- Partial unique index: at most one pending/running job per dedupe_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_jobs_dedupe_pending
    ON refresh_jobs (dedupe_key)
    WHERE status IN ('pending', 'running');

-- ── Schema version track ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _schema_version (
    version   INTEGER PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Record this schema version (idempotent)
INSERT INTO _schema_version (version, applied_at)
VALUES (1, NOW())
ON CONFLICT (version) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- v2 additions (unified explore + image provenance + hotel price snapshots)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── place_images ────────────────────────────────────────────────────────────
-- Every image is bound to the exact (source, source_entity_id) that returned it.
-- Cross-source pairing is only allowed via place_image_matches with sufficient
-- confidence; fuzzy-name or index-based pairing is never persisted here.
CREATE TABLE IF NOT EXISTS place_images (
    id                SERIAL PRIMARY KEY,
    source            TEXT      NOT NULL,             -- 'amap' | 'fliggy'
    source_entity_id  TEXT      NOT NULL,             -- amap POI id or fliggy poi/hotel id
    entity_type       TEXT      NOT NULL DEFAULT 'place',  -- 'place' | 'hotel'
    image_type        TEXT      NOT NULL DEFAULT 'primary', -- 'primary' | 'hotelExterior' | 'room' | 'facility' | 'restaurant' | 'gallery'
    url               TEXT      NOT NULL,
    attribution       TEXT,                            -- human-readable source label
    storage_allowed   BOOLEAN,                         -- only set when licence is confirmed
    fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ,
    UNIQUE (source, source_entity_id, image_type, url)
);
CREATE INDEX IF NOT EXISTS idx_place_images_entity ON place_images(source, source_entity_id);

-- ── place_image_matches ─────────────────────────────────────────────────────
-- Cross-source image evidence. Below-threshold rows stay pending manual review
-- and MUST NOT be used for display.
CREATE TABLE IF NOT EXISTS place_image_matches (
    id                 SERIAL PRIMARY KEY,
    amap_source_id     TEXT      NOT NULL,
    flyai_source_id    TEXT      NOT NULL,
    match_confidence   DOUBLE PRECISION NOT NULL,
    match_evidence     JSONB     NOT NULL,             -- name/city/district/address/geo facts
    matched_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    matched_by         TEXT      NOT NULL DEFAULT 'rule:v1',
    approved           BOOLEAN   NOT NULL DEFAULT FALSE, -- manual review gate
    UNIQUE (amap_source_id, flyai_source_id)
);

-- ── hotel_price_snapshots ───────────────────────────────────────────────────
-- Date-bound dynamic pricing kept separate from hotel_properties so one query's
-- price can never become a hotel's permanent price.
CREATE TABLE IF NOT EXISTS hotel_price_snapshots (
    id                SERIAL PRIMARY KEY,
    source_hotel_id   TEXT      NOT NULL,
    check_in          DATE      NOT NULL,
    check_out         DATE      NOT NULL,
    guests            INTEGER,
    price             DOUBLE PRECISION,
    price_type        TEXT      NOT NULL DEFAULT 'search_reference',
    price_description TEXT,
    room_availability TEXT,
    jump_url          TEXT,
    query_hash        TEXT,
    fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ NOT NULL,            -- 10 min fresh boundary
    stale_until       TIMESTAMPTZ NOT NULL             -- 30 min hard limit
);
CREATE INDEX IF NOT EXISTS idx_hotel_price_snapshots_lookup
    ON hotel_price_snapshots(source_hotel_id, check_in, check_out, fetched_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hotel_price_snapshots_query
    ON hotel_price_snapshots(source_hotel_id, check_in, check_out, query_hash);

-- Additional columns for travel_places (idempotent, additive only)
ALTER TABLE travel_places ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE travel_places ADD COLUMN IF NOT EXISTS type_name TEXT;
ALTER TABLE travel_places ADD COLUMN IF NOT EXISTS type_code TEXT;
ALTER TABLE travel_places ADD COLUMN IF NOT EXISTS business_area TEXT;
ALTER TABLE travel_places ADD COLUMN IF NOT EXISTS booking_url TEXT;
ALTER TABLE travel_places ADD COLUMN IF NOT EXISTS stale_until TIMESTAMPTZ;
ALTER TABLE travel_places ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ;

-- Additional columns for hotel_properties (idempotent, additive only)
ALTER TABLE hotel_properties ADD COLUMN IF NOT EXISTS latitude_provider DOUBLE PRECISION;
ALTER TABLE hotel_properties ADD COLUMN IF NOT EXISTS longitude_provider DOUBLE PRECISION;
ALTER TABLE hotel_properties ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE hotel_properties ADD COLUMN IF NOT EXISTS booking_url TEXT;
ALTER TABLE hotel_properties ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE hotel_properties ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ;
ALTER TABLE hotel_properties ADD COLUMN IF NOT EXISTS stale_until TIMESTAMPTZ;

INSERT INTO _schema_version (version, applied_at) VALUES (2, NOW()) ON CONFLICT (version) DO NOTHING;
