-- MP-CG-01 / 1.3 — Classificazione voci (mappa F/V/Z per CE riclassificato)

CREATE TABLE IF NOT EXISTS public.cg_classificazione_voci (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  voce_chiave     text NOT NULL,
  voce_descrizione text NOT NULL,
  macro_voce      text NOT NULL CHECK (macro_voce IN (
    'ricavi','acquisti_materie','costi_produttivi','costo_personale',
    'costi_commerciali','costi_amministrativi','ammortamenti',
    'oneri_tributari','oneri_finanziari','proventi_finanziari',
    'ricavi_extra','costi_extra'
  )),
  tipo            text NOT NULL CHECK (tipo IN ('F','V','Z')),
  source_table    text NOT NULL CHECK (source_table IN (
    'company_costs','bank_transactions','invoices','prima_nota','manual'
  )),
  source_field    text,
  source_value    text,
  ordering        int NOT NULL DEFAULT 100,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, voce_chiave, source_table, source_value)
);

CREATE INDEX IF NOT EXISTS idx_cg_class_lookup ON public.cg_classificazione_voci
  (company_id, source_table, source_value) WHERE is_active;

ALTER TABLE public.cg_classificazione_voci ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cg_class_select" ON public.cg_classificazione_voci FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "cg_class_insert" ON public.cg_classificazione_voci FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "cg_class_update" ON public.cg_classificazione_voci FOR UPDATE
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "cg_class_delete" ON public.cg_classificazione_voci FOR DELETE
  USING (company_id = public.get_my_company_id());

CREATE TRIGGER trg_cg_class_updated BEFORE UPDATE ON public.cg_classificazione_voci
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.cg_classificazione_voci IS
  'Mappa categoria/voce a macro_voce (CE riclassificato) e tipo F/V/Z (BEP).';
