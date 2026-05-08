-- ════════════════════════════════════════════════════════════════════════════
-- silvio_tool_apply_computo_review
-- Trasforma un computo metrico reviewato in quote+items in un'unica
-- transazione atomica: se l'INSERT su quote_items fallisce, il quote
-- viene rollbackato automaticamente (no orphan quotes).
--
-- Sostituisce il pattern client-side a due step in useComputoExtract.ts:
--   1. supabase.from('quotes').insert(...)
--   2. supabase.from('quote_items').insert(...)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.silvio_tool_apply_computo_review(
  p_company_id     uuid,
  p_computo_id     uuid,
  p_items          jsonb,   -- array di voci incluse (vedi schema sotto)
  p_config         jsonb    -- { oggetto, contact_id, note, quote_number? }
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
/*
  p_items schema (array):
  [
    {
      "id": "uuid",                         -- computo_voci_estratte.id
      "name": "text",                       -- nome voce (preferisce matched_name)
      "description": "text|null",           -- descrizione estesa
      "unit_of_measure": "text",
      "quantity": number,
      "unit_price": number,
      "line_total": number,
      "discount_percent": number,
      "codice_prezzario": "text|null",
      "article_template_id": "uuid|null",
      "family_id": "uuid|null",
      "sort_order": number
    },
    ...
  ]

  p_config schema:
  {
    "oggetto": "text|null",
    "contact_id": "uuid|null",
    "note": "text|null",
    "quote_number": "text|null"   -- se omesso, lo genera la funzione
  }
*/
DECLARE
  v_upload        record;
  v_quote_id      uuid;
  v_quote_number  text;
  v_subtotal      numeric := 0;
  v_vat_rate      numeric := 10;   -- 10% per lavori edili
  v_item          jsonb;
  v_line_total    numeric;
  v_items_count   int := 0;
BEGIN
  -- ─── 1. Valida computo upload ─────────────────────────────────────────────
  SELECT * INTO v_upload
    FROM public.computo_uploads
    WHERE id = p_computo_id AND company_id = p_company_id;
  IF v_upload IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'computo_not_found');
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_items');
  END IF;

  -- ─── 2. Calcola subtotal ──────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_line_total := COALESCE((v_item->>'line_total')::numeric, 0);
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;

  -- ─── 3. Genera quote number ───────────────────────────────────────────────
  v_quote_number := COALESCE(
    NULLIF(trim(p_config->>'quote_number'), ''),
    lpad(
      ((SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(quote_number, '\D', '', 'g'), '')::int), 0) + 1
        FROM public.quotes WHERE company_id = p_company_id))::text,
      5, '0'
    )
  );

  -- ─── 4. Insert quote ──────────────────────────────────────────────────────
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
    vat_rate,
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
    v_vat_rate,
    'computo_ai',
    p_computo_id,
    true,
    auth.uid()
  )
  RETURNING id INTO v_quote_id;

  -- ─── 5. Insert quote_items ────────────────────────────────────────────────
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
      is_optional,
      mostra_nel_pdf
    )
    VALUES (
      v_quote_id,
      p_company_id,
      COALESCE((v_item->>'sort_order')::int, 0),
      'product',
      'prodotto',
      COALESCE(NULLIF(v_item->>'name', ''), 'Voce senza nome'),
      NULLIF(v_item->>'description', ''),
      COALESCE(NULLIF(v_item->>'unit_of_measure', ''), 'cad'),
      COALESCE((v_item->>'quantity')::numeric, 1),
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'line_total')::numeric, 0),
      COALESCE((v_item->>'discount_percent')::numeric, 0),
      v_vat_rate,
      NULLIF(v_item->>'id', '')::uuid,              -- computo_voce_id
      NULLIF(v_item->>'codice_prezzario', ''),
      NULLIF(v_item->>'article_template_id', '')::uuid,
      NULLIF(v_item->>'family_id', '')::uuid,
      false,
      true
    );
    v_items_count := v_items_count + 1;
  END LOOP;

  -- ─── 6. Aggiorna stato computo ────────────────────────────────────────────
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

GRANT EXECUTE ON FUNCTION public.silvio_tool_apply_computo_review(uuid, uuid, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.silvio_tool_apply_computo_review IS
  'Crea quote+items da computo metrico in una singola transazione atomica. '
  'Elimina il rischio di quote orfani se items INSERT fallisce (pattern P0).';
