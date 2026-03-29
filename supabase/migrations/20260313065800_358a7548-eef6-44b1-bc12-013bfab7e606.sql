-- ─── 1. Tabella fattura_ordine (many-to-many) ──────────────
CREATE TABLE IF NOT EXISTS public.fattura_ordine (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fattura_id  UUID NOT NULL REFERENCES public.documenti_fiscali(id) ON DELETE CASCADE,
  ordine_id   UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  importo_associato NUMERIC(12,2),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID,
  UNIQUE(fattura_id, ordine_id)
);
