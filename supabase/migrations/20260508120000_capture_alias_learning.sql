-- ════════════════════════════════════════════════════════════════════════════
-- MP-AI-CAPTURE — Memory Loop: registra alias quando l'utente abbina manualmente
-- ════════════════════════════════════════════════════════════════════════════
-- Quando l'utente apre il review panel (ai-quote-from-capture o computo) e
-- abbina manualmente una voce a un articolo/famiglia del listino, vogliamo
-- IMPARARE quel match: la prossima volta che l'AI estrae una voce con
-- descrizione_grezza simile, dovrebbe matchare automaticamente via
-- silvio_tool_match_product_alias (lookup deterministica O(1)).
--
-- Strategia: estendere silvio_tool_apply_capture_review per chiamare
-- silvio_tool_register_product_alias dentro lo stesso transaction block,
-- per ogni voce con descrizione_grezza non vuota + matched (article/family/tariffa).
--
-- Filosofia: l'utente che abbina manualmente è la SUPERVISIONE umana che
-- alimenta il modello. Ogni abbinamento manuale = +1 dato di training
-- per i match futuri.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.silvio_tool_apply_capture_review(
  p_company_id uuid,
  p_run_id uuid,
  p_corrections jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_run record;
  v_quote_id uuid;
  v_quote_number text;
  v_contact_id uuid;
  v_customer jsonb;
  v_products jsonb;
  v_product jsonb;
  v_subtotal numeric := 0;
  v_vat_rate numeric := 22;
  v_strategy text;
  v_existing_phone text;
  v_existing_email text;
  v_existing_phone_norm text;
  v_contact_action text;
  v_existing_contact record;
  v_updated_fields text[] := ARRAY[]::text[];
  -- ── Alias learning ───────────────────────────────────────────────────────
  v_alias_text text;
  v_template_id uuid;
  v_family_id uuid;
  v_tariffa_id uuid;
  v_aliases_registered int := 0;
BEGIN
  -- ─── 1. Carica run + valida company ───────────────────────────────────────
  SELECT * INTO v_run
    FROM public.preventivo_da_foto_runs
    WHERE id = p_run_id AND company_id = p_company_id;
  IF v_run IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_not_found');
  END IF;

  v_customer := COALESCE(p_corrections->'customer', v_run.extracted_customer_data);
  v_products := COALESCE(p_corrections->'products', v_run.extracted_products);

  IF jsonb_typeof(v_products) <> 'array' OR jsonb_array_length(v_products) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_products');
  END IF;

  -- ─── 2. Risolvi contact secondo strategia ─────────────────────────────────
  v_strategy := COALESCE(p_corrections->>'contact_strategy', 'auto');
  v_existing_phone := NULLIF(trim(v_customer->>'telefono'), '');
  v_existing_email := NULLIF(trim(v_customer->>'email'), '');
  v_existing_phone_norm := regexp_replace(COALESCE(v_existing_phone, ''), '\D', '', 'g');

  IF v_strategy = 'use_existing' THEN
    v_contact_id := NULLIF(p_corrections->>'existing_contact_id', '')::uuid;
    IF v_contact_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'existing_contact_id_required');
    END IF;
    SELECT * INTO v_existing_contact FROM public.marketing_contacts
      WHERE id = v_contact_id AND company_id = p_company_id;
    IF v_existing_contact IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'contact_not_found_or_other_company');
    END IF;
    v_contact_action := 'reused';
  ELSIF v_strategy = 'always_new' THEN
    INSERT INTO public.marketing_contacts(
      company_id, first_name, last_name, email, phone, company_name,
      address, city, province, postal_code, fiscal_code, vat_number,
      created_by, source_channel
    )
    VALUES (
      p_company_id,
      NULLIF(trim(v_customer->>'nome'), ''),
      NULLIF(trim(v_customer->>'cognome'), ''),
      v_existing_email,
      v_existing_phone,
      NULLIF(trim(v_customer->>'azienda'), ''),
      NULLIF(trim(v_customer->>'indirizzo'), ''),
      NULLIF(trim(v_customer->>'citta'), ''),
      NULLIF(trim(v_customer->>'provincia'), ''),
      NULLIF(trim(v_customer->>'cap'), ''),
      NULLIF(trim(v_customer->>'cf'), ''),
      NULLIF(trim(v_customer->>'piva'), ''),
      auth.uid(),
      'capture_review'
    )
    RETURNING id INTO v_contact_id;
    v_contact_action := 'created';
  ELSIF v_strategy = 'manual' THEN
    v_contact_id := NULL;
    v_contact_action := 'skipped';
  ELSE  -- 'auto'
    SELECT id INTO v_contact_id FROM public.marketing_contacts
     WHERE company_id = p_company_id
       AND (
         (v_existing_email IS NOT NULL AND lower(email) = lower(v_existing_email))
         OR (v_existing_phone_norm <> ''
             AND regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = v_existing_phone_norm)
       )
     ORDER BY created_at DESC LIMIT 1;
    IF v_contact_id IS NOT NULL THEN
      v_contact_action := 'reused';
    ELSE
      INSERT INTO public.marketing_contacts(
        company_id, first_name, last_name, email, phone, company_name,
        address, city, province, postal_code, fiscal_code, vat_number,
        created_by, source_channel
      )
      VALUES (
        p_company_id,
        NULLIF(trim(v_customer->>'nome'), ''),
        NULLIF(trim(v_customer->>'cognome'), ''),
        v_existing_email,
        v_existing_phone,
        NULLIF(trim(v_customer->>'azienda'), ''),
        NULLIF(trim(v_customer->>'indirizzo'), ''),
        NULLIF(trim(v_customer->>'citta'), ''),
        NULLIF(trim(v_customer->>'provincia'), ''),
        NULLIF(trim(v_customer->>'cap'), ''),
        NULLIF(trim(v_customer->>'cf'), ''),
        NULLIF(trim(v_customer->>'piva'), ''),
        auth.uid(),
        'capture_review'
      )
      RETURNING id INTO v_contact_id;
      v_contact_action := 'created';
    END IF;
  END IF;

  -- ─── 3. Calcola subtotal ──────────────────────────────────────────────────
  FOR v_product IN SELECT * FROM jsonb_array_elements(v_products) LOOP
    v_subtotal := v_subtotal +
      COALESCE((v_product->>'quantity')::numeric, 1) *
      COALESCE((v_product->>'unit_price')::numeric, 0);
  END LOOP;

  -- ─── 4. Insert quote ──────────────────────────────────────────────────────
  SELECT to_char(
    ((SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(quote_number, '\D', '', 'g'), '')::int), 0) + 1
      FROM public.quotes WHERE company_id = p_company_id))::text, 5, '0'
  ) INTO v_quote_number;

  INSERT INTO public.quotes(
    company_id, quote_number, status, contact_id,
    client_name, client_email, client_phone, client_company, client_address,
    client_fiscal_code, client_vat_number,
    title, description,
    subtotal, vat_amount, total, vat_rate,
    is_ai_generated, ai_persona_used,
    indirizzo_lavori,
    created_by
  )
  VALUES (
    p_company_id, v_quote_number, 'bozza', v_contact_id,
    TRIM(CONCAT(v_customer->>'nome', ' ', v_customer->>'cognome')),
    NULLIF(trim(v_customer->>'email'), ''),
    NULLIF(trim(v_customer->>'telefono'), ''),
    NULLIF(trim(v_customer->>'azienda'), ''),
    NULLIF(trim(v_customer->>'indirizzo'), ''),
    NULLIF(trim(v_customer->>'cf'), ''),
    NULLIF(trim(v_customer->>'piva'), ''),
    COALESCE(NULLIF(trim(p_corrections->>'title'), ''),
             'Preventivo AI da ' || COALESCE(v_run.capture_mode, 'capture')),
    v_run.description,
    v_subtotal,
    v_subtotal * v_vat_rate / 100,
    v_subtotal * (1 + v_vat_rate / 100),
    v_vat_rate,
    true,
    'sales',
    v_run.cantiere_address,
    auth.uid()
  )
  RETURNING id INTO v_quote_id;

  -- ─── 5. Insert quote_items + Alias learning ───────────────────────────────
  -- Per ogni voce: oltre a INSERT su quote_items, se la voce è MATCHED a un
  -- prodotto del listino (article_template_id / family_id / tariffa_id) E ha
  -- una descrizione_grezza non vuota, registra l'alias in product_aliases.
  -- La prossima volta che l'AI vedrà una voce simile la matcherà subito.
  FOR v_product IN SELECT * FROM jsonb_array_elements(v_products) LOOP
    INSERT INTO public.quote_items(
      quote_id, company_id, item_type, name, description,
      quantity, unit_price, vat_rate, unit_of_measure,
      article_template_id, family_id, tariffa_id,
      misura_x, misura_y, axis_selections,
      sort_order, item_category
    )
    VALUES (
      v_quote_id,
      p_company_id,
      COALESCE(NULLIF(v_product->>'item_type', ''), 'product'),
      v_product->>'name',
      NULLIF(v_product->>'description', ''),
      COALESCE((v_product->>'quantity')::numeric, 1),
      COALESCE((v_product->>'unit_price')::numeric, 0),
      v_vat_rate,
      COALESCE(NULLIF(v_product->>'unit_of_measure', ''), 'pz'),
      NULLIF(v_product->>'article_template_id', '')::uuid,
      NULLIF(v_product->>'family_id', '')::uuid,
      NULLIF(v_product->>'tariffa_id', '')::uuid,
      NULLIF(v_product->>'misura_x', '')::int,
      NULLIF(v_product->>'misura_y', '')::int,
      v_product->'axis_selections',
      COALESCE((v_product->>'sort_order')::int, 0),
      NULLIF(v_product->>'item_category', '')
    );

    -- ── Alias learning ─────────────────────────────────────────────────────
    -- Registra solo se:
    --  · descrizione_grezza non vuota (>=3 char dopo trim)
    --  · esattamente 1 target (template/family/tariffa)
    --  · match_type = 'manual' (l'utente ha confermato → fonte affidabile)
    v_alias_text := NULLIF(trim(v_product->>'descrizione_grezza'), '');
    v_template_id := NULLIF(v_product->>'article_template_id', '')::uuid;
    v_family_id := NULLIF(v_product->>'family_id', '')::uuid;
    v_tariffa_id := NULLIF(v_product->>'tariffa_id', '')::uuid;
    IF v_alias_text IS NOT NULL
       AND length(v_alias_text) >= 3
       AND (v_template_id IS NOT NULL
            OR v_family_id IS NOT NULL
            OR v_tariffa_id IS NOT NULL)
       AND COALESCE(v_product->>'match_type', '') = 'manual' THEN
      BEGIN
        INSERT INTO public.product_aliases(
          company_id, alias_text,
          article_template_id, family_id, tariffa_id,
          confidence, learned_from, created_by
        )
        VALUES (
          p_company_id, v_alias_text,
          v_template_id, v_family_id, v_tariffa_id,
          0.95, 'capture_review', auth.uid()
        )
        ON CONFLICT DO NOTHING;
        IF FOUND THEN
          v_aliases_registered := v_aliases_registered + 1;
        ELSE
          -- Già esiste: incrementa use_count + last_used_at
          UPDATE public.product_aliases
             SET confidence = GREATEST(confidence, 0.95),
                 use_count = use_count + 1,
                 last_used_at = now()
           WHERE company_id = p_company_id
             AND alias_normalized = lower(trim(v_alias_text))
             AND COALESCE(article_template_id::text, '') = COALESCE(v_template_id::text, '')
             AND COALESCE(family_id::text, '') = COALESCE(v_family_id::text, '')
             AND COALESCE(tariffa_id::text, '') = COALESCE(v_tariffa_id::text, '');
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Non bloccante: se il register alias fallisce, l'inserimento del
        -- preventivo procede comunque. Il peggio è che l'AI non impara.
        RAISE WARNING 'alias register skipped for "%": %', v_alias_text, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- ─── 6. Aggiorna run ──────────────────────────────────────────────────────
  UPDATE public.preventivo_da_foto_runs
     SET quote_id = v_quote_id,
         status = 'completed',
         user_review_completed_at = now(),
         user_corrections = p_corrections,
         reviewed_by_user_id = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'ok', true,
    'quote_id', v_quote_id,
    'quote_number', v_quote_number,
    'contact_id', v_contact_id,
    'contact_action', v_contact_action,
    'aliases_registered', v_aliases_registered
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_apply_capture_review(uuid, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.silvio_tool_apply_capture_review IS
  'Trasforma capture run reviewed in quote+items+contact. Auto-registra alias '
  'in product_aliases per ogni voce abbinata manualmente (memory loop AI).';
