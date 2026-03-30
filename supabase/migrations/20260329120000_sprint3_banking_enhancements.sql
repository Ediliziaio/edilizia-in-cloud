-- Sprint 3: Banking enhancements
-- 3.1 Prima Nota: link a bank_transaction_id
-- 3.3 Alert finanziari configurabili
-- 3.2 Cash flow forecast RPC

-- ============================================================
-- 3.1 — Prima Nota: collegamento a transazioni bancarie
-- ============================================================
ALTER TABLE public.prima_nota_entries
  ADD COLUMN IF NOT EXISTS bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prima_nota_bank_tx
  ON public.prima_nota_entries(bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL;

-- ============================================================
-- 3.3 — Alert finanziari configurabili
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bank_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_type text NOT NULL CHECK (rule_type IN ('balance_below', 'large_debit', 'unreconciled_days', 'connection_expiring')),
  threshold numeric,
  days_threshold integer,
  is_active boolean NOT NULL DEFAULT true,
  notify_email boolean DEFAULT true,
  notify_inapp boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_alert_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_alert_rules_tenant" ON public.bank_alert_rules;
CREATE POLICY "bank_alert_rules_tenant" ON public.bank_alert_rules
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_bank_alert_rules_company
  ON public.bank_alert_rules(company_id);

-- ============================================================
-- 3.2 — Cash flow forecast RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_cash_flow_forecast(
  p_company_id uuid,
  p_days int DEFAULT 90
)
RETURNS TABLE (
  current_balance numeric,
  expected_income numeric,
  expected_expenses numeric,
  forecasted_balance numeric,
  income_details jsonb,
  expense_details jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance numeric;
  v_expected_income numeric;
  v_expected_expenses numeric;
  v_income_details jsonb;
  v_expense_details jsonb;
BEGIN
  -- Saldo attuale (somma saldi conti attivi)
  SELECT COALESCE(SUM(ba.current_balance), 0)
  INTO v_current_balance
  FROM public.bank_accounts ba
  JOIN public.bank_connections bc ON bc.id = ba.connection_id
  WHERE ba.company_id = p_company_id
    AND ba.is_active = true
    AND bc.status = 'active';

  -- Entrate attese: fatture emesse non pagate con scadenza nei prossimi p_days giorni
  SELECT
    COALESCE(SUM(i.total - COALESCE(i.paid_amount, 0)), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'invoice_number', i.invoice_number,
      'client', i.client_company_name,
      'amount', i.total - COALESCE(i.paid_amount, 0),
      'due_date', i.due_date
    )), '[]'::jsonb)
  INTO v_expected_income, v_income_details
  FROM public.invoices i
  WHERE i.company_id = p_company_id
    AND i.status NOT IN ('paid', 'cancelled', 'draft')
    AND i.type = 'invoice'
    AND (i.total - COALESCE(i.paid_amount, 0)) > 0
    AND i.due_date <= CURRENT_DATE + (p_days || ' days')::interval;

  -- Uscite previste: scadenze passive nei prossimi p_days giorni
  SELECT
    COALESCE(SUM(s.importo), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'description', s.descrizione,
      'amount', s.importo,
      'due_date', s.data_scadenza,
      'type', s.tipo
    )), '[]'::jsonb)
  INTO v_expected_expenses, v_expense_details
  FROM public.scadenze s
  WHERE s.company_id = p_company_id
    AND s.stato != 'pagata'
    AND s.data_scadenza <= CURRENT_DATE + (p_days || ' days')::interval;

  RETURN QUERY SELECT
    v_current_balance,
    v_expected_income,
    v_expected_expenses,
    v_current_balance + v_expected_income - v_expected_expenses,
    v_income_details,
    v_expense_details;
END;
$$;
