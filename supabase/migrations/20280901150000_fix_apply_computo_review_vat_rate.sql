-- ============================================================================
-- Fix: silvio_tool_apply_computo_review scriveva quotes.vat_rate, colonna che
-- su quotes NON esiste (l'IVA di testata vive in vat_amount/total; il rate
-- per-riga sta su quote_items.vat_rate, che c'è).
--
-- Scoperto dal collaudo AI end-to-end (contratto Cosmet → revisione computo →
-- "Genera Preventivo" → 42703). La funzione era il finale dell'intera
-- pipeline "importa documento intelligente": ogni generazione falliva.
--
-- Qui: stessa funzione, identica in tutto, MENO la colonna fantasma.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.silvio_tool_apply_computo_review(
  p_company_id uuid,
  p_computo_id uuid,
  p_items jsonb,
  p_config jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_upload        record;
  v_quote_id      uuid;
  v_quote_number  text;
  v_subtotal      numeric := 0;
  v_vat_rate      numeric := 10;
  v_item          jsonb;
  v_line_total    numeric;
  v_items_count   int := 0;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  SELECT * INTO v_upload
    FROM public.computo_uploads
    WHERE id = p_computo_id AND company_id = p_company_id;
  IF v_upload IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'computo_not_found');
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_items');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_line_total := COALESCE((v_item->>'line_total')::numeric, 0);
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;

  v_quote_number := COALESCE(
    NULLIF(trim(p_config->>'quote_number'), ''),
    lpad(
      ((SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(quote_number, '\D', '', 'g'), '')::int), 0) + 1
        FROM public.quotes WHERE company_id = p_company_id))::text,
      5, '0'
    )
  );

  INSERT INTO public.quotes(
    company_id,
    quote_number,
    status,
    contact_id,
    title,
    notes,
    subtotal,
    vat_amount,
    total,
    source,
    computo_upload_id,
    is_ai_generated,
    created_by
  )
  VALUES (
    p_company_id,
    v_quote_number,
    'bozza',
    NULLIF(p_config->>'contact_id', '')::uuid,
    COALESCE(
      NULLIF(trim(p_config->>'oggetto'), ''),
      COALESCE(v_upload.oggetto_lavori, 'Da Computo Metrico')
    ),
    COALESCE(
      NULLIF(trim(p_config->>'note'), ''),
      'Generato da computo metrico: ' || v_upload.file_name
    ),
    v_subtotal,
    v_subtotal * v_vat_rate / 100,
    v_subtotal * (1 + v_vat_rate / 100),
    'computo_ai',
    p_computo_id,
    true,
    auth.uid()
  )
  RETURNING id INTO v_quote_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.quote_items(
      quote_id,
      company_id,
      sort_order,
      item_type,
      item_category,
      name,
      description,
      unit_of_measure,
      quantity,
      unit_price,
      line_total,
      discount_percent,
      vat_rate,
      computo_voce_id,
      codice_prezzario,
      article_template_id,
      family_id,
      tariffa_id,
      prezzo_acquisto,
      is_optional,
      mostra_nel_pdf
    )
    VALUES (
      v_quote_id,
      p_company_id,
      COALESCE((v_item->>'sort_order')::int, 0),
      COALESCE(
        NULLIF(v_item->>'item_type', ''),
        CASE WHEN NULLIF(v_item->>'tariffa_id', '') IS NULL THEN 'product' ELSE 'service' END
      ),
      COALESCE(
        NULLIF(v_item->>'item_category', ''),
        CASE WHEN NULLIF(v_item->>'tariffa_id', '') IS NULL THEN 'prodotto' ELSE 'servizio' END
      ),
      COALESCE(NULLIF(v_item->>'name', ''), 'Voce senza nome'),
      NULLIF(v_item->>'description', ''),
      COALESCE(NULLIF(v_item->>'unit_of_measure', ''), 'cad'),
      COALESCE((v_item->>'quantity')::numeric, 1),
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'line_total')::numeric, 0),
      COALESCE((v_item->>'discount_percent')::numeric, 0),
      v_vat_rate,
      NULLIF(v_item->>'id', '')::uuid,
      NULLIF(v_item->>'codice_prezzario', ''),
      NULLIF(v_item->>'article_template_id', '')::uuid,
      NULLIF(v_item->>'family_id', '')::uuid,
      NULLIF(v_item->>'tariffa_id', '')::uuid,
      NULLIF(v_item->>'prezzo_acquisto', '')::numeric,
      false,
      true
    );
    v_items_count := v_items_count + 1;
  END LOOP;

  UPDATE public.computo_uploads
     SET extraction_status = 'completed',
         quote_id = v_quote_id,
         updated_at = now()
   WHERE id = p_computo_id;

  RETURN jsonb_build_object(
    'ok', true,
    'quote_id', v_quote_id,
    'quote_number', v_quote_number,
    'items_count', v_items_count,
    'subtotal', v_subtotal
  );
END $$;
