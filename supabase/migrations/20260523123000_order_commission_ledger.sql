-- Order commission ledger.
-- Append-style audit trail for base commissions, deductions and payment state changes.

CREATE TABLE IF NOT EXISTS public.order_commission_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_salesperson_id UUID NOT NULL REFERENCES public.order_salespeople(id) ON DELETE CASCADE,
  salesperson_id UUID NOT NULL REFERENCES public.salespeople(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (
    entry_type IN (
      'base',
      'base_adjustment',
      'deduction',
      'deduction_adjustment',
      'payment_marked',
      'payment_reopened',
      'payment_expected_updated',
      'rule_changed',
      'manual_bonus',
      'manual_malus',
      'manual_adjustment',
      'ai_adjustment',
      'system_note'
    )
  ),
  amount_delta NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_after NUMERIC(12,2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('system', 'manual', 'ai', 'import', 'payment')),
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_commission_ledger_company_date
  ON public.order_commission_ledger(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_commission_ledger_order
  ON public.order_commission_ledger(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_commission_ledger_order_salesperson
  ON public.order_commission_ledger(order_salesperson_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_commission_ledger_salesperson
  ON public.order_commission_ledger(salesperson_id, created_at DESC);

ALTER TABLE public.order_commission_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company admins can view order commission ledger" ON public.order_commission_ledger;
CREATE POLICY "Company admins can view order commission ledger"
ON public.order_commission_ledger FOR SELECT
USING (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND company_id = get_user_company_id(auth.uid())
);

DROP POLICY IF EXISTS "Staff can view order commission ledger if permitted" ON public.order_commission_ledger;
CREATE POLICY "Staff can view order commission ledger if permitted"
ON public.order_commission_ledger FOR SELECT
USING (
  has_permission(auth.uid(), 'can_view_orders'::text)
  AND company_id = get_user_company_id(auth.uid())
);

DROP POLICY IF EXISTS "Salespeople can view their order commission ledger" ON public.order_commission_ledger;
CREATE POLICY "Salespeople can view their order commission ledger"
ON public.order_commission_ledger FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.salespeople s
    WHERE s.id = order_commission_ledger.salesperson_id
      AND s.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Super admins can view order commission ledger" ON public.order_commission_ledger;
CREATE POLICY "Super admins can view order commission ledger"
ON public.order_commission_ledger FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

GRANT SELECT ON public.order_commission_ledger TO authenticated;

CREATE OR REPLACE FUNCTION public.add_order_commission_ledger_entry(
  p_order_salesperson_id UUID,
  p_entry_type TEXT,
  p_amount_delta NUMERIC DEFAULT 0,
  p_description TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'system',
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_effective_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record RECORD;
  v_balance_after NUMERIC;
  v_ledger_id UUID;
BEGIN
  SELECT
    os.id AS order_salesperson_id,
    os.order_id,
    os.salesperson_id,
    o.company_id
  INTO v_record
  FROM public.order_salespeople os
  JOIN public.orders o ON o.id = os.order_id
  WHERE os.id = p_order_salesperson_id;

  IF v_record.order_salesperson_id IS NULL THEN
    RAISE EXCEPTION 'order_salesperson_not_found';
  END IF;

  SELECT COALESCE(SUM(amount_delta), 0) + COALESCE(p_amount_delta, 0)
  INTO v_balance_after
  FROM public.order_commission_ledger
  WHERE order_salesperson_id = p_order_salesperson_id;

  INSERT INTO public.order_commission_ledger (
    company_id,
    order_id,
    order_salesperson_id,
    salesperson_id,
    entry_type,
    amount_delta,
    balance_after,
    source,
    description,
    metadata,
    effective_date,
    created_by
  )
  VALUES (
    v_record.company_id,
    v_record.order_id,
    v_record.order_salesperson_id,
    v_record.salesperson_id,
    p_entry_type,
    ROUND(COALESCE(p_amount_delta, 0), 2),
    ROUND(COALESCE(v_balance_after, 0), 2),
    COALESCE(p_source, 'system'),
    p_description,
    COALESCE(p_metadata, '{}'::jsonb),
    COALESCE(p_effective_date, CURRENT_DATE),
    auth.uid()
  )
  RETURNING id INTO v_ledger_id;

  RETURN v_ledger_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_order_commission_ledger_entry(UUID, TEXT, NUMERIC, TEXT, TEXT, JSONB, DATE) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.log_order_salesperson_commission_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.commission_amount, 0) <> 0 THEN
      PERFORM public.add_order_commission_ledger_entry(
        NEW.id,
        'base',
        COALESCE(NEW.commission_amount, 0),
        'Provvigione base calcolata',
        'system',
        jsonb_build_object(
          'commission_type', NEW.commission_type,
          'commission_value', NEW.commission_value
        ),
        CURRENT_DATE
      );
    END IF;

    IF COALESCE(NEW.deduction_amount, 0) <> 0 THEN
      PERFORM public.add_order_commission_ledger_entry(
        NEW.id,
        'deduction',
        -COALESCE(NEW.deduction_amount, 0),
        'Decurtazione iniziale',
        'manual',
        '{}'::jsonb,
        CURRENT_DATE
      );
    END IF;

    IF COALESCE(NEW.is_paid, false) = true THEN
      PERFORM public.add_order_commission_ledger_entry(
        NEW.id,
        'payment_marked',
        0,
        'Provvigione segnata come pagata',
        'payment',
        jsonb_build_object('paid_date', NEW.paid_date),
        COALESCE(NEW.paid_date, CURRENT_DATE)
      );
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.commission_type IS DISTINCT FROM OLD.commission_type
     OR NEW.commission_value IS DISTINCT FROM OLD.commission_value THEN
    PERFORM public.add_order_commission_ledger_entry(
      NEW.id,
      'rule_changed',
      0,
      'Regola provvigionale modificata',
      'manual',
      jsonb_build_object(
        'old_commission_type', OLD.commission_type,
        'new_commission_type', NEW.commission_type,
        'old_commission_value', OLD.commission_value,
        'new_commission_value', NEW.commission_value
      ),
      CURRENT_DATE
    );
  END IF;

  IF NEW.commission_amount IS DISTINCT FROM OLD.commission_amount THEN
    v_delta := COALESCE(NEW.commission_amount, 0) - COALESCE(OLD.commission_amount, 0);
    IF v_delta <> 0 THEN
      PERFORM public.add_order_commission_ledger_entry(
        NEW.id,
        'base_adjustment',
        v_delta,
        'Ricalcolo provvigione base',
        'system',
        jsonb_build_object(
          'old_commission_amount', OLD.commission_amount,
          'new_commission_amount', NEW.commission_amount
        ),
        CURRENT_DATE
      );
    END IF;
  END IF;

  IF NEW.deduction_amount IS DISTINCT FROM OLD.deduction_amount THEN
    v_delta := COALESCE(NEW.deduction_amount, 0) - COALESCE(OLD.deduction_amount, 0);
    IF v_delta <> 0 THEN
      PERFORM public.add_order_commission_ledger_entry(
        NEW.id,
        'deduction_adjustment',
        -v_delta,
        CASE WHEN v_delta > 0 THEN 'Decurtazione aumentata' ELSE 'Decurtazione ridotta' END,
        'manual',
        jsonb_build_object(
          'old_deduction_amount', OLD.deduction_amount,
          'new_deduction_amount', NEW.deduction_amount
        ),
        CURRENT_DATE
      );
    END IF;
  END IF;

  IF NEW.is_paid IS DISTINCT FROM OLD.is_paid
     OR NEW.paid_date IS DISTINCT FROM OLD.paid_date THEN
    PERFORM public.add_order_commission_ledger_entry(
      NEW.id,
      CASE WHEN COALESCE(NEW.is_paid, false) THEN 'payment_marked' ELSE 'payment_reopened' END,
      0,
      CASE WHEN COALESCE(NEW.is_paid, false) THEN 'Provvigione segnata come pagata' ELSE 'Pagamento provvigione riaperto' END,
      'payment',
      jsonb_build_object(
        'old_paid_date', OLD.paid_date,
        'new_paid_date', NEW.paid_date
      ),
      COALESCE(NEW.paid_date, CURRENT_DATE)
    );
  END IF;

  IF NEW.payment_expected_date IS DISTINCT FROM OLD.payment_expected_date THEN
    PERFORM public.add_order_commission_ledger_entry(
      NEW.id,
      'payment_expected_updated',
      0,
      'Data pagamento prevista aggiornata',
      'manual',
      jsonb_build_object(
        'old_payment_expected_date', OLD.payment_expected_date,
        'new_payment_expected_date', NEW.payment_expected_date
      ),
      COALESCE(NEW.payment_expected_date, CURRENT_DATE)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_order_salesperson_commission_changes ON public.order_salespeople;
CREATE TRIGGER trg_log_order_salesperson_commission_changes
AFTER INSERT OR UPDATE OF commission_type, commission_value, commission_amount, deduction_amount, is_paid, paid_date, payment_expected_date
ON public.order_salespeople
FOR EACH ROW
EXECUTE FUNCTION public.log_order_salesperson_commission_changes();

INSERT INTO public.order_commission_ledger (
  company_id,
  order_id,
  order_salesperson_id,
  salesperson_id,
  entry_type,
  amount_delta,
  balance_after,
  source,
  description,
  metadata,
  effective_date,
  created_at
)
SELECT
  o.company_id,
  os.order_id,
  os.id,
  os.salesperson_id,
  'base',
  ROUND(COALESCE(os.commission_amount, 0), 2),
  ROUND(COALESCE(os.commission_amount, 0), 2),
  'system',
  'Provvigione base storica',
  jsonb_build_object(
    'commission_type', os.commission_type,
    'commission_value', os.commission_value,
    'backfill', true
  ),
  os.created_at::date,
  os.created_at
FROM public.order_salespeople os
JOIN public.orders o ON o.id = os.order_id
WHERE COALESCE(os.commission_amount, 0) <> 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.order_commission_ledger l
    WHERE l.order_salesperson_id = os.id
  );

INSERT INTO public.order_commission_ledger (
  company_id,
  order_id,
  order_salesperson_id,
  salesperson_id,
  entry_type,
  amount_delta,
  balance_after,
  source,
  description,
  metadata,
  effective_date,
  created_at
)
SELECT
  o.company_id,
  os.order_id,
  os.id,
  os.salesperson_id,
  'deduction',
  -ROUND(COALESCE(os.deduction_amount, 0), 2),
  ROUND(COALESCE(os.commission_amount, 0) - COALESCE(os.deduction_amount, 0), 2),
  'manual',
  'Decurtazione storica',
  jsonb_build_object('backfill', true),
  os.created_at::date,
  os.created_at + interval '1 second'
FROM public.order_salespeople os
JOIN public.orders o ON o.id = os.order_id
WHERE COALESCE(os.deduction_amount, 0) <> 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.order_commission_ledger l
    WHERE l.order_salesperson_id = os.id
      AND l.entry_type = 'deduction'
  );
