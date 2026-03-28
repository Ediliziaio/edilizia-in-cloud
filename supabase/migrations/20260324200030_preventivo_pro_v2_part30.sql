CREATE INDEX IF NOT EXISTS idx_quotes_tipo
  ON public.quotes(company_id, tipo_lavoro) WHERE tipo_lavoro IS NOT NULL;
