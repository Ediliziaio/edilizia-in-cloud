-- Liquidazione IVA: la stima dalle fatture si vede anche quando il periodo non si può confermare.
-- Prima Scavolo vedeva «—» in tutti i mesi: agosto non confermato blocca settembre, e le 732 ricevute
-- senza data di ricezione SDI bloccano ogni mese. Il blocco della conferma resta com'era.
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
  v_cassa jsonb; v_motivo_registro text; v_motivo_riporto text;
  v_totali_registro boolean; v_campo text;
  v_versamento_prec jsonb;
  v_anteprima jsonb;
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

  -- Stima dalle fatture (24/11/2026): anche quando il periodo non si può ancora confermare
  -- (precedente non confermato, date di ricezione incerte, riepiloghi mancanti) la persona
  -- deve vedere i numeri. Non si conferma da qui: serve solo a leggere.
  b := public.liquidazione_iva_periodo(p_company,
         CASE WHEN v_mensile THEN 'mensile' ELSE 'trimestrale' END, p_anno,
         CASE WHEN v_mensile THEN p_periodo END, CASE WHEN v_mensile THEN NULL ELSE p_periodo END);
  v_cassa := private.lipe_corrispettivi_cassa(p_company,v_dal,v_al);
  v_anteprima := jsonb_build_object(
    'vp2', coalesce((b #>> '{lipe,vp2}')::numeric, 0) + coalesce((v_cassa->>'imponibile')::numeric, 0),
    'vp3', coalesce((b #>> '{lipe,vp3}')::numeric, 0),
    'vp4', coalesce((b ->> 'iva_vendite')::numeric, 0) + coalesce((v_cassa->>'iva')::numeric, 0),
    'vp5', CASE WHEN imp.pro_rata_percentuale IS NOT NULL
                THEN round(coalesce((b #>> '{lipe,vp5}')::numeric, 0) * imp.pro_rata_percentuale / 100, 2)
                ELSE coalesce((b #>> '{lipe,vp5}')::numeric, 0) END,
    'documenti', b -> 'documenti');

  IF p_periodo > 1 THEN
    SELECT data_summary INTO prec FROM public.fiscal_reports
     WHERE company_id = p_company AND report_type = 'lipe'
       AND period_end = v_dal - 1 AND status IN ('reviewed_commercialista', 'submitted', 'accepted_ade');
    IF prec IS NULL THEN
      RETURN jsonb_build_object('calcolabile', false, 'etichetta', v_etichetta, 'dal', v_dal, 'al', v_al,
        'motivo', 'Conferma prima il periodo precedente.', 'anteprima', v_anteprima);
    END IF;
  END IF;

  v_totali_registro := coalesce(m -> 'totali_registro' = 'true'::jsonb, false);
  v_motivo_registro := CASE
    WHEN imp.iva_per_cassa THEN 'L’IVA per cassa dipende dagli incassi e dai pagamenti del periodo.'
    WHEN (v_cassa->>'presente')::boolean AND NOT (v_cassa->>'completa')::boolean
      THEN 'Verifica e registra le chiusure di Cassa in Cloud o riporta i totali del Registro IVA.'
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
    WHEN coalesce((b #>> '{lipe,vendite_importate_da_verificare}')::boolean, false)
      THEN 'Per alcune fatture di vendita importate manca l’esigibilità IVA. Verifica i totali sul Registro IVA.'
    WHEN coalesce((b #>> '{lipe,esigibilita_differita}')::boolean, false) THEN
      'Verifica l’IVA a esigibilità differita in base al periodo in cui è divenuta esigibile.'
    WHEN coalesce((b ->> 'calcolabile')::boolean, false) IS NOT TRUE AND NOT (
      (v_cassa->>'presente')::boolean AND (v_cassa->>'completa')::boolean
      AND coalesce((b#>>'{documenti,vendite}')::int,-1)=0 AND coalesce((b#>>'{documenti,acquisti}')::int,-1)=0
    ) THEN
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
      'motivo', v_motivo_registro, 'anteprima', v_anteprima);
  ELSE
    vp2 := (b #>> '{lipe,vp2}')::numeric;
    vp3 := (b #>> '{lipe,vp3}')::numeric;
    vp2 := vp2 + coalesce((v_cassa->>'imponibile')::numeric,0);
    vp4 := (b ->> 'iva_vendite')::numeric + coalesce((v_cassa->>'iva')::numeric,0);
    IF (v_cassa->>'presente')::boolean THEN
      v_avvisi:=v_avvisi||jsonb_build_array('Incluse le chiusure registrate di Cassa in Cloud.');
    END IF;
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
    v_versamento_prec := private.f24_iva_da_liquidazione(prec, v_dal - 1);
    IF v_versamento_prec ->> 'stato' = 'riporto' AND NOT EXISTS (
      SELECT 1 FROM public.f24_entries f WHERE f.company_id = p_company AND f.anno = p_anno
        AND f.mese = (v_versamento_prec->>'mese')::int AND f.tributo_code = v_versamento_prec->>'codice'
        AND (f.stato = 'pagato' OR f.data_pagamento IS NOT NULL)
    ) THEN
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
    'calcolabile', true, 'etichetta', v_etichetta,
    'versamento', private.f24_iva_versamento(p_anno, CASE WHEN v_mensile THEN p_periodo END, v_trim_lipe, greatest(tot,0)), 'dal', v_dal, 'al', v_al, 'anno', p_anno,
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
