-- 3. AI Credit Topups (storico ricariche)
CREATE TABLE IF NOT EXISTS public.ai_credit_topups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id),
  amount_eur      DECIMAL(10,4) NOT NULL,
  type            TEXT NOT NULL DEFAULT 'manual',
  status          TEXT NOT NULL DEFAULT 'pending',
  payment_method  TEXT,
  payment_ref     TEXT,
  invoice_number  TEXT,
  notes           TEXT,
  triggered_by    UUID,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
