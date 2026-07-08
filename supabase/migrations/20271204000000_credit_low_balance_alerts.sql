-- Stato degli avvisi "saldo crediti in esaurimento" (email al titolare).
-- Una riga per company+wallet: serve al cron credit-low-balance-alert per
-- non ri-avvisare ogni giorno (re-alert solo dopo 7 giorni, oppure dopo che
-- il saldo è risalito sopra soglia — in quel caso la riga viene eliminata
-- e il prossimo calo fa ripartire l'avviso).
CREATE TABLE IF NOT EXISTS public.credit_low_balance_alerts (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  wallet_type text NOT NULL CHECK (wallet_type IN ('ai', 'email', 'whatsapp', 'render')),
  alerted_at timestamptz NOT NULL DEFAULT now(),
  balance_at_alert numeric,
  threshold_at_alert numeric,
  PRIMARY KEY (company_id, wallet_type)
);

-- Solo il service role (edge function cron) legge/scrive: RLS attiva senza
-- policy = nessun accesso dai client. È stato interno, non dato utente.
ALTER TABLE public.credit_low_balance_alerts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.credit_low_balance_alerts IS
  'Dedup avvisi email saldo-basso per wallet (cron credit-low-balance-alert).';
