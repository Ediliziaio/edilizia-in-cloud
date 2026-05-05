-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-13 — SPRINT 5: Generative tools (create_quote_draft, computo_analyze)
-- ════════════════════════════════════════════════════════════════════════════
-- Tool che Silvio può invocare per generare BOZZE da approvare:
--   • silvio_create_quote_draft → bozza preventivo + items
--   • silvio_create_invoice_draft → bozza fattura/SAL su ordine
--   • silvio_analyze_computo_text → ritorna analisi su testo computo
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) silvio_create_quote_draft — crea preventivo + items in stato 'draft'
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_create_quote_draft(
  p_company_id uuid,
  p_user_id uuid,
  p_client_name text,
  p_client_email text DEFAULT NULL,
  p_client_phone text DEFAULT NULL,
  p_client_address text DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_tipo_lavoro text DEFAULT NULL,
  p_indirizzo_lavori text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_validity_days int DEFAULT 30,
  p_default_vat_rate numeric DEFAULT 22.0,
  p_internal_notes text DEFAULT 'Bozza generata da Silvio'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote_id uuid;
  v_quote_number text;
  v_subtotal numeric := 0;
  v_vat_amount numeric := 0;
  v_total numeric := 0;
  v_year text := to_char(now(), 'YYYY');
  v_seq int;
  v_item jsonb;
  v_line_total numeric;
  v_item_vat_rate numeric;
  v_items_count int := 0;
BEGIN
  IF p_client_name IS NULL OR length(trim(p_client_name)) < 2 THEN
    RAISE EXCEPTION 'client_name obbligatorio (min 2 char)' USING ERRCODE = '22023';
  END IF;

  -- Genera quote_number progressivo per anno
  SELECT COUNT(*) + 1 INTO v_seq
  FROM public.quotes
  WHERE company_id = p_company_id
    AND quote_number LIKE 'PREV-' || v_year || '-%';

  v_quote_number := 'PREV-' || v_year || '-' || LPAD(v_seq::text, 4, '0');

  -- Calcola subtotal/vat/total dai items
  IF jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_line_total := COALESCE((v_item->>'quantity')::numeric, 1)
                      * COALESCE((v_item->>'unit_price')::numeric, 0);
      v_item_vat_rate := COALESCE((v_item->>'vat_rate')::numeric, p_default_vat_rate);
      v_subtotal := v_subtotal + v_line_total;
      v_vat_amount := v_vat_amount + (v_line_total * v_item_vat_rate / 100.0);
      v_items_count := v_items_count + 1;
    END LOOP;
  END IF;

  v_total := v_subtotal + v_vat_amount;

  -- Insert quote
  INSERT INTO public.quotes (
    company_id, quote_number, status,
    client_name, client_email, client_phone, client_address,
    title, description, tipo_lavoro, indirizzo_lavori,
    subtotal, vat_amount, total,
    validity_days, expires_at,
    internal_notes, created_by
  ) VALUES (
    p_company_id, v_quote_number, 'draft',
    p_client_name, p_client_email, p_client_phone, p_client_address,
    COALESCE(p_title, 'Preventivo per ' || p_client_name),
    p_description, p_tipo_lavoro, p_indirizzo_lavori,
    round(v_subtotal::numeric, 2), round(v_vat_amount::numeric, 2), round(v_total::numeric, 2),
    p_validity_days, (now() + (p_validity_days || ' days')::interval),
    p_internal_notes, p_user_id
  )
  RETURNING id INTO v_quote_id;

  -- Insert items
  IF jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
    INSERT INTO public.quote_items (
      quote_id, company_id, item_type, name, description,
      quantity, unit_price, unit_of_measure, vat_rate, line_total, sort_order
    )
    SELECT
      v_quote_id,
      p_company_id,
      COALESCE(item->>'item_type', 'material'),
      item->>'name',
      item->>'description',
      COALESCE((item->>'quantity')::numeric, 1),
      COALESCE((item->>'unit_price')::numeric, 0),
      item->>'unit_of_measure',
      COALESCE((item->>'vat_rate')::numeric, p_default_vat_rate),
      ROUND((COALESCE((item->>'quantity')::numeric, 1)
        * COALESCE((item->>'unit_price')::numeric, 0))::numeric, 2),
      (ord - 1)
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS arr(item, ord);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'quote_id', v_quote_id,
    'quote_number', v_quote_number,
    'status', 'draft',
    'client_name', p_client_name,
    'subtotal_eur', round(v_subtotal::numeric, 2),
    'vat_eur', round(v_vat_amount::numeric, 2),
    'total_eur', round(v_total::numeric, 2),
    'items_count', v_items_count,
    'message', format('Bozza preventivo %s creata per %s — totale € %s. Apri /azienda/preventivi/%s per modificarlo o inviarlo.',
                      v_quote_number, p_client_name,
                      to_char(v_total, 'FM999G999D90'), v_quote_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_create_quote_draft(uuid, uuid, text, text, text, text, text, text, text, text, jsonb, int, numeric, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_create_quote_draft(uuid, uuid, text, text, text, text, text, text, text, text, jsonb, int, numeric, text) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) silvio_create_invoice_draft — registra fattura (stub, integrazione SDI futura)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_create_invoice_draft(
  p_company_id uuid,
  p_user_id uuid,
  p_order_id uuid,
  p_rata_type text,        -- 'acconto' | 'acconto_2' | 'saldo' | 'finanziamento'
  p_amount numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_amount numeric;
  v_label text;
  v_installment_id uuid;
BEGIN
  SELECT id, company_id, order_code, client_name, client_company, total_amount,
         deposit_amount, balance_amount, deposit_2_amount, financing_amount,
         deposit_paid, deposit_2_paid, balance_paid, financing_paid
  INTO v_order
  FROM public.orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordine non trovato' USING ERRCODE = '22023';
  END IF;
  IF v_order.company_id <> p_company_id THEN
    RAISE EXCEPTION 'Ordine non autorizzato' USING ERRCODE = '42501';
  END IF;

  -- Determina importo da rata_type
  v_amount := COALESCE(p_amount, CASE p_rata_type
    WHEN 'acconto'        THEN v_order.deposit_amount
    WHEN 'acconto_2'      THEN v_order.deposit_2_amount
    WHEN 'saldo'          THEN v_order.balance_amount
    WHEN 'finanziamento'  THEN v_order.financing_amount
    ELSE NULL
  END);

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Importo non determinabile per rata_type=%', p_rata_type USING ERRCODE = '22023';
  END IF;

  v_label := CASE p_rata_type
    WHEN 'acconto' THEN 'Fattura acconto'
    WHEN 'acconto_2' THEN 'Fattura acconto 2'
    WHEN 'saldo' THEN 'Fattura saldo'
    WHEN 'finanziamento' THEN 'Fattura finanziamento'
    ELSE 'Fattura ' || p_rata_type
  END;

  -- Crea installment record (modello rate)
  INSERT INTO public.order_installments (
    order_id, label, type, amount, expected_date, position
  ) VALUES (
    p_order_id, v_label, p_rata_type, v_amount, CURRENT_DATE,
    COALESCE((SELECT MAX(position) + 1 FROM public.order_installments WHERE order_id = p_order_id), 1)
  )
  RETURNING id INTO v_installment_id;

  RETURN jsonb_build_object(
    'success', true,
    'installment_id', v_installment_id,
    'order_code', v_order.order_code,
    'cliente', COALESCE(v_order.client_name, v_order.client_company),
    'rata_type', p_rata_type,
    'amount_eur', round(v_amount::numeric, 2),
    'message', format('Riga fattura %s da € %s creata su ordine %s. Apri commessa per emetterla via SDI.',
                      v_label, to_char(v_amount, 'FM999G999D90'), v_order.order_code)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_create_invoice_draft(uuid, uuid, uuid, text, numeric, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_create_invoice_draft(uuid, uuid, uuid, text, numeric, text) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) silvio_get_quote_for_review — restituisce bozza quote per UI
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_get_quote_for_review(p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote jsonb;
  v_items jsonb;
BEGIN
  SELECT to_jsonb(q) INTO v_quote
  FROM public.quotes q
  WHERE q.id = p_quote_id
    AND q.company_id = public.get_my_company_id();

  IF v_quote IS NULL THEN
    RETURN jsonb_build_object('error', 'quote_not_found_or_unauthorized');
  END IF;

  SELECT jsonb_agg(to_jsonb(qi) ORDER BY qi.sort_order) INTO v_items
  FROM public.quote_items qi
  WHERE qi.quote_id = p_quote_id;

  RETURN jsonb_build_object(
    'quote', v_quote,
    'items', COALESCE(v_items, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_get_quote_for_review(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_get_quote_for_review(uuid) TO authenticated, service_role;
