-- Sprint 4: Advanced banking features

-- ============================================================
-- 4.3 — Multi-valuta: amount_eur per conversione
-- ============================================================
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS amount_eur numeric(15,2);

-- Per le transazioni esistenti in EUR, amount_eur = amount
UPDATE public.bank_transactions
  SET amount_eur = amount
  WHERE currency = 'EUR' AND amount_eur IS NULL;

COMMENT ON COLUMN public.bank_transactions.amount_eur
  IS 'Importo convertito in EUR al momento del sync (per transazioni non-EUR)';

-- ============================================================
-- 4.4 — Note spese integrate
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expense_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_name text,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'reimbursed')),
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text DEFAULT 'EUR',
  period_from date,
  period_to date,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_reports_tenant" ON public.expense_reports
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_expense_reports_company ON public.expense_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_expense_reports_employee ON public.expense_reports(employee_id);
CREATE INDEX IF NOT EXISTS idx_expense_reports_status ON public.expense_reports(status);

-- Righe nota spese
CREATE TABLE IF NOT EXISTS public.expense_report_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.expense_reports(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  description text NOT NULL,
  category text DEFAULT 'Trasferte',
  amount numeric(12,2) NOT NULL,
  currency text DEFAULT 'EUR',
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  receipt_url text,
  receipt_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_report_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_report_items_tenant" ON public.expense_report_items
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_expense_report_items_report ON public.expense_report_items(report_id);
CREATE INDEX IF NOT EXISTS idx_expense_report_items_tx ON public.expense_report_items(bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL;

-- Trigger per aggiornare total_amount
CREATE OR REPLACE FUNCTION public.update_expense_report_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.expense_reports
  SET total_amount = (
    SELECT COALESCE(SUM(amount), 0) FROM public.expense_report_items WHERE report_id = COALESCE(NEW.report_id, OLD.report_id)
  ),
  updated_at = now()
  WHERE id = COALESCE(NEW.report_id, OLD.report_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_expense_report_total ON public.expense_report_items;
CREATE TRIGGER trg_update_expense_report_total
  AFTER INSERT OR UPDATE OR DELETE ON public.expense_report_items
  FOR EACH ROW EXECUTE FUNCTION public.update_expense_report_total();
