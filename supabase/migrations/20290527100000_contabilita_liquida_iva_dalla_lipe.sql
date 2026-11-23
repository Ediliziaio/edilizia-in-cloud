-- Un solo calcolo dell'IVA (23/11/2026).
--
-- Prima c'erano due conti dello stesso periodo che potevano non tornare, senza che nessuno lo dicesse:
-- - la liquidazione periodica (liquidazione_iva_righi → LIPE confermata in fiscal_reports): acquisti
--   nel periodo di ricezione SDI o dichiarata, soglia di 100 € dal 2024, interessi 1% solo nei primi
--   tre trimestri;
-- - il giroconto della contabilità generale (questa funzione): i saldi dei conti IVA a fine periodo,
--   con gli acquisti alla data della fattura, soglia di 25,82 € e interessi anche nel quarto trimestre.
--
-- Adesso la contabilità registra la liquidazione che si comunica: se la LIPE dello stesso periodo è
-- confermata, il giroconto prende da lì IVA esigibile (VP4), IVA detratta (VP5) e interessi (VP12).
-- Senza LIPE confermata l'anteprima mostra ancora i saldi delle scritture, ma non si registra.
-- Quello che resta sui conti IVA dopo il giroconto è IVA registrata in un periodo e liquidata in un
-- altro (fattura di fine mese ricevuta il mese dopo): la prende la LIPE del periodo giusto.
-- Il debito sotto la soglia si registra lo stesso: resta su Erario c/IVA e si versa col periodo
-- dopo (VP7 della LIPE successiva), invece di restare sui conti IVA.
--
-- L'anteprima restituisce anche i saldi delle scritture e, per i periodi già registrati, gli importi
-- della scrittura: la pagina mostra la differenza. Le liquidazioni già registrate non si toccano.
-- Solo la funzione cambia: nessun dato viene scritto da questa migrazione.

CREATE OR REPLACE FUNCTION public.contabilita_liquida_iva(p_company uuid, p_dal date, p_al date, p_anteprima boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  k jsonb; v_id uuid; v_vendite numeric; v_acquisti numeric; v_saldo numeric; v_credito_prec numeric := 0;
  v_compensato numeric := 0; v_conto_credito text; v_righe jsonb; v_scrittura uuid; v_interessi numeric := 0; v_trimestrale boolean;
  v_anno int := extract(year FROM p_al)::int;
  v_soglia numeric := CASE WHEN extract(year FROM p_al) < 2024 THEN 25.82 ELSE 100 END;
  v_ultimo boolean := p_al = make_date(extract(year FROM p_al)::int, 12, 31);
  v_lipe jsonb; v_lipe_stato text; v_sc_vendite numeric; v_sc_acquisti numeric;
  v_reg_id uuid; v_reg_vendite numeric; v_reg_acquisti numeric; v_sotto boolean;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF p_dal IS NULL OR p_al IS NULL OR p_al < p_dal OR extract(year FROM p_dal) <> extract(year FROM p_al) THEN
    RAISE EXCEPTION 'Periodo non valido' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0));
  SELECT coalesce(jsonb_object_agg(chiave, id), '{}'::jsonb) INTO k FROM (
    SELECT DISTINCT ON (chiave) chiave, id FROM (
      SELECT coalesce(codice_standard, codice) AS chiave, id, codice_standard IS NOT NULL AS esplicito, codice
        FROM public.contabilita_conti WHERE company_id = p_company AND movimentabile AND attivo
    ) x ORDER BY chiave, esplicito DESC, codice
  ) y;
  IF NOT (k ? '13.10' AND k ? '05.10' AND k ? '13.11') THEN
    RAISE EXCEPTION 'Mancano i conti IVA su vendite, IVA su acquisti ed Erario c/IVA (13.10, 05.10, 13.11)' USING ERRCODE = '22023';
  END IF;
  v_conto_credito := CASE WHEN k ? '05.11' THEN '05.11' ELSE '13.11' END;
  v_id := md5('liquidazione-iva:' || p_company || ':' || p_dal || ':' || p_al)::uuid;

  -- I saldi delle scritture a fine periodo, liquidazioni comprese: l'IVA registrata e non ancora girata.
  SELECT coalesce(sum(r.avere - r.dare) FILTER (WHERE r.conto_id = (k->>'13.10')::uuid), 0),
         coalesce(sum(r.dare - r.avere) FILTER (WHERE r.conto_id = (k->>'05.10')::uuid), 0)
    INTO v_sc_vendite, v_sc_acquisti
    FROM public.contabilita_righe r JOIN public.contabilita_scritture s ON s.id = r.scrittura_id
   WHERE s.company_id = p_company AND s.data_registrazione <= p_al
     AND s.esercizio = v_anno;

  -- La LIPE confermata dello stesso periodo (stessi estremi), se c'è.
  SELECT f.data_summary, f.status INTO v_lipe, v_lipe_stato
    FROM public.fiscal_reports f
   WHERE f.company_id = p_company AND f.report_type = 'lipe'
     AND f.period_start = p_dal AND f.period_end = p_al
     AND f.status IN ('reviewed_commercialista', 'submitted', 'accepted_ade')
     AND jsonb_typeof(f.data_summary -> 'righi') = 'object'
   ORDER BY f.updated_at DESC NULLS LAST
   LIMIT 1;

  IF v_lipe IS NOT NULL THEN
    v_vendite := round(coalesce((v_lipe #>> '{righi,vp4}')::numeric, 0), 2);
    v_acquisti := round(coalesce((v_lipe #>> '{righi,vp5}')::numeric, 0), 2);
  ELSE
    v_vendite := v_sc_vendite;
    v_acquisti := v_sc_acquisti;
  END IF;

  -- Credito delle liquidazioni prima di questa: saldo dare del conto del credito a fine periodo,
  -- senza la liquidazione di questo stesso periodo (anche un trimestre dopo i suoi mesi lo vede).
  SELECT coalesce(sum(r.dare - r.avere), 0) INTO v_credito_prec
    FROM public.contabilita_righe r JOIN public.contabilita_scritture s ON s.id = r.scrittura_id
   WHERE s.company_id = p_company AND r.conto_id = (k->>v_conto_credito)::uuid AND s.data_registrazione <= p_al
     AND s.origine_id IS DISTINCT FROM v_id
     -- Dopo una chiusura il credito è già nell'apertura dell'anno: gli anni prima non si sommano di nuovo.
     AND (s.esercizio = v_anno OR NOT EXISTS (
           SELECT 1 FROM public.contabilita_scritture a WHERE a.company_id = p_company AND a.esercizio = v_anno
              AND a.origine = 'apertura' AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = a.id)));
  v_credito_prec := greatest(v_credito_prec, 0);
  v_saldo := v_vendite - v_acquisti;
  IF v_saldo > 0 THEN v_compensato := least(v_credito_prec, v_saldo); END IF;

  IF v_lipe IS NOT NULL THEN
    -- Gli interessi li ha già calcolati la LIPE (VP12: solo trimestrali, solo i primi tre trimestri).
    v_interessi := round(coalesce((v_lipe #>> '{righi,vp12}')::numeric, 0), 2);
    v_sotto := coalesce((v_lipe #>> '{righi,vp14_debito}')::numeric, 0) BETWEEN 0.01 AND v_soglia AND NOT v_ultimo;
  ELSE
    -- Trimestrale per opzione: 1% di interessi sul dovuto, non nel quarto trimestre (si versa con la dichiarazione).
    v_trimestrale := p_al - p_dal > 40 AND extract(month FROM p_al) < 12 AND EXISTS (SELECT 1 FROM public.fiscalita_impostazioni_iva i
      WHERE i.company_id = p_company AND i.anno = v_anno AND i.periodicita = 'trimestrale');
    IF v_trimestrale AND v_saldo - v_compensato > v_soglia THEN v_interessi := round((v_saldo - v_compensato) * 0.01, 2); END IF;
    v_sotto := v_saldo - v_compensato > 0 AND v_saldo - v_compensato <= v_soglia AND NOT v_ultimo;
  END IF;

  -- Il periodo già registrato: gli importi della scrittura viva, per confrontarli con la LIPE.
  SELECT s.id INTO v_reg_id FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.origine = 'liquidazione_iva' AND s.origine_id = v_id AND s.storno_di IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
   ORDER BY s.created_at DESC LIMIT 1;
  IF v_reg_id IS NOT NULL THEN
    SELECT coalesce(sum(r.dare - r.avere) FILTER (WHERE r.conto_id = (k->>'13.10')::uuid), 0),
           coalesce(sum(r.avere - r.dare) FILTER (WHERE r.conto_id = (k->>'05.10')::uuid), 0)
      INTO v_reg_vendite, v_reg_acquisti
      FROM public.contabilita_righe r WHERE r.scrittura_id = v_reg_id;
  END IF;

  IF NOT p_anteprima THEN
    IF public.contabilita_documento_registrato(p_company, 'liquidazione_iva', v_id) THEN
      RAISE EXCEPTION 'Questo periodo è già liquidato: storna la liquidazione per rifarla' USING ERRCODE = '23505';
    END IF;
    IF v_lipe IS NULL THEN
      RAISE EXCEPTION 'Conferma prima la liquidazione periodica (LIPE) di questo periodo: la contabilità registra quella'
        USING ERRCODE = '22023';
    END IF;
    IF v_vendite = 0 AND v_acquisti = 0 AND v_interessi = 0 THEN
      RAISE EXCEPTION 'Nessuna IVA da liquidare nel periodo' USING ERRCODE = '22023';
    END IF;
    v_righe := public.contabilita_riga(k->>'13.10', 'dare', v_vendite, 'IVA su vendite del periodo (VP4)')
            || public.contabilita_riga(k->>'05.10', 'avere', v_acquisti, 'IVA detratta del periodo (VP5)')
            || public.contabilita_riga(k->>v_conto_credito, 'avere', v_compensato, 'credito dei periodi precedenti');
    IF v_saldo > 0 THEN
      v_righe := v_righe || public.contabilita_riga(k->>'13.11', 'avere', v_saldo - v_compensato,
        CASE WHEN v_sotto THEN 'IVA da versare (sotto la soglia: col periodo successivo)' ELSE 'IVA da versare' END);
    ELSE
      v_righe := v_righe || public.contabilita_riga(k->>v_conto_credito, 'dare', -v_saldo, 'IVA a credito');
    END IF;
    IF v_interessi > 0 THEN
      v_righe := v_righe || public.contabilita_riga(k->>(CASE WHEN k ? '40.02' THEN '40.02' WHEN k ? '30.40' THEN '30.40' ELSE '30.01' END), 'dare', v_interessi, 'interessi 1% liquidazione trimestrale (VP12)')
                         || public.contabilita_riga(k->>'13.11', 'avere', v_interessi, 'interessi 1% liquidazione trimestrale (VP12)');
    END IF;
    v_scrittura := public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, p_al), 'Liquidazione IVA',
      'Liquidazione IVA dal ' || to_char(p_dal, 'DD/MM/YYYY') || ' al ' || to_char(p_al, 'DD/MM/YYYY') || ' (LIPE confermata)',
      NULL, NULL, v_righe, 'liquidazione_iva', v_id, NULL);
  END IF;
  RETURN jsonb_build_object('iva_vendite', v_vendite, 'iva_acquisti', v_acquisti, 'saldo', v_saldo,
    'credito_precedente', v_credito_prec, 'compensato', v_compensato,
    'da_versare', greatest(v_saldo - v_compensato, 0),
    'sotto_minimo', v_sotto, 'soglia', v_soglia, 'a_credito', greatest(-v_saldo, 0),
    'gia_liquidato', public.contabilita_documento_registrato(p_company, 'liquidazione_iva', v_id),
    'interessi', v_interessi, 'scrittura_id', v_scrittura,
    'fonte', CASE WHEN v_lipe IS NOT NULL THEN 'lipe' ELSE 'scritture' END,
    'lipe_stato', v_lipe_stato,
    'lipe_da_versare', (v_lipe #>> '{righi,vp14_debito}')::numeric,
    'lipe_a_credito', (v_lipe #>> '{righi,vp14_credito}')::numeric,
    'scritture_iva_vendite', v_sc_vendite, 'scritture_iva_acquisti', v_sc_acquisti,
    'registrata_iva_vendite', v_reg_vendite, 'registrata_iva_acquisti', v_reg_acquisti);
END $function$;

REVOKE ALL ON FUNCTION public.contabilita_liquida_iva(uuid, date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_liquida_iva(uuid, date, date, boolean) TO authenticated, service_role;
