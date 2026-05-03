-- MP-CG-04 — RPC Piano Industriale (proiezione 3/5/7 anni) + What-If

-- ════════════════════════════════════════════════════════════════════════════
-- 1) cg_simula_piano_industriale — proiezione completa
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cg_simula_piano_industriale(
  p_company_id    uuid DEFAULT NULL,
  p_assumption_id uuid DEFAULT NULL,
  p_anno_partenza int  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_assumption record;
  v_anno_base int;
  v_orizzonte int;
  v_periodi jsonb := '[]'::jsonb;
  v_ce0 jsonb;
  v_sp0 jsonb;
  v_ricavi numeric := 0;
  v_cv numeric := 0;
  v_cf numeric := 0;
  v_amm numeric := 0;
  v_of numeric := 0;
  v_cespiti numeric := 0;
  v_mp numeric := 0;
  v_debito_mlt numeric := 0;
  v_utile_base numeric := 0;
  v_ricavi_t numeric;
  v_cv_t numeric;
  v_cf_t numeric;
  v_amm_t numeric;
  v_of_t numeric;
  v_ebitda_t numeric;
  v_ebit_t numeric;
  v_utile_t numeric;
  v_imposte_t numeric;
  v_cespiti_t numeric;
  v_mp_t numeric;
  v_score_t int;
  v_classe_t text;
  v_eff numeric := 1.50;        -- efficienza scala % anno
  v_aliq numeric := 27.50;
  v_vita_utile_anni numeric := 10;
  i int;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id non risolvibile';
  END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  -- ── Assumption: param esplicito o default 'base' ─────────────────────────
  IF p_assumption_id IS NULL THEN
    SELECT * INTO v_assumption
    FROM public.piano_industriale_assumptions
    WHERE company_id = v_company_id AND scenario = 'base' AND is_default = true
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Nessuno scenario "base" trovato. Esegui bootstrap scenari prima.';
    END IF;
  ELSE
    SELECT * INTO v_assumption
    FROM public.piano_industriale_assumptions
    WHERE id = p_assumption_id AND company_id = v_company_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Assumption non trovata o non accessibile'; END IF;
  END IF;

  v_orizzonte := v_assumption.orizzonte_anni;
  v_anno_base := COALESCE(p_anno_partenza, v_assumption.anno_partenza,
                          extract(year from current_date)::int - 1);
  v_aliq := COALESCE(v_assumption.aliquota_imposte_pct, 27.50);

  -- ── Bootstrap baseline: consuntivo anno_base ─────────────────────────────
  v_ce0 := public.cg_get_conto_economico_riclassificato(v_company_id, v_anno_base);
  v_sp0 := public.cg_get_stato_patrimoniale_riclassificato(v_company_id, v_anno_base);

  SELECT (v->>'valore')::numeric INTO v_ricavi
  FROM jsonb_array_elements(v_ce0->'voci') v WHERE v->>'codice'='01';

  SELECT COALESCE(sum(importo), 0) INTO v_cv
  FROM public.v_cg_costi_classificati
  WHERE company_id = v_company_id AND anno = v_anno_base AND tipo = 'V';

  SELECT COALESCE(sum(importo), 0) INTO v_cf
  FROM public.v_cg_costi_classificati
  WHERE company_id = v_company_id AND anno = v_anno_base AND tipo = 'F';

  SELECT (v->>'valore')::numeric INTO v_amm
  FROM jsonb_array_elements(v_ce0->'voci') v WHERE v->>'codice'='09';

  SELECT (v->>'valore')::numeric INTO v_of
  FROM jsonb_array_elements(v_ce0->'voci') v WHERE v->>'codice'='11';

  SELECT (v->>'valore')::numeric INTO v_utile_base
  FROM jsonb_array_elements(v_ce0->'voci') v WHERE v->>'codice'='L';

  v_cespiti    := COALESCE((v_sp0->'attivo' ->>'attivo_fisso')::numeric, 0);
  v_mp         := COALESCE((v_sp0->'passivo'->>'mezzi_propri')::numeric, 0);
  v_debito_mlt := COALESCE((v_sp0->'passivo'->>'mutui_mlt')::numeric, 0);

  v_ricavi := COALESCE(v_ricavi, 0);
  v_amm := COALESCE(v_amm, 0);
  v_of  := COALESCE(v_of, 0);
  v_utile_base := COALESCE(v_utile_base, 0);

  -- t = 0 (consuntivo)
  v_periodi := v_periodi || jsonb_build_array(jsonb_build_object(
    'tipo', 'consuntivo', 'anno', v_anno_base, 't', 0,
    'ricavi', round(v_ricavi, 0),
    'costi_var', round(v_cv, 0),
    'costi_fissi', round(v_cf, 0),
    'ebitda', round(v_ricavi - v_cv - v_cf, 0),
    'ammortamenti', round(v_amm, 0),
    'oneri_finanziari', round(v_of, 0),
    'utile', round(v_utile_base, 0),
    'cespiti', round(v_cespiti, 0),
    'mezzi_propri', round(v_mp, 0),
    'debito_mlt', round(v_debito_mlt, 0)
  ));

  -- ── Loop proiezione 1..orizzonte ────────────────────────────────────────
  FOR i IN 1..v_orizzonte LOOP
    v_ricavi_t := v_ricavi * (1 + COALESCE(v_assumption.crescita_ricavi_pct[i], 0) / 100);
    v_cv_t     := v_cv     * (1 + (COALESCE(v_assumption.crescita_ricavi_pct[i], 0) - v_eff) / 100);
    v_cf_t     := v_cf     * (1 + COALESCE(v_assumption.crescita_costi_fissi_pct[i], 0) / 100)
                          + COALESCE(v_assumption.delta_costo_personale[i], 0);

    v_cespiti_t := v_cespiti + COALESCE(v_assumption.investimenti[i], 0) - v_amm;
    v_amm_t     := v_amm + COALESCE(v_assumption.investimenti[i], 0) / v_vita_utile_anni;

    v_debito_mlt := v_debito_mlt + COALESCE(v_assumption.nuovo_debito_mlt[i], 0);
    v_of_t       := v_debito_mlt * COALESCE(v_assumption.tasso_debito_pct, 6.0) / 100;

    v_ebitda_t  := v_ricavi_t - v_cv_t - v_cf_t;
    v_ebit_t    := v_ebitda_t - v_amm_t;
    v_imposte_t := GREATEST((v_ebit_t - v_of_t) * v_aliq / 100, 0);
    v_utile_t   := v_ebit_t - v_of_t - v_imposte_t;
    v_mp_t      := v_mp + v_utile_t;

    -- Rating semplificato sul proiettato (4 indicatori approssimati)
    v_score_t :=
      CASE WHEN v_ricavi_t > 0 AND v_of_t / v_ricavi_t <= 0.015 THEN 25
           WHEN v_ricavi_t > 0 AND v_of_t / v_ricavi_t <= 0.025 THEN 20
           WHEN v_ricavi_t > 0 AND v_of_t / v_ricavi_t <= 0.035 THEN 15
           WHEN v_ricavi_t > 0 AND v_of_t / v_ricavi_t <= 0.045 THEN 10
           WHEN v_ricavi_t > 0 AND v_of_t / v_ricavi_t <= 0.060 THEN 5
           ELSE 0 END
      + COALESCE(round((v_mp_t / NULLIF(v_mp_t + v_debito_mlt + v_cf_t, 0)) * 60), 0)::int;
    v_score_t := LEAST(GREATEST(v_score_t, 0), 100);
    v_classe_t := CASE WHEN v_score_t >= 90 THEN 'AAA' WHEN v_score_t >= 80 THEN 'AA'
                       WHEN v_score_t >= 70 THEN 'A'   WHEN v_score_t >= 55 THEN 'BBB'
                       WHEN v_score_t >= 40 THEN 'BB'  WHEN v_score_t >= 20 THEN 'B'
                       ELSE 'CCC' END;

    v_periodi := v_periodi || jsonb_build_array(jsonb_build_object(
      'tipo', 'proiezione', 'anno', v_anno_base + i, 't', i,
      'ricavi', round(v_ricavi_t, 0),
      'costi_var', round(v_cv_t, 0),
      'costi_fissi', round(v_cf_t, 0),
      'ebitda', round(v_ebitda_t, 0),
      'ammortamenti', round(v_amm_t, 0),
      'oneri_finanziari', round(v_of_t, 0),
      'utile', round(v_utile_t, 0),
      'cespiti', round(v_cespiti_t, 0),
      'mezzi_propri', round(v_mp_t, 0),
      'debito_mlt', round(v_debito_mlt, 0),
      'investimento_anno', COALESCE(v_assumption.investimenti[i], 0),
      'rating_score', v_score_t,
      'rating_classe', v_classe_t,
      'crescita_ricavi_pct', COALESCE(v_assumption.crescita_ricavi_pct[i], 0)
    ));

    -- Avanza baseline per il prossimo anno
    v_ricavi := v_ricavi_t; v_cv := v_cv_t; v_cf := v_cf_t;
    v_amm := v_amm_t; v_cespiti := v_cespiti_t; v_mp := v_mp_t;
  END LOOP;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id,
      'scenario',   v_assumption.scenario,
      'assumption_id', v_assumption.id,
      'anno_base',  v_anno_base,
      'orizzonte',  v_orizzonte,
      'tasso_debito_pct', v_assumption.tasso_debito_pct,
      'aliquota_imposte_pct', v_aliq
    ),
    'periodi', v_periodi
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cg_simula_piano_industriale TO authenticated;
COMMENT ON FUNCTION public.cg_simula_piano_industriale IS
  'Proiezione CE+SP+Rating su 3/5/7 anni partendo da consuntivo + assumption.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2) cg_simulazione_what_if — clone temporaneo con override + simula + cleanup
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cg_simulazione_what_if(
  p_company_id            uuid    DEFAULT NULL,
  p_assumption_id         uuid    DEFAULT NULL,
  p_override_crescita_pct numeric DEFAULT NULL,
  p_override_margine_pct  numeric DEFAULT NULL,
  p_override_investimento numeric DEFAULT NULL,
  p_orizzonte             int     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_assumption_id uuid;
  v_temp_id uuid;
  v_a record;
  v_orizzonte int;
  v_result jsonb;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id non risolvibile';
  END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  IF p_assumption_id IS NULL THEN
    SELECT id INTO v_assumption_id FROM public.piano_industriale_assumptions
    WHERE company_id = v_company_id AND scenario = 'base' AND is_default = true
    LIMIT 1;
    IF v_assumption_id IS NULL THEN
      RAISE EXCEPTION 'Scenario base non trovato';
    END IF;
  ELSE
    v_assumption_id := p_assumption_id;
  END IF;

  SELECT * INTO v_a FROM public.piano_industriale_assumptions
  WHERE id = v_assumption_id AND company_id = v_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assumption non accessibile'; END IF;

  v_orizzonte := COALESCE(p_orizzonte, v_a.orizzonte_anni);

  -- Clone temporanea con override
  INSERT INTO public.piano_industriale_assumptions (
    company_id, scenario, anno_partenza, orizzonte_anni,
    crescita_ricavi_pct, margine_target_pct, crescita_costi_fissi_pct,
    investimenti, delta_costo_personale, nuovo_debito_mlt,
    tasso_debito_pct, aliquota_imposte_pct,
    is_default, note
  ) VALUES (
    v_a.company_id, 'custom', v_a.anno_partenza, v_orizzonte,
    CASE WHEN p_override_crescita_pct IS NOT NULL
         THEN array_fill(p_override_crescita_pct, ARRAY[v_orizzonte])
         ELSE v_a.crescita_ricavi_pct END,
    COALESCE(p_override_margine_pct, v_a.margine_target_pct),
    v_a.crescita_costi_fissi_pct,
    CASE WHEN p_override_investimento IS NOT NULL
         THEN array_fill(p_override_investimento, ARRAY[v_orizzonte])
         ELSE v_a.investimenti END,
    v_a.delta_costo_personale, v_a.nuovo_debito_mlt,
    v_a.tasso_debito_pct, v_a.aliquota_imposte_pct,
    false, '__what_if_temp__'
  ) RETURNING id INTO v_temp_id;

  v_result := public.cg_simula_piano_industriale(v_company_id, v_temp_id);

  DELETE FROM public.piano_industriale_assumptions WHERE id = v_temp_id;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cg_simulazione_what_if TO authenticated;
COMMENT ON FUNCTION public.cg_simulazione_what_if IS
  'Simulazione what-if veloce con override puntuali. Clona scenario, simula, elimina.';
