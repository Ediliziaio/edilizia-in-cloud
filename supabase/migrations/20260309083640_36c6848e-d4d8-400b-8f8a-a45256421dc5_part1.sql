-- 2. Index on expires_at
CREATE INDEX IF NOT EXISTS idx_bank_connections_expires ON public.bank_connections(expires_at);
