-- =============================================================================
-- P0-1 — RPC atomica per salvare le righe di un preventivo
-- =============================================================================
-- Risolve il bug P0 "QuoteBuilder DELETE→INSERT senza transazione": se l'INSERT
-- o l'UPDATE delle nuove righe falliva, la DELETE era già committata → il
-- preventivo restava vuoto o semi-corrotto.
--
-- La RPC esegue DELETE + INSERT + UPDATE parent_item_id dentro un singolo
-- function body PL/pgSQL, quindi in un'unica transazione implicita: qualsiasi
-- errore causa rollback totale e nessuna riga viene persa.
--
-- Nota Supabase CLI locale:
-- questo file viene eseguito come prepared statement unico in alcune versioni
-- del runner, quindi funzione, grant e commento sono racchiusi in un solo DO.
-- =============================================================================

DO $migration$
BEGIN
  EXECUTE $function$
    CREATE OR REPLACE FUNCTION public.save_quote_items_atomic(
      p_quote_id uuid,
      p_company_id uuid,
      p_items jsonb -- array di oggetti con eventuale client_temp_id e parent_temp_id
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_catalog
    AS $fn$
    DECLARE
      v_item jsonb;
      v_map jsonb := '{}'::jsonb;
      v_new_id uuid;
      v_client_temp_id text;
      v_parent_temp_id text;
      v_parent_db_id uuid;
      v_sort int := 0;
    BEGIN
      -- Authorization: solo chi ha accesso al tenant della quote può salvare
      IF NOT EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.id = p_quote_id AND q.company_id = p_company_id
      ) THEN
        RAISE EXCEPTION 'Quote not found or access denied';
      END IF;

      -- Step 1: DELETE existing items (inside transaction — rollback on any failure)
      DELETE FROM public.quote_items WHERE quote_id = p_quote_id;

      -- Step 2: INSERT new rows, building client_temp_id -> uuid map
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_client_temp_id := v_item->>'client_temp_id';

        INSERT INTO public.quote_items (
          quote_id, company_id, item_type, name, description, quantity, unit_price,
          discount_percent, vat_rate, unit_of_measure, sort_order, article_template_id,
          item_category, tariffa_id, prezzo_acquisto, mostra_nel_pdf, is_optional,
          misura_x, misura_y, family_id, axis_selections,
          supplier_catalog_id, supplier_product_line_id
        ) VALUES (
          p_quote_id, p_company_id,
          v_item->>'item_type', v_item->>'name', v_item->>'description',
          (v_item->>'quantity')::numeric, (v_item->>'unit_price')::numeric,
          COALESCE((v_item->>'discount_percent')::numeric, 0),
          COALESCE((v_item->>'vat_rate')::numeric, 22),
          v_item->>'unit_of_measure', v_sort,
          NULLIF(v_item->>'article_template_id','')::uuid,
          COALESCE(v_item->>'item_category','prodotto'),
          NULLIF(v_item->>'tariffa_id','')::uuid,
          COALESCE((v_item->>'prezzo_acquisto')::numeric, 0),
          COALESCE((v_item->>'mostra_nel_pdf')::boolean, true),
          COALESCE((v_item->>'is_optional')::boolean, false),
          NULLIF(v_item->>'misura_x','')::numeric,
          NULLIF(v_item->>'misura_y','')::numeric,
          NULLIF(v_item->>'family_id','')::uuid,
          v_item->'axis_selections',
          NULLIF(v_item->>'supplier_catalog_id','')::uuid,
          NULLIF(v_item->>'supplier_product_line_id','')::uuid
        )
        RETURNING id INTO v_new_id;

        IF v_client_temp_id IS NOT NULL THEN
          v_map := v_map || jsonb_build_object(v_client_temp_id, v_new_id::text);
        END IF;
        v_sort := v_sort + 1;
      END LOOP;

      -- Step 3: UPDATE parent_item_id resolving temp ids
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_client_temp_id := v_item->>'client_temp_id';
        v_parent_temp_id := v_item->>'parent_temp_id';
        IF v_client_temp_id IS NOT NULL AND v_parent_temp_id IS NOT NULL THEN
          v_parent_db_id := NULLIF(v_map->>v_parent_temp_id,'')::uuid;
          IF v_parent_db_id IS NOT NULL THEN
            UPDATE public.quote_items
              SET parent_item_id = v_parent_db_id
              WHERE id = NULLIF(v_map->>v_client_temp_id,'')::uuid;
          END IF;
        END IF;
      END LOOP;

      RETURN jsonb_build_object(
        'ok', true,
        'inserted', jsonb_array_length(p_items),
        'map', v_map
      );
    END;
    $fn$;
  $function$;

  -- Concedi esecuzione a utenti autenticati — l'authorization è applicata
  -- dentro la RPC via check company_id.
  EXECUTE 'REVOKE ALL ON FUNCTION public.save_quote_items_atomic(uuid, uuid, jsonb) FROM public';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_quote_items_atomic(uuid, uuid, jsonb) TO authenticated';

  EXECUTE $comment$
    COMMENT ON FUNCTION public.save_quote_items_atomic(uuid, uuid, jsonb) IS
      'P0-1: salva righe preventivo in modo atomico (DELETE+INSERT+UPDATE in singola transazione). Usata da QuoteBuilder.tsx e Preventivi.tsx duplicateMutation.'
  $comment$;
END
$migration$;
