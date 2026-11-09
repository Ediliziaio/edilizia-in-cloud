-- Una riga per data di inizio (uq_fiscal_period): la conferma riusa la bozza che
-- ha la stessa data di inizio anche se finisce in un altro giorno.
CREATE OR REPLACE FUNCTION public.liquidazione_iva_conferma(
  p_company uuid, p_anno integer, p_periodo integer, p_manuali jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r jsonb; v_dal date; v_al date; v_id uuid; v_stato text; v_fine date;
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

  SELECT id, status, period_end INTO v_id, v_stato, v_fine FROM public.fiscal_reports
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
  RETURN jsonb_build_object('id', v_id, 'dati', r);
END $$;
REVOKE ALL ON FUNCTION public.liquidazione_iva_conferma(uuid, integer, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liquidazione_iva_conferma(uuid, integer, integer, jsonb) TO authenticated, service_role;
