-- Quote from Capture System — schema delta + RPC
-- ════════════════════════════════════════════════════════════════════════════
-- Estende preventivo_da_foto_runs per supportare audio + estratto strutturato.
-- Aggiunge product_aliases per fuzzy matching nomi locali → listino.
-- Aggiunge RPC silvio_tool_estrai_dati_da_capture + silvio_tool_apply_capture_review.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ESTENSIONE preventivo_da_foto_runs
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.preventivo_da_foto_runs
  ADD COLUMN IF NOT EXISTS audio_storage_path text,
  ADD COLUMN IF NOT EXISTS audio_transcript text,
  ADD COLUMN IF NOT EXISTS audio_duration_sec numeric,
  ADD COLUMN IF NOT EXISTS extracted_customer_data jsonb,
  ADD COLUMN IF NOT EXISTS extracted_products jsonb,
  ADD COLUMN IF NOT EXISTS extraction_confidence numeric,
  ADD COLUMN IF NOT EXISTS user_review_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS user_corrections jsonb,
  ADD COLUMN IF NOT EXISTS capture_mode text;

-- Status state machine estesa: aggiunge stati per audio + review
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'preventivo_da_foto_runs_status_check'
  ) THEN
    -- skip: vincolo non presente in alcune migrations precedenti
    NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pdf_runs_status_created
  ON public.preventivo_da_foto_runs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pdf_runs_company_user_review
  ON public.preventivo_da_foto_runs(company_id, user_review_completed_at)
  WHERE user_review_completed_at IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. NUOVA TABELLA product_aliases (fuzzy matching nomi locali)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  alias_text text NOT NULL,                    -- "infisso PVC", "finestrone"
  alias_normalized text GENERATED ALWAYS AS (lower(trim(alias_text))) STORED,

  -- Target: uno di questi (mutually exclusive)
  article_template_id uuid REFERENCES public.article_templates(id) ON DELETE CASCADE,
  family_id uuid REFERENCES public.article_families(id) ON DELETE CASCADE,
  tariffa_id uuid REFERENCES public.tariffe_aziendali(id) ON DELETE CASCADE,

  confidence numeric(3,2) DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),

  -- Tracking apprendimento
  learned_from text NOT NULL DEFAULT 'manual'
    CHECK (learned_from IN ('manual', 'capture_review', 'history', 'import')),
  use_count int DEFAULT 0,
  last_used_at timestamptz,

  created_at timestamptz DEFAULT now(),
  created_by uuid,

  -- Almeno un target richiesto
  CONSTRAINT product_aliases_target_required
    CHECK (
      (article_template_id IS NOT NULL)::int +
      (family_id IS NOT NULL)::int +
      (tariffa_id IS NOT NULL)::int = 1
    )
);

CREATE INDEX IF NOT EXISTS idx_product_aliases_company_normalized
  ON public.product_aliases(company_id, alias_normalized);
CREATE INDEX IF NOT EXISTS idx_product_aliases_template
  ON public.product_aliases(article_template_id) WHERE article_template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_aliases_family
  ON public.product_aliases(family_id) WHERE family_id IS NOT NULL;

ALTER TABLE public.product_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_aliases_company ON public.product_aliases;
CREATE POLICY product_aliases_company ON public.product_aliases
  FOR ALL USING (company_id = public.get_my_company_id());

-- Unique alias per (company, normalized, target)
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_aliases_template
  ON public.product_aliases(company_id, alias_normalized, article_template_id)
  WHERE article_template_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_aliases_family
  ON public.product_aliases(company_id, alias_normalized, family_id)
  WHERE family_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_aliases_tariffa
  ON public.product_aliases(company_id, alias_normalized, tariffa_id)
  WHERE tariffa_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RPC: silvio_tool_match_product_alias
-- Cerca alias rapido prima di chiamare pgvector (cache locale company)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_match_product_alias(
  p_company_id uuid,
  p_alias_text text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_normalized text := lower(trim(p_alias_text));
  v_match record;
BEGIN
  -- Match esatto prima
  SELECT
    pa.id, pa.article_template_id, pa.family_id, pa.tariffa_id,
    pa.confidence, pa.use_count
  INTO v_match
  FROM public.product_aliases pa
  WHERE pa.company_id = p_company_id
    AND pa.alias_normalized = v_normalized
  ORDER BY pa.confidence DESC, pa.use_count DESC
  LIMIT 1;

  IF v_match.id IS NULL THEN
    -- Match parziale (LIKE)
    SELECT
      pa.id, pa.article_template_id, pa.family_id, pa.tariffa_id,
      pa.confidence, pa.use_count
    INTO v_match
    FROM public.product_aliases pa
    WHERE pa.company_id = p_company_id
      AND pa.alias_normalized LIKE '%' || v_normalized || '%'
    ORDER BY pa.confidence DESC, pa.use_count DESC
    LIMIT 1;
  END IF;

  IF v_match.id IS NULL THEN
    RETURN jsonb_build_object('match', false);
  END IF;

  -- Bump use_count
  UPDATE public.product_aliases
     SET use_count = use_count + 1, last_used_at = now()
   WHERE id = v_match.id;

  RETURN jsonb_build_object(
    'match', true,
    'alias_id', v_match.id,
    'article_template_id', v_match.article_template_id,
    'family_id', v_match.family_id,
    'tariffa_id', v_match.tariffa_id,
    'confidence', v_match.confidence,
    'match_type', CASE WHEN v_match.confidence >= 0.99 THEN 'exact' ELSE 'partial' END
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_match_product_alias(uuid, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RPC: silvio_tool_register_product_alias
-- Registra/aggiorna alias dopo che l'utente ha confermato il match
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_register_product_alias(
  p_company_id uuid,
  p_alias_text text,
  p_article_template_id uuid DEFAULT NULL,
  p_family_id uuid DEFAULT NULL,
  p_tariffa_id uuid DEFAULT NULL,
  p_learned_from text DEFAULT 'capture_review',
  p_confidence numeric DEFAULT 0.95
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  -- Validazione: esattamente 1 target
  IF (p_article_template_id IS NOT NULL)::int +
     (p_family_id IS NOT NULL)::int +
     (p_tariffa_id IS NOT NULL)::int <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'exactly_one_target_required');
  END IF;

  INSERT INTO public.product_aliases(
    company_id, alias_text, article_template_id, family_id, tariffa_id,
    confidence, learned_from, created_by
  )
  VALUES (
    p_company_id, p_alias_text, p_article_template_id, p_family_id, p_tariffa_id,
    p_confidence, p_learned_from, auth.uid()
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Già esistente: aggiorna confidence se più alta
    UPDATE public.product_aliases
       SET confidence = GREATEST(confidence, p_confidence),
           use_count = use_count + 1,
           last_used_at = now()
     WHERE company_id = p_company_id
       AND alias_normalized = lower(trim(p_alias_text))
       AND COALESCE(article_template_id::text, '') = COALESCE(p_article_template_id::text, '')
       AND COALESCE(family_id::text, '') = COALESCE(p_family_id::text, '')
       AND COALESCE(tariffa_id::text, '') = COALESCE(p_tariffa_id::text, '')
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'alias_id', v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_register_product_alias(uuid, text, uuid, uuid, uuid, text, numeric) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RPC: silvio_tool_apply_capture_review
-- Trasforma una preventivo_da_foto_runs reviewata in quote + quote_items + customer
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_apply_capture_review(
  p_company_id uuid,
  p_run_id uuid,
  p_corrections jsonb
  -- {
  --   customer: { nome, cognome, telefono, email, indirizzo, citta, ... },
  --   products: [...],
  --   contact_strategy: 'auto'|'manual'|'always_new'|'use_existing',
  --   existing_contact_id: uuid (richiesto se strategy='use_existing')
  -- }
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
  v_contact_action text;  -- 'created' | 'reused' | 'updated' | 'manual_required' | 'skipped'
  v_existing_contact record;
  v_updated_fields text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO v_run FROM public.preventivo_da_foto_runs
   WHERE id = p_run_id AND company_id = p_company_id;

  IF v_run.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_not_found');
  END IF;

  v_customer := COALESCE(p_corrections->'customer', v_run.extracted_customer_data);
  v_products := COALESCE(p_corrections->'products', v_run.extracted_products);
  v_strategy := COALESCE(NULLIF(p_corrections->>'contact_strategy', ''), 'auto');

  IF v_products IS NULL OR jsonb_array_length(v_products) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_products');
  END IF;

  -- ─── RISOLUZIONE CONTATTO ────────────────────────────────────────────────
  -- Strategia:
  --   'use_existing' → usa contact passato dall'utente (UI ha selezionato manualmente)
  --   'always_new'   → crea nuovo senza controllare duplicati
  --   'manual'       → solo lookup, nessuna creazione automatica
  --   'auto'         → match per phone/email; se trovato → riusa+aggiorna campi vuoti
  --                     se non trovato → crea
  -- ─────────────────────────────────────────────────────────────────────────

  IF v_strategy = 'use_existing' THEN
    v_contact_id := NULLIF(p_corrections->>'existing_contact_id', '')::uuid;
    IF v_contact_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'existing_contact_id_required');
    END IF;

    -- Verifica che il contact appartenga alla company
    PERFORM 1 FROM public.marketing_contacts
     WHERE id = v_contact_id AND company_id = p_company_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'contact_not_found_or_other_company');
    END IF;

    v_contact_action := 'reused';

    -- Aggiorna i campi vuoti con i dati nuovi (se v_customer ha info nuove)
    IF v_customer IS NOT NULL THEN
      SELECT * INTO v_existing_contact
      FROM public.marketing_contacts WHERE id = v_contact_id;

      UPDATE public.marketing_contacts SET
        first_name = COALESCE(NULLIF(first_name, ''), NULLIF(trim(v_customer->>'nome'), '')),
        last_name = COALESCE(NULLIF(last_name, ''), NULLIF(trim(v_customer->>'cognome'), '')),
        phone = COALESCE(NULLIF(phone, ''), NULLIF(trim(v_customer->>'telefono'), '')),
        email = COALESCE(NULLIF(email, ''), NULLIF(trim(v_customer->>'email'), '')),
        company_name = COALESCE(NULLIF(company_name, ''), NULLIF(trim(v_customer->>'azienda'), '')),
        address = COALESCE(NULLIF(address, ''), NULLIF(trim(v_customer->>'indirizzo'), '')),
        city = COALESCE(NULLIF(city, ''), NULLIF(trim(v_customer->>'citta'), '')),
        province = COALESCE(NULLIF(province, ''), NULLIF(trim(v_customer->>'provincia'), '')),
        postal_code = COALESCE(NULLIF(postal_code, ''), NULLIF(trim(v_customer->>'cap'), '')),
        fiscal_code = COALESCE(NULLIF(fiscal_code, ''), NULLIF(trim(v_customer->>'cf'), '')),
        vat_number = COALESCE(NULLIF(vat_number, ''), NULLIF(trim(v_customer->>'piva'), '')),
        last_activity_at = now(),
        updated_at = now()
      WHERE id = v_contact_id;

      -- Detect campi aggiornati per audit
      IF v_existing_contact.first_name IS NULL OR v_existing_contact.first_name = '' THEN
        IF NULLIF(trim(v_customer->>'nome'), '') IS NOT NULL THEN v_updated_fields := array_append(v_updated_fields, 'first_name'); END IF;
      END IF;
      IF v_existing_contact.last_name IS NULL OR v_existing_contact.last_name = '' THEN
        IF NULLIF(trim(v_customer->>'cognome'), '') IS NOT NULL THEN v_updated_fields := array_append(v_updated_fields, 'last_name'); END IF;
      END IF;
      IF v_existing_contact.address IS NULL OR v_existing_contact.address = '' THEN
        IF NULLIF(trim(v_customer->>'indirizzo'), '') IS NOT NULL THEN v_updated_fields := array_append(v_updated_fields, 'address'); END IF;
      END IF;
      IF v_existing_contact.city IS NULL OR v_existing_contact.city = '' THEN
        IF NULLIF(trim(v_customer->>'citta'), '') IS NOT NULL THEN v_updated_fields := array_append(v_updated_fields, 'city'); END IF;
      END IF;

      IF array_length(v_updated_fields, 1) > 0 THEN
        v_contact_action := 'updated';
      END IF;
    END IF;

  ELSIF v_strategy = 'always_new' AND v_customer IS NOT NULL THEN
    INSERT INTO public.marketing_contacts(
      company_id, first_name, last_name, phone, email, company_name,
      address, city, province, postal_code, country,
      fiscal_code, vat_number, source, contact_type, last_activity_at
    )
    VALUES (
      p_company_id,
      NULLIF(trim(v_customer->>'nome'), ''),
      NULLIF(trim(v_customer->>'cognome'), ''),
      NULLIF(trim(v_customer->>'telefono'), ''),
      NULLIF(trim(v_customer->>'email'), ''),
      NULLIF(trim(v_customer->>'azienda'), ''),
      NULLIF(trim(v_customer->>'indirizzo'), ''),
      NULLIF(trim(v_customer->>'citta'), ''),
      NULLIF(trim(v_customer->>'provincia'), ''),
      NULLIF(trim(v_customer->>'cap'), ''),
      COALESCE(NULLIF(trim(v_customer->>'paese'), ''), 'IT'),
      NULLIF(trim(v_customer->>'cf'), ''),
      NULLIF(trim(v_customer->>'piva'), ''),
      'capture_ai',
      'lead',
      now()
    )
    RETURNING id INTO v_contact_id;
    v_contact_action := 'created';

  ELSIF v_strategy IN ('auto', 'manual') AND v_customer IS NOT NULL THEN
    v_existing_phone := NULLIF(trim(v_customer->>'telefono'), '');
    v_existing_email := NULLIF(trim(v_customer->>'email'), '');
    -- Normalizza telefono per match (rimuove spazi, +, -, prefisso 39 italiano)
    v_existing_phone_norm := CASE
      WHEN v_existing_phone IS NOT NULL
      THEN regexp_replace(regexp_replace(v_existing_phone, '\s|-|\+|\(|\)', '', 'g'), '^39', '')
      ELSE NULL
    END;

    -- Match per email o telefono normalizzato
    SELECT * INTO v_existing_contact
    FROM public.marketing_contacts
    WHERE company_id = p_company_id
      AND deleted_at IS NULL
      AND (
        (v_existing_email IS NOT NULL AND lower(email) = lower(v_existing_email))
        OR (v_existing_phone_norm IS NOT NULL AND
            regexp_replace(regexp_replace(COALESCE(phone, ''), '\s|-|\+|\(|\)', '', 'g'), '^39', '') = v_existing_phone_norm)
        OR (v_existing_phone_norm IS NOT NULL AND
            regexp_replace(regexp_replace(COALESCE(telefono_normalized, ''), '\s|-|\+|\(|\)', '', 'g'), '^39', '') = v_existing_phone_norm)
      )
    ORDER BY last_activity_at DESC NULLS LAST
    LIMIT 1;

    IF v_existing_contact.id IS NOT NULL THEN
      -- TROVATO → riusa + aggiorna campi vuoti
      v_contact_id := v_existing_contact.id;

      UPDATE public.marketing_contacts SET
        first_name = COALESCE(NULLIF(first_name, ''), NULLIF(trim(v_customer->>'nome'), '')),
        last_name = COALESCE(NULLIF(last_name, ''), NULLIF(trim(v_customer->>'cognome'), '')),
        phone = COALESCE(NULLIF(phone, ''), v_existing_phone),
        email = COALESCE(NULLIF(email, ''), v_existing_email),
        company_name = COALESCE(NULLIF(company_name, ''), NULLIF(trim(v_customer->>'azienda'), '')),
        address = COALESCE(NULLIF(address, ''), NULLIF(trim(v_customer->>'indirizzo'), '')),
        city = COALESCE(NULLIF(city, ''), NULLIF(trim(v_customer->>'citta'), '')),
        province = COALESCE(NULLIF(province, ''), NULLIF(trim(v_customer->>'provincia'), '')),
        postal_code = COALESCE(NULLIF(postal_code, ''), NULLIF(trim(v_customer->>'cap'), '')),
        fiscal_code = COALESCE(NULLIF(fiscal_code, ''), NULLIF(trim(v_customer->>'cf'), '')),
        vat_number = COALESCE(NULLIF(vat_number, ''), NULLIF(trim(v_customer->>'piva'), '')),
        last_activity_at = now(),
        updated_at = now()
      WHERE id = v_contact_id;

      -- Quali campi sono effettivamente cambiati?
      IF (v_existing_contact.first_name IS NULL OR v_existing_contact.first_name = '') AND NULLIF(trim(v_customer->>'nome'), '') IS NOT NULL THEN
        v_updated_fields := array_append(v_updated_fields, 'first_name');
      END IF;
      IF (v_existing_contact.last_name IS NULL OR v_existing_contact.last_name = '') AND NULLIF(trim(v_customer->>'cognome'), '') IS NOT NULL THEN
        v_updated_fields := array_append(v_updated_fields, 'last_name');
      END IF;
      IF (v_existing_contact.address IS NULL OR v_existing_contact.address = '') AND NULLIF(trim(v_customer->>'indirizzo'), '') IS NOT NULL THEN
        v_updated_fields := array_append(v_updated_fields, 'address');
      END IF;
      IF (v_existing_contact.city IS NULL OR v_existing_contact.city = '') AND NULLIF(trim(v_customer->>'citta'), '') IS NOT NULL THEN
        v_updated_fields := array_append(v_updated_fields, 'city');
      END IF;
      IF (v_existing_contact.fiscal_code IS NULL OR v_existing_contact.fiscal_code = '') AND NULLIF(trim(v_customer->>'cf'), '') IS NOT NULL THEN
        v_updated_fields := array_append(v_updated_fields, 'fiscal_code');
      END IF;
      IF (v_existing_contact.vat_number IS NULL OR v_existing_contact.vat_number = '') AND NULLIF(trim(v_customer->>'piva'), '') IS NOT NULL THEN
        v_updated_fields := array_append(v_updated_fields, 'vat_number');
      END IF;

      v_contact_action := CASE WHEN array_length(v_updated_fields, 1) > 0 THEN 'updated' ELSE 'reused' END;

    ELSIF v_strategy = 'auto' THEN
      -- NON TROVATO + auto → crea
      INSERT INTO public.marketing_contacts(
        company_id, first_name, last_name, phone, email, company_name,
        address, city, province, postal_code, country,
        fiscal_code, vat_number, source, contact_type, last_activity_at
      )
      VALUES (
        p_company_id,
        NULLIF(trim(v_customer->>'nome'), ''),
        NULLIF(trim(v_customer->>'cognome'), ''),
        v_existing_phone,
        v_existing_email,
        NULLIF(trim(v_customer->>'azienda'), ''),
        NULLIF(trim(v_customer->>'indirizzo'), ''),
        NULLIF(trim(v_customer->>'citta'), ''),
        NULLIF(trim(v_customer->>'provincia'), ''),
        NULLIF(trim(v_customer->>'cap'), ''),
        COALESCE(NULLIF(trim(v_customer->>'paese'), ''), 'IT'),
        NULLIF(trim(v_customer->>'cf'), ''),
        NULLIF(trim(v_customer->>'piva'), ''),
        'capture_ai',
        'lead',
        now()
      )
      RETURNING id INTO v_contact_id;
      v_contact_action := 'created';

    ELSE
      -- strategy = 'manual' + non trovato → l'utente deve scegliere
      v_contact_action := 'manual_required';
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'manual_contact_selection_required',
        'extracted_customer', v_customer
      );
    END IF;
  ELSE
    v_contact_action := 'skipped';
  END IF;

  -- 2. Genera quote_number progressivo per company
  SELECT 'Q-' || TO_CHAR(now(), 'YYYY') || '-' || LPAD(
    ((SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(quote_number, '\D', '', 'g'), '')::int), 0) + 1
      FROM public.quotes WHERE company_id = p_company_id))::text, 5, '0'
  ) INTO v_quote_number;

  -- 3. Calcola subtotal
  FOR v_product IN SELECT * FROM jsonb_array_elements(v_products) LOOP
    v_subtotal := v_subtotal +
      COALESCE((v_product->>'quantity')::numeric, 1) *
      COALESCE((v_product->>'unit_price')::numeric, 0);
  END LOOP;

  -- 4. Insert quote
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

  -- 5. Insert quote_items
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
  END LOOP;

  -- 6. Aggiorna run
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
    'updated_contact_fields', to_jsonb(v_updated_fields),
    'subtotal', v_subtotal,
    'total', v_subtotal * (1 + v_vat_rate / 100),
    'items_count', jsonb_array_length(v_products)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_apply_capture_review(uuid, uuid, jsonb) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. RPC: silvio_tool_lookup_contact_live
-- Trova candidati contact per email/telefono (UI suggerisce match in tempo reale)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_lookup_contact_live(
  p_company_id uuid,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_name_hint text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  company_name text,
  city text,
  match_type text,           -- 'email_exact' | 'phone_exact' | 'name_fuzzy'
  match_confidence numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_phone_norm text := CASE
    WHEN p_phone IS NOT NULL
    THEN regexp_replace(regexp_replace(p_phone, '\s|-|\+|\(|\)', '', 'g'), '^39', '')
    ELSE NULL
  END;
BEGIN
  RETURN QUERY
  -- Match esatto email
  SELECT
    mc.id, mc.first_name, mc.last_name, mc.email, mc.phone, mc.company_name, mc.city,
    'email_exact'::text AS match_type,
    1.0::numeric AS match_confidence
  FROM public.marketing_contacts mc
  WHERE mc.company_id = p_company_id
    AND mc.deleted_at IS NULL
    AND p_email IS NOT NULL
    AND lower(mc.email) = lower(p_email)
  UNION ALL
  -- Match esatto telefono normalizzato
  SELECT
    mc.id, mc.first_name, mc.last_name, mc.email, mc.phone, mc.company_name, mc.city,
    'phone_exact'::text,
    0.95::numeric
  FROM public.marketing_contacts mc
  WHERE mc.company_id = p_company_id
    AND mc.deleted_at IS NULL
    AND v_phone_norm IS NOT NULL
    AND (
      regexp_replace(regexp_replace(COALESCE(mc.phone, ''), '\s|-|\+|\(|\)', '', 'g'), '^39', '') = v_phone_norm
      OR regexp_replace(regexp_replace(COALESCE(mc.telefono_normalized, ''), '\s|-|\+|\(|\)', '', 'g'), '^39', '') = v_phone_norm
    )
    AND (p_email IS NULL OR lower(COALESCE(mc.email, '')) <> lower(p_email))  -- evita duplicato con email_exact
  UNION ALL
  -- Match fuzzy nome+cognome (solo se email/phone non hanno trovato)
  SELECT
    mc.id, mc.first_name, mc.last_name, mc.email, mc.phone, mc.company_name, mc.city,
    'name_fuzzy'::text,
    GREATEST(
      similarity(lower(coalesce(mc.first_name, '') || ' ' || coalesce(mc.last_name, '')), lower(p_name_hint)),
      similarity(lower(coalesce(mc.last_name, '') || ' ' || coalesce(mc.first_name, '')), lower(p_name_hint))
    )::numeric
  FROM public.marketing_contacts mc
  WHERE mc.company_id = p_company_id
    AND mc.deleted_at IS NULL
    AND p_name_hint IS NOT NULL AND length(p_name_hint) >= 3
    AND similarity(lower(coalesce(mc.first_name, '') || ' ' || coalesce(mc.last_name, '')), lower(p_name_hint)) > 0.4
  ORDER BY match_confidence DESC
  LIMIT 8;
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_lookup_contact_live(uuid, text, text, text) TO authenticated;

-- pg_trgm extension richiesta per similarity()
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. RPC: silvio_tool_get_capture_run
-- Get single run con i dati estratti (per UI review)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_get_capture_run(
  p_company_id uuid,
  p_run_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row jsonb;
BEGIN
  SELECT to_jsonb(r) INTO v_row
  FROM public.preventivo_da_foto_runs r
  WHERE r.id = p_run_id AND r.company_id = p_company_id;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'run', v_row);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_get_capture_run(uuid, uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. RPC: silvio_tool_create_capture_run
-- Inizia nuovo run (chiamato dall'edge ai-quote-from-capture)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_create_capture_run(
  p_company_id uuid,
  p_capture_mode text,  -- 'foto' | 'audio' | 'testo' | 'mixed'
  p_image_paths text[] DEFAULT NULL,
  p_audio_path text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_vertical_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_capture_mode NOT IN ('foto', 'audio', 'testo', 'mixed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_capture_mode');
  END IF;

  INSERT INTO public.preventivo_da_foto_runs(
    company_id, source, capture_mode,
    image_storage_paths, audio_storage_path, description, vertical_key,
    status
  )
  VALUES (
    p_company_id, 'manual_ui', p_capture_mode,
    p_image_paths, p_audio_path, p_description, p_vertical_key,
    'pending'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'run_id', v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_create_capture_run(uuid, text, text[], text, text, text) TO authenticated;

DO $$ BEGIN
  RAISE NOTICE 'Quote from Capture: 4 RPC + product_aliases + extensions pronti';
END $$;
