-- Controllo di Gestione · Piano industriale: base coerente col Conto economico,
-- anno in corso stimato a fine anno, rating con le stesse regole della scheda
-- Rating bancario, rate dei mutui che riducono il debito.
--
-- Cosa non andava (Demo 2, scenario Base, anno base 2025):
--  * i costi dell'anno base erano presi grezzi dai costi classificati, oneri
--    finanziari compresi (8.500 €), e poi gli oneri finanziari venivano tolti
--    una seconda volta: EBITDA base −413.891 € contro −405.391 € del Conto
--    economico. Con le buste paga caricate il Conto economico usa il costo del
--    personale dei cedolini, il piano no: altri numeri diversi.
--  * l'anno base era sempre l'anno precedente: non si poteva partire
--    dall'anno in corso (2026, EBITDA +530.795 € in 10 mesi).
--  * il rating del piano era una formula diversa da quella del Rating bancario
--    (oneri finanziari + mezzi propri / (mezzi propri + debito + costi fissi)):
--    il piano diceva CCC mentre la scheda Rating diceva AAA sugli stessi dati.
--  * il debito MLT non scendeva mai: le rate pagate non lo riducevano.
--  * le imposte del piano erano un 27,5% fisso, diverso dalla stima IRES+IRAP
--    del Conto economico.
--
-- Ora:
--  * anno base = p_anno_partenza, altrimenti l'anno dello scenario, altrimenti
--    l'anno scorso. Se l'anno base è quello in corso, ricavi e costi sono
--    riportati a fine anno in proporzione ai giorni trascorsi (meta
--    'base_stimata_fine_anno' = true, la pagina lo dice);
--  * costi variabili + fissi = ricavi − EBITDA del Conto economico, divisi tra
--    variabili e fissi con le proporzioni delle voci classificate;
--  * imposte = stessa stima del Conto economico (IRES + addizionale su utile
--    ante imposte, IRAP su EBIT, più il personale solo se l'opzione
--    base_irap_include_personale è accesa);
--  * rating di ogni anno con i 4 indicatori e le soglie di cg_get_rating; la
--    liquidità resta quella dell'anno base (il piano non proietta il
--    circolante), il rating dell'anno base è quello vero;
--  * rimborso annuo del debito = rate annue dei mutui attivi − interessi,
--    fino a estinzione.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Punteggio e classe del rating da 4 rapporti (stesse soglie di cg_get_rating).
CREATE OR REPLACE FUNCTION public.cg_rating_punteggio(p_liquidita numeric, p_indipendenza numeric, p_oneri numeric, p_cashflow numeric)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  WITH s AS (
    SELECT
      CASE WHEN p_liquidita IS NULL THEN 0 WHEN p_liquidita >= 1.8 THEN 25 WHEN p_liquidita >= 1.5 THEN 20
           WHEN p_liquidita >= 1.2 THEN 15 WHEN p_liquidita >= 1.0 THEN 10 WHEN p_liquidita >= 0.8 THEN 5 ELSE 0 END
    + CASE WHEN p_indipendenza IS NULL THEN 0 WHEN p_indipendenza >= 0.40 THEN 25 WHEN p_indipendenza >= 0.30 THEN 20
           WHEN p_indipendenza >= 0.20 THEN 15 WHEN p_indipendenza >= 0.15 THEN 10 WHEN p_indipendenza >= 0.10 THEN 5 ELSE 0 END
    + CASE WHEN p_oneri IS NULL THEN 0 WHEN p_oneri <= 0.015 THEN 25 WHEN p_oneri <= 0.025 THEN 20
           WHEN p_oneri <= 0.035 THEN 15 WHEN p_oneri <= 0.045 THEN 10 WHEN p_oneri <= 0.060 THEN 5 ELSE 0 END
    + CASE WHEN p_cashflow IS NULL THEN 0 WHEN p_cashflow >= 0.12 THEN 25 WHEN p_cashflow >= 0.08 THEN 20
           WHEN p_cashflow >= 0.05 THEN 15 WHEN p_cashflow >= 0.03 THEN 10 WHEN p_cashflow >= 0.01 THEN 5 ELSE 0 END AS score
  )
  SELECT jsonb_build_object('score', score, 'classe',
    CASE WHEN score >= 90 THEN 'AAA' WHEN score >= 80 THEN 'AA' WHEN score >= 70 THEN 'A'
         WHEN score >= 55 THEN 'BBB' WHEN score >= 40 THEN 'BB' WHEN score >= 20 THEN 'B' ELSE 'CCC' END)
  FROM s;
$$;

REVOKE ALL ON FUNCTION public.cg_rating_punteggio(numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cg_rating_punteggio(numeric, numeric, numeric, numeric) TO authenticated, service_role;

-- Firma nuova con il margine obiettivo del what-if: si toglie la vecchia per
-- non avere due versioni che PostgREST non sa distinguere.
DROP FUNCTION IF EXISTS public.cg_simula_piano_industriale(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.cg_simula_piano_industriale(p_company_id uuid DEFAULT NULL::uuid, p_assumption_id uuid DEFAULT NULL::uuid, p_anno_partenza integer DEFAULT NULL::integer, p_margine_target_pct numeric DEFAULT NULL::numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_a record;
  v_anno_base int; v_orizzonte int; v_giorni int; v_f numeric := 1; v_stimata boolean := false;
  v_ce0 jsonb; v_sp0 jsonb; v_rt0 jsonb;
  v_periodi jsonb := '[]'::jsonb;
  v_ricavi numeric; v_ebitda numeric; v_opex numeric; v_cv numeric; v_cf numeric;
  v_pers numeric; v_amm numeric; v_of numeric; v_trib numeric; v_utile numeric;
  v_quota_v numeric; v_val numeric; v_raw_v numeric; v_raw_tot numeric;
  r record;
  v_cespiti numeric; v_mp numeric; v_debito numeric; v_fondi numeric; v_ac numeric; v_pc numeric;
  v_liq0 numeric; v_tot_att0 numeric;
  v_rate_anno numeric; v_tasso numeric;
  v_ires numeric; v_irap numeric; v_add numeric; v_quota_pers numeric;
  v_g numeric; v_ricavi_t numeric; v_cv_t numeric; v_cf_t numeric; v_pers_t numeric;
  v_amm_t numeric; v_of_t numeric; v_ebitda_t numeric; v_ebit_t numeric; v_uai_t numeric;
  v_imposte_t numeric; v_utile_t numeric; v_rimborso numeric; v_cespiti_t numeric; v_mp_t numeric;
  v_pc_t numeric; v_ac_t numeric; v_tot_pas_t numeric; v_rt jsonb;
  v_m0 numeric; v_m_t numeric;
  v_eff numeric := 1.50;           -- efficienza di scala sui costi variabili, punti % l'anno
  v_vita_utile_anni numeric := 10; -- ammortamento dei nuovi investimenti
  i int;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id IS DISTINCT FROM public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  IF p_assumption_id IS NULL THEN
    SELECT * INTO v_a FROM public.piano_industriale_assumptions
     WHERE company_id = v_company_id AND scenario = 'base' AND is_default = true LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Nessuno scenario "base" trovato. Esegui bootstrap scenari prima.';
    END IF;
  ELSE
    SELECT * INTO v_a FROM public.piano_industriale_assumptions
     WHERE id = p_assumption_id AND company_id = v_company_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Assumption non trovata o non accessibile'; END IF;
  END IF;

  v_orizzonte := v_a.orizzonte_anni;
  v_anno_base := COALESCE(p_anno_partenza, v_a.anno_partenza, extract(year FROM current_date)::int - 1);
  v_giorni := public.cg_giorni_periodo(v_anno_base);
  IF v_giorni IS NULL THEN
    RAISE EXCEPTION 'L''anno di partenza % non è ancora iniziato', v_anno_base;
  END IF;
  IF v_anno_base = extract(year FROM current_date)::int THEN
    v_f := 365.0 / v_giorni; v_stimata := true;
  END IF;

  v_ce0 := public.cg_get_conto_economico_riclassificato(v_company_id, v_anno_base);
  v_sp0 := public.cg_get_stato_patrimoniale_riclassificato(v_company_id, v_anno_base);
  v_rt0 := public.cg_get_rating(v_company_id, v_anno_base);

  SELECT COALESCE(max((v->>'valore')::numeric) FILTER (WHERE v->>'codice' = '01'), 0),
         COALESCE(max((v->>'valore')::numeric) FILTER (WHERE v->>'codice' = 'E'), 0),
         COALESCE(max((v->>'valore')::numeric) FILTER (WHERE v->>'codice' = '06'), 0),
         COALESCE(max((v->>'valore')::numeric) FILTER (WHERE v->>'codice' = '09'), 0),
         COALESCE(max((v->>'valore')::numeric) FILTER (WHERE v->>'codice' = '11'), 0)
           - COALESCE(max((v->>'valore')::numeric) FILTER (WHERE v->>'codice' = '12'), 0),
         COALESCE(max((v->>'valore')::numeric) FILTER (WHERE v->>'codice' = '10'), 0),
         COALESCE(max((v->>'valore')::numeric) FILTER (WHERE v->>'codice' = 'L'), 0)
    INTO v_ricavi, v_ebitda, v_pers, v_amm, v_of, v_trib, v_utile
  FROM jsonb_array_elements(v_ce0->'voci') v;

  -- Costi operativi = ricavi − EBITDA, cioè esattamente quelli del Conto economico.
  v_opex := v_ricavi - v_ebitda;

  -- Parte variabile: per ogni riga operativa del CE, la quota variabile delle
  -- voci classificate (tipo 'V'). Senza classificazione: materie variabili,
  -- tutto il resto fisso.
  v_cv := 0;
  FOR r IN
    SELECT * FROM (VALUES ('acquisti_materie','03',1.0), ('costi_produttivi','05',0.0),
                          ('costo_personale','06',0.0), ('costi_commerciali','07',0.0),
                          ('costi_amministrativi','08',0.0)) AS m(macro, codice, quota_default)
  LOOP
    SELECT COALESCE((v->>'valore')::numeric, 0) INTO v_val
      FROM jsonb_array_elements(v_ce0->'voci') v WHERE v->>'codice' = r.codice;
    SELECT COALESCE(sum(importo) FILTER (WHERE tipo = 'V'), 0), COALESCE(sum(importo), 0)
      INTO v_raw_v, v_raw_tot
      FROM public.v_cg_costi_classificati
     WHERE company_id = v_company_id AND anno = v_anno_base AND macro_voce = r.macro;
    v_quota_v := CASE WHEN v_raw_tot > 0 THEN v_raw_v / v_raw_tot ELSE r.quota_default END;
    v_cv := v_cv + COALESCE(v_val, 0) * v_quota_v;
  END LOOP;
  v_cf := v_opex - v_cv;

  -- Anno in corso: flussi riportati a fine anno.
  v_ricavi := v_ricavi * v_f; v_cv := v_cv * v_f; v_cf := v_cf * v_f; v_pers := v_pers * v_f;
  v_amm := v_amm * v_f; v_of := v_of * v_f; v_trib := v_trib * v_f; v_utile := v_utile * v_f;
  v_ebitda := v_ricavi - v_cv - v_cf;
  v_m0 := CASE WHEN v_ricavi > 0 THEN v_ebitda / v_ricavi ELSE 0 END;

  v_cespiti := COALESCE((v_sp0->'attivo'->>'attivo_fisso')::numeric, 0);
  v_mp      := COALESCE((v_sp0->'passivo'->>'mezzi_propri')::numeric, 0);
  v_debito  := COALESCE((v_sp0->'passivo'->>'mutui_mlt')::numeric, 0);
  v_fondi   := COALESCE((v_sp0->'passivo'->>'fondo_tfr')::numeric, 0) + COALESCE((v_sp0->'passivo'->>'fondi_rischi')::numeric, 0);
  v_ac      := COALESCE((v_sp0->'attivo'->>'attivo_circolante')::numeric, 0);
  v_pc      := COALESCE((v_sp0->'passivo'->>'pas_corrente')::numeric, 0);
  v_tot_att0 := COALESCE((v_sp0->'attivo'->>'totale')::numeric, 0);
  v_liq0 := CASE WHEN v_pc > 0 THEN v_ac / v_pc WHEN v_ac > 0 THEN 99 END;

  SELECT COALESCE(sum(rata_mensile * 12), 0) INTO v_rate_anno
    FROM public.cg_loans WHERE company_id = v_company_id AND is_active;
  v_tasso := COALESCE(v_a.tasso_debito_pct, 6.0);

  SELECT ires_pct, irap_pct, addizionale_ires_pct,
         CASE WHEN base_irap_include_personale THEN 1 ELSE 0 END
    INTO v_ires, v_irap, v_add, v_quota_pers
    FROM public.cg_aliquote_imposte WHERE company_id = v_company_id;
  v_ires := COALESCE(v_ires, 24); v_irap := COALESCE(v_irap, 3.9); v_add := COALESCE(v_add, 0);
  v_quota_pers := COALESCE(v_quota_pers, 0); -- default: personale deducibile (migrazione 20281022104200)

  v_periodi := jsonb_build_array(jsonb_build_object(
    'tipo', 'consuntivo', 'anno', v_anno_base, 't', 0,
    'stimato_fine_anno', v_stimata,
    'ricavi', round(v_ricavi, 0), 'costi_var', round(v_cv, 0), 'costi_fissi', round(v_cf, 0),
    'ebitda', round(v_ebitda, 0), 'ammortamenti', round(v_amm, 0),
    'oneri_finanziari', round(v_of, 0), 'utile', round(v_utile, 0),
    'cespiti', round(v_cespiti, 0), 'mezzi_propri', round(v_mp, 0), 'debito_mlt', round(v_debito, 0),
    'rating_score', (v_rt0->>'score')::int, 'rating_classe', v_rt0->>'classe',
    'rating_attendibile', COALESCE((v_rt0->>'attendibile')::boolean, false)
  ));

  FOR i IN 1..v_orizzonte LOOP
    v_g := COALESCE(v_a.crescita_ricavi_pct[i], 0);
    v_ricavi_t := v_ricavi * (1 + v_g / 100);
    v_cf_t := v_cf * (1 + COALESCE(v_a.crescita_costi_fissi_pct[i], 0) / 100)
              + COALESCE(v_a.delta_costo_personale[i], 0);
    IF p_margine_target_pct IS NOT NULL AND v_ricavi_t > 0 THEN
      -- What-if «margine obiettivo»: il margine EBITDA va in linea retta dal
      -- valore dell'anno base all'obiettivo nell'ultimo anno del piano.
      v_m_t := v_m0 + (p_margine_target_pct / 100 - v_m0) * i / v_orizzonte;
      v_cv_t := v_ricavi_t * (1 - v_m_t) - v_cf_t;
    ELSE
      v_cv_t := v_cv * (1 + (v_g - v_eff) / 100);
    END IF;
    v_pers_t := CASE WHEN v_cf > 0 THEN v_pers * v_cf_t / v_cf ELSE v_pers END
                + 0; -- il personale segue i costi fissi

    v_cespiti_t := GREATEST(v_cespiti + COALESCE(v_a.investimenti[i], 0) - v_amm, 0);
    v_amm_t := v_amm + COALESCE(v_a.investimenti[i], 0) / v_vita_utile_anni;

    v_of_t := v_debito * v_tasso / 100;
    v_rimborso := LEAST(GREATEST(v_rate_anno - v_of_t, 0), v_debito);
    v_debito := v_debito - v_rimborso + COALESCE(v_a.nuovo_debito_mlt[i], 0);

    v_ebitda_t := v_ricavi_t - v_cv_t - v_cf_t;
    v_ebit_t := v_ebitda_t - v_amm_t;
    v_uai_t := v_ebit_t - v_trib - v_of_t;
    v_imposte_t := round(GREATEST(v_uai_t, 0) * (v_ires + v_add) / 100, 2)
                 + round(GREATEST(v_ebit_t + v_pers_t * v_quota_pers, 0) * v_irap / 100, 2);
    v_utile_t := v_uai_t - v_imposte_t;
    v_mp_t := v_mp + v_utile_t;

    -- Circolante e debiti a breve crescono con i ricavi (liquidità invariata).
    v_ac_t := v_ac * v_ricavi_t / NULLIF(v_ricavi, 0);
    v_pc_t := v_pc * v_ricavi_t / NULLIF(v_ricavi, 0);
    v_tot_pas_t := v_mp_t + v_debito + v_fondi + COALESCE(v_pc_t, v_pc);
    v_rt := public.cg_rating_punteggio(
      v_liq0,
      CASE WHEN v_tot_pas_t > 0 THEN v_mp_t / v_tot_pas_t END,
      CASE WHEN v_ricavi_t > 0 THEN v_of_t / v_ricavi_t END,
      CASE WHEN v_tot_pas_t > 0 THEN (v_utile_t + v_amm_t) / v_tot_pas_t END);

    v_periodi := v_periodi || jsonb_build_array(jsonb_build_object(
      'tipo', 'proiezione', 'anno', v_anno_base + i, 't', i,
      'ricavi', round(v_ricavi_t, 0), 'costi_var', round(v_cv_t, 0), 'costi_fissi', round(v_cf_t, 0),
      'ebitda', round(v_ebitda_t, 0), 'ammortamenti', round(v_amm_t, 0),
      'oneri_finanziari', round(v_of_t, 0), 'utile', round(v_utile_t, 0),
      'cespiti', round(v_cespiti_t, 0), 'mezzi_propri', round(v_mp_t, 0), 'debito_mlt', round(v_debito, 0),
      'investimento_anno', COALESCE(v_a.investimenti[i], 0),
      'rating_score', (v_rt->>'score')::int, 'rating_classe', v_rt->>'classe',
      'crescita_ricavi_pct', v_g
    ));

    v_ricavi := v_ricavi_t; v_cv := v_cv_t; v_cf := v_cf_t; v_pers := v_pers_t;
    v_amm := v_amm_t; v_cespiti := v_cespiti_t; v_mp := v_mp_t;
    v_ac := COALESCE(v_ac_t, v_ac); v_pc := COALESCE(v_pc_t, v_pc);
  END LOOP;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id,
      'scenario', v_a.scenario,
      'assumption_id', v_a.id,
      'anno_base', v_anno_base,
      'orizzonte', v_orizzonte,
      'base_stimata_fine_anno', v_stimata,
      'giorni_base', v_giorni,
      'sp_base_quadrato', COALESCE((v_sp0->'quadratura'->>'quadrato')::boolean, false),
      'sp_base_differenza', COALESCE((v_sp0->'quadratura'->>'differenza')::numeric, 0),
      'tasso_debito_pct', v_tasso,
      'aliquota_imposte_pct', v_ires + v_add,
      'irap_pct', v_irap
    ),
    'periodi', v_periodi
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cg_simula_piano_industriale(uuid, uuid, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cg_simula_piano_industriale(uuid, uuid, integer, numeric) TO authenticated, service_role;

-- What-if: accetta l'anno di partenza e usa davvero il margine obiettivo
-- (prima lo salvava nella copia temporanea ma la simulazione lo ignorava:
-- lo slider «Margine target» non cambiava nessun numero).
DROP FUNCTION IF EXISTS public.cg_simulazione_what_if(uuid, uuid, numeric, numeric, numeric, integer);

CREATE OR REPLACE FUNCTION public.cg_simulazione_what_if(p_company_id uuid DEFAULT NULL::uuid, p_assumption_id uuid DEFAULT NULL::uuid, p_override_crescita_pct numeric DEFAULT NULL::numeric, p_override_margine_pct numeric DEFAULT NULL::numeric, p_override_investimento numeric DEFAULT NULL::numeric, p_orizzonte integer DEFAULT NULL::integer, p_anno_partenza integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_assumption_id uuid;
  v_temp_id uuid;
  v_a record;
  v_orizzonte int;
  v_result jsonb;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id IS DISTINCT FROM public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;
  PERFORM public._cg_assert_enabled(v_company_id);

  IF p_assumption_id IS NULL THEN
    SELECT id INTO v_assumption_id FROM public.piano_industriale_assumptions
     WHERE company_id = v_company_id AND scenario = 'base' AND is_default = true LIMIT 1;
    IF v_assumption_id IS NULL THEN RAISE EXCEPTION 'Scenario base non trovato'; END IF;
  ELSE
    v_assumption_id := p_assumption_id;
  END IF;

  SELECT * INTO v_a FROM public.piano_industriale_assumptions
   WHERE id = v_assumption_id AND company_id = v_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assumption non accessibile'; END IF;

  v_orizzonte := COALESCE(p_orizzonte, v_a.orizzonte_anni);

  INSERT INTO public.piano_industriale_assumptions (
    company_id, scenario, anno_partenza, orizzonte_anni,
    crescita_ricavi_pct, margine_target_pct, crescita_costi_fissi_pct,
    investimenti, delta_costo_personale, nuovo_debito_mlt,
    tasso_debito_pct, aliquota_imposte_pct, is_default, note
  ) VALUES (
    v_a.company_id, 'custom', v_a.anno_partenza, v_orizzonte,
    CASE WHEN p_override_crescita_pct IS NOT NULL THEN array_fill(p_override_crescita_pct, ARRAY[v_orizzonte])
         ELSE v_a.crescita_ricavi_pct END,
    COALESCE(p_override_margine_pct, v_a.margine_target_pct),
    v_a.crescita_costi_fissi_pct,
    CASE WHEN p_override_investimento IS NOT NULL THEN array_fill(p_override_investimento, ARRAY[v_orizzonte])
         ELSE v_a.investimenti END,
    v_a.delta_costo_personale, v_a.nuovo_debito_mlt,
    v_a.tasso_debito_pct, v_a.aliquota_imposte_pct, false, '__what_if_temp__'
  ) RETURNING id INTO v_temp_id;

  v_result := public.cg_simula_piano_industriale(v_company_id, v_temp_id, p_anno_partenza, p_override_margine_pct);

  DELETE FROM public.piano_industriale_assumptions WHERE id = v_temp_id;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.cg_simulazione_what_if(uuid, uuid, numeric, numeric, numeric, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cg_simulazione_what_if(uuid, uuid, numeric, numeric, numeric, integer, integer) TO authenticated, service_role;
