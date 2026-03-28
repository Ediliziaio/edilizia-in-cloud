-- =============================================
-- STEP 2: ALTER Suppliers + Purchase Orders + OdA
-- =============================================

-- 2A. ALTER SUPPLIERS — aggiungere campi operativi
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS iban TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
