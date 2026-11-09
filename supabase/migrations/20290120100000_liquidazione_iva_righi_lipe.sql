-- Liquidazione IVA vera: i righi VP2-VP14 della comunicazione, calcolati in un
-- posto solo e confermati periodo per periodo (09/11/2026).
--
-- La periodicità viene dalle impostazioni IVA dell'anno. I righi di un periodo
-- leggono il periodo prima solo se è confermato: si conferma in ordine.
-- La riga confermata sta in fiscal_reports (report_type 'lipe'); il file XML si
-- costruisce da lì e non ricalcola niente.
--
-- Regole dal documento dell'Agenzia «Specifiche tecniche IVP18» (provvedimento
-- 14/03/2024): VP7 solo fino a 100 € e mai a gennaio, dicembre, 1° o 4° trimestre;
-- VP8 mai nel primo periodo; VP12 solo nei trimestri 1-3 dei trimestrali su
-- opzione; VP13 solo a dicembre o nel 4° trimestre, da 103,29 €.

CREATE OR REPLACE FUNCTION public.liquidazione_iva_righi(
  p_company uuid, p_anno integer, p_periodo integer, p_manuali jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  imp public.fiscalita_impostazioni_iva;
  v_mensile boolean; v_trim_lipe int; v_dal date; v_al date; v_max int; b jsonb; prec jsonb;
  vp2 numeric; vp3 numeric; vp4 numeric; vp5 numeric; a numeric;
  vp6d numeric; vp6c numeric; vp7 numeric := 0; vp8 numeric := 0; vp9 numeric; vp10 numeric; vp11 numeric; vp12 numeric := 0;
  vp13 numeric; v_metodo int; base numeric; tot numeric; v_usato numeric; v_disp numeric;
  v_avvisi jsonb := '[]'::jsonb;
  v_etichetta text;
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
    -- Il quarto dei trimestrali su opzione si scrive 5, degli speciali 4.
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
  IF coalesce((b ->> 'calcolabile')::boolean, true) IS NOT TRUE THEN
    RETURN jsonb_build_object('calcolabile', false, 'etichetta', v_etichetta, 'dal', v_dal, 'al', v_al,
      'motivo', coalesce(b ->> 'motivo', 'Dati insufficienti per il calcolo.'));
  END IF;

  vp2 := round(coalesce((b ->> 'imponibile_vendite')::numeric, 0), 2);
  vp3 := round(coalesce((b ->> 'imponibile_acquisti')::numeric, 0), 2);
  vp4 := round(coalesce((b ->> 'iva_vendite')::numeric, 0), 2);
  vp5 := round(coalesce((b ->> 'iva_acquisti')::numeric, 0), 2);
  a := vp4 - vp5;
  vp6d := greatest(a, 0);
  vp6c := greatest(-a, 0);

  IF prec IS NOT NULL THEN
    IF coalesce((prec #>> '{righi,vp14_debito}')::numeric, 0) > 0
       AND (prec #>> '{righi,vp14_debito}')::numeric <= 100 THEN
      IF (v_mensile AND p_periodo = 12) OR (NOT v_mensile AND p_periodo = 4) THEN
        v_avvisi := v_avvisi || to_jsonb('Il debito sotto 100 € del periodo precedente non si riporta in questo periodo: va in dichiarazione.'::text);
      ELSE
        vp7 := (prec #>> '{righi,vp14_debito}')::numeric;
      END IF;
    END IF;
    vp8 := coalesce((prec #>> '{righi,vp14_credito}')::numeric, 0);
  END IF;

  -- Credito dell'anno prima: quel che resta, salvo importo scritto a mano.
  SELECT coalesce(sum((data_summary #>> '{righi,vp9}')::numeric), 0) INTO v_usato
    FROM public.fiscal_reports
   WHERE company_id = p_company AND report_type = 'lipe' AND period_start >= make_date(p_anno, 1, 1)
     AND period_end < v_dal AND status IN ('reviewed_commercialista', 'submitted', 'accepted_ade');
  v_disp := greatest(coalesce(imp.credito_anno_precedente, 0) - v_usato, 0);
  vp9 := coalesce((m ->> 'vp9')::numeric, least(v_disp, greatest(vp6d - vp6c + vp7 - vp8, 0)));
  IF vp9 < 0 OR vp9 > v_disp + 0.004 THEN
    RETURN jsonb_build_object('calcolabile', false, 'etichetta', v_etichetta, 'dal', v_dal, 'al', v_al,
      'motivo', format('Credito dell''anno precedente disponibile: %s €.', v_disp));
  END IF;
  vp10 := round(greatest(coalesce((m ->> 'vp10')::numeric, 0), 0), 2);
  vp11 := round(greatest(coalesce((m ->> 'vp11')::numeric, 0), 0), 2);

  base := vp6d - vp6c + vp7 - vp8 - vp9 - vp10;
  IF vp11 > 0 AND (base <= 0 OR vp11 > base OR v_trim_lipe = 5) THEN
    RETURN jsonb_build_object('calcolabile', false, 'etichetta', v_etichetta, 'dal', v_dal, 'al', v_al,
      'motivo', 'I crediti d''imposta non possono superare il dovuto del periodo.');
  END IF;
  base := base - vp11;

  IF imp.periodicita = 'trimestrale' AND p_periodo <= 3 AND base > 0 THEN
    vp12 := round(base * 0.01, 2);
  END IF;

  vp13 := round(greatest(coalesce((m ->> 'vp13')::numeric, 0), 0), 2);
  IF vp13 > 0 THEN
    IF NOT ((v_mensile AND p_periodo = 12) OR (NOT v_mensile AND p_periodo = 4)) THEN
      vp13 := 0;
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
  IF coalesce((b #>> '{documenti,reverse_charge_aliquota_presunta}')::int, 0) > 0
     OR coalesce((b #>> '{documenti,acquisti_senza_riepilogo}')::int, 0) > 0 THEN
    v_avvisi := v_avvisi || to_jsonb('Alcuni documenti hanno aliquota presunta o manca il riepilogo: controllali nel Registro IVA.'::text);
  END IF;

  RETURN jsonb_build_object(
    'calcolabile', true, 'etichetta', v_etichetta, 'dal', v_dal, 'al', v_al, 'anno', p_anno,
    'periodicita', imp.periodicita,
    'mese', CASE WHEN v_mensile THEN p_periodo END,
    'trimestre', v_trim_lipe,
    'trimestre_solare', CASE WHEN v_mensile THEN ((p_periodo - 1) / 3) + 1 ELSE p_periodo END,
    'credito_anno_disponibile', v_disp,
    'avvisi', v_avvisi,
    'documenti', b -> 'documenti',
    'ipotesi', b -> 'ipotesi',
    'righi', jsonb_build_object(
      'vp2', vp2, 'vp3', vp3, 'vp4', vp4, 'vp5', vp5, 'vp6_debito', vp6d, 'vp6_credito', vp6c,
      'vp7', vp7, 'vp8', vp8, 'vp9', vp9, 'vp10', vp10, 'vp11', vp11, 'vp12', vp12,
      'vp13', vp13, 'vp13_metodo', v_metodo,
      'vp14_debito', greatest(tot, 0), 'vp14_credito', greatest(-tot, 0)));
END $$;
REVOKE ALL ON FUNCTION public.liquidazione_iva_righi(uuid, integer, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liquidazione_iva_righi(uuid, integer, integer, jsonb) TO authenticated, service_role;

-- Tutti i periodi dell'anno con il loro stato.
CREATE OR REPLACE FUNCTION public.liquidazioni_iva_anno(p_company uuid, p_anno integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.user_can_access_company(p_company) IS NOT TRUE
     OR NOT (public.e_amministratore_di(p_company) OR public.has_role(auth.uid(), 'super_admin')
             OR public.user_can_write_accountant_company(p_company)) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', id, 'dal', period_start, 'al', period_end, 'stato', status,
             'protocollo', ade_protocol_number, 'dati', data_summary,
             'confermata_il', data_summary ->> 'confermata_il') ORDER BY period_start)
      FROM public.fiscal_reports
     WHERE company_id = p_company AND report_type = 'lipe'
       AND period_start >= make_date(p_anno, 1, 1) AND period_end <= make_date(p_anno, 12, 31)
       AND status <> 'draft'), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.liquidazioni_iva_anno(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liquidazioni_iva_anno(uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.liquidazione_iva_conferma(
  p_company uuid, p_anno integer, p_periodo integer, p_manuali jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r jsonb; v_dal date; v_al date; v_id uuid; v_stato text;
BEGIN
  IF public.utente_sola_lettura(p_company) THEN
    RAISE EXCEPTION 'Accesso in sola lettura' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company::text, 2811));
  r := public.liquidazione_iva_righi(p_company, p_anno, p_periodo, p_manuali);
  IF coalesce((r ->> 'calcolabile')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '%', coalesce(r ->> 'motivo', 'Periodo non calcolabile') USING ERRCODE = '22023';
  END IF;
  v_dal := (r ->> 'dal')::date;
  v_al := (r ->> 'al')::date;

  SELECT id, status INTO v_id, v_stato FROM public.fiscal_reports
   WHERE company_id = p_company AND report_type = 'lipe' AND period_start = v_dal AND period_end = v_al
   ORDER BY (status <> 'draft') DESC, created_at LIMIT 1 FOR UPDATE;
  IF v_stato IN ('submitted', 'accepted_ade') THEN
    RAISE EXCEPTION 'Questo periodo è già stato inviato: non si riconferma.' USING ERRCODE = '23514';
  END IF;

  r := r || jsonb_build_object('manuali', coalesce(p_manuali, '{}'::jsonb),
                               'confermata_il', now(), 'confermata_da', auth.uid());
  IF v_id IS NULL THEN
    INSERT INTO public.fiscal_reports (company_id, report_type, period_start, period_end, data_summary, status)
    VALUES (p_company, 'lipe', v_dal, v_al, r, 'reviewed_commercialista') RETURNING id INTO v_id;
  ELSE
    UPDATE public.fiscal_reports
       SET data_summary = r, status = 'reviewed_commercialista', updated_at = now() WHERE id = v_id;
  END IF;
  RETURN jsonb_build_object('id', v_id, 'dati', r);
END $$;
REVOKE ALL ON FUNCTION public.liquidazione_iva_conferma(uuid, integer, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liquidazione_iva_conferma(uuid, integer, integer, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.liquidazione_iva_riapri(p_report uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  f public.fiscal_reports;
BEGIN
  SELECT * INTO f FROM public.fiscal_reports WHERE id = p_report AND report_type = 'lipe';
  IF f.id IS NULL THEN
    RAISE EXCEPTION 'Liquidazione non trovata' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.liquidazioni_iva_anno(f.company_id, extract(year FROM f.period_start)::int);
  IF public.utente_sola_lettura(f.company_id) THEN
    RAISE EXCEPTION 'Accesso in sola lettura' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(f.company_id::text, 2811));
  SELECT * INTO f FROM public.fiscal_reports WHERE id = p_report FOR UPDATE;
  IF f.status IN ('submitted', 'accepted_ade') THEN
    RAISE EXCEPTION 'Questo periodo è già stato inviato: non si riapre.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fiscal_reports x
              WHERE x.company_id = f.company_id AND x.report_type = 'lipe' AND x.period_start > f.period_end
                AND extract(year FROM x.period_start) = extract(year FROM f.period_start)
                AND x.status <> 'draft') THEN
    RAISE EXCEPTION 'Riapri prima i periodi successivi.' USING ERRCODE = '23514';
  END IF;
  UPDATE public.fiscal_reports SET status = 'draft', updated_at = now() WHERE id = f.id;
  RETURN jsonb_build_object('riaperta', true);
END $$;
REVOKE ALL ON FUNCTION public.liquidazione_iva_riapri(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liquidazione_iva_riapri(uuid) TO authenticated, service_role;

-- Dopo l'invio da Entratel: protocollo della ricevuta, una volta per tutti i periodi del file.
CREATE OR REPLACE FUNCTION public.liquidazione_iva_segna_inviata(p_company uuid, p_dal date, p_al date, p_protocollo text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_n integer; v_p text := nullif(btrim(coalesce(p_protocollo, '')), '');
BEGIN
  PERFORM public.liquidazioni_iva_anno(p_company, extract(year FROM p_dal)::int);
  IF public.utente_sola_lettura(p_company) THEN
    RAISE EXCEPTION 'Accesso in sola lettura' USING ERRCODE = '42501';
  END IF;
  IF v_p IS NULL OR length(v_p) > 80 THEN
    RAISE EXCEPTION 'Scrivi il protocollo della ricevuta.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.fiscal_reports
     SET status = 'submitted', ade_protocol_number = v_p, submitted_at = now(), updated_at = now()
   WHERE company_id = p_company AND report_type = 'lipe' AND period_start >= p_dal AND period_end <= p_al
     AND status = 'reviewed_commercialista';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Nessun periodo confermato da segnare.' USING ERRCODE = '22023';
  END IF;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.liquidazione_iva_segna_inviata(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liquidazione_iva_segna_inviata(uuid, date, date, text) TO authenticated, service_role;
