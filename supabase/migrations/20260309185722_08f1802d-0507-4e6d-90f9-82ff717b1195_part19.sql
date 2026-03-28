CREATE INDEX idx_prima_nota_scadenza ON public.prima_nota_entries(scadenza_id) WHERE scadenza_id IS NOT NULL;
