-- supabase/migrations/20260820000002_mrr_monthly_snapshot.sql
-- Tabella storico MRR mensile per calcolo forecast

CREATE TABLE IF NOT EXISTS public.mrr_monthly_snapshot (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year_month DATE NOT NULL, -- primo giorno del mese: 2025-01-01
  mrr_eur NUMERIC(12,2) NOT NULL, -- MRR in Euro quel mese
  active_subscriptions INTEGER NOT NULL DEFAULT 0,
  churn_rate NUMERIC(5,4), -- opzionale: tasso churn mensile
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(year_month)
);

ALTER TABLE public.mrr_monthly_snapshot ENABLE ROW LEVEL SECURITY;

-- Solo superadmin può leggere (gestito via edge function con service_role)
-- RLS deny-all per client normale
CREATE POLICY "deny_all_mrr_snapshot" ON public.mrr_monthly_snapshot
  FOR ALL USING (false);

-- Indice per query temporali
CREATE INDEX idx_mrr_snapshot_month ON public.mrr_monthly_snapshot(year_month DESC);
