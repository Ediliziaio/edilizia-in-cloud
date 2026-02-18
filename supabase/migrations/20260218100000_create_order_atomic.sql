-- =============================================================
-- Funzione atomica per la creazione di un ordine completo
--
-- Problema attuale in CreateOrder.tsx:
--   - 1 INSERT orders
--   - 1 INSERT order_status_history
--   - 1 INSERT order_items (bulk)
--   - Per ogni articolo con stock: SELECT qty → UPDATE stock → INSERT movement
--     ↳ Race condition: due ordini simultanei leggono lo stesso qty e
--       decrementano entrambi da quel valore (lo stock finale è sbagliato)
--     ↳ N+1 queries: 100 articoli = 300 richieste separate
--   - 1 INSERT order_salespeople (opzionale)
-- → Se un passaggio fallisce dopo che altri sono già stati eseguiti,
--   l'ordine rimane in stato inconsistente.
--
-- Soluzione: una funzione PL/pgSQL SECURITY DEFINER che:
--   1. Verifica che l'utente appartenga all'azienda (o sia super_admin)
--   2. Esegue TUTTO in una singola transazione PostgreSQL
--   3. Decrementa lo stock con UPDATE atomico (no SELECT+UPDATE)
--   4. Ritorna l'ID dell'ordine creato
--
-- Chiamata lato frontend:
--   supabase.rpc('create_order_atomic', { p_order_data, p_items, p_salesperson, p_user_id })
-- =============================================================

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_order_data  JSONB,
  p_items       JSONB    DEFAULT '[]'::jsonb,
  p_salesperson JSONB    DEFAULT NULL,
  p_user_id     UUID     DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id          UUID;
  v_company_id        UUID;
  v_caller_id         UUID;
  v_item              JSONB;
  v_item_id           UUID;
  v_stock_item_id     UUID;
  v_qty               INTEGER;
  v_commission_type   TEXT;
  v_commission_value  NUMERIC;
  v_commission_amount NUMERIC;
  v_total_amount      NUMERIC;
BEGIN
  -- ── 0. Recupera l'utente chiamante ──────────────────────────────────
  v_caller_id  := COALESCE(p_user_id, auth.uid());
  v_company_id := (p_order_data->>'company_id')::uuid;

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'create_order_atomic: utente non autenticato';
  END IF;

  -- ── 1. Verifica permessi: deve appartenere all'azienda o essere super_admin ──
  IF NOT (
    has_role(v_caller_id, 'super_admin'::app_role)
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_caller_id AND company_id = v_company_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'create_order_atomic: non autorizzato per la company %', v_company_id;
  END IF;

  -- ── 2. Crea l'ordine ─────────────────────────────────────────────────
  v_total_amount := COALESCE((p_order_data->>'total_amount')::numeric, 0);

  INSERT INTO public.orders (
    company_id,
    customer_id,
    order_code,
    description,
    total_amount,
    deposit_amount,
    deposit_2_amount,
    financing_amount,
    payment_type,
    balance_amount,
    expected_date,
    internal_notes,
    current_status_id,
    vat_rate,
    warehouse_arrival_date,
    work_start_date,
    work_end_date,
    deposit_paid,
    deposit_paid_date,
    deposit_2_paid,
    deposit_2_paid_date,
    balance_paid,
    balance_paid_date,
    balance_expected_date,
    deposit_expected_date,
    deposit_2_expected_date,
    financing_paid,
    financing_paid_date,
    financing_expected_date,
    financing_cost,
    has_building_bonus
  ) VALUES (
    v_company_id,
    (p_order_data->>'customer_id')::uuid,
    NULLIF(TRIM(p_order_data->>'order_code'), ''),
    p_order_data->>'description',
    v_total_amount,
    COALESCE((p_order_data->>'deposit_amount')::numeric,  0),
    COALESCE((p_order_data->>'deposit_2_amount')::numeric, 0),
    COALESCE((p_order_data->>'financing_amount')::numeric, 0),
    COALESCE(p_order_data->>'payment_type', 'standard'),
    COALESCE((p_order_data->>'balance_amount')::numeric, 0),
    (p_order_data->>'expected_date')::date,
    NULLIF(p_order_data->>'internal_notes', ''),
    (p_order_data->>'current_status_id')::uuid,
    COALESCE((p_order_data->>'vat_rate')::numeric, 22),
    (p_order_data->>'warehouse_arrival_date')::date,
    (p_order_data->>'work_start_date')::date,
    (p_order_data->>'work_end_date')::date,
    COALESCE((p_order_data->>'deposit_paid')::boolean, false),
    (p_order_data->>'deposit_paid_date')::date,
    COALESCE((p_order_data->>'deposit_2_paid')::boolean, false),
    (p_order_data->>'deposit_2_paid_date')::date,
    COALESCE((p_order_data->>'balance_paid')::boolean, false),
    (p_order_data->>'balance_paid_date')::date,
    (p_order_data->>'balance_expected_date')::date,
    (p_order_data->>'deposit_expected_date')::date,
    (p_order_data->>'deposit_2_expected_date')::date,
    COALESCE((p_order_data->>'financing_paid')::boolean, false),
    (p_order_data->>'financing_paid_date')::date,
    (p_order_data->>'financing_expected_date')::date,
    COALESCE((p_order_data->>'financing_cost')::numeric, 0),
    COALESCE((p_order_data->>'has_building_bonus')::boolean, false)
  )
  RETURNING id INTO v_order_id;

  -- ── 3. Storico stato iniziale ─────────────────────────────────────────
  INSERT INTO public.order_status_history (
    order_id,
    status_id,
    changed_by
  ) VALUES (
    v_order_id,
    (p_order_data->>'current_status_id')::uuid,
    v_caller_id
  );

  -- ── 4. Articoli ordine + scarico magazzino atomico ────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_stock_item_id := NULLIF(v_item->>'stock_item_id', '')::uuid;
    v_qty           := COALESCE((v_item->>'quantity')::integer, 1);

    -- Inserisci l'articolo
    INSERT INTO public.order_items (
      order_id,
      name,
      description,
      quantity,
      status,
      position,
      supplier_id,
      purchase_price,
      vat_rate,
      stock_item_id,
      unit_price,
      discount_percent,
      standard_cost,
      is_paid,
      paid_date,
      payment_method,
      deposit_amount,
      deposit_paid,
      deposit_paid_date,
      balance_amount,
      balance_paid,
      balance_paid_date,
      balance_expected_date,
      deposit_expected_date
    ) VALUES (
      v_order_id,
      v_item->>'name',
      NULLIF(v_item->>'description', ''),
      v_qty,
      COALESCE(v_item->>'status', 'da_ordinare'),
      COALESCE((v_item->>'position')::integer, 0),
      NULLIF(v_item->>'supplier_id', '')::uuid,
      COALESCE((v_item->>'purchase_price')::numeric, 0),
      COALESCE((v_item->>'vat_rate')::numeric, 22),
      v_stock_item_id,
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'discount_percent')::numeric, 0),
      COALESCE((v_item->>'standard_cost')::numeric, 0),
      COALESCE((v_item->>'is_paid')::boolean, false),
      NULLIF(v_item->>'paid_date', '')::date,
      NULLIF(v_item->>'payment_method', ''),
      COALESCE((v_item->>'deposit_amount')::numeric, 0),
      COALESCE((v_item->>'deposit_paid')::boolean, false),
      NULLIF(v_item->>'deposit_paid_date', '')::date,
      COALESCE((v_item->>'balance_amount')::numeric, 0),
      COALESCE((v_item->>'balance_paid')::boolean, false),
      NULLIF(v_item->>'balance_paid_date', '')::date,
      NULLIF(v_item->>'balance_expected_date', '')::date,
      NULLIF(v_item->>'deposit_expected_date', '')::date
    )
    RETURNING id INTO v_item_id;

    -- Scarico magazzino atomico (no race condition):
    -- UPDATE in un'unica operazione — nessuna SELECT separata
    IF v_stock_item_id IS NOT NULL THEN
      UPDATE public.warehouse_stock
      SET quantity = GREATEST(0, quantity - v_qty)
      WHERE id = v_stock_item_id;

      INSERT INTO public.warehouse_movements (
        stock_item_id,
        order_item_id,
        movement_type,
        quantity,
        notes,
        performed_by
      ) VALUES (
        v_stock_item_id,
        v_item_id,
        'scarico',
        v_qty,
        'Prelievo automatico per ordine ' ||
          COALESCE(NULLIF(TRIM(p_order_data->>'order_code'), ''),
                   LEFT(v_order_id::text, 8)),
        v_caller_id
      );
    END IF;
  END LOOP;

  -- ── 5. Venditore (opzionale) ──────────────────────────────────────────
  IF p_salesperson IS NOT NULL
     AND (p_salesperson->>'salesperson_id') IS NOT NULL
  THEN
    v_commission_type  := p_salesperson->>'commission_type';
    v_commission_value := COALESCE((p_salesperson->>'commission_value')::numeric, 0);

    IF v_commission_type = 'fixed' THEN
      v_commission_amount := v_commission_value;
    ELSE
      -- percentage_sold / percentage_collected: calcolata sull'imponibile
      v_commission_amount := v_total_amount * (v_commission_value / 100);
    END IF;

    INSERT INTO public.order_salespeople (
      order_id,
      salesperson_id,
      commission_type,
      commission_value,
      commission_amount
    ) VALUES (
      v_order_id,
      (p_salesperson->>'salesperson_id')::uuid,
      v_commission_type,
      v_commission_value,
      v_commission_amount
    );
  END IF;

  -- ── 6. Ritorna l'ordine creato ────────────────────────────────────────
  RETURN jsonb_build_object(
    'id',      v_order_id,
    'success', true
  );

EXCEPTION WHEN OTHERS THEN
  -- Il rollback avviene automaticamente perché la transazione viene annullata
  RAISE EXCEPTION 'create_order_atomic failed: %', SQLERRM;
END;
$$;

-- Revoca accesso pubblico e concede solo agli utenti autenticati
REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb, jsonb, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(jsonb, jsonb, jsonb, uuid) TO authenticated;
