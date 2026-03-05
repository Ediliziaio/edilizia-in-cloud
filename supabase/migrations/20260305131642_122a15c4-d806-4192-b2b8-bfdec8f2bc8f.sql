
-- =============================================================
-- order_installments: rate di pagamento dinamiche (N rate per ordine)
-- =============================================================

-- 1. Tabella order_installments
CREATE TABLE public.order_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'deposit',
  amount NUMERIC NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_date DATE,
  expected_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_installments_type_check CHECK (type IN ('deposit', 'balance', 'financing'))
);

-- Index per query frequenti
CREATE INDEX idx_order_installments_order_id ON public.order_installments(order_id);

-- 2. RLS
ALTER TABLE public.order_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage installments for their company orders"
ON public.order_installments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.profiles p ON p.company_id = o.company_id
    WHERE o.id = order_installments.order_id
    AND p.id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.profiles p ON p.company_id = o.company_id
    WHERE o.id = order_installments.order_id
    AND p.id = auth.uid()
  )
);

-- Super admin bypass
CREATE POLICY "Super admins can manage all installments"
ON public.order_installments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 3. Trigger di sincronizzazione: installments → colonne legacy su orders
CREATE OR REPLACE FUNCTION public.sync_installments_to_order_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_dep1_amount NUMERIC := 0;
  v_dep1_paid BOOLEAN := false;
  v_dep1_paid_date DATE;
  v_dep1_expected_date DATE;
  v_dep2_amount NUMERIC := 0;
  v_dep2_paid BOOLEAN := false;
  v_dep2_paid_date DATE;
  v_dep2_expected_date DATE;
  v_bal_amount NUMERIC := 0;
  v_bal_paid BOOLEAN := false;
  v_bal_paid_date DATE;
  v_bal_expected_date DATE;
  v_fin_amount NUMERIC := 0;
  v_fin_paid BOOLEAN := false;
  v_fin_paid_date DATE;
  v_fin_expected_date DATE;
  v_rec RECORD;
  v_dep_idx INTEGER := 0;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);

  -- Iterate deposits in position order
  FOR v_rec IN
    SELECT amount, is_paid, paid_date, expected_date
    FROM public.order_installments
    WHERE order_id = v_order_id AND type = 'deposit'
    ORDER BY position
  LOOP
    IF v_dep_idx = 0 THEN
      v_dep1_amount := v_rec.amount;
      v_dep1_paid := v_rec.is_paid;
      v_dep1_paid_date := v_rec.paid_date;
      v_dep1_expected_date := v_rec.expected_date;
    ELSIF v_dep_idx = 1 THEN
      v_dep2_amount := v_rec.amount;
      v_dep2_paid := v_rec.is_paid;
      v_dep2_paid_date := v_rec.paid_date;
      v_dep2_expected_date := v_rec.expected_date;
    END IF;
    v_dep_idx := v_dep_idx + 1;
  END LOOP;

  -- Balance
  SELECT amount, is_paid, paid_date, expected_date
  INTO v_bal_amount, v_bal_paid, v_bal_paid_date, v_bal_expected_date
  FROM public.order_installments
  WHERE order_id = v_order_id AND type = 'balance'
  ORDER BY position LIMIT 1;

  -- Financing
  SELECT amount, is_paid, paid_date, expected_date
  INTO v_fin_amount, v_fin_paid, v_fin_paid_date, v_fin_expected_date
  FROM public.order_installments
  WHERE order_id = v_order_id AND type = 'financing'
  ORDER BY position LIMIT 1;

  -- Update legacy columns
  UPDATE public.orders SET
    deposit_amount = COALESCE(v_dep1_amount, 0),
    deposit_paid = COALESCE(v_dep1_paid, false),
    deposit_paid_date = v_dep1_paid_date,
    deposit_expected_date = v_dep1_expected_date,
    deposit_2_amount = COALESCE(v_dep2_amount, 0),
    deposit_2_paid = COALESCE(v_dep2_paid, false),
    deposit_2_paid_date = v_dep2_paid_date,
    deposit_2_expected_date = v_dep2_expected_date,
    balance_amount = COALESCE(v_bal_amount, 0),
    balance_paid = COALESCE(v_bal_paid, false),
    balance_paid_date = v_bal_paid_date,
    balance_expected_date = v_bal_expected_date,
    financing_amount = COALESCE(v_fin_amount, 0),
    financing_paid = COALESCE(v_fin_paid, false),
    financing_paid_date = v_fin_paid_date,
    financing_expected_date = v_fin_expected_date
  WHERE id = v_order_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_installments_to_orders
AFTER INSERT OR UPDATE OR DELETE ON public.order_installments
FOR EACH ROW
EXECUTE FUNCTION public.sync_installments_to_order_columns();

-- 4. Aggiorna create_order_atomic per supportare installments
DROP FUNCTION IF EXISTS public.create_order_atomic(jsonb, jsonb, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_order_data  JSONB,
  p_items       JSONB    DEFAULT '[]'::jsonb,
  p_salesperson JSONB    DEFAULT NULL,
  p_user_id     UUID     DEFAULT NULL,
  p_installments JSONB   DEFAULT '[]'::jsonb
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
  v_inst              JSONB;
BEGIN
  v_caller_id  := COALESCE(p_user_id, auth.uid());
  v_company_id := (p_order_data->>'company_id')::uuid;

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'create_order_atomic: utente non autenticato';
  END IF;

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

  v_total_amount := COALESCE((p_order_data->>'total_amount')::numeric, 0);

  INSERT INTO public.orders (
    company_id, customer_id, order_code, description,
    total_amount, deposit_amount, deposit_2_amount, financing_amount,
    payment_type, balance_amount, expected_date, internal_notes,
    current_status_id, vat_rate, warehouse_arrival_date,
    work_start_date, work_end_date,
    deposit_paid, deposit_paid_date,
    deposit_2_paid, deposit_2_paid_date,
    balance_paid, balance_paid_date,
    balance_expected_date, deposit_expected_date, deposit_2_expected_date,
    financing_paid, financing_paid_date, financing_expected_date,
    financing_cost, has_building_bonus, assigned_to
  ) VALUES (
    v_company_id,
    (p_order_data->>'customer_id')::uuid,
    NULLIF(TRIM(p_order_data->>'order_code'), ''),
    p_order_data->>'description',
    v_total_amount,
    COALESCE((p_order_data->>'deposit_amount')::numeric, 0),
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
    COALESCE((p_order_data->>'has_building_bonus')::boolean, false),
    NULLIF(p_order_data->>'assigned_to', '')::uuid
  )
  RETURNING id INTO v_order_id;

  -- Status history
  INSERT INTO public.order_status_history (order_id, status_id, changed_by)
  VALUES (v_order_id, (p_order_data->>'current_status_id')::uuid, v_caller_id);

  -- Order items + stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_stock_item_id := NULLIF(v_item->>'stock_item_id', '')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::integer, 1);

    INSERT INTO public.order_items (
      order_id, name, description, quantity, status, position,
      supplier_id, purchase_price, vat_rate, stock_item_id,
      unit_price, discount_percent, standard_cost,
      is_paid, paid_date, payment_method,
      deposit_amount, deposit_paid, deposit_paid_date,
      balance_amount, balance_paid, balance_paid_date,
      balance_expected_date, deposit_expected_date
    ) VALUES (
      v_order_id, v_item->>'name', NULLIF(v_item->>'description', ''),
      v_qty, COALESCE(v_item->>'status', 'da_ordinare'),
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

    IF v_stock_item_id IS NOT NULL THEN
      UPDATE public.warehouse_stock
      SET quantity = GREATEST(0, quantity - v_qty)
      WHERE id = v_stock_item_id;

      INSERT INTO public.warehouse_movements (
        stock_item_id, order_item_id, movement_type, quantity, notes, performed_by
      ) VALUES (
        v_stock_item_id, v_item_id, 'scarico', v_qty,
        'Prelievo automatico per ordine ' ||
          COALESCE(NULLIF(TRIM(p_order_data->>'order_code'), ''), LEFT(v_order_id::text, 8)),
        v_caller_id
      );
    END IF;
  END LOOP;

  -- Installments
  IF p_installments IS NOT NULL AND jsonb_array_length(p_installments) > 0 THEN
    FOR v_inst IN SELECT * FROM jsonb_array_elements(p_installments)
    LOOP
      INSERT INTO public.order_installments (
        order_id, position, label, type, amount, is_paid, paid_date, expected_date
      ) VALUES (
        v_order_id,
        COALESCE((v_inst->>'position')::integer, 0),
        COALESCE(v_inst->>'label', ''),
        COALESCE(v_inst->>'type', 'deposit'),
        COALESCE((v_inst->>'amount')::numeric, 0),
        COALESCE((v_inst->>'is_paid')::boolean, false),
        NULLIF(v_inst->>'paid_date', '')::date,
        NULLIF(v_inst->>'expected_date', '')::date
      );
    END LOOP;
  END IF;

  -- Salesperson
  IF p_salesperson IS NOT NULL AND (p_salesperson->>'salesperson_id') IS NOT NULL THEN
    v_commission_type  := p_salesperson->>'commission_type';
    v_commission_value := COALESCE((p_salesperson->>'commission_value')::numeric, 0);
    IF v_commission_type = 'fixed' THEN
      v_commission_amount := v_commission_value;
    ELSE
      v_commission_amount := v_total_amount * (v_commission_value / 100);
    END IF;

    INSERT INTO public.order_salespeople (
      order_id, salesperson_id, commission_type, commission_value, commission_amount
    ) VALUES (
      v_order_id,
      (p_salesperson->>'salesperson_id')::uuid,
      v_commission_type, v_commission_value, v_commission_amount
    );
  END IF;

  RETURN jsonb_build_object('id', v_order_id, 'success', true);

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'create_order_atomic failed: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb, jsonb, jsonb, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(jsonb, jsonb, jsonb, uuid, jsonb) TO authenticated;
