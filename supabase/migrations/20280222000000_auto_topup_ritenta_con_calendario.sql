-- La ricarica automatica ritentava una carta rifiutata OGNI ORA, per sempre.
--
-- La chiave di idempotenza era oraria e il cron gira ogni 15 minuti: nessun
-- tetto, nessuna attesa crescente, e soprattutto nessuna riga da nessuna parte
-- che dicesse "questa carta continua a essere rifiutata". Il cliente non
-- riceveva niente e i circuiti vedevano decine di tentativi falliti sulla
-- stessa carta, che e' il modo piu' rapido per farsi bloccare.
--
-- Ora i tentativi seguono un calendario: uno al giorno per i primi 5 giorni
-- (spesso e' un plafond temporaneo e si risolve da solo), poi uno a settimana
-- per due mesi, poi si smette e basta. Lo stato vive qui accanto alla
-- configurazione, cosi' e' leggibile con una SELECT.

ALTER TABLE public.company_auto_topup
  ADD COLUMN IF NOT EXISTS failure_count      integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_failure_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_failure_at    timestamptz,
  ADD COLUMN IF NOT EXISTS last_failure_reason text,
  ADD COLUMN IF NOT EXISTS next_attempt_at    timestamptz,
  ADD COLUMN IF NOT EXISTS retries_exhausted_at timestamptz;

COMMENT ON COLUMN public.company_auto_topup.next_attempt_at IS
  'Prima di questo istante il cron non ritenta. NULL = nessun fallimento in corso, si puo'' tentare subito.';
COMMENT ON COLUMN public.company_auto_topup.retries_exhausted_at IS
  'Valorizzato quando il calendario dei tentativi si esaurisce (5 giornalieri + 8 settimanali): da qui in poi serve un intervento del cliente sulla carta.';

-- Il calendario, in un posto solo: lo usa la edge function e si legge da SQL.
--   tentativi 1-5   → il giorno dopo
--   tentativi 6-13  → la settimana dopo (8 settimane ≈ 2 mesi)
--   oltre           → NULL, si smette
CREATE OR REPLACE FUNCTION public.auto_topup_next_attempt(p_failure_count integer)
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_failure_count <= 0  THEN NULL
    WHEN p_failure_count <= 5  THEN now() + interval '1 day'
    WHEN p_failure_count <= 13 THEN now() + interval '7 days'
    ELSE NULL
  END;
$$;

-- Chi sta accumulando rifiuti, a colpo d'occhio.
CREATE INDEX IF NOT EXISTS idx_company_auto_topup_next_attempt
  ON public.company_auto_topup (next_attempt_at)
  WHERE next_attempt_at IS NOT NULL;
