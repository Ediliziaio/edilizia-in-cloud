-- «Genera preventivo» dal computo metrico non ha mai funzionato (05/10/2026).
--
-- La funzione scriveva quote_items.line_total, che è una colonna calcolata
-- (GENERATED ALWAYS … STORED, migrazione 20260330000003): Postgres rifiuta
-- qualunque valore (errore 428C9) e la transazione salta a ogni tentativo.
-- In produzione: 0 preventivi con source 'computo_ai', 9 computi su 13 fermi
-- in revisione dal 1° settembre.
--
-- In più l'IVA era il 10% fisso su ogni riga, anche per un prodotto del
-- listino al 22%. Ora ogni riga porta la sua: vat_rate della voce, poi
-- quella della configurazione (p_config->>'vat_rate'), poi 10% come prima
-- (l'aliquota più comune per i lavori di ristrutturazione).
--
-- I totali del preventivo li ricalcola il trigger trg_recalc_quote_totals_ins
-- dopo ogni inserimento di righe: quelli scritti qui sono solo il punto di
-- partenza, calcolati dalle righe invece che dal line_total mandato dal
-- browser.
--
-- La categoria di ripiego era «servizio», che il CHECK di quote_items non
-- ammette: ora una voce senza categoria valida è posa se ha una tariffa,
-- altrimenti prodotto.
--
-- Stessa firma, stessi permessi (CREATE OR REPLACE li conserva).

CREATE OR REPLACE FUNCTION public.silvio_tool_apply_computo_review(
  p_company_id uuid,
  p_computo_id uuid,
  p_items jsonb,
  p_config jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_upload        record;
  v_quote_id      uuid;
  v_quote_number  text;
  v_subtotal      numeric := 0;
  v_vat_amount    numeric := 0;
  v_vat_default   numeric := 10;
  v_vat_rate      numeric;
  v_item          jsonb;
  v_line_net      numeric;
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

  -- Aliquota di ripiego scelta nella configurazione, se valida (0..100).
  IF COALESCE(p_config->>'vat_rate', '') ~ '^\d+(\.\d+)?$'
     AND (p_config->>'vat_rate')::numeric BETWEEN 0 AND 100 THEN
    v_vat_default := (p_config->>'vat_rate')::numeric;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_line_net := COALESCE((v_item->>'quantity')::numeric, 1)
                * COALESCE((v_item->>'unit_price')::numeric, 0)
                * (1 - COALESCE((v_item->>'discount_percent')::numeric, 0) / 100);
    v_vat_rate := CASE
      WHEN COALESCE(v_item->>'vat_rate', '') ~ '^\d+(\.\d+)?$'
           AND (v_item->>'vat_rate')::numeric BETWEEN 0 AND 100
        THEN (v_item->>'vat_rate')::numeric
      ELSE v_vat_default
    END;
    v_subtotal := v_subtotal + v_line_net;
    v_vat_amount := v_vat_amount + v_line_net * v_vat_rate / 100;
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
    round(v_subtotal, 2),
    round(v_vat_amount, 2),
    round(v_subtotal + v_vat_amount, 2),
    'computo_ai',
    p_computo_id,
    true,
    auth.uid()
  )
  RETURNING id INTO v_quote_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    -- line_total non si scrive: la calcola il database da quantità, prezzo e sconto.
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
      -- Solo le categorie che il CHECK di quote_items ammette per una voce:
      -- una tariffa senza categoria (o con una non ammessa, come «servizio»)
      -- è posa, il resto prodotto, come categoriaRigaPreventivo nel browser.
      CASE
        WHEN v_item->>'item_category' IN ('prodotto', 'posa', 'trasporto', 'tiro_piano', 'smaltimento', 'nolo', 'pratica')
          THEN v_item->>'item_category'
        WHEN NULLIF(v_item->>'tariffa_id', '') IS NULL THEN 'prodotto'
        ELSE 'posa'
      END,
      COALESCE(NULLIF(v_item->>'name', ''), 'Voce senza nome'),
      NULLIF(v_item->>'description', ''),
      COALESCE(NULLIF(v_item->>'unit_of_measure', ''), 'cad'),
      COALESCE((v_item->>'quantity')::numeric, 1),
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'discount_percent')::numeric, 0),
      CASE
        WHEN COALESCE(v_item->>'vat_rate', '') ~ '^\d+(\.\d+)?$'
             AND (v_item->>'vat_rate')::numeric BETWEEN 0 AND 100
          THEN (v_item->>'vat_rate')::numeric
        ELSE v_vat_default
      END,
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
    'subtotal', round(v_subtotal, 2)
  );
END $function$;
