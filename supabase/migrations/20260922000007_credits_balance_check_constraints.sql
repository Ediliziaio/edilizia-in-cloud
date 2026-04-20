-- ============================================================================
-- CHECK constraint `balance_eur >= 0` sui wallet di crediti
-- ============================================================================
-- Oggi le tabelle `email_credits`, `ai_credits`, `whatsapp_credits` non hanno
-- un CHECK sul saldo. Una race condition o un bug nella logica di consumo
-- potrebbe lasciare un saldo negativo (= crediti "regalati" silenziosamente).
-- `render_credits` ha già il CHECK `balance >= 0` dalla migration originale.
--
-- Aggiungiamo lo stesso vincolo alle altre tre tabelle. Idempotente: rimuovi
-- i CHECK precedenti (se già applicati) prima di ri-aggiungerli con lo
-- stesso nome.
--
-- Nota: se esistono record con balance_eur < 0, l'ADD CONSTRAINT fallirà
-- senza `NOT VALID`. Usiamo una due fasi:
--   1. Azzera i saldi negativi (molto improbabile in produzione ma safe)
--   2. Aggiungi CHECK
-- ============================================================================

-- 1) Sanitize: converte ogni saldo negativo a 0 (last-resort, non dovrebbe
-- mai esistere in prod). Logga count per diagnostica.
DO $$
DECLARE
  v_n_email int;
  v_n_ai    int;
  v_n_wa    int;
BEGIN
  UPDATE public.email_credits SET balance_eur = 0 WHERE balance_eur < 0;
  GET DIAGNOSTICS v_n_email = ROW_COUNT;

  UPDATE public.ai_credits SET balance_eur = 0 WHERE balance_eur < 0;
  GET DIAGNOSTICS v_n_ai = ROW_COUNT;

  UPDATE public.whatsapp_credits SET balance_eur = 0 WHERE balance_eur < 0;
  GET DIAGNOSTICS v_n_wa = ROW_COUNT;

  IF v_n_email + v_n_ai + v_n_wa > 0 THEN
    RAISE NOTICE
      'Saldi negativi sanitizzati: email=%  ai=%  whatsapp=%',
      v_n_email, v_n_ai, v_n_wa;
  END IF;
END $$;

-- 2) CHECK constraints (drop-then-add per idempotenza)
ALTER TABLE public.email_credits
  DROP CONSTRAINT IF EXISTS email_credits_balance_eur_nonneg;
ALTER TABLE public.email_credits
  ADD CONSTRAINT email_credits_balance_eur_nonneg
  CHECK (balance_eur >= 0);

ALTER TABLE public.ai_credits
  DROP CONSTRAINT IF EXISTS ai_credits_balance_eur_nonneg;
ALTER TABLE public.ai_credits
  ADD CONSTRAINT ai_credits_balance_eur_nonneg
  CHECK (balance_eur >= 0);

ALTER TABLE public.whatsapp_credits
  DROP CONSTRAINT IF EXISTS whatsapp_credits_balance_eur_nonneg;
ALTER TABLE public.whatsapp_credits
  ADD CONSTRAINT whatsapp_credits_balance_eur_nonneg
  CHECK (balance_eur >= 0);
