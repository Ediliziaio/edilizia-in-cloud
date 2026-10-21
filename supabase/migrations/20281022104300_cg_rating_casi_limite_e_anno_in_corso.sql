-- Controllo di Gestione · Rating bancario: casi limite e anno in corso.
--
-- Cosa non andava:
--  * senza passività correnti (nessun debito a breve) la liquidità valeva 0 e
--    prendeva 0 punti: il caso migliore trattato come il peggiore;
--  * senza ricavi l'incidenza degli oneri finanziari valeva 1 (100%) per
--    convenzione, e la pagina doveva indovinare quando nascondere il numero;
--  * (utile + ammortamenti) / attivo usava i flussi di 10 mesi contro un
--    attivo di fine periodo: indicatore sottostimato per l'anno in corso;
--  * il motivo «Stato patrimoniale non riconciliato: differenza 1346331.55 €»
--    usciva con il numero non formattato.
--
-- Ora ogni indicatore dice se è 'calcolabile'; quelli non calcolabili danno
-- 0 punti e la pagina mostra «—» con il motivo. Il flusso di cassa è riportato
-- all'anno con i giorni trascorsi (cg_giorni_periodo, migrazione 20281022104100).

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.cg_formato_euro(p_valore numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT replace(replace(replace(to_char(COALESCE(p_valore, 0), 'FM999,999,999,990.00'), ',', '#'), '.', ','), '#', '.') || ' €';
$$;

REVOKE ALL ON FUNCTION public.cg_formato_euro(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cg_formato_euro(numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cg_get_rating(p_company_id uuid DEFAULT NULL::uuid, p_anno integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_sp jsonb; v_ce jsonb;
  v_ac numeric; v_pc numeric; v_mp numeric; v_tot_pas numeric; v_tot_att numeric;
  v_of numeric; v_ricavi numeric; v_utile numeric; v_amm numeric;
  v_giorni integer; v_fattore numeric;
  v_r1 numeric; v_r2 numeric; v_r3 numeric; v_r4 numeric;
  v_c1 boolean; v_c2 boolean; v_c3 boolean; v_c4 boolean;
  v_s1 int; v_s2 int; v_s3 int; v_s4 int;
  v_score int; v_classe text; v_livello text;
  v_quadrato boolean; v_motivi jsonb := '[]'::jsonb;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id IS DISTINCT FROM public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  v_sp := public.cg_get_stato_patrimoniale_riclassificato(v_company_id, p_anno);
  v_ce := public.cg_get_conto_economico_riclassificato(v_company_id, p_anno);

  v_ac      := COALESCE((v_sp->'attivo' ->>'attivo_circolante')::numeric, 0);
  v_pc      := COALESCE((v_sp->'passivo'->>'pas_corrente')::numeric, 0);
  v_mp      := COALESCE((v_sp->'passivo'->>'mezzi_propri')::numeric, 0);
  v_tot_pas := COALESCE((v_sp->'passivo'->>'totale')::numeric, 0);
  v_tot_att := COALESCE((v_sp->'attivo' ->>'totale')::numeric, 0);
  v_quadrato := COALESCE((v_sp->'quadratura'->>'quadrato')::boolean, false);

  SELECT (v->>'valore')::numeric INTO v_ricavi FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice'='01';
  SELECT (v->>'valore')::numeric INTO v_of     FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice'='11';
  SELECT (v->>'valore')::numeric INTO v_utile  FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice'='L';
  SELECT (v->>'valore')::numeric INTO v_amm    FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice'='09';
  v_ricavi := COALESCE(v_ricavi, 0); v_of := COALESCE(v_of, 0);
  v_utile := COALESCE(v_utile, 0);   v_amm := COALESCE(v_amm, 0);

  v_giorni := public.cg_giorni_periodo(p_anno);
  v_fattore := CASE WHEN v_giorni > 0 THEN 365.0 / v_giorni END;

  -- 1. Liquidità: attivo circolante / passività correnti.
  v_c1 := v_pc > 0 OR v_ac > 0;
  v_r1 := CASE WHEN v_pc > 0 THEN v_ac / v_pc END;          -- NULL con pc = 0
  v_s1 := CASE WHEN NOT v_c1 THEN 0
               WHEN v_pc <= 0 THEN 25                        -- nessun debito a breve
               WHEN v_r1 >= 1.8 THEN 25 WHEN v_r1 >= 1.5 THEN 20 WHEN v_r1 >= 1.2 THEN 15
               WHEN v_r1 >= 1.0 THEN 10 WHEN v_r1 >= 0.8 THEN 5 ELSE 0 END;
  -- 2. Indipendenza finanziaria: mezzi propri / totale passivo.
  v_c2 := v_tot_pas > 0;
  v_r2 := CASE WHEN v_c2 THEN v_mp / v_tot_pas END;
  v_s2 := CASE WHEN NOT v_c2 THEN 0
               WHEN v_r2 >= 0.40 THEN 25 WHEN v_r2 >= 0.30 THEN 20 WHEN v_r2 >= 0.20 THEN 15
               WHEN v_r2 >= 0.15 THEN 10 WHEN v_r2 >= 0.10 THEN 5 ELSE 0 END;
  -- 3. Peso degli oneri finanziari sul fatturato (stesso periodo: niente annualizzazione).
  v_c3 := v_ricavi > 0;
  v_r3 := CASE WHEN v_c3 THEN v_of / v_ricavi END;
  v_s3 := CASE WHEN NOT v_c3 THEN 0
               WHEN v_r3 <= 0.015 THEN 25 WHEN v_r3 <= 0.025 THEN 20 WHEN v_r3 <= 0.035 THEN 15
               WHEN v_r3 <= 0.045 THEN 10 WHEN v_r3 <= 0.060 THEN 5 ELSE 0 END;
  -- 4. Flusso di cassa: (utile + ammortamenti) riportati all'anno / totale attivo.
  v_c4 := v_tot_att > 0 AND v_fattore IS NOT NULL;
  v_r4 := CASE WHEN v_c4 THEN (v_utile + v_amm) * v_fattore / v_tot_att END;
  v_s4 := CASE WHEN NOT v_c4 THEN 0
               WHEN v_r4 >= 0.12 THEN 25 WHEN v_r4 >= 0.08 THEN 20 WHEN v_r4 >= 0.05 THEN 15
               WHEN v_r4 >= 0.03 THEN 10 WHEN v_r4 >= 0.01 THEN 5 ELSE 0 END;

  v_score := v_s1 + v_s2 + v_s3 + v_s4;
  v_classe := CASE WHEN v_score >= 90 THEN 'AAA' WHEN v_score >= 80 THEN 'AA'
                   WHEN v_score >= 70 THEN 'A'   WHEN v_score >= 55 THEN 'BBB'
                   WHEN v_score >= 40 THEN 'BB'  WHEN v_score >= 20 THEN 'B'
                   ELSE 'CCC' END;
  v_livello := CASE v_classe WHEN 'AAA' THEN 'molto_basso' WHEN 'AA' THEN 'basso'
                             WHEN 'A' THEN 'medio_basso' WHEN 'BBB' THEN 'medio'
                             WHEN 'BB' THEN 'medio_alto' WHEN 'B' THEN 'alto' ELSE 'default' END;

  IF NOT v_quadrato THEN
    v_motivi := v_motivi || jsonb_build_array('Lo Stato patrimoniale non quadra: differenza di '
      || public.cg_formato_euro((v_sp->'quadratura'->>'differenza')::numeric) || ' tra attivo e passivo.');
  END IF;
  IF v_ricavi <= 0 OR v_tot_att <= 0 THEN
    v_motivi := v_motivi || jsonb_build_array('Ricavi o attivo a zero: non bastano per una valutazione.');
  END IF;
  IF v_giorni IS NULL THEN
    v_motivi := v_motivi || jsonb_build_array('Anno futuro: non ci sono ancora dati consuntivi.');
  END IF;

  RETURN jsonb_build_object(
    'attendibile', v_quadrato AND v_ricavi > 0 AND v_tot_att > 0 AND v_giorni IS NOT NULL,
    'motivi', v_motivi,
    'anno', p_anno,
    'giorni_periodo', v_giorni,
    'classe', v_classe,
    'livello', v_livello,
    'score', v_score,
    'indicatori', jsonb_build_array(
      jsonb_build_object('codice','liquidita', 'label','Attivo circolante / Passività correnti',
        'valore', round(v_r1, 4), 'calcolabile', v_c1, 'punteggio', v_s1, 'soglia_top', 1.8),
      jsonb_build_object('codice','indipendenza', 'label','Mezzi propri / Totale passivo',
        'valore', round(v_r2, 4), 'calcolabile', v_c2, 'punteggio', v_s2, 'soglia_top', 0.40),
      jsonb_build_object('codice','oneri_finanziari', 'label','Oneri finanziari / Fatturato',
        'valore', round(v_r3, 4), 'calcolabile', v_c3, 'punteggio', v_s3, 'soglia_top', 0.015),
      jsonb_build_object('codice','cashflow', 'label','(Utile + Ammortamenti) / Totale attivo',
        'valore', round(v_r4, 4), 'calcolabile', v_c4, 'punteggio', v_s4, 'soglia_top', 0.12)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cg_get_rating(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_rating(uuid, integer) TO authenticated, service_role;
