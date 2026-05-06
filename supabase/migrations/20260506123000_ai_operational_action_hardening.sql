-- AI operational action hardening.
-- Keeps Silvio's data-reading tools fast, but validates tenant ownership before
-- any SECURITY DEFINER tool writes scheduling, DPI or delivery state.

CREATE OR REPLACE FUNCTION public.silvio_tool_pianifica_cantiere(
  p_company_id uuid,
  p_cantiere_id uuid,
  p_resources jsonb,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_inserted int := 0;
  v_resource_type text;
  v_employee_id uuid;
  v_subcontractor_id uuid;
  v_mezzo_id uuid;
  v_start_date date;
  v_end_date date;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = p_cantiere_id
      AND o.company_id = p_company_id
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'cantiere_not_found',
      'message', 'La commessa/cantiere non appartiene all''azienda richiesta.'
    );
  END IF;

  IF p_resources IS NULL OR jsonb_typeof(p_resources) <> 'array' OR jsonb_array_length(p_resources) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'resources_required',
      'message', 'Serve almeno una risorsa da pianificare.'
    );
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_resources) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_resource', 'message', 'Ogni risorsa deve essere un oggetto JSON.');
    END IF;

    v_resource_type := COALESCE(NULLIF(v_item->>'resource_type', ''), 'employee');
    IF v_resource_type NOT IN ('employee', 'subcontractor', 'mezzo', 'capomastro') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_resource_type', 'resource_type', v_resource_type);
    END IF;

    v_employee_id := NULLIF(v_item->>'employee_id', '')::uuid;
    v_subcontractor_id := NULLIF(v_item->>'subcontractor_id', '')::uuid;
    v_mezzo_id := NULLIF(v_item->>'mezzo_id', '')::uuid;
    v_start_date := COALESCE(NULLIF(v_item->>'start_date', '')::date, p_start_date, current_date);
    v_end_date := COALESCE(NULLIF(v_item->>'end_date', '')::date, p_end_date, (current_date + interval '7 days')::date);

    IF v_end_date < v_start_date THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_date_range', 'message', 'La data fine non puo precedere la data inizio.');
    END IF;

    IF v_resource_type IN ('employee', 'capomastro') THEN
      IF v_employee_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = v_employee_id AND e.company_id = p_company_id
      ) THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'employee_not_found',
          'message', 'Operaio/capomastro non trovato nel tenant corrente.'
        );
      END IF;
    END IF;

    IF v_resource_type = 'subcontractor' THEN
      IF v_subcontractor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.subappaltatori s
        WHERE s.id = v_subcontractor_id AND s.company_id = p_company_id
      ) THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'subcontractor_not_found',
          'message', 'Subappaltatore non trovato nel tenant corrente.'
        );
      END IF;
    END IF;

    IF v_resource_type = 'mezzo' AND v_mezzo_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'mezzo_required',
        'message', 'Per pianificare un mezzo serve mezzo_id.'
      );
    END IF;

    INSERT INTO public.cantiere_allocations(
      company_id, cantiere_id, resource_type, employee_id, subcontractor_id, mezzo_id,
      start_date, end_date, hours_per_day, status, ai_suggested
    )
    VALUES (
      p_company_id, p_cantiere_id,
      v_resource_type,
      CASE WHEN v_resource_type IN ('employee', 'capomastro') THEN v_employee_id ELSE NULL END,
      CASE WHEN v_resource_type = 'subcontractor' THEN v_subcontractor_id ELSE NULL END,
      CASE WHEN v_resource_type = 'mezzo' THEN v_mezzo_id ELSE NULL END,
      v_start_date,
      v_end_date,
      COALESCE(NULLIF(v_item->>'hours_per_day', '')::numeric, 8),
      'planned',
      COALESCE(NULLIF(v_item->>'ai_suggested', '')::boolean, false)
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'cantiere_id', p_cantiere_id, 'allocations_inserted', v_inserted);
EXCEPTION
  WHEN invalid_text_representation OR datetime_field_overflow THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_resource_payload',
      'message', 'Una risorsa contiene UUID, data o numero non valido.'
    );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_pianifica_cantiere(uuid, uuid, jsonb, date, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_pianifica_cantiere(uuid, uuid, jsonb, date, date) TO service_role;


CREATE OR REPLACE FUNCTION public.silvio_tool_genera_modulo_consegna_dpi(
  p_company_id uuid,
  p_employee_id uuid,
  p_dpi_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
  v_item jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_employee_id
      AND e.company_id = p_company_id
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'employee_not_found',
      'message', 'Operaio non trovato nel tenant corrente.'
    );
  END IF;

  IF p_dpi_items IS NULL OR jsonb_typeof(p_dpi_items) <> 'array' OR jsonb_array_length(p_dpi_items) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'dpi_items_required',
      'message', 'Serve almeno un DPI da registrare.'
    );
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_dpi_items) LOOP
    IF jsonb_typeof(v_item) <> 'object' OR NULLIF(v_item->>'dpi_type', '') IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_dpi_item', 'message', 'Ogni DPI deve includere dpi_type.');
    END IF;

    INSERT INTO public.employee_dpi_consegne(
      company_id, employee_id, dpi_type, dpi_brand, dpi_size, dpi_serial, consegna_date, expiry_date
    )
    VALUES (
      p_company_id,
      p_employee_id,
      v_item->>'dpi_type',
      NULLIF(v_item->>'dpi_brand', ''),
      NULLIF(v_item->>'dpi_size', ''),
      NULLIF(v_item->>'dpi_serial', ''),
      COALESCE(NULLIF(v_item->>'consegna_date', '')::date, current_date),
      NULLIF(v_item->>'expiry_date', '')::date
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted, 'employee_id', p_employee_id);
EXCEPTION
  WHEN invalid_text_representation OR check_violation OR datetime_field_overflow THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_dpi_payload',
      'message', 'Uno o piu DPI hanno tipo, data o formato non valido.'
    );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_genera_modulo_consegna_dpi(uuid, uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_genera_modulo_consegna_dpi(uuid, uuid, jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.silvio_tool_invia_report_cfo(
  p_company_id uuid,
  p_report_id uuid,
  p_channels text[] DEFAULT ARRAY['email']
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channels text[] := COALESCE(p_channels, ARRAY['email']::text[]);
  v_channel text;
BEGIN
  IF to_regclass('public.cfo_weekly_reports') IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'report_table_missing',
      'message', 'La tabella report CFO non e ancora disponibile in questo ambiente.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cfo_weekly_reports r
    WHERE r.id = p_report_id
      AND r.company_id = p_company_id
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'report_not_found',
      'message', 'Report CFO non trovato nel tenant corrente.'
    );
  END IF;

  FOREACH v_channel IN ARRAY v_channels LOOP
    IF v_channel NOT IN ('email', 'whatsapp') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_channel', 'channel', v_channel);
    END IF;
  END LOOP;

  UPDATE public.cfo_weekly_reports
     SET email_sent_at = CASE WHEN 'email' = ANY(v_channels) THEN now() ELSE email_sent_at END,
         whatsapp_sent_at = CASE WHEN 'whatsapp' = ANY(v_channels) THEN now() ELSE whatsapp_sent_at END
   WHERE id = p_report_id
     AND company_id = p_company_id;

  RETURN jsonb_build_object('ok', true, 'report_id', p_report_id, 'channels', v_channels);
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_invia_report_cfo(uuid, uuid, text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_invia_report_cfo(uuid, uuid, text[]) TO service_role;
