-- Aggiunge sr_progetti.schema_pagamento per supportare i pattern standard:
--   - tutto_finanziato:      100% via finanziaria (no milestone)
--   - acconto_finanziato:    1 acconto + saldo via finanziaria
--   - due_acconti_finanziato: 2 acconti + saldo via finanziaria
--   - due_acconti_saldo:     2 acconti + saldo a fine (no finanziaria)
--   - tre_step:              acconto firma + arrivo merce + saldo (default tipico)
--   - personalizzato:        l'utente personalizza tutto manualmente
--
-- I valori delle milestone restano in pagamento_milestones (già esistente).
-- Questo campo serve a "guidare" l'UI per pre-popolare i template e per
-- decidere se mostrare anche la sezione finanziaria.
--
-- Idempotente.

ALTER TABLE public.sr_progetti
  ADD COLUMN IF NOT EXISTS schema_pagamento TEXT;

COMMENT ON COLUMN public.sr_progetti.schema_pagamento IS
  'Pattern modalità pagamento cliente: tutto_finanziato | acconto_finanziato | '
  'due_acconti_finanziato | due_acconti_saldo | tre_step | personalizzato. '
  'Guida i template default per pagamento_milestones e la visibilità sezione finanziaria.';

NOTIFY pgrst, 'reload schema';
