
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

CREATE INDEX idx_fattura_ordine_fattura ON public.fattura_ordine(fattura_id);
CREATE INDEX idx_fattura_ordine_ordine ON public.fattura_ordine(ordine_id);
CREATE INDEX idx_fattura_ordine_company ON public.fattura_ordine(company_id);

ALTER TABLE public.fattura_ordine ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fo_sel" ON public.fattura_ordine FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());
CREATE POLICY "fo_ins" ON public.fattura_ordine FOR INSERT TO authenticated WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "fo_upd" ON public.fattura_ordine FOR UPDATE TO authenticated USING (company_id = public.get_my_company_id());
CREATE POLICY "fo_del" ON public.fattura_ordine FOR DELETE TO authenticated USING (company_id = public.get_my_company_id());

-- ─── 2. Colonna ordine_id shortcut su documenti_fiscali ──────
ALTER TABLE public.documenti_fiscali
  ADD COLUMN IF NOT EXISTS ordine_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documenti_fiscali_ordine
  ON public.documenti_fiscali(ordine_id) WHERE ordine_id IS NOT NULL;

-- ─── 3. View stato pagamento fattura ─────────────────────────
CREATE OR REPLACE VIEW public.fattura_pagamento_stato AS
SELECT
  df.id                                                       AS fattura_id,
  df.company_id,
  df.totale_da_pagare                                         AS importo_totale,
  COALESCE(SUM(m.importo), 0)                                 AS importo_incassato,
  df.totale_da_pagare - COALESCE(SUM(m.importo), 0)           AS importo_residuo,
  CASE
    WHEN COALESCE(SUM(m.importo), 0) >= df.totale_da_pagare THEN 'pagata'
    WHEN COALESCE(SUM(m.importo), 0) > 0                    THEN 'parziale'
    WHEN df.data_scadenza IS NOT NULL AND df.data_scadenza::date < CURRENT_DATE THEN 'scaduta'
    ELSE 'in_attesa'
  END                                                         AS stato_pagamento,
  MAX(m.data_movimento)                                       AS ultimo_incasso,
  COUNT(m.id)::int                                            AS numero_incassi
FROM public.documenti_fiscali df
LEFT JOIN public.movimenti_cassa_native m ON m.documento_id = df.id AND m.tipo = 'entrata'
WHERE df.stato != 'annullata'
GROUP BY df.id, df.company_id, df.totale_da_pagare, df.data_scadenza;

-- ─── 4. Trigger: aggiorna stato fattura su movimenti_cassa_native ──
CREATE OR REPLACE FUNCTION public.update_fattura_stato_on_movimento()
RETURNS TRIGGER AS $$
DECLARE
  v_doc_id    UUID;
  v_totale    NUMERIC;
  v_incassato NUMERIC;
  v_nuovo     TEXT;
BEGIN
  v_doc_id := COALESCE(NEW.documento_id, OLD.documento_id);
  IF v_doc_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT totale_da_pagare INTO v_totale
  FROM public.documenti_fiscali
  WHERE id = v_doc_id;

  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(importo), 0) INTO v_incassato
  FROM public.movimenti_cassa_native
  WHERE documento_id = v_doc_id AND tipo = 'entrata';

  IF v_incassato >= v_totale THEN
    v_nuovo := 'pagata';
  ELSIF v_incassato > 0 THEN
    v_nuovo := 'parzialmente_pagata';
  ELSE
    v_nuovo := 'emessa';
  END IF;

  UPDATE public.documenti_fiscali
  SET stato = v_nuovo,
      importo_pagato = v_incassato,
      pagato_at = CASE WHEN v_incassato >= v_totale THEN NOW() ELSE NULL END,
      updated_at = NOW()
  WHERE id = v_doc_id
    AND stato NOT IN ('annullata', 'rifiutata', 'bozza');

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_update_fattura_stato_on_movimento ON public.movimenti_cassa_native;
CREATE TRIGGER trg_update_fattura_stato_on_movimento
  AFTER INSERT OR UPDATE OR DELETE ON public.movimenti_cassa_native
  FOR EACH ROW
  EXECUTE FUNCTION public.update_fattura_stato_on_movimento();
