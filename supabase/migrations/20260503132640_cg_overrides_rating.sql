-- MP-CG-01 / 1.5 — Override manuali sul CE riclassificato
-- (per ratei/risconti, accantonamenti, correzioni rispetto all'auto-popolamento).

CREATE TABLE IF NOT EXISTS public.ce_riclassificato_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  esercizio       int  NOT NULL,
  mese            int  CHECK (mese BETWEEN 1 AND 12),
  voce_chiave     text NOT NULL,
  importo_override numeric(14,2) NOT NULL,
  motivo          text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),
  UNIQUE (company_id, esercizio, mese, voce_chiave)
);

ALTER TABLE public.ce_riclassificato_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cer_ovr_select" ON public.ce_riclassificato_overrides FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "cer_ovr_insert" ON public.ce_riclassificato_overrides FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "cer_ovr_update" ON public.ce_riclassificato_overrides FOR UPDATE
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "cer_ovr_delete" ON public.ce_riclassificato_overrides FOR DELETE
  USING (company_id = public.get_my_company_id());

CREATE TRIGGER trg_cer_ovr_updated BEFORE UPDATE ON public.ce_riclassificato_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.ce_riclassificato_overrides IS
  'Override manuali per voce / mese / esercizio del CE riclassificato.';

-- MP-CG-01 / 1.6 — Snapshot mensile rating bancario stimato

CREATE TABLE IF NOT EXISTS public.cg_rating_snapshot (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  data_snapshot      date NOT NULL DEFAULT CURRENT_DATE,
  ratio_liquidita    numeric(8,4),
  ratio_indipendenza numeric(8,4),
  ratio_oneri        numeric(8,4),
  ratio_cashflow     numeric(8,4),
  scoring_totale     int  NOT NULL,
  classe_rating      text NOT NULL CHECK (classe_rating IN (
    'AAA','AA','A','BBB','BB','B','CCC'
  )),
  livello_rischio    text NOT NULL CHECK (livello_rischio IN (
    'molto_basso','basso','medio_basso','medio','medio_alto','alto','default'
  )),
  fonte              text NOT NULL DEFAULT 'auto' CHECK (fonte IN ('auto','manuale','simulato')),
  payload            jsonb NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, data_snapshot, fonte)
);

CREATE INDEX IF NOT EXISTS idx_rating_company_data ON public.cg_rating_snapshot(company_id, data_snapshot DESC);

ALTER TABLE public.cg_rating_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rating_select" ON public.cg_rating_snapshot FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "rating_insert" ON public.cg_rating_snapshot FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());
-- update/delete riservati a service_role (cron mensile) — niente policy per authenticated.

COMMENT ON TABLE public.cg_rating_snapshot IS
  'Snapshot mensile del rating bancario stimato per tracking nel tempo.';
