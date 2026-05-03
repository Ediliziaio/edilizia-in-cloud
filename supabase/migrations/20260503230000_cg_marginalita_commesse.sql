-- MP-CG-12 — Marginalità per commessa/cantiere
--
-- Combina v_ordine_marginalita con orders.percentuale_avanzamento
-- per calcolare il margine atteso a fine commessa (proiezione lineare):
--
--   margine_atteso = preventivo - costo_atteso
--   costo_atteso   = consuntivo / max(percentuale_avanzamento, 0.01)
--
-- Espone classificazione semaforo:
--   • verde  → margine_perc_atteso >= 15%
--   • giallo → 0% <= margine < 15%
--   • rosso  → margine < 0%

CREATE OR REPLACE FUNCTION public.cg_get_marginalita_commesse(
  p_company_id uuid DEFAULT NULL,
  p_anno       int  DEFAULT NULL,
  p_status_filter text DEFAULT NULL  -- es. 'in_corso' / 'completato' / NULL=tutti
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_result jsonb;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  WITH base AS (
    SELECT
      v.id,
      v.order_code,
      v.description,
      v.cliente_nome,
      v.work_start_date,
      v.work_end_date,
      o.status,
      COALESCE(o.percentuale_avanzamento, 0) AS pct_avanz,
      v.preventivo_contratto,
      v.preventivo_totale,
      v.consuntivo,
      v.costo_acquisti,
      v.costo_errori,
      v.variazioni_approvate,
      v.margine,
      v.margine_perc
    FROM public.v_ordine_marginalita v
    LEFT JOIN public.orders o ON o.id = v.id
    WHERE v.company_id = v_company_id
      AND (p_status_filter IS NULL OR o.status = p_status_filter)
      AND (p_anno IS NULL
           OR extract(year from v.work_start_date)::int = p_anno
           OR extract(year from v.work_end_date)::int = p_anno
           OR (v.work_start_date IS NULL AND v.work_end_date IS NULL))
  ),
  computed AS (
    SELECT b.*,
      CASE
        WHEN b.pct_avanz >= 1 THEN b.consuntivo
        WHEN b.pct_avanz > 0  THEN b.consuntivo / GREATEST(b.pct_avanz, 0.01)
        ELSE NULL
      END AS costo_atteso,
      CASE
        WHEN b.pct_avanz > 0 THEN
          COALESCE(b.preventivo_contratto, b.preventivo_totale, 0)
          - CASE WHEN b.pct_avanz >= 1 THEN b.consuntivo
                 ELSE b.consuntivo / GREATEST(b.pct_avanz, 0.01) END
        ELSE NULL
      END AS margine_atteso
    FROM base b
  ),
  righe AS (
    SELECT jsonb_agg(jsonb_build_object(
        'id',                    c.id,
        'order_code',            c.order_code,
        'description',           c.description,
        'cliente',               c.cliente_nome,
        'status',                c.status,
        'pct_avanzamento',       c.pct_avanz,
        'work_start',            c.work_start_date,
        'work_end',              c.work_end_date,
        'preventivo',            COALESCE(c.preventivo_contratto, c.preventivo_totale, 0),
        'consuntivo',            COALESCE(c.consuntivo, 0),
        'costo_acquisti',        COALESCE(c.costo_acquisti, 0),
        'costo_errori',          COALESCE(c.costo_errori, 0),
        'variazioni',            COALESCE(c.variazioni_approvate, 0),
        'margine',               COALESCE(c.margine, 0),
        'margine_perc',          COALESCE(c.margine_perc, 0),
        'costo_atteso',          c.costo_atteso,
        'margine_atteso',        c.margine_atteso,
        'margine_atteso_perc',   CASE
                                    WHEN COALESCE(c.preventivo_contratto, c.preventivo_totale, 0) <> 0 AND c.margine_atteso IS NOT NULL
                                      THEN (c.margine_atteso / COALESCE(c.preventivo_contratto, c.preventivo_totale)) * 100
                                    ELSE NULL
                                 END,
        'semaforo',              CASE
                                    WHEN c.margine_atteso IS NULL THEN 'grigio'
                                    WHEN COALESCE(c.preventivo_contratto, c.preventivo_totale, 0) > 0
                                         AND (c.margine_atteso / COALESCE(c.preventivo_contratto, c.preventivo_totale)) >= 0.15
                                         THEN 'verde'
                                    WHEN c.margine_atteso < 0 THEN 'rosso'
                                    ELSE 'giallo'
                                 END
      ) ORDER BY COALESCE(c.preventivo_contratto, c.preventivo_totale, 0) DESC) AS items
    FROM computed c
  ),
  kpi AS (
    SELECT jsonb_build_object(
      'n_commesse',           count(*),
      'n_in_corso',           count(*) FILTER (WHERE pct_avanz > 0 AND pct_avanz < 1),
      'n_completate',         count(*) FILTER (WHERE pct_avanz >= 1),
      'preventivo_totale',    COALESCE(sum(COALESCE(preventivo_contratto, preventivo_totale, 0)), 0),
      'consuntivo_totale',    COALESCE(sum(consuntivo), 0),
      'margine_totale',       COALESCE(sum(margine), 0),
      'margine_atteso_totale', COALESCE(sum(margine_atteso) FILTER (WHERE margine_atteso IS NOT NULL), 0),
      'n_in_perdita',         count(*) FILTER (WHERE margine_atteso < 0)
    ) AS data
    FROM computed
  )
  SELECT jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id,
      'anno', p_anno,
      'status_filter', p_status_filter,
      'generato_il', now()
    ),
    'kpi',  (SELECT data FROM kpi),
    'righe', COALESCE((SELECT items FROM righe), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.cg_get_marginalita_commesse FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_marginalita_commesse TO authenticated;

COMMENT ON FUNCTION public.cg_get_marginalita_commesse IS
  'Marginalita per commessa: ricavi vs costi + proiezione lineare a fine cantiere + semaforo verde/giallo/rosso.';

CREATE OR REPLACE FUNCTION public.cg_get_marginalita_commesse_safe(
  p_anno          int,
  p_status_filter text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_company_id uuid := public.get_my_company_id();
BEGIN
  PERFORM public._cg_assert_enabled(v_company_id);
  RETURN public.cg_get_marginalita_commesse(v_company_id, p_anno, p_status_filter);
END;
$$;

REVOKE ALL ON FUNCTION public.cg_get_marginalita_commesse_safe FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_marginalita_commesse_safe TO authenticated;
