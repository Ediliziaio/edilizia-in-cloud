-- MP-CG-13 — Budget annuale + Variance + Forecast run-rate
--
-- Tabella cg_budget: 1 riga per (anno, codice_voce_CE) con importo budget annuale.
-- RPC cg_get_budget_consuntivo_forecast(anno):
--   Per ogni voce CE → { budget, consuntivo_ytd, forecast_run_rate, variance_eur, variance_pct, semaforo }
--   Forecast = consuntivo_ytd / mesi_passati * 12

CREATE TABLE IF NOT EXISTS public.cg_budget (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  anno        int  NOT NULL,
  codice      text NOT NULL,         -- '01','03','05',… (codice voce CE)
  importo     numeric(14,2) NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT cg_budget_unique UNIQUE (company_id, anno, codice)
);

CREATE INDEX IF NOT EXISTS idx_cg_budget_company_anno
  ON public.cg_budget(company_id, anno);

ALTER TABLE public.cg_budget ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cg_budget_select ON public.cg_budget;
CREATE POLICY cg_budget_select ON public.cg_budget FOR SELECT
  USING (company_id = public.get_my_company_id()
         OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS cg_budget_insert ON public.cg_budget;
CREATE POLICY cg_budget_insert ON public.cg_budget FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS cg_budget_update ON public.cg_budget;
CREATE POLICY cg_budget_update ON public.cg_budget FOR UPDATE
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS cg_budget_delete ON public.cg_budget;
CREATE POLICY cg_budget_delete ON public.cg_budget FOR DELETE
  USING (company_id = public.get_my_company_id());

DROP TRIGGER IF EXISTS trg_cg_budget_updated_at ON public.cg_budget;
CREATE TRIGGER trg_cg_budget_updated_at
  BEFORE UPDATE ON public.cg_budget
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.cg_budget IS
  'Budget annuale per voce CE riclassificata (codici 01..L).';

-- RPC main
CREATE OR REPLACE FUNCTION public.cg_get_budget_consuntivo_forecast(
  p_company_id uuid DEFAULT NULL,
  p_anno       int  DEFAULT extract(year from current_date)::int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_mese_oggi  int;
  v_ce_ytd     jsonb;
  v_ce_anno    jsonb;   -- consuntivo intero anno per anni passati
  v_result     jsonb;
  v_is_anno_corrente boolean;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  v_is_anno_corrente := (p_anno = extract(year from current_date)::int);
  v_mese_oggi := CASE
                   WHEN v_is_anno_corrente THEN extract(month from current_date)::int
                   ELSE 12
                 END;

  -- Consuntivo YTD (gen → mese corrente)
  SELECT public.cg_get_conto_economico_riclassificato(
    v_company_id, p_anno, 1, v_mese_oggi
  ) INTO v_ce_ytd;

  WITH consuntivo AS (
    SELECT (jsonb_array_elements(v_ce_ytd->'voci'))::jsonb v
  ),
  consuntivo_map AS (
    SELECT (v->>'codice')::text AS codice,
           (v->>'label')::text  AS label,
           (v->>'tipo')::text   AS tipo,
           (v->>'valore')::numeric AS valore
    FROM consuntivo
  ),
  budget_map AS (
    SELECT b.codice, b.importo AS budget
    FROM public.cg_budget b
    WHERE b.company_id = v_company_id AND b.anno = p_anno
  ),
  joined AS (
    SELECT cm.codice, cm.label, cm.tipo, cm.valore AS consuntivo_ytd,
           COALESCE(bm.budget, 0) AS budget,
           -- Forecast a fine anno = ytd / mesi_passati * 12
           CASE WHEN v_mese_oggi > 0
                THEN cm.valore / v_mese_oggi * 12
                ELSE 0 END AS forecast
    FROM consuntivo_map cm
    LEFT JOIN budget_map bm ON bm.codice = cm.codice
  )
  SELECT jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id,
      'anno', p_anno,
      'mese_corrente', v_mese_oggi,
      'is_anno_corrente', v_is_anno_corrente,
      'generato_il', now()
    ),
    'voci', jsonb_agg(jsonb_build_object(
      'codice', codice,
      'label',  label,
      'tipo',   tipo,
      'budget', budget,
      'consuntivo_ytd', consuntivo_ytd,
      'forecast_anno',  forecast,
      'variance_eur',   forecast - budget,
      'variance_pct',   CASE WHEN budget <> 0 THEN ((forecast - budget) / ABS(budget)) * 100 ELSE NULL END,
      'semaforo',       CASE
                          WHEN budget = 0 THEN 'grigio'
                          WHEN tipo IN ('subtot','subtot_grasso') THEN 'grigio'
                          -- Per voci di RICAVO: forecast > budget = verde
                          WHEN codice IN ('01','13','12','A','D','E','F','G','H','I','L')
                               AND forecast >= budget * 0.95 THEN 'verde'
                          WHEN codice IN ('01','13','12','A','D','E','F','G','H','I','L')
                               AND forecast < budget * 0.85 THEN 'rosso'
                          -- Per voci di COSTO: forecast > budget = rosso
                          WHEN codice IN ('03','04','05','06','07','08','09','10','11','14','15')
                               AND forecast <= budget * 1.05 THEN 'verde'
                          WHEN codice IN ('03','04','05','06','07','08','09','10','11','14','15')
                               AND forecast > budget * 1.15 THEN 'rosso'
                          ELSE 'giallo'
                        END
    ) ORDER BY codice)
  ) INTO v_result
  FROM joined;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.cg_get_budget_consuntivo_forecast FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_budget_consuntivo_forecast TO authenticated;

COMMENT ON FUNCTION public.cg_get_budget_consuntivo_forecast IS
  'Budget vs Consuntivo YTD vs Forecast run-rate. Variance e semaforo per ogni voce CE.';

CREATE OR REPLACE FUNCTION public.cg_get_budget_consuntivo_forecast_safe(p_anno int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_company_id uuid := public.get_my_company_id();
BEGIN
  PERFORM public._cg_assert_enabled(v_company_id);
  RETURN public.cg_get_budget_consuntivo_forecast(v_company_id, p_anno);
END;
$$;
REVOKE ALL ON FUNCTION public.cg_get_budget_consuntivo_forecast_safe FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_budget_consuntivo_forecast_safe TO authenticated;
