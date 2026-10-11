-- Migration: create public.auth_risk_assessments
-- Stores combined authentication risk assessments per login attempt.

CREATE TABLE IF NOT EXISTS public.auth_risk_assessments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id UUID NOT NULL,
    login_attempt_id UUID NOT NULL DEFAULT gen_random_uuid(),
    
    ip_location_score INT NOT NULL DEFAULT 0,
    fingerprint_score INT NOT NULL DEFAULT 0,
    
    total_score INT NOT NULL DEFAULT 0,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'review', 'high', 'critical')),
    
    action TEXT NOT NULL,
    user_agent TEXT,
    ip_address INET,
    ip_json JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_risk_account_time
    ON public.auth_risk_assessments(account_id, created_at DESC);

ALTER TABLE public.auth_risk_assessments
    ENABLE ROW LEVEL SECURITY;