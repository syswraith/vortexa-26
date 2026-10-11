-- Migration: create public.device_fingerprints
-- Stores known device fingerprints per user for authentication risk assessment.

CREATE TABLE IF NOT EXISTS public.device_fingerprints (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id UUID NOT NULL,
    fp1 TEXT,
    fp2 TEXT,
    trust_level TEXT NOT NULL DEFAULT 'unknown'
        CHECK (trust_level IN ('unknown', 'trusted', 'suspicious', 'blocked')),
    label TEXT,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    seen_count INT NOT NULL DEFAULT 1,
    UNIQUE(account_id, fp1, fp2)
);

CREATE INDEX IF NOT EXISTS idx_device_fp_account
    ON public.device_fingerprints(account_id);

CREATE INDEX IF NOT EXISTS idx_device_fp_lookup
    ON public.device_fingerprints(fp1, fp2);

ALTER TABLE public.device_fingerprints
    ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; anon/authenticated get no direct access.
-- Access is via backend service functions only.