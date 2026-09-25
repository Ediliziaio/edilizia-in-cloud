-- Preserve the three-argument API used by both editor and duplication.
-- SECURITY INVOKER applies tenant, staff visibility and blocked-user RLS.
CREATE OR REPLACE FUNCTION public.save_quote_items_atomic(
  p_quote_id uuid, p_company_id uuid, p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_item jsonb;
  v_map jsonb := '{}'::jsonb;
  v_new_id uuid;
  v_parent_id uuid;
  v_sort integer := 0;
  v_updated_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Items must be an array' USING ERRCODE = '22023';
  END IF;

  -- An UPDATE (not just SELECT) checks the quote's write policy, including
  -- staff assignment. It also serializes all replacement operations on a quote.
  -- The lock is held until rows and their totals have been committed together.
  UPDATE public.quotes SET updated_at = clock_timestamp()
    WHERE id = p_quote_id AND company_id = p_company_id
    RETURNING updated_at INTO v_updated_at;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found or access denied' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.quote_items WHERE quote_id = p_quote_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.quote_items (
      quote_id, company_id, item_type, name, description, quantity, unit_price,
      discount_percent, vat_rate, unit_of_measure, sort_order, article_template_id,
      item_category, tariffa_id, prezzo_acquisto, mostra_nel_pdf, is_optional,
      misura_x, misura_y, family_id, axis_selections, supplier_catalog_id, supplier_product_line_id
    ) VALUES (
      p_quote_id, p_company_id, v_item->>'item_type', v_item->>'name', v_item->>'description',
      (v_item->>'quantity')::numeric, (v_item->>'unit_price')::numeric,
      COALESCE((v_item->>'discount_percent')::numeric, 0), COALESCE((v_item->>'vat_rate')::numeric, 22),
      v_item->>'unit_of_measure', v_sort, NULLIF(v_item->>'article_template_id', '')::uuid,
      COALESCE(v_item->>'item_category', 'prodotto'), NULLIF(v_item->>'tariffa_id', '')::uuid,
      COALESCE((v_item->>'prezzo_acquisto')::numeric, 0), COALESCE((v_item->>'mostra_nel_pdf')::boolean, true),
      COALESCE((v_item->>'is_optional')::boolean, false), NULLIF(v_item->>'misura_x', '')::numeric,
      NULLIF(v_item->>'misura_y', '')::numeric, NULLIF(v_item->>'family_id', '')::uuid,
      v_item->'axis_selections', NULLIF(v_item->>'supplier_catalog_id', '')::uuid,
      NULLIF(v_item->>'supplier_product_line_id', '')::uuid
    ) RETURNING id INTO v_new_id;
    IF v_item->>'client_temp_id' IS NOT NULL THEN
      v_map := v_map || jsonb_build_object(v_item->>'client_temp_id', v_new_id::text);
    END IF;
    v_sort := v_sort + 1;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_parent_id := NULLIF(v_map->>(v_item->>'parent_temp_id'), '')::uuid;
    IF v_parent_id IS NOT NULL THEN
      UPDATE public.quote_items SET parent_item_id = v_parent_id
        WHERE id = NULLIF(v_map->>(v_item->>'client_temp_id'), '')::uuid;
    END IF;
  END LOOP;

  -- Return the version produced by THIS transaction (including totals triggers),
  -- so subsequent attachment failures cannot leave the editor's guard stale.
  SELECT updated_at INTO v_updated_at FROM public.quotes WHERE id = p_quote_id;
  RETURN jsonb_build_object('ok', true, 'inserted', v_sort, 'map', v_map, 'updated_at', v_updated_at);
END;
$fn$;
REVOKE ALL ON FUNCTION public.save_quote_items_atomic(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_quote_items_atomic(uuid, uuid, jsonb) TO authenticated;
