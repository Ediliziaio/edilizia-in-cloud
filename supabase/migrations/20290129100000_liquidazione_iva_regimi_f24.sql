-- Liquidazione IVA: quel che le simulazioni del 09/11 hanno trovato.
-- Il forfettario veniva calcolato come un ordinario, il pro-rata e l'IVA per cassa
-- delle impostazioni erano ignorati in silenzio, e cambiare periodicità con periodi
-- già confermati faceva leggere il periodo precedente sbagliato.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $patch$
DECLARE
  d text := pg_get_functiondef('public.liquidazione_iva_righi(uuid,integer,integer,jsonb)'::regprocedure);
  prima text;
BEGIN
  prima := d;
  d := replace(d, $x$  v_mensile := imp.periodicita = 'mensile';$x$,
$x$  IF imp.regime = 'forfettario' THEN
    RETURN jsonb_build_object('calcolabile', false, 'motivo', 'Il regime forfettario non fa la liquidazione IVA né la comunicazione LIPE.');
  END IF;
  v_mensile := imp.periodicita = 'mensile';$x$);
  IF d = prima THEN RAISE EXCEPTION 'punto forfettario non trovato'; END IF;

  prima := d;
  d := replace(d, $x$  vp5 := round(coalesce((b ->> 'iva_acquisti')::numeric, 0), 2);$x$,
$x$  vp5 := round(coalesce((b ->> 'iva_acquisti')::numeric, 0), 2);
  IF imp.pro_rata_percentuale IS NOT NULL THEN
    vp5 := round(vp5 * imp.pro_rata_percentuale / 100, 2);
    v_avvisi := v_avvisi || to_jsonb(format('IVA detratta ridotta al %s%% di pro-rata.', imp.pro_rata_percentuale));
  END IF;$x$);
  IF d = prima THEN RAISE EXCEPTION 'punto pro-rata non trovato'; END IF;

  prima := d;
  d := replace(d, $x$  RETURN jsonb_build_object(
    'calcolabile', true,$x$,
$x$  IF imp.iva_per_cassa THEN
    v_avvisi := v_avvisi || to_jsonb('IVA per cassa: sono contate solo le fatture marcate a esigibilità differita. Verifica gli incassi del periodo.'::text);
  END IF;
  IF imp.attivita_separate THEN
    v_avvisi := v_avvisi || to_jsonb('Attività separate: il calcolo è unico, va ripartito dal consulente.'::text);
  END IF;
  IF vp2 = 0 AND vp3 = 0 THEN
    v_avvisi := v_avvisi || to_jsonb('Nessun documento nel periodo: controlla che le fatture siano state importate.'::text);
  END IF;

  RETURN jsonb_build_object(
    'calcolabile', true,$x$);
  IF d = prima THEN RAISE EXCEPTION 'punto avvisi non trovato'; END IF;

  EXECUTE d;
END $patch$;

-- La periodicità non cambia con periodi già confermati: i righi si leggono a catena.
CREATE OR REPLACE FUNCTION private.impostazioni_iva_periodicita_ferma()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF NEW.periodicita IS DISTINCT FROM OLD.periodicita AND EXISTS (
       SELECT 1 FROM public.fiscal_reports f
        WHERE f.company_id = NEW.company_id AND f.report_type = 'lipe' AND f.status <> 'draft'
          AND extract(year FROM f.period_start) = NEW.anno) THEN
    RAISE EXCEPTION 'Ci sono liquidazioni confermate per il %: riaprile prima di cambiare la periodicità.', NEW.anno USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.impostazioni_iva_periodicita_ferma() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_impostazioni_iva_periodicita_ferma ON public.fiscalita_impostazioni_iva;
CREATE TRIGGER trg_impostazioni_iva_periodicita_ferma
  BEFORE UPDATE OF periodicita ON public.fiscalita_impostazioni_iva
  FOR EACH ROW EXECUTE FUNCTION private.impostazioni_iva_periodicita_ferma();

-- L'F24 nasce dalla liquidazione confermata, una volta sola.
CREATE OR REPLACE FUNCTION public.liquidazione_iva_crea_f24(p_report uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  f public.fiscal_reports; v_debito numeric; v_mese int; v_trim int; v_anno int; v_codice text; v_scad date;
  v_descr text; v_id uuid; v_tag text; v_mese_f24 int;
BEGIN
  SELECT * INTO f FROM public.fiscal_reports WHERE id = p_report AND report_type = 'lipe';
  IF f.id IS NULL THEN
    RAISE EXCEPTION 'Liquidazione non trovata' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.liquidazioni_iva_anno(f.company_id, extract(year FROM f.period_start)::int);
  IF public.utente_sola_lettura(f.company_id) THEN
    RAISE EXCEPTION 'Accesso in sola lettura' USING ERRCODE = '42501';
  END IF;
  IF f.status = 'draft' THEN
    RAISE EXCEPTION 'Conferma prima la liquidazione.' USING ERRCODE = '22023';
  END IF;

  v_debito := coalesce((f.data_summary #>> '{righi,vp14_debito}')::numeric, 0);
  v_mese := (f.data_summary ->> 'mese')::int;
  v_trim := (f.data_summary ->> 'trimestre')::int;
  v_anno := extract(year FROM f.period_start)::int;
  IF v_trim = 5 THEN
    RAISE EXCEPTION 'Il quarto trimestre si versa con la dichiarazione annuale.' USING ERRCODE = '22023';
  END IF;
  IF v_debito <= 100 THEN
    RAISE EXCEPTION 'Fino a 100 € non si versa: l''importo passa al periodo successivo.' USING ERRCODE = '22023';
  END IF;

  IF v_mese IS NOT NULL THEN
    v_codice := '60' || lpad(v_mese::text, 2, '0');
    v_scad := (make_date(v_anno, v_mese, 16) + interval '1 month')::date;
    v_descr := 'IVA ' || (f.data_summary ->> 'etichetta') || ' ' || v_anno;
    v_mese_f24 := v_mese;
  ELSE
    v_codice := '603' || v_trim;
    v_scad := CASE v_trim WHEN 1 THEN make_date(v_anno, 5, 16) WHEN 2 THEN make_date(v_anno, 8, 20)
                          WHEN 3 THEN make_date(v_anno, 11, 16) ELSE make_date(v_anno + 1, 2, 16) END;
    v_descr := 'IVA ' || v_trim || '° trimestre ' || v_anno;
    v_mese_f24 := v_trim * 3;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(f.company_id::text, 2811));
  v_tag := '[LIQ:' || f.id::text || ']';
  SELECT id INTO v_id FROM public.f24_entries
   WHERE company_id = f.company_id AND note LIKE '%' || v_tag || '%' AND stato <> 'annullato' LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_id, 'gia_creato', true);
  END IF;
  INSERT INTO public.f24_entries (company_id, anno, mese, tributo_code, tributo_descrizione, importo, stato, data_scadenza, note)
  VALUES (f.company_id, v_anno, v_mese_f24, v_codice, v_descr, v_debito, 'da_pagare', v_scad, 'Dalla liquidazione IVA ' || v_tag)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'codice', v_codice, 'importo', v_debito, 'scadenza', v_scad);
END $$;
REVOKE ALL ON FUNCTION public.liquidazione_iva_crea_f24(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liquidazione_iva_crea_f24(uuid) TO authenticated, service_role;
