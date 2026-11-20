SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Le scadenze di generazione, riporto e previsione condividono la stessa regola.
-- Art. 1 DPR 100/1998 e art. 7 DPR 542/1999, come modificati dal D.Lgs. 108/2024.
CREATE OR REPLACE FUNCTION private.f24_iva_versamento(p_anno integer, p_mese integer, p_trimestre integer, p_importo numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO '' AS $$
DECLARE
  v_data date;
  v_mese integer;
  v_codice text;
  v_soglia numeric := CASE WHEN p_anno < 2024 THEN 25.82 ELSE 100 END;
BEGIN
  IF coalesce(p_importo, 0) <= 0 THEN RETURN '{"stato":"nessuno"}'::jsonb; END IF;
  IF p_mese BETWEEN 1 AND 12 THEN
    v_mese := p_mese;
    v_codice := (6000 + p_mese)::text;
    v_data := CASE WHEN p_mese = 7 THEN make_date(p_anno,8,20)
      ELSE (make_date(p_anno,p_mese,16) + interval '1 month')::date END;
  ELSIF p_trimestre = 5 THEN
    RETURN '{"stato":"annuale"}'::jsonb;
  ELSIF p_trimestre BETWEEN 1 AND 4 THEN
    v_mese := p_trimestre * 3;
    v_codice := (6030 + p_trimestre)::text;
    v_data := CASE p_trimestre WHEN 1 THEN make_date(p_anno,5,16) WHEN 2 THEN make_date(p_anno,8,20)
      WHEN 3 THEN make_date(p_anno,11,16) ELSE make_date(p_anno+1,2,16) END;
  ELSE
    RETURN '{"stato":"sconosciuto"}'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'stato', CASE WHEN p_importo <= v_soglia AND
      (coalesce(p_mese BETWEEN 1 AND 10,false) OR coalesce(p_trimestre BETWEEN 1 AND 2,false))
      THEN 'riporto' ELSE 'da_versare' END,
    'anno', p_anno, 'mese', v_mese, 'codice', v_codice,
    'scadenza', public.giorno_lavorativo_successivo(v_data), 'importo', p_importo);
END $$;

CREATE OR REPLACE FUNCTION private.f24_iva_da_liquidazione(p_dati jsonb, p_inizio date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT private.f24_iva_versamento(extract(year FROM $2)::int, ($1 ->> 'mese')::int,
    ($1 ->> 'trimestre')::int, ($1 #>> '{righi,vp14_debito}')::numeric)
$$;

-- Il tag è l'identità usata dagli F24 già registrati. Il riferimento in bozza
-- permette di sospendere la stessa riga senza perdere la chiave del periodo.
CREATE OR REPLACE FUNCTION private.f24_iva_riga(p_company uuid, p_report uuid, p_sospeso uuid)
RETURNS public.f24_entries LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE r public.f24_entries;
BEGIN
  SELECT * INTO r FROM public.f24_entries f
   WHERE f.company_id = p_company AND strpos(coalesce(f.note, ''), '[LIQ:' || p_report || ']') > 0
     AND (f.stato <> 'annullato' OR f.id = p_sospeso)
   ORDER BY (f.stato <> 'annullato') DESC, f.created_at DESC, f.id
   LIMIT 1 FOR UPDATE;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION private.f24_iva_verifica_modificabile(p_f24 public.f24_entries)
RETURNS void LANGUAGE plpgsql STABLE SET search_path TO '' AS $$
BEGIN
  IF p_f24.stato NOT IN ('da_pagare','annullato') OR p_f24.data_pagamento IS NOT NULL OR p_f24.pdf_url IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.fattura_allegati a
        WHERE a.company_id = p_f24.company_id AND a.f24_entry_id = p_f24.id) THEN
    RAISE EXCEPTION 'L’F24 ha un versamento o un documento registrato. Verifica la rettifica con il consulente.' USING ERRCODE = '23514';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.f24_iva_sincronizza(p_report public.fiscal_reports, p_crea boolean, p_sospeso uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE
  v public.f24_entries;
  r jsonb := private.f24_iva_da_liquidazione(p_report.data_summary,p_report.period_start);
  v_anno int := (r->>'anno')::int;
  v_mese int := (r->>'mese')::int;
  v_codice text := r->>'codice';
  v_importo numeric := (r->>'importo')::numeric;
  v_data date := (r->>'scadenza')::date;
  v_descr text := 'IVA ' || coalesce(p_report.data_summary ->> 'etichetta', v_codice) || ' ' || v_anno;
  v_id uuid;
  v_note text;
BEGIN
  SELECT * INTO v FROM private.f24_iva_riga(p_report.company_id,p_report.id,p_sospeso);
  IF r->>'stato' <> 'da_versare' THEN
    IF p_crea THEN
      RAISE EXCEPTION '%', CASE r->>'stato'
        WHEN 'riporto' THEN 'Il debito sotto soglia può essere riportato al periodo successivo.'
        WHEN 'annuale' THEN 'Il quarto trimestre si versa con la dichiarazione annuale.'
        ELSE 'Per la liquidazione non risulta un versamento periodico dovuto.' END USING ERRCODE = '22023';
    END IF;
    IF v.id IS NOT NULL AND v.stato <> 'annullato' THEN
      PERFORM private.f24_iva_verifica_modificabile(v);
      UPDATE public.f24_entries SET stato='annullato', updated_at=now(),
        note=concat_ws(E'\n',note,'Annullato dopo la rettifica della liquidazione IVA.') WHERE id=v.id;
    END IF;
    RETURN '{}'::jsonb;
  END IF;

  IF v.id IS NULL AND NOT p_crea THEN RETURN '{}'::jsonb; END IF;
  IF v.id IS NOT NULL AND v.stato <> 'annullato'
     AND row(v.anno,v.mese,v.tributo_code,v.importo,v.data_scadenza)
         IS NOT DISTINCT FROM row(v_anno,v_mese,v_codice,v_importo,v_data) THEN
    RETURN r || jsonb_build_object('id',v.id,'gia_creato',true);
  END IF;
  IF v.id IS NOT NULL THEN PERFORM private.f24_iva_verifica_modificabile(v); END IF;

  IF EXISTS (SELECT 1 FROM public.f24_entries f
      WHERE f.company_id=p_report.company_id AND f.anno=v_anno AND f.mese=v_mese
        AND f.tributo_code=v_codice AND f.id IS DISTINCT FROM v.id) THEN
    RAISE EXCEPTION 'Esiste già una voce F24 per questo tributo e periodo. Verificala nel Registro F24.' USING ERRCODE = '23514';
  END IF;

  IF v.id IS NULL THEN
    INSERT INTO public.f24_entries(company_id,anno,mese,tributo_code,tributo_descrizione,importo,stato,data_scadenza,note)
    VALUES(p_report.company_id,v_anno,v_mese,v_codice,v_descr,v_importo,'da_pagare',v_data,
      'Dalla liquidazione IVA [LIQ:' || p_report.id || ']') RETURNING id INTO v_id;
  ELSE
    v_id := v.id;
    v_note := format('Ricalcolato il %s. Prima della conferma: tributo %s, importo %s €, scadenza %s.',
      (now() AT TIME ZONE 'Europe/Rome')::date, v.tributo_code, v.importo, v.data_scadenza);
    UPDATE public.f24_entries SET anno=v_anno,mese=v_mese,tributo_code=v_codice,tributo_descrizione=v_descr,
      importo=v_importo,stato='da_pagare',data_scadenza=v_data,note=concat_ws(E'\n',note,v_note),updated_at=now() WHERE id=v_id;
  END IF;
  RETURN r || jsonb_build_object('id',v_id,'aggiornato',v.id IS NOT NULL);
END $$;

CREATE OR REPLACE FUNCTION public.liquidazione_iva_crea_f24(p_report uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE f public.fiscal_reports;
BEGIN
  SELECT * INTO f FROM public.fiscal_reports WHERE id=p_report AND report_type='lipe';
  IF NOT FOUND THEN RAISE EXCEPTION 'Liquidazione non trovata' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.liquidazioni_iva_anno(f.company_id, extract(year FROM f.period_start)::int);
  IF public.utente_sola_lettura(f.company_id) THEN RAISE EXCEPTION 'Accesso in sola lettura' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(f.company_id::text,2811));
  SELECT * INTO f FROM public.fiscal_reports WHERE id=p_report AND report_type='lipe' FOR UPDATE;
  IF NOT FOUND OR f.status = 'draft' THEN RAISE EXCEPTION 'Conferma prima la liquidazione.' USING ERRCODE = '22023'; END IF;
  RETURN private.f24_iva_sincronizza(f,true,null);
END $$;

CREATE OR REPLACE FUNCTION public.liquidazione_iva_conferma(p_company uuid, p_anno integer, p_periodo integer, p_manuali jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r jsonb; v_dal date; v_al date; v_id uuid; v_stato text; v_fine date; v_f24_sospeso uuid; v_report public.fiscal_reports;
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
  IF v_al >= (now() AT TIME ZONE 'Europe/Rome')::date THEN
    RAISE EXCEPTION 'Il periodo non è ancora finito: si conferma dal giorno dopo la sua fine.' USING ERRCODE = '22023';
  END IF;

  -- Una riga per data di inizio (vincolo uq_fiscal_period): una bozza con un'altra
  -- fine, per esempio trimestrale dopo il passaggio a mensile, si riusa.
  SELECT id, status, period_end, (data_summary ->> 'f24_sospeso_id')::uuid
    INTO v_id, v_stato, v_fine, v_f24_sospeso FROM public.fiscal_reports
   WHERE company_id = p_company AND report_type = 'lipe' AND period_start = v_dal FOR UPDATE;
  IF v_stato IN ('submitted', 'accepted_ade') THEN
    RAISE EXCEPTION 'Questo periodo è già stato inviato: non si riconferma.' USING ERRCODE = '23514';
  END IF;
  IF v_stato IS NOT NULL AND v_stato <> 'draft' AND v_fine <> v_al THEN
    RAISE EXCEPTION 'C''è una liquidazione confermata con un''altra periodicità: riaprila prima.' USING ERRCODE = '23514';
  END IF;

  r := r || jsonb_build_object('manuali', coalesce(p_manuali, '{}'::jsonb),
                               'confermata_il', now(), 'confermata_da', auth.uid());
  IF v_id IS NULL THEN
    INSERT INTO public.fiscal_reports (company_id, report_type, period_start, period_end, data_summary, status)
    VALUES (p_company, 'lipe', v_dal, v_al, r, 'reviewed_commercialista') RETURNING id INTO v_id;
  ELSE
    UPDATE public.fiscal_reports
       SET period_end = v_al, data_summary = r, status = 'reviewed_commercialista', updated_at = now() WHERE id = v_id;
  END IF;
  SELECT * INTO v_report FROM public.fiscal_reports WHERE id = v_id;
  PERFORM private.f24_iva_sincronizza(v_report, false, v_f24_sospeso);
  RETURN jsonb_build_object('id', v_id, 'dati', r);
END $function$;

CREATE OR REPLACE FUNCTION public.liquidazione_iva_riapri(p_report uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  f public.fiscal_reports; v_f24 public.f24_entries; v_sospeso uuid;
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
  SELECT * INTO v_f24 FROM private.f24_iva_riga(f.company_id, f.id, null);
  IF v_f24.id IS NOT NULL THEN
    PERFORM private.f24_iva_verifica_modificabile(v_f24);
    UPDATE public.f24_entries SET stato = 'annullato', updated_at = now(),
      note = concat_ws(E'\n', note, 'Sospeso per riapertura della liquidazione.')
      WHERE id = v_f24.id;
    v_sospeso := v_f24.id;
  END IF;
  UPDATE public.fiscal_reports
     SET status = 'draft', updated_at = now(),
         data_summary = CASE WHEN v_sospeso IS NULL THEN data_summary
           ELSE data_summary || jsonb_build_object('f24_sospeso_id', v_sospeso) END
   WHERE id = f.id;
  RETURN jsonb_build_object('riaperta', true);
END $function$;

CREATE OR REPLACE FUNCTION public.liquidazioni_iva_anno(p_company uuid, p_anno integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.user_can_access_company(p_company) IS NOT TRUE
     OR NOT (public.e_amministratore_di(p_company) OR public.has_role(auth.uid(), 'super_admin')
             OR public.user_can_write_accountant_company(p_company)) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', id, 'dal', period_start, 'al', period_end, 'stato', status,
             'protocollo', ade_protocol_number,
             'dati', data_summary || jsonb_build_object('versamento', private.f24_iva_da_liquidazione(data_summary, period_start)),
             'confermata_il', data_summary ->> 'confermata_il') ORDER BY period_start)
      FROM public.fiscal_reports
     WHERE company_id = p_company AND report_type = 'lipe'
       AND period_start >= make_date(p_anno, 1, 1) AND period_end <= make_date(p_anno, 12, 31)
       AND status <> 'draft'), '[]'::jsonb);
END $function$;


-- La scadenza finale dello scorso periodo e un F24 già pagato escludono il riporto VP7.
DO $patch$
DECLARE
  d text := pg_get_functiondef('public.liquidazione_iva_righi(uuid,integer,integer,jsonb)'::regprocedure);
  prima text := d;
BEGIN
  IF strpos(d, 'private.f24_iva_versamento') > 0 THEN RETURN; END IF;
  d := replace(d, $old$  v_soglia numeric := CASE WHEN p_anno < 2024 THEN 25.82 ELSE 100 END;$old$,
    $new$  v_versamento_prec jsonb;$new$);
  d := replace(d,$old$    IF coalesce((prec #>> '{righi,vp14_debito}')::numeric, 0) BETWEEN 0.01 AND v_soglia
       AND NOT ((v_mensile AND p_periodo = 12) OR (NOT v_mensile AND p_periodo = 4)) THEN$old$,
$new$    v_versamento_prec := private.f24_iva_da_liquidazione(prec, v_dal - 1);
    IF v_versamento_prec ->> 'stato' = 'riporto' AND NOT EXISTS (
      SELECT 1 FROM public.f24_entries f WHERE f.company_id = p_company AND f.anno = p_anno
        AND f.mese = (v_versamento_prec->>'mese')::int AND f.tributo_code = v_versamento_prec->>'codice'
        AND (f.stato = 'pagato' OR f.data_pagamento IS NOT NULL)
    ) THEN$new$);
  d := replace(d, $old$    'calcolabile', true, 'etichetta', v_etichetta,$old$,
    $new$    'calcolabile', true, 'etichetta', v_etichetta,
    'versamento', private.f24_iva_versamento(p_anno, CASE WHEN v_mensile THEN p_periodo END, v_trim_lipe, greatest(tot,0)),$new$);
  IF d = prima OR strpos(d,'AND NOT ((v_mensile AND p_periodo = 12)') > 0 THEN
    RAISE EXCEPTION 'Definizione del riporto LIPE inattesa';
  END IF;
  EXECUTE d;
END $patch$;

REVOKE ALL ON FUNCTION private.f24_iva_versamento(integer,integer,integer,numeric),
  private.f24_iva_da_liquidazione(jsonb,date), private.f24_iva_riga(uuid,uuid,uuid),
  private.f24_iva_verifica_modificabile(public.f24_entries),
  private.f24_iva_sincronizza(public.fiscal_reports,boolean,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liquidazione_iva_crea_f24(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liquidazione_iva_crea_f24(uuid) TO authenticated, service_role;
