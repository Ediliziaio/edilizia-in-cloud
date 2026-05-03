ALTER TABLE public.order_errors
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'aperta',
  ADD COLUMN IF NOT EXISTS detailed_cause TEXT,
  ADD COLUMN IF NOT EXISTS process_origin TEXT,
  ADD COLUMN IF NOT EXISTS verify_role TEXT,
  ADD COLUMN IF NOT EXISTS corrective_action TEXT,
  ADD COLUMN IF NOT EXISTS corrective_due_date DATE,
  ADD COLUMN IF NOT EXISTS confirmed_responsibility_kind TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_responsibility_id TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_responsibility_name TEXT,
  ADD COLUMN IF NOT EXISTS ai_cause_summary TEXT,
  ADD COLUMN IF NOT EXISTS ai_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_errors_review_status_check'
  ) THEN
    ALTER TABLE public.order_errors
      ADD CONSTRAINT order_errors_review_status_check
      CHECK (review_status IN ('aperta', 'in_verifica', 'assegnata', 'risolta', 'non_imputabile'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_errors_company_status
  ON public.order_errors(company_id, review_status);

CREATE INDEX IF NOT EXISTS idx_order_errors_company_detailed_cause
  ON public.order_errors(company_id, detailed_cause);

CREATE INDEX IF NOT EXISTS idx_order_errors_company_confirmed_responsibility
  ON public.order_errors(company_id, confirmed_responsibility_kind, confirmed_responsibility_id);
