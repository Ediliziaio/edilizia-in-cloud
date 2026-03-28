-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_quotes_signature_token
ON public.quotes (signature_token)
WHERE signature_token IS NOT NULL;
