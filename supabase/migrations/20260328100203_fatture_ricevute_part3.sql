CREATE INDEX IF NOT EXISTS idx_fatture_ricevute_cedente ON public.fatture_ricevute(company_id, cedente_piva);
