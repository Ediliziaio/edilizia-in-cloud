-- 3. Tabella per preferenze alert scadenze
CREATE TABLE IF NOT EXISTS public.scadenza_alert_prefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_enabled BOOLEAN DEFAULT true,
  default_alert_days INTEGER DEFAULT 7,
  alert_email TEXT,
  alert_on_overdue BOOLEAN DEFAULT true,
  alert_on_upcoming BOOLEAN DEFAULT true,
  auto_generate_from_invoices BOOLEAN DEFAULT true,
  auto_reconcile_payments BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id)
);
