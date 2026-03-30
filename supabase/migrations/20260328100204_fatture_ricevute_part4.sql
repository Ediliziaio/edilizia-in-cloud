CREATE INDEX IF NOT EXISTS idx_fatture_ricevute_data ON public.fatture_ricevute(company_id, data_fattura DESC);
