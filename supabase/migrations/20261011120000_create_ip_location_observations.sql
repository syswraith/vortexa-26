-- Migration: create public.ip_location_observations
--
-- Stores per-account IP/geolocation observations used by the IP/location
-- anomaly detection feature (src/services/ipLocationRisk.js).
--
-- Apply this to your existing Supabase database, either:
--   * with the Supabase CLI:  supabase db push
--   * or by running this file in the Supabase SQL editor.
--
-- This migration assumes the existing public."Users"(uid) table and does not
-- modify it. RLS is enabled without any permissive policies; the server-side
-- service role bypasses RLS, while anon/authenticated roles get no access.

CREATE TABLE IF NOT EXISTS public.ip_location_observations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id UUID NOT NULL
        REFERENCES public."Users"(uid) ON DELETE CASCADE,

    ip_address INET NOT NULL,
    country_code TEXT,
    region TEXT,
    city TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    asn BIGINT,
    isp TEXT,
    timezone TEXT,

    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    geo_provider TEXT,
    geo_lookup_success BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT valid_coordinates CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (
            latitude BETWEEN -90 AND 90
            AND longitude BETWEEN -180 AND 180
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_ip_location_account_time
    ON public.ip_location_observations(account_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_ip_location_ip
    ON public.ip_location_observations(ip_address);

ALTER TABLE public.ip_location_observations
    ENABLE ROW LEVEL SECURITY;
