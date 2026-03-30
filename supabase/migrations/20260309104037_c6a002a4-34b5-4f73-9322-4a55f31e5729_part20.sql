CREATE INDEX IF NOT EXISTS idx_quotes_token ON public.quotes(signature_token) WHERE signature_token IS NOT NULL;
