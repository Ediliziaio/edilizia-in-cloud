-- =============================================================================
-- P0-4 — topup_outbox: outbox pattern per accredito atomico al pagamento
-- =============================================================================
-- Risolve il bug P0 "auto-topup: crediti NON atomici al pagamento": se la RPC
-- add_email_credits_with_log falliva DOPO che Stripe aveva già confermato
-- l'addebito, il cliente aveva PAGATO ma NON ricevuto i crediti, senza
-- retry né alert.
--
-- Pattern: ogni PaymentIntent riuscito genera una riga `pending` in
-- topup_outbox. Il tentativo di accredito immediato avviene nello stesso
-- turno (con 3 retry), ma se tutto fallisce la riga resta visibile e
-- processabile dal cron topup-outbox-recovery.
--
-- UNIQUE su stripe_payment_intent_id → double-insert diventa no-op,
-- l'outbox è idempotente rispetto a riesecuzioni.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.topup_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  amount_eur numeric(10,2) NOT NULL,
  stripe_payment_intent_id text NOT NULL UNIQUE,
  wallet_type text NOT NULL DEFAULT 'email',
  status text NOT NULL CHECK (status IN ('pending','credited','failed')) DEFAULT 'pending',
  retry_count int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  credited_at timestamptz,
  alerted_at timestamptz
);

COMMENT ON TABLE public.topup_outbox IS
  'P0-4: outbox pattern per garantire che ogni charge Stripe auto-topup riuscito porti all''accredito crediti email. Righe "failed" con retry_count<10 vengono riprovate dal cron topup-outbox-recovery.';

-- Indice parziale solo sulle righe pending/failed (quelle che il cron deve
-- processare): keep-index piccolo anche con milioni di righe storiche credited.
CREATE INDEX IF NOT EXISTS idx_topup_outbox_processable
  ON public.topup_outbox (status, created_at)
  WHERE status IN ('pending','failed');

ALTER TABLE public.topup_outbox ENABLE ROW LEVEL SECURITY;

-- Solo super_admin può leggere l'outbox dal client (operativo/diagnostico).
-- Le edge function usano service_role e bypassano le policy.
DROP POLICY IF EXISTS topup_outbox_admin_select ON public.topup_outbox;
CREATE POLICY topup_outbox_admin_select ON public.topup_outbox
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Nessuna policy INSERT/UPDATE/DELETE: scritture possibili SOLO via
-- service_role (edge function) o super_admin autenticato via RPC dedicata
-- (non prevista in questo sprint).
