-- altezza in mm

CREATE INDEX IF NOT EXISTS idx_qi_tariffa
  ON public.quote_items(tariffa_id) WHERE tariffa_id IS NOT NULL;
