-- Controllo di Gestione · Indici avanzati: periodo vero, debiti fornitori veri,
-- valori provvisori quando lo Stato patrimoniale non quadra.
--
-- Cosa non andava (Demo 2, anno 2026, al 22/10):
--  * DSO/DSI/DPO moltiplicavano per 365 i ricavi e gli acquisti di 10 mesi:
--    giorni gonfiati di circa un quinto (DSO 81 invece di 66).
--  * DPO = 0 giorni perché il debito verso fornitori veniva preso dallo Stato
--    patrimoniale, che lo aveva a zero, mentre in scadenzario ci sono
--    157.388 € da pagare a fornitori. Con DPO a zero anche il ciclo del
--    circolante (CCC) era sbagliato.
--  * Z-score e DSCR usavano EBIT, ricavi ed EBITDA di 10 mesi contro attivo e
--    rate di 12 mesi, e venivano presentati come validi anche con uno Stato
--    patrimoniale sbilanciato di 1.346.331,55 €.
--
-- Ora:
--  * giorni del periodo = giorni trascorsi da inizio anno (anno in corso),
--    365/366 per gli anni chiusi, nessun indice per gli anni futuri;
--  * debito fornitori = quello dello Stato patrimoniale se presente, altrimenti
--    il residuo delle scadenze in uscita verso fornitori ancora da pagare
--    (pagamento_fornitore e costo_aziendale, escluse le previsionali); se è
--    zero il DPO è «non calcolabile», non 0 giorni;
--  * il DPO si calcola su acquisti + servizi (materie, costi produttivi,
--    commerciali e amministrativi), cioè su ciò che i fornitori fatturano;
--  * Z-score usa EBIT e ricavi riportati all'anno; DSCR confronta il flusso
--    del periodo con le rate dello stesso periodo;
--  * 'attendibile' = false e 'motivi' quando lo Stato patrimoniale non quadra.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Giorni del periodo coperto dai dati di un esercizio.
CREATE OR REPLACE FUNCTION public.cg_giorni_periodo(p_anno integer)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_anno < extract(year FROM current_date)::int
      THEN (make_date(p_anno + 1, 1, 1) - make_date(p_anno, 1, 1))
    WHEN p_anno = extract(year FROM current_date)::int
      THEN (current_date - make_date(p_anno, 1, 1)) + 1
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.cg_giorni_periodo(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cg_giorni_periodo(integer) TO authenticated, service_role;

-- Debito aperto verso fornitori dallo scadenzario (residuo non pagato).
-- Solo per uso interno delle funzioni del Controllo di Gestione.
CREATE OR REPLACE FUNCTION public.cg_debiti_fornitori_aperti(p_company_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(sum(GREATEST(s.amount - COALESCE(s.paid_amount, 0), 0)), 0)
  FROM public.scadenze s
  WHERE s.company_id = p_company_id
    AND s.direction = 'uscita'
    AND s.tipo IN ('pagamento_fornitore', 'costo_aziendale')
    AND COALESCE(s.is_previsionale, false) = false
    AND lower(COALESCE(s.status, '')) IN ('da_pagare', 'parziale', 'scaduta', 'pending', 'partial', 'unpaid', 'overdue');
$$;

REVOKE ALL ON FUNCTION public.cg_debiti_fornitori_aperti(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cg_debiti_fornitori_aperti(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cg_get_indici_avanzati(p_company_id uuid DEFAULT NULL::uuid, p_anno integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_ce jsonb; v_sp jsonb;
  v_ricavi numeric; v_acquisti numeric; v_servizi numeric; v_comm numeric; v_amm_costi numeric;
  v_acquisti_servizi numeric; v_costo_vend numeric;
  v_ebitda numeric; v_ebit numeric; v_imposte numeric;
  v_crediti numeric; v_debiti_forn numeric; v_debiti_sp numeric; v_fonte_debiti text;
  v_rimanenze numeric; v_attivo numeric; v_pn numeric; v_passivo_corrente numeric; v_attivo_circ numeric;
  v_giorni integer; v_fattore numeric;
  v_dso numeric; v_dpo numeric; v_dsi numeric; v_ccc numeric;
  v_x1 numeric; v_x2 numeric; v_x3 numeric; v_x4 numeric; v_x5 numeric; v_debiti_tot numeric;
  v_z_score numeric; v_z_classe text;
  v_rate_anno numeric; v_rate_periodo numeric; v_interessi_anno numeric; v_dscr numeric;
  v_quadrato boolean; v_differenza numeric;
  v_motivi jsonb := '[]'::jsonb;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id IS DISTINCT FROM public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  v_ce := public.cg_get_conto_economico_riclassificato(v_company_id, p_anno, 1, 12);
  v_sp := public.cg_get_stato_patrimoniale_riclassificato(v_company_id, p_anno);

  SELECT (v->>'valore')::numeric INTO v_ricavi     FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = '01';
  SELECT (v->>'valore')::numeric INTO v_acquisti   FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = '03';
  SELECT (v->>'valore')::numeric INTO v_servizi    FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = '05';
  SELECT (v->>'valore')::numeric INTO v_comm       FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = '07';
  SELECT (v->>'valore')::numeric INTO v_amm_costi  FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = '08';
  SELECT (v->>'valore')::numeric INTO v_costo_vend FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = 'C';
  SELECT (v->>'valore')::numeric INTO v_ebitda     FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = 'E';
  SELECT (v->>'valore')::numeric INTO v_ebit       FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = 'F';
  SELECT (v->>'valore')::numeric INTO v_imposte    FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = '15';

  v_ricavi := COALESCE(v_ricavi, 0);
  v_acquisti_servizi := COALESCE(v_acquisti, 0) + COALESCE(v_servizi, 0) + COALESCE(v_comm, 0) + COALESCE(v_amm_costi, 0);

  v_crediti          := COALESCE((v_sp->'attivo'->>'crediti_clienti')::numeric, 0);
  v_rimanenze        := COALESCE((v_sp->'attivo'->>'rimanenze')::numeric, 0);
  v_attivo           := COALESCE((v_sp->'attivo'->>'totale')::numeric, 0);
  v_attivo_circ      := COALESCE((v_sp->'attivo'->>'attivo_circolante')::numeric, 0);
  v_debiti_sp        := COALESCE((v_sp->'passivo'->>'debiti_fornitori')::numeric, 0);
  v_pn               := COALESCE((v_sp->'passivo'->>'mezzi_propri')::numeric, 0);
  v_passivo_corrente := COALESCE((v_sp->'passivo'->>'pas_corrente')::numeric, 0);
  v_quadrato         := COALESCE((v_sp->'quadratura'->>'quadrato')::boolean, false);
  v_differenza       := COALESCE((v_sp->'quadratura'->>'differenza')::numeric, 0);

  IF v_debiti_sp > 0 THEN
    v_debiti_forn := v_debiti_sp; v_fonte_debiti := 'stato_patrimoniale';
  ELSE
    v_debiti_forn := public.cg_debiti_fornitori_aperti(v_company_id); v_fonte_debiti := 'scadenzario';
  END IF;

  v_giorni := public.cg_giorni_periodo(p_anno);
  v_fattore := CASE WHEN v_giorni > 0 THEN 365.0 / v_giorni ELSE NULL END;

  IF v_giorni IS NULL THEN
    v_motivi := v_motivi || jsonb_build_array('Anno futuro: non ci sono ancora dati consuntivi.');
  END IF;

  v_dso := CASE WHEN v_giorni > 0 AND v_ricavi > 0 THEN v_crediti / v_ricavi * v_giorni END;
  v_dsi := CASE WHEN v_giorni > 0 AND v_costo_vend > 0 THEN v_rimanenze / v_costo_vend * v_giorni END;
  v_dpo := CASE WHEN v_giorni > 0 AND v_acquisti_servizi > 0 AND v_debiti_forn > 0
                THEN v_debiti_forn / v_acquisti_servizi * v_giorni END;
  -- Il ciclo si calcola solo con tutti i pezzi: senza DPO sarebbe gonfiato.
  v_ccc := CASE WHEN v_dso IS NOT NULL AND v_dpo IS NOT NULL
                THEN v_dso + COALESCE(v_dsi, 0) - v_dpo END;

  -- Z-score di Altman, modello rivisto per società non quotate (1983):
  --   Z' = 0,717·X1 + 0,847·X2 + 3,107·X3 + 0,420·X4 + 0,998·X5
  -- X3 e X5 sono flussi: riportati all'anno se l'esercizio è in corso.
  IF v_attivo > 0 AND v_fattore IS NOT NULL THEN
    v_x1 := (v_attivo_circ - v_passivo_corrente) / v_attivo;
    v_x2 := (COALESCE((v_sp->'passivo'->>'riserve')::numeric, 0)
             + COALESCE((v_sp->'passivo'->>'utile_esercizio')::numeric, 0)) / v_attivo;
    v_x3 := COALESCE(v_ebit, 0) * v_fattore / v_attivo;
    v_debiti_tot := COALESCE((v_sp->'passivo'->>'pas_consolidato')::numeric, 0) + v_passivo_corrente;
    v_x4 := CASE WHEN v_debiti_tot > 0 THEN v_pn / v_debiti_tot ELSE NULL END;
    v_x5 := v_ricavi * v_fattore / v_attivo;
    IF v_x4 IS NOT NULL THEN
      v_z_score := round(0.717 * v_x1 + 0.847 * v_x2 + 3.107 * v_x3 + 0.420 * v_x4 + 0.998 * v_x5, 3);
      v_z_classe := CASE WHEN v_z_score >= 2.9 THEN 'safe' WHEN v_z_score >= 1.23 THEN 'grey' ELSE 'distress' END;
    END IF;
  END IF;

  SELECT COALESCE(sum(rata_mensile * 12), 0), COALESCE(sum(capitale_residuo * (tasso_pct / 100.0)), 0)
    INTO v_rate_anno, v_interessi_anno
  FROM public.cg_loans
  WHERE company_id = v_company_id AND is_active = true;

  v_rate_periodo := CASE WHEN v_giorni > 0 THEN round(v_rate_anno * v_giorni / 365.0, 2) ELSE 0 END;
  v_dscr := CASE WHEN v_rate_periodo > 0
                 THEN round((COALESCE(v_ebitda, 0) - COALESCE(v_imposte, 0)) / v_rate_periodo, 2) END;

  IF NOT v_quadrato THEN
    v_motivi := v_motivi || jsonb_build_array(
      'Lo Stato patrimoniale non quadra (differenza ' ||
      replace(replace(replace(to_char(v_differenza, 'FM999,999,999,990.00'), ',', '#'), '.', ','), '#', '.') || ' €): Z-score e indici patrimoniali sono provvisori.');
  END IF;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object('company_id', v_company_id, 'anno', p_anno, 'generato_il', now(),
                               'giorni_periodo', v_giorni),
    'attendibile', v_quadrato AND v_giorni IS NOT NULL,
    'motivi', v_motivi,
    'rotazione', jsonb_build_object(
      'giorni_periodo',   v_giorni,
      'dso_giorni',       v_dso,
      'dpo_giorni',       v_dpo,
      'dsi_giorni',       v_dsi,
      'ccc_giorni',       v_ccc,
      'crediti_clienti',  v_crediti,
      'debiti_fornitori', v_debiti_forn,
      'debiti_fornitori_fonte', v_fonte_debiti,
      'rimanenze',        v_rimanenze,
      'ricavi',           v_ricavi,
      'acquisti',         v_acquisti_servizi,
      'costo_venduto',    v_costo_vend
    ),
    'altman', jsonb_build_object(
      'z_score', v_z_score,
      'classe', v_z_classe,
      'provvisorio', NOT v_quadrato,
      'componenti', jsonb_build_object('x1', round(v_x1, 4), 'x2', round(v_x2, 4), 'x3', round(v_x3, 4),
                                       'x4', round(v_x4, 4), 'x5', round(v_x5, 4)),
      'descrizione', CASE v_z_classe
        WHEN 'safe'     THEN 'Area di sicurezza: rischio di insolvenza basso'
        WHEN 'grey'     THEN 'Area grigia: da tenere sotto controllo'
        WHEN 'distress' THEN 'Area di rischio: probabilità di insolvenza alta'
        ELSE 'Non calcolabile: mancano attivo, debiti o dati dell''anno'
      END
    ),
    'dscr', jsonb_build_object(
      'valore',             v_dscr,
      'imposte_ce',         v_imposte,
      'flusso_disponibile', COALESCE(v_ebitda, 0) - COALESCE(v_imposte, 0),
      'servizio_debito',    v_rate_periodo,
      'rate_anno',          v_rate_anno,
      'rate_periodo',       v_rate_periodo,
      'giorni_periodo',     v_giorni,
      'interessi_anno',     v_interessi_anno,
      'ebitda',             v_ebitda,
      'provvisorio',        NOT v_quadrato,
      'classe', CASE
        WHEN v_dscr IS NULL THEN 'na'
        WHEN v_dscr >= 1.5  THEN 'eccellente'
        WHEN v_dscr >= 1.2  THEN 'buono'
        WHEN v_dscr >= 1.0  THEN 'critico'
        ELSE 'insufficiente'
      END
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cg_get_indici_avanzati(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_indici_avanzati(uuid, integer) TO authenticated, service_role;
