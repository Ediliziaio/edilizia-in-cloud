-- V2 Schema Updates for Tesoreria

-- 1. Add expires_at to bank_connections
ALTER TABLE public.bank_connections ADD COLUMN IF NOT EXISTS expires_at timestamptz;
