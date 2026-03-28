-- NOT VALID: salta la verifica delle righe esistenti (tutte NULL)

-- Indice per lookup inverso: "quali prodotti usano questa tariffa di montaggio?"
CREATE INDEX IF NOT EXISTS idx_at_montaggio_tariffa
  ON public.article_templates(montaggio_tariffa_id)
  WHERE montaggio_tariffa_id IS NOT NULL;
