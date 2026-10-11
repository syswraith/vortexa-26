-- Migration: drop foreign key constraint on ip_location_observations.account_id
-- This allows storing observations for users that may not exist in public."Users" table

ALTER TABLE public.ip_location_observations
    DROP CONSTRAINT IF EXISTS ip_location_observations_account_id_fkey;