-- Totali del quadro VP accanto a quelli del prospetto IVA esistente.
-- Il VP2 comprende lo split payment; il VP3 conta l'imponibile di ogni acquisto una volta.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $patch$
DECLARE
  d text := pg_get_functiondef('public.liquidazione_iva_periodo(uuid,text,integer,integer,integer)'::regprocedure);
  prima text;
BEGIN
  IF position('integrazioni_senza_originale' IN d) > 0 THEN RETURN; END IF;
  prima := d;
  d := replace(d, $prima$           d.imponibile_totale, d.iva_totale, d.riepilogo_iva
    FROM public.fatture_vendite_iva d$prima$, $dopo$           d.imponibile_totale, d.iva_totale, d.riepilogo_iva,
           originale.id AS originale_id, coalesce(originale.detraibilita_percentuale, 100) AS detraibile_lipe
    FROM public.fatture_vendite_iva d
    LEFT JOIN public.documenti_fiscali integrazione
      ON d.origine = 'nativa' AND d.tipo = ANY(v_tipi_integrazione)
      AND integrazione.id = d.id AND integrazione.company_id = d.company_id
    LEFT JOIN public.fatture_ricevute originale
      ON originale.id = integrazione.fattura_ricevuta_id AND originale.company_id = d.company_id
      AND originale.stato IN ('non_letta', 'letta', 'contabilizzata')$dopo$);
  IF d = prima THEN RAISE EXCEPTION 'LIPE: punto del prospetto IVA non trovato'; END IF;

  prima := d;
  d := replace(d, $prima$    SELECT v.id, v.integrazione,
           coalesce$prima$, $dopo$    SELECT v.id, v.integrazione,
           upper(coalesce(r.value ->> 'natura', '')) AS natura,
           coalesce$dopo$);
  IF d = prima THEN RAISE EXCEPTION 'LIPE: punto del prospetto IVA non trovato'; END IF;

  prima := d;
  d := replace(d, $prima$    SELECT v.id, v.integrazione, '—', upper(v.esig_doc),$prima$, $dopo$    SELECT v.id, v.integrazione, '', '—', upper(v.esig_doc),$dopo$);
  IF d = prima THEN RAISE EXCEPTION 'LIPE: punto del prospetto IVA non trovato'; END IF;

  prima := d;
  d := replace(d, $prima$    'imponibile_acquisti',round(t.imp_acquisti, 2),$prima$, $dopo$    'imponibile_acquisti',round(t.imp_acquisti, 2),
    'lipe', jsonb_build_object(
      'vp2', round((SELECT coalesce(sum(r.imponibile), 0) FROM vend_righe r
        WHERE NOT r.integrazione AND r.natura NOT IN ('N1', 'N2.2')), 2),
      'vp3', round((SELECT coalesce(sum(r.imponibile), 0) FROM acq_righe r
        WHERE NOT r.integrazione AND r.natura <> 'N1'), 2),
      'vp5', round(t.iva_acquisti - (SELECT coalesce(sum(r.imposta - round(r.imposta * v.detraibile_lipe / 100, 2)), 0)
        FROM vend_righe r JOIN vend_doc v ON v.id = r.id WHERE r.integrazione), 2),
      'integrazioni_senza_originale', (SELECT count(*) FROM vend_doc WHERE integrazione AND originale_id IS NULL),
      'esigibilita_differita', EXISTS (SELECT 1 FROM vend_righe WHERE esigibilita = 'D')
        OR EXISTS (
          SELECT 1 FROM public.documenti_fiscali d
          WHERE d.company_id = p_company_id AND d.deleted_at IS NULL
            AND d.tipo = ANY(v_tipi_vendite) AND d.stato NOT IN ('bozza', 'annullata')
            AND upper(coalesce(d.sdi_stato, '')) <> 'NS' AND d.data_emissione < v_dal
            AND (d.pagato_at IS NULL OR (d.pagato_at AT TIME ZONE 'Europe/Rome')::date >= v_dal)
            AND (upper(coalesce(d.esigibilita_iva, '')) = 'D'
              OR d.riepilogo_iva @> '[{"esigibilita":"D"}]'::jsonb)
        )
    ),$dopo$);
  IF d = prima THEN RAISE EXCEPTION 'LIPE: punto del prospetto IVA non trovato'; END IF;
  EXECUTE d;
END $patch$;

CREATE OR REPLACE FUNCTION public.liquidazione_iva_righi(p_company uuid, p_anno integer, p_periodo integer, p_manuali jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  imp public.fiscalita_impostazioni_iva;
  v_mensile boolean; v_trim_lipe int; v_dal date; v_al date; v_max int; b jsonb; prec jsonb;
  vp2 numeric; vp3 numeric; vp4 numeric; vp5 numeric; a numeric;
  vp6d numeric; vp6c numeric; vp7 numeric := 0; vp8 numeric := 0; vp9 numeric; vp10 numeric; vp11 numeric; vp12 numeric := 0;
  vp13 numeric; v_metodo int; base numeric; tot numeric; v_usato numeric; v_disp numeric;
  v_avvisi jsonb := '[]'::jsonb;
  v_etichetta text;
  v_motivo_registro text; v_motivo_riporto text;
  v_totali_registro boolean; v_campo text;
  v_soglia numeric := CASE WHEN p_anno < 2024 THEN 25.82 ELSE 100 END;
  v_debito_riportabile numeric := 0; v_credito_riportabile numeric := 0;
  m jsonb := coalesce(p_manuali, '{}'::jsonb);
BEGIN
  IF auth.uid() IS NULL OR public.user_can_access_company(p_company) IS NOT TRUE
     OR NOT (public.e_amministratore_di(p_company) OR public.has_role(auth.uid(), 'super_admin')
             OR public.user_can_write_accountant_company(p_company)) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO imp FROM public.fiscalita_impostazioni_iva WHERE company_id = p_company AND anno = p_anno;
  IF imp.company_id IS NULL OR imp.periodicita IS NULL THEN
    RETURN jsonb_build_object('calcolabile', false, 'motivo', 'Compila le Impostazioni IVA dell''anno.');
  END IF;

  IF imp.regime = 'forfettario' THEN
    RETURN jsonb_build_object('calcolabile', false, 'motivo', 'Il regime forfettario non fa la liquidazione IVA né la comunicazione LIPE.');
  END IF;
  IF imp.attivita_separate OR imp.regime = 'altro' THEN
    RETURN jsonb_build_object('calcolabile', false, 'motivo',
      'Per contabilità separate e regimi IVA speciali occorre predisporre la comunicazione con il consulente.');
  END IF;
  v_mensile := imp.periodicita = 'mensile';
  v_max := CASE WHEN v_mensile THEN 12 ELSE 4 END;
  IF p_periodo IS NULL OR p_periodo < 1 OR p_periodo > v_max THEN
    RAISE EXCEPTION 'Periodo non valido' USING ERRCODE = '22023';
  END IF;
  IF v_mensile THEN
    v_dal := make_date(p_anno, p_periodo, 1);
    v_al := (v_dal + interval '1 month - 1 day')::date;
    v_etichetta := initcap(to_char(v_dal, 'TMMonth'));
  ELSE
    v_dal := make_date(p_anno, (p_periodo - 1) * 3 + 1, 1);
    v_al := (v_dal + interval '3 months - 1 day')::date;
    v_etichetta := p_periodo || '° trimestre';
    v_trim_lipe := CASE WHEN p_periodo = 4 AND imp.periodicita = 'trimestrale' THEN 5 ELSE p_periodo END;
  END IF;

  IF p_periodo > 1 THEN
    SELECT data_summary INTO prec FROM public.fiscal_reports
     WHERE company_id = p_company AND report_type = 'lipe'
       AND period_end = v_dal - 1 AND status IN ('reviewed_commercialista', 'submitted', 'accepted_ade');
    IF prec IS NULL THEN
      RETURN jsonb_build_object('calcolabile', false, 'etichetta', v_etichetta, 'dal', v_dal, 'al', v_al,
        'motivo', 'Conferma prima il periodo precedente.');
    END IF;
  END IF;

  b := public.liquidazione_iva_periodo(p_company,
         CASE WHEN v_mensile THEN 'mensile' ELSE 'trimestrale' END, p_anno,
         CASE WHEN v_mensile THEN p_periodo END, CASE WHEN v_mensile THEN NULL ELSE p_periodo END);
  v_totali_registro := coalesce(m -> 'totali_registro' = 'true'::jsonb, false);
  v_motivo_registro := CASE
    WHEN imp.iva_per_cassa THEN 'L’IVA per cassa dipende dagli incassi e dai pagamenti del periodo.'
    WHEN EXISTS (SELECT 1 FROM public.cassa_in_cloud_scontrini s
                  WHERE s.company_id = p_company AND s.data BETWEEN v_dal AND v_al)
      OR EXISTS (SELECT 1 FROM public.cassa_in_cloud_chiusure c
                  WHERE c.company_id = p_company AND c.giorno BETWEEN v_dal AND v_al)
      THEN 'Il calcolo dalle fatture non include i corrispettivi di Cassa in Cloud.'
    WHEN coalesce((b #>> '{documenti,reverse_charge_aliquota_presunta}')::int, 0) > 0
      THEN 'Nel registro ci sono fatture reverse charge con IVA calcolata a un’aliquota presunta.'
    WHEN coalesce((b #>> '{documenti,acquisti_senza_data_ricezione}')::int, 0) > 0
      THEN 'Verifica il periodo di registrazione degli acquisti senza data di ricezione certa.'
    WHEN coalesce((b #>> '{documenti,acquisti_senza_riepilogo}')::int, 0)
        + coalesce((b #>> '{documenti,vendite_senza_riepilogo}')::int, 0) > 0
      THEN 'Manca il riepilogo IVA di alcuni documenti.'
    WHEN coalesce((b #>> '{documenti,integrazioni_ricevute}')::int, 0)
        + coalesce((b #>> '{lipe,integrazioni_senza_originale}')::int, 0) > 0
      THEN 'Verifica le integrazioni e le fatture originali nel registro, per contare ogni imponibile una sola volta.'
    WHEN coalesce((b #>> '{lipe,esigibilita_differita}')::boolean, false) THEN
      'Verifica l’IVA a esigibilità differita in base al periodo in cui è divenuta esigibile.'
    WHEN coalesce((b ->> 'calcolabile')::boolean, false) IS NOT TRUE THEN
      coalesce(b ->> 'motivo', 'Dati insufficienti per il calcolo.')
    END;

  IF v_totali_registro THEN
    FOREACH v_campo IN ARRAY ARRAY['vp2', 'vp3', 'vp4', 'vp5'] LOOP
      IF jsonb_typeof(m -> v_campo) IS DISTINCT FROM 'number'
         OR abs((m ->> v_campo)::numeric) >= 1000000000000 THEN
        RETURN jsonb_build_object('calcolabile', false, 'richiede_registro', true,
          'motivo', coalesce(v_motivo_registro || ' ', '') || 'Inserisci tutti i righi da VP2 a VP5 verificati sul registro IVA.');
      END IF;
    END LOOP;
    vp2 := round((m ->> 'vp2')::numeric, 2);
    vp3 := round((m ->> 'vp3')::numeric, 2);
    vp4 := round((m ->> 'vp4')::numeric, 2);
    vp5 := round((m ->> 'vp5')::numeric, 2);
  ELSIF v_motivo_registro IS NOT NULL THEN
    RETURN jsonb_build_object('calcolabile', false, 'richiede_registro', true, 'dal', v_dal, 'al', v_al,
      'motivo', v_motivo_registro);
  ELSE
    vp2 := (b #>> '{lipe,vp2}')::numeric;
    vp3 := (b #>> '{lipe,vp3}')::numeric;
    vp4 := (b ->> 'iva_vendite')::numeric;
    vp5 := (b #>> '{lipe,vp5}')::numeric;
  END IF;
  IF NOT v_totali_registro AND imp.pro_rata_percentuale IS NOT NULL THEN
    vp5 := round(vp5 * imp.pro_rata_percentuale / 100, 2);
    v_avvisi := v_avvisi || to_jsonb(format('IVA detratta ridotta al %s%% di pro-rata.', imp.pro_rata_percentuale));
  END IF;
  a := vp4 - vp5;
  vp6d := greatest(a, 0);
  vp6c := greatest(-a, 0);

  IF prec IS NOT NULL THEN
    IF coalesce((prec #>> '{righi,vp14_debito}')::numeric, 0) BETWEEN 0.01 AND v_soglia
       AND NOT ((v_mensile AND p_periodo = 12) OR (NOT v_mensile AND p_periodo = 4)) THEN
      v_debito_riportabile := (prec #>> '{righi,vp14_debito}')::numeric;
    END IF;
    v_credito_riportabile := coalesce((prec #>> '{righi,vp14_credito}')::numeric, 0);
  END IF;

  vp7 := round(coalesce((m ->> 'vp7')::numeric, 0), 2);
  vp8 := round(coalesce((m ->> 'vp8')::numeric, v_credito_riportabile), 2);
  IF v_debito_riportabile > 0 AND m ->> 'vp7' IS NULL THEN
    v_motivo_riporto := 'Indica in VP7 il debito del periodo precedente effettivamente rinviato, oppure 0 se già versato.';
  ELSIF vp7 < 0 OR vp7 > v_debito_riportabile THEN
    v_motivo_riporto := format('Il debito riportabile in VP7 è al massimo %s €.', v_debito_riportabile);
  ELSIF vp8 < 0 OR vp8 > v_credito_riportabile THEN
    v_motivo_riporto := format('Il credito riportabile in VP8 è al massimo %s €.', v_credito_riportabile);
  END IF;
  IF v_motivo_riporto IS NOT NULL THEN
    RETURN jsonb_build_object('calcolabile', false, 'motivo', v_motivo_riporto,
      'dal', v_dal, 'al', v_al, 'richiede_registro', v_motivo_registro IS NOT NULL,
      'debito_riportabile', v_debito_riportabile, 'credito_riportabile', v_credito_riportabile);
  END IF;

  SELECT coalesce(sum((data_summary #>> '{righi,vp9}')::numeric), 0) INTO v_usato
    FROM public.fiscal_reports
   WHERE company_id = p_company AND report_type = 'lipe' AND period_start >= make_date(p_anno, 1, 1)
     AND period_end < v_dal AND status IN ('reviewed_commercialista', 'submitted', 'accepted_ade');
  v_disp := greatest(coalesce(imp.credito_anno_precedente, 0) - v_usato, 0);
  vp9 := round(coalesce((m ->> 'vp9')::numeric, least(v_disp, greatest(vp6d - vp6c + vp7 - vp8, 0))), 2);
  IF vp9 < -least(greatest(v_usato, 0), vp8) OR vp9 > v_disp THEN
    RETURN jsonb_build_object('calcolabile', false, 'etichetta', v_etichetta, 'dal', v_dal, 'al', v_al,
      'motivo', format('Nel VP9 il credito utilizzabile è %s € e si possono estromettere fino a %s €.', v_disp, least(greatest(v_usato, 0), vp8)),
      'debito_riportabile', v_debito_riportabile, 'credito_riportabile', v_credito_riportabile);
  END IF;
  vp10 := round(coalesce((m ->> 'vp10')::numeric, 0), 2);
  vp11 := round(coalesce((m ->> 'vp11')::numeric, 0), 2);
  vp13 := round(coalesce((m ->> 'vp13')::numeric, 0), 2);
  IF least(vp10, vp11, vp13) < 0 THEN
    RETURN jsonb_build_object('calcolabile', false, 'motivo', 'VP10, VP11 e VP13 non ammettono importi negativi.');
  END IF;

  base := vp6d - vp6c + vp7 - vp8 - vp9 - vp10;
  IF vp11 > 0 AND (vp11 > vp6d + vp7 - vp8 - vp9 - vp10 OR v_trim_lipe = 5) THEN
    RETURN jsonb_build_object('calcolabile', false, 'etichetta', v_etichetta, 'dal', v_dal, 'al', v_al,
      'motivo', 'I crediti d''imposta non possono superare il dovuto del periodo.');
  END IF;
  base := base - vp11;

  IF imp.periodicita = 'trimestrale' AND p_periodo <= 3 AND base > 0 THEN
    vp12 := round(base * 0.01, 2);
  END IF;

  IF vp13 > 0 THEN
    IF NOT ((v_mensile AND p_periodo = 12) OR (NOT v_mensile AND p_periodo = 4)) THEN
      RETURN jsonb_build_object('calcolabile', false, 'motivo',
        'VP13 si può compilare solo a dicembre o nel quarto trimestre.');
    ELSIF vp13 < 103.29 THEN
      RETURN jsonb_build_object('calcolabile', false, 'etichetta', v_etichetta, 'dal', v_dal, 'al', v_al,
        'motivo', 'L''acconto si indica solo da 103,29 €.');
    ELSE
      v_metodo := CASE imp.metodo_acconto WHEN 'storico' THEN 1 WHEN 'previsionale' THEN 2 WHEN 'analitico' THEN 3 ELSE 1 END;
    END IF;
  END IF;

  tot := vp6d - vp6c + vp7 + vp12 - vp11 - vp8 - vp9 - vp10 - vp13;

  IF v_trim_lipe = 5 THEN
    v_avvisi := v_avvisi || to_jsonb('Quarto trimestre: il saldo si determina nella dichiarazione annuale.'::text);
  END IF;
  IF v_totali_registro THEN
    v_avvisi := v_avvisi || to_jsonb('VP2–VP5 inseriti dai registri IVA. Il pro-rata deve essere già incluso nel VP5.'::text);
  ELSIF coalesce((b ->> 'iva_indetraibile')::numeric, 0) > 0 THEN
    v_avvisi := v_avvisi || to_jsonb(format('IVA non detraibile del periodo: %s € (indicata sulle singole fatture).', b ->> 'iva_indetraibile'));
  END IF;

  RETURN jsonb_build_object(
    'calcolabile', true, 'etichetta', v_etichetta, 'dal', v_dal, 'al', v_al, 'anno', p_anno,
    'periodicita', imp.periodicita,
    'mese', CASE WHEN v_mensile THEN p_periodo END,
    'trimestre', v_trim_lipe,
    'trimestre_solare', CASE WHEN v_mensile THEN ((p_periodo - 1) / 3) + 1 ELSE p_periodo END,
    'credito_anno_disponibile', v_disp,
    'debito_riportabile', v_debito_riportabile, 'credito_riportabile', v_credito_riportabile,
    'fonte_lipe', CASE WHEN v_totali_registro THEN 'registro' ELSE 'fatture' END,
    'avvisi', v_avvisi,
    'documenti', b -> 'documenti',
    'ipotesi', b -> 'ipotesi',
    'righi', jsonb_build_object(
      'vp2', vp2, 'vp3', vp3, 'vp4', vp4, 'vp5', vp5, 'vp6_debito', vp6d, 'vp6_credito', vp6c,
      'vp7', vp7, 'vp8', vp8, 'vp9', vp9, 'vp10', vp10, 'vp11', vp11, 'vp12', vp12,
      'vp13', vp13, 'vp13_metodo', v_metodo,
      'vp14_debito', greatest(tot, 0), 'vp14_credito', greatest(-tot, 0)));
END $function$;

-- La ricevuta riguarda l'intero trimestre. Usa lo stesso lock della conferma.
CREATE OR REPLACE FUNCTION public.liquidazione_iva_segna_inviata(p_company uuid, p_dal date, p_al date, p_protocollo text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_n integer; v_p text := nullif(btrim(coalesce(p_protocollo, '')), '');
  v_attesi integer; v_presenti integer; v_durata interval;
BEGIN
  IF p_dal IS NULL OR p_al IS NULL OR p_dal <> date_trunc('quarter', p_dal)::date
     OR p_al <> (p_dal + interval '3 months - 1 day')::date THEN
    RAISE EXCEPTION 'Seleziona un trimestre solare intero.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.liquidazioni_iva_anno(p_company, extract(year FROM p_dal)::int);
  IF public.utente_sola_lettura(p_company) THEN
    RAISE EXCEPTION 'Accesso in sola lettura' USING ERRCODE = '42501';
  END IF;
  IF v_p IS NULL OR length(v_p) > 80 THEN
    RAISE EXCEPTION 'Scrivi il protocollo della ricevuta.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company::text, 2811));
  SELECT CASE WHEN i.periodicita = 'mensile' THEN 3 ELSE 1 END INTO v_attesi
    FROM public.fiscalita_impostazioni_iva i WHERE i.company_id = p_company AND i.anno = extract(year FROM p_dal)::int;
  IF v_attesi IS NULL THEN RAISE EXCEPTION 'Compila le impostazioni IVA dell’anno.' USING ERRCODE = '22023'; END IF;
  v_durata := CASE WHEN v_attesi = 3 THEN interval '1 month' ELSE interval '3 months' END;
  SELECT count(*) INTO v_presenti
    FROM generate_series(p_dal::timestamp, p_al::timestamp, v_durata) AS p(inizio)
   WHERE EXISTS (
     SELECT 1 FROM public.fiscal_reports f
      WHERE f.company_id = p_company AND f.report_type = 'lipe' AND f.period_start = p.inizio::date
        AND f.period_end = (p.inizio + v_durata - interval '1 day')::date
        AND f.status = 'reviewed_commercialista' AND jsonb_typeof(f.data_summary -> 'righi') = 'object'
   );
  IF v_presenti <> v_attesi THEN
    RAISE EXCEPTION 'Conferma tutte le liquidazioni del trimestre prima di registrare la ricevuta.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.fiscal_reports
     SET status = 'submitted', ade_protocol_number = v_p, submitted_at = now(), updated_at = now()
   WHERE company_id = p_company AND report_type = 'lipe' AND period_start >= p_dal AND period_end <= p_al
     AND period_start IN (SELECT p::date FROM generate_series(p_dal::timestamp, p_al::timestamp, v_durata) p)
     AND period_end = (period_start + v_durata - interval '1 day')::date
     AND status = 'reviewed_commercialista' AND jsonb_typeof(data_summary -> 'righi') = 'object';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> v_attesi THEN
    RAISE EXCEPTION 'Le liquidazioni del trimestre sono cambiate. Ricarica e riprova.' USING ERRCODE = '22023';
  END IF;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.liquidazione_iva_righi(uuid, integer, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liquidazione_iva_righi(uuid, integer, integer, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.liquidazione_iva_segna_inviata(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liquidazione_iva_segna_inviata(uuid, date, date, text) TO authenticated, service_role;
