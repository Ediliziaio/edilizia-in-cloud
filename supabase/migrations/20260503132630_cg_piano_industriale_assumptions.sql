-- MP-CG-01 / 1.4 — Piano industriale: assumption per scenario / orizzonte

CREATE TABLE IF NOT EXISTS public.piano_industriale_assumptions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scenario                    text NOT NULL DEFAULT 'base'
                              CHECK (scenario IN ('base','prudente','aggressivo','custom')),
  anno_partenza               int  NOT NULL,
  orizzonte_anni              int  NOT NULL CHECK (orizzonte_anni IN (3,5,7)),
  crescita_ricavi_pct         numeric(5,2)[] NOT NULL,
  margine_target_pct          numeric(5,2) NOT NULL DEFAULT 15.00,
  crescita_costi_fissi_pct    numeric(5,2)[] NOT NULL,
  investimenti                numeric(14,2)[] NOT NULL,
  delta_costo_personale       numeric(14,2)[] NOT NULL,
  nuovo_debito_mlt            numeric(14,2)[] NOT NULL,
  tasso_debito_pct            numeric(5,2) NOT NULL DEFAULT 6.00,
  aliquota_imposte_pct        numeric(5,2) NOT NULL DEFAULT 27.50,
  is_default                  boolean NOT NULL DEFAULT false,
  note                        text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pi_one_default ON public.piano_industriale_assumptions
  (company_id, scenario) WHERE is_default = true;

ALTER TABLE public.piano_industriale_assumptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pi_select" ON public.piano_industriale_assumptions FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "pi_insert" ON public.piano_industriale_assumptions FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "pi_update" ON public.piano_industriale_assumptions FOR UPDATE
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "pi_delete" ON public.piano_industriale_assumptions FOR DELETE
  USING (company_id = public.get_my_company_id());

CREATE TRIGGER trg_pi_updated BEFORE UPDATE ON public.piano_industriale_assumptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.piano_industriale_assumptions IS
  'Parametri di proiezione multi-anno per Piano Industriale e simulazioni what-if.';
