-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.credit_low_balance_alerts (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  wallet_type text NOT NULL CHECK (wallet_type IN ('ai', 'email', 'whatsapp', 'render')),
  alerted_at timestamptz NOT NULL DEFAULT now(),
  balance_at_alert numeric,
  threshold_at_alert numeric,
  PRIMARY KEY (company_id, wallet_type)
);

ALTER TABLE public.credit_low_balance_alerts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.credit_low_balance_alerts IS
  'Dedup avvisi email saldo-basso per wallet (cron credit-low-balance-alert).';
