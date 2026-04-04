-- Migration B: Materiali rapportino tipizzati con FK a magazzino
-- Affianca JSONB esistente — non lo rimuove
CREATE TABLE IF NOT EXISTS public.rapportino_materiali (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rapportino_id   UUID NOT NULL
    REFERENCES public.rapportini_intervento(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Articolo dal magazzino (opzionale — per materiali non a magazzino usa solo descrizione)
  stock_item_id   UUID
    REFERENCES public.warehouse_stock(id) ON DELETE SET NULL,
  descrizione     TEXT NOT NULL,
  quantita        NUMERIC(10,3) NOT NULL DEFAULT 1,
  unita_misura    TEXT NOT NULL DEFAULT 'pz',
  prezzo_unitario NUMERIC(10,2),  -- prezzo al momento dell'utilizzo
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.rapportino_materiali ENABLE ROW LEVEL SECURITY;

CREATE POLICY rapportino_materiali_company
  ON public.rapportino_materiali FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_rm_rapportino
  ON public.rapportino_materiali(rapportino_id);

CREATE INDEX IF NOT EXISTS idx_rm_stock
  ON public.rapportino_materiali(stock_item_id)
  WHERE stock_item_id IS NOT NULL;
