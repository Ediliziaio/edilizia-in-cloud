-- MP-CG-14 — Indici Finanziari Avanzati
--   • DSO  = (Crediti clienti / Ricavi) * 365
--   • DPO  = (Debiti fornitori / Acquisti) * 365
--   • DSI  = (Rimanenze / Costo del venduto) * 365
--   • CCC  = DSO + DSI - DPO
--   • Z-score di Altman (modello edilizia/PMI privata)
--   • DSCR = EBITDA / (Quota capitale + Interessi)

CREATE OR REPLACE FUNCTION public.cg_get_indici_avanzati(
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
  v_ce       jsonb;
  v_sp       jsonb;
  v_pfn      jsonb;
  v_ricavi   numeric;
  v_acquisti numeric;
  v_costo_vend numeric;
  v_ebitda   numeric;
  v_ebit     numeric;
  v_utile_ai numeric;
  v_utile    numeric;
  v_oneri_fin numeric;
  v_crediti  numeric;
  v_debiti_forn numeric;
  v_rimanenze numeric;
  v_attivo   numeric;
  v_pn       numeric;
  v_passivo_corrente numeric;
  v_attivo_circ numeric;
  v_dso      numeric;
  v_dpo      numeric;
  v_dsi      numeric;
  v_ccc      numeric;
  v_z_score  numeric;
  v_z_classe text;
  v_dscr     numeric;
  v_servizio_debito numeric;
  v_rate_anno numeric;
  v_interessi_anno numeric;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  -- CE annuale
  v_ce := public.cg_get_conto_economico_riclassificato(v_company_id, p_anno, 1, 12);
  -- SP
  v_sp := public.cg_get_stato_patrimoniale_riclassificato(v_company_id, p_anno);
  -- PFN
  v_pfn := public.cg_get_pfn(v_company_id, p_anno);

  -- Estrai voci CE
  SELECT (v->>'valore')::numeric INTO v_ricavi   FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = '01';
  SELECT (v->>'valore')::numeric INTO v_acquisti FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = '03';
  SELECT (v->>'valore')::numeric INTO v_costo_vend FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = 'C';
  SELECT (v->>'valore')::numeric INTO v_ebitda   FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = 'E';
  SELECT (v->>'valore')::numeric INTO v_ebit     FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = 'F';
  SELECT (v->>'valore')::numeric INTO v_utile_ai FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = 'I';
  SELECT (v->>'valore')::numeric INTO v_utile    FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = 'L';
  SELECT (v->>'valore')::numeric INTO v_oneri_fin FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = '11';

  -- Estrai voci SP
  v_crediti      := COALESCE((v_sp->'attivo'->>'crediti_clienti')::numeric, 0);
  v_rimanenze    := COALESCE((v_sp->'attivo'->>'rimanenze')::numeric, 0);
  v_attivo       := COALESCE((v_sp->'attivo'->>'totale')::numeric, 0);
  v_attivo_circ  := COALESCE((v_sp->'attivo'->>'attivo_circolante')::numeric, 0);
  v_debiti_forn  := COALESCE((v_sp->'passivo'->>'debiti_fornitori')::numeric, 0);
  v_pn           := COALESCE((v_sp->'passivo'->>'mezzi_propri')::numeric, 0);
  v_passivo_corrente := COALESCE((v_sp->'passivo'->>'pas_corrente')::numeric, 0);

  -- Indici di rotazione (giorni)
  v_dso := CASE WHEN v_ricavi > 0    THEN (v_crediti     / v_ricavi)    * 365 ELSE NULL END;
  v_dpo := CASE WHEN v_acquisti > 0  THEN (v_debiti_forn / v_acquisti)  * 365 ELSE NULL END;
  v_dsi := CASE WHEN v_costo_vend > 0 THEN (v_rimanenze   / v_costo_vend) * 365 ELSE NULL END;
  v_ccc := COALESCE(v_dso, 0) + COALESCE(v_dsi, 0) - COALESCE(v_dpo, 0);

  -- Z-score di Altman (modello revised per PMI non quotate, 1983):
  --   Z' = 0.717·X1 + 0.847·X2 + 3.107·X3 + 0.420·X4 + 0.998·X5
  --   X1 = (Attivo circolante - Passivo corrente) / Attivo
  --   X2 = Utile non distribuito / Attivo  (qui usiamo riserve+utile come proxy)
  --   X3 = EBIT / Attivo
  --   X4 = PN / Debiti totali (=Pas_consol + Pas_corrente)
  --   X5 = Ricavi / Attivo
  IF v_attivo > 0 THEN
    DECLARE
      v_x1 numeric := (v_attivo_circ - v_passivo_corrente) / v_attivo;
      v_x2 numeric := COALESCE((
        SELECT ((v_sp->'passivo'->>'riserve')::numeric + (v_sp->'passivo'->>'utile_esercizio')::numeric)
      ), 0) / v_attivo;
      v_x3 numeric := COALESCE(v_ebit, 0) / v_attivo;
      v_debiti_tot numeric := COALESCE((v_sp->'passivo'->>'pas_consolidato')::numeric, 0)
                            + v_passivo_corrente;
      v_x4 numeric := CASE WHEN v_debiti_tot > 0 THEN v_pn / v_debiti_tot ELSE 0 END;
      v_x5 numeric := COALESCE(v_ricavi, 0) / v_attivo;
    BEGIN
      v_z_score := round(0.717 * v_x1 + 0.847 * v_x2 + 3.107 * v_x3 + 0.420 * v_x4 + 0.998 * v_x5, 3);
      v_z_classe := CASE
                      WHEN v_z_score >= 2.9  THEN 'safe'        -- area sicurezza
                      WHEN v_z_score >= 1.23 THEN 'grey'        -- area grigia
                      ELSE 'distress'                            -- area distress
                    END;
    END;
  END IF;

  -- DSCR — usa rate mutui annuali + interessi
  SELECT
    COALESCE(sum(rata_mensile * 12), 0),
    COALESCE(sum(capitale_residuo * (tasso_pct/100.0)), 0)
  INTO v_rate_anno, v_interessi_anno
  FROM public.cg_loans
  WHERE company_id = v_company_id AND is_active = true;

  v_servizio_debito := v_rate_anno;
  v_dscr := CASE
              WHEN v_servizio_debito > 0
                THEN round((COALESCE(v_ebitda, 0) - COALESCE(v_utile_ai, 0) * 0.30) / v_servizio_debito, 2)
              ELSE NULL
            END;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id,
      'anno', p_anno,
      'generato_il', now()
    ),
    'rotazione', jsonb_build_object(
      'dso_giorni', v_dso,
      'dpo_giorni', v_dpo,
      'dsi_giorni', v_dsi,
      'ccc_giorni', v_ccc,
      'crediti_clienti',    v_crediti,
      'debiti_fornitori',   v_debiti_forn,
      'rimanenze',          v_rimanenze,
      'ricavi',             v_ricavi,
      'acquisti',           v_acquisti,
      'costo_venduto',      v_costo_vend
    ),
    'altman', jsonb_build_object(
      'z_score',    v_z_score,
      'classe',     v_z_classe,
      'descrizione', CASE v_z_classe
        WHEN 'safe'     THEN 'Area di sicurezza — bassa probabilità di default'
        WHEN 'grey'     THEN 'Area grigia — monitorare con attenzione'
        WHEN 'distress' THEN 'Area di distress — alto rischio di default'
        ELSE 'Non calcolabile (dati insufficienti)'
      END
    ),
    'dscr', jsonb_build_object(
      'valore',          v_dscr,
      'servizio_debito', v_servizio_debito,
      'rate_anno',       v_rate_anno,
      'interessi_anno',  v_interessi_anno,
      'ebitda',          v_ebitda,
      'classe',          CASE
                            WHEN v_dscr IS NULL THEN 'na'
                            WHEN v_dscr >= 1.5  THEN 'eccellente'
                            WHEN v_dscr >= 1.2  THEN 'buono'
                            WHEN v_dscr >= 1.0  THEN 'critico'
                            ELSE 'insufficiente'
                          END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cg_get_indici_avanzati FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_indici_avanzati TO authenticated;

COMMENT ON FUNCTION public.cg_get_indici_avanzati IS
  'Indici finanziari avanzati: DSO/DPO/DSI/CCC, Z-score Altman, DSCR.';

CREATE OR REPLACE FUNCTION public.cg_get_indici_avanzati_safe(p_anno int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_company_id uuid := public.get_my_company_id();
BEGIN
  PERFORM public._cg_assert_enabled(v_company_id);
  RETURN public.cg_get_indici_avanzati(v_company_id, p_anno);
END;
$$;
REVOKE ALL ON FUNCTION public.cg_get_indici_avanzati_safe FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_indici_avanzati_safe TO authenticated;
