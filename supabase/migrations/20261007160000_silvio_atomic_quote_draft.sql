-- Local preparation only: deploy with the actor-isolation migration first.
-- Preserve the RPC signature; fix generated columns, status and atomic line creation.
CREATE OR REPLACE FUNCTION public.silvio_create_quote_draft(
  p_company_id uuid, p_user_id uuid, p_client_name text,
  p_client_email text DEFAULT NULL, p_client_phone text DEFAULT NULL,
  p_client_address text DEFAULT NULL, p_title text DEFAULT NULL,
  p_description text DEFAULT NULL, p_tipo_lavoro text DEFAULT NULL,
  p_indirizzo_lavori text DEFAULT NULL, p_items jsonb DEFAULT '[]'::jsonb,
  p_validity_days int DEFAULT 30, p_default_vat_rate numeric DEFAULT NULL,
  p_internal_notes text DEFAULT 'Bozza generata da Silvio'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_roles text[];
  v_id uuid := gen_random_uuid();
  v_number text;
  v_item jsonb;
  v_rate numeric;
  v_quote public.quotes%ROWTYPE;
BEGIN
  IF NOT public.ai_is_service_role() THEN
    RAISE EXCEPTION 'Service execution required' USING ERRCODE = '42501';
  END IF;
  v_roles := public.silvio_context_actor_roles(p_company_id, p_user_id);
  IF NOT COALESCE(v_roles && ARRAY['super_admin','company_admin','company_staff','salesperson']::text[], false) THEN
    RAISE EXCEPTION 'Quote permission denied' USING ERRCODE = '42501';
  END IF;
  IF NOT (v_roles && ARRAY['super_admin','company_admin','salesperson']::text[]) AND NOT EXISTS (
    SELECT 1 FROM public.staff_permissions s WHERE s.company_id = p_company_id AND s.user_id = p_user_id
      AND s.sola_lettura IS FALSE AND s.can_view_preventivi IS TRUE AND s.can_edit_preventivi IS TRUE
      AND s.only_assigned IS FALSE AND s.only_my_warehouse IS FALSE
  ) THEN
    RAISE EXCEPTION 'Quote permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_client_name IS NULL OR length(trim(p_client_name)) < 2 THEN
    RAISE EXCEPTION 'Nome cliente obbligatorio' USING ERRCODE = '22023';
  END IF;
  IF p_validity_days IS NULL OR p_validity_days NOT BETWEEN 1 AND 3650 THEN
    RAISE EXCEPTION 'Validita non valida' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Voci non valide' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Specificare da 1 a 200 voci' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_rate := COALESCE((v_item->>'vat_rate')::numeric, p_default_vat_rate);
    IF jsonb_typeof(v_item) <> 'object' OR COALESCE(length(trim(v_item->>'name')), 0) = 0
      OR jsonb_typeof(v_item->'quantity') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_item->'unit_price') IS DISTINCT FROM 'number'
      OR (v_item->>'quantity')::numeric <= 0 OR (v_item->>'unit_price')::numeric < 0
      OR v_rate IS NULL OR v_rate NOT BETWEEN 0 AND 100
      OR COALESCE(v_item->>'item_type', 'material') NOT IN ('material','labor','subcontract','service','other') THEN
      RAISE EXCEPTION 'Voce non valida: verificare nome, quantita, prezzo e IVA' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- A draft identifier, not a fiscal number. UUID avoids COUNT(*) races/deleted-number reuse.
  v_number := 'BOZZA-' || to_char(now(), 'YYYY') || '-' || v_id::text;
  INSERT INTO public.quotes(id, company_id, quote_number, status, client_name, client_email,
    client_phone, client_address, title, description, tipo_lavoro, indirizzo_lavori,
    subtotal, vat_amount, total, validity_days, expires_at, internal_notes, created_by)
  VALUES(v_id, p_company_id, v_number, 'bozza', trim(p_client_name), p_client_email,
    p_client_phone, p_client_address, COALESCE(NULLIF(trim(p_title), ''), 'Preventivo per ' || trim(p_client_name)),
    p_description, p_tipo_lavoro, p_indirizzo_lavori, 0, 0, 0,
    p_validity_days, now() + make_interval(days => p_validity_days), p_internal_notes, p_user_id);

  INSERT INTO public.quote_items(quote_id, company_id, item_type, name, description,
    quantity, unit_price, unit_of_measure, vat_rate, sort_order)
  SELECT v_id, p_company_id, COALESCE(item->>'item_type', 'material'), trim(item->>'name'), item->>'description',
    (item->>'quantity')::numeric, (item->>'unit_price')::numeric, item->>'unit_of_measure',
    COALESCE((item->>'vat_rate')::numeric, p_default_vat_rate), ord - 1
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS items(item, ord);
  -- Reuse the application's calculation, including rounding. No parallel AI totals.
  PERFORM public.do_recalculate_quote_totals(v_id);
  SELECT * INTO STRICT v_quote FROM public.quotes WHERE id = v_id AND company_id = p_company_id;
  RETURN jsonb_build_object('success', true, 'quote_id', v_id, 'quote_number', v_number,
    'status', v_quote.status, 'client_name', v_quote.client_name,
    'subtotal_eur', v_quote.subtotal, 'vat_eur', v_quote.vat_amount, 'total_eur', v_quote.total,
    'items_count', jsonb_array_length(p_items), 'message', 'Bozza preventivo creata. Verifica le voci prima di inviarla.',
    'link', '/azienda/marketing/preventivi/' || v_id::text || '/modifica');
END;
$$;
REVOKE ALL ON FUNCTION public.silvio_create_quote_draft(uuid,uuid,text,text,text,text,text,text,text,text,jsonb,int,numeric,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_create_quote_draft(uuid,uuid,text,text,text,text,text,text,text,text,jsonb,int,numeric,text) TO service_role;
