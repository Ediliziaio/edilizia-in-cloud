CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_number ON public.quotes(company_id, quote_number);
