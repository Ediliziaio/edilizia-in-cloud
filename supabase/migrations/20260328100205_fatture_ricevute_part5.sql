CREATE UNIQUE INDEX IF NOT EXISTS idx_fatture_ricevute_sdi_unique ON public.fatture_ricevute(sdi_id_trasmissione)
  WHERE sdi_id_trasmissione IS NOT NULL;
