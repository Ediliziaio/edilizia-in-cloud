-- ════════════════════════════════════════════════════════════════════════════
-- La Certificazione Unica smette di essere un foglio bianco
-- ════════════════════════════════════════════════════════════════════════════
--
-- È il secondo sottosistema paghe orfano, e ha esattamente la forma del primo.
-- `silvio_tool_genera_cu_anno` fa una cosa sola:
--     INSERT INTO fiscal_reports(company_id, report_type, period_start,
--                                period_end, status)
--     VALUES (…, 'cu', …, 'draft')
-- e risponde `{ok: true, report_id: …}`. Nessun dipendente, nessun imponibile,
-- nessuna ritenuta. Una Certificazione Unica che risulta generata e non
-- contiene niente — la stessa cosa che faceva `silvio_tool_genera_f24_mese`
-- prima dell'ondata 5.8.
--
-- La CU certifica al dipendente e all'Agenzia quanto ha percepito e quanto gli
-- è stato trattenuto nell'anno. Quei numeri adesso esistono: sono nei cedolini
-- che `cedolino_genera` sa produrre dalle timbrature.
--
-- ── Cosa NON c'è dentro, e perché ──────────────────────────────────────────
-- Solo il lavoro dipendente. Restano fuori le ritenute d'acconto ai
-- professionisti (parte «Lavoro autonomo» della CU), le addizionali regionali
-- e comunali — che il calcolo del cedolino esclude, quindi metterle qui
-- sarebbe inventarle — e i familiari a carico, che il sistema non registra.
-- E come per l'F24: niente invio telematico.

CREATE OR REPLACE FUNCTION public.cu_componi(
  p_company_id uuid,
  p_anno       integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_righe    jsonb := '[]'::jsonb;
  v_quanti   integer := 0;
  v_bozze    integer := 0;
  v_lordo    numeric := 0;
  v_ritenute numeric := 0;
  v_contrib  numeric := 0;
  v_id       uuid;
  v_stato    text;
BEGIN
  IF public.user_can_access_company(p_company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_stato FROM public.fiscal_reports
   WHERE company_id = p_company_id AND report_type = 'cu'
     AND period_start = make_date(p_anno, 1, 1);
  IF v_stato IS NOT NULL AND v_stato <> 'draft' THEN
    RETURN jsonb_build_object('ok', false,
      'motivo', format('la CU %s è in stato %s: non si ricompone', p_anno, v_stato));
  END IF;

  -- Un cedolino in bozza non ha certificato niente: non entra.
  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'dipendente'), '[]'::jsonb), count(*)
    INTO v_righe, v_quanti
    FROM (
      SELECT jsonb_build_object(
               'employee_id', c.employee_id,
               'dipendente', trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')),
               'codice_fiscale', nullif(btrim(coalesce(e.email, '')), ''),
               'mesi_certificati', count(*),
               'lordo_anno', round(sum(coalesce(c.lordo, 0)), 2),
               'contributi_dipendente', round(sum(coalesce(c.contributi_dipendente, 0)), 2),
               'ritenute_irpef', round(sum(coalesce(c.ritenute_irpef, 0)), 2),
               'netto_anno', round(sum(coalesce(c.netto, 0)), 2)) AS x
        FROM public.hr_cedolini c
        JOIN public.employees e ON e.id = c.employee_id
       WHERE c.company_id = p_company_id AND c.anno = p_anno
         AND c.stato <> 'bozza'
       GROUP BY c.employee_id, e.first_name, e.last_name, e.email
    ) s;

  SELECT count(*) INTO v_bozze FROM public.hr_cedolini
   WHERE company_id = p_company_id AND anno = p_anno AND stato = 'bozza';

  IF v_quanti = 0 THEN
    RETURN jsonb_build_object('ok', false,
      'motivo', CASE WHEN v_bozze > 0
                     THEN format('nessun cedolino emesso per il %s: ce ne sono %s in bozza, e una CU non si fa su cedolini non emessi', p_anno, v_bozze)
                     ELSE format('nessun cedolino per il %s: non c''è niente da certificare', p_anno) END,
      'anno', p_anno, 'company_id', p_company_id);
  END IF;

  SELECT coalesce(sum((r ->> 'lordo_anno')::numeric), 0),
         coalesce(sum((r ->> 'ritenute_irpef')::numeric), 0),
         coalesce(sum((r ->> 'contributi_dipendente')::numeric), 0)
    INTO v_lordo, v_ritenute, v_contrib
    FROM jsonb_array_elements(v_righe) r;

  INSERT INTO public.fiscal_reports (company_id, report_type, period_start, period_end,
                                     status, data_summary, ai_validation_warnings)
  VALUES (p_company_id, 'cu', make_date(p_anno, 1, 1), make_date(p_anno, 12, 31), 'draft',
          jsonb_build_object(
            'anno', p_anno,
            'percipienti', v_quanti,
            'totale_lordo', round(v_lordo, 2),
            'totale_ritenute_irpef', round(v_ritenute, 2),
            'totale_contributi_dipendente', round(v_contrib, 2),
            'righe', v_righe),
          jsonb_build_object('non_incluso', jsonb_build_array(
            'ritenute d''acconto ai professionisti: la parte «Lavoro autonomo» non è coperta',
            'addizionali regionali e comunali: il calcolo del cedolino le esclude',
            'familiari a carico e detrazioni personali: il sistema non li registra',
            'invio telematico: non implementato')))
  ON CONFLICT (company_id, report_type, period_start) DO UPDATE
    SET data_summary = EXCLUDED.data_summary,
        ai_validation_warnings = EXCLUDED.ai_validation_warnings,
        period_end = EXCLUDED.period_end,
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true, 'report_id', v_id, 'anno', p_anno,
    'percipienti', v_quanti,
    'totale_lordo', round(v_lordo, 2),
    'totale_ritenute_irpef', round(v_ritenute, 2),
    'cedolini_in_bozza_esclusi', v_bozze,
    'righe', v_righe,
    'non_incluso', jsonb_build_array(
      'ritenute d''acconto ai professionisti',
      'addizionali regionali e comunali',
      'familiari a carico e detrazioni personali',
      'invio telematico'),
    'da_rivedere_da_un_commercialista', true);
END $function$;

COMMENT ON FUNCTION public.cu_componi(uuid, integer) IS
  'Compone la Certificazione Unica dell''anno dai cedolini emessi, e dichiara cosa non copre. Rifiuta di produrre un documento vuoto: se non ci sono cedolini emessi lo dice, distinguendo il caso in cui ce ne siano solo in bozza.';

REVOKE ALL ON FUNCTION public.cu_componi(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cu_componi(uuid, integer) TO authenticated, service_role;

-- L'ingresso storico smette di produrre un foglio bianco.
CREATE OR REPLACE FUNCTION public.silvio_tool_genera_cu_anno(
  p_company_id uuid, p_year integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.cu_componi(p_company_id, p_year);
END $function$;
