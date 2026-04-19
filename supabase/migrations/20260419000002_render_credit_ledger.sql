-- ============================================================================
-- 20260419000002 — render_credit_ledger + deduct_render_credit_v3
-- ============================================================================
-- Bug fix P3.1 del report stabilization:
--
-- Le RPC deduct_render_credit (v1) e deduct_render_credit_v2 sono atomiche ma
-- non registrano AUDIT: nessun session_id, user_id, reason, balance_after.
-- In caso di contestazione ("dove sono finiti i miei crediti?") non c'è modo
-- di ricostruire lo storico. I wallet EUR hanno tabelle ledger per-servizio;
-- il wallet render no.
--
-- Questa migration introduce:
--   1. public.render_credit_ledger — tabella append-only di tutti i movimenti
--      (consume + adjust + topup).
--   2. public.deduct_render_credit_v3 — successore di v2, con logging atomico
--      e parametri session_id/user_id/reason opzionali.
--
-- v1 e v2 restano in place per retrocompat. Le edge functions verranno
-- aggiornate nel frontend per provare v3 prima (con fallback graceful).
-- ============================================================================

-- ── Tabella ledger ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.render_credit_ledger (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid         NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  delta        integer      NOT NULL,
  balance_after integer     NOT NULL CHECK (balance_after >= 0),
  reason       text         NOT NULL
    CHECK (reason IN ('consume', 'adjust_admin', 'topup', 'refund', 'seed', 'correction')),
  session_id   uuid,
  user_id      uuid,
  revenue_eur  numeric(10,4) DEFAULT 0,
  purchase_id  uuid,
  metadata     jsonb,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rcl_company_created
  ON public.render_credit_ledger(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rcl_session
  ON public.render_credit_ledger(session_id)
  WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rcl_reason
  ON public.render_credit_ledger(reason);

ALTER TABLE public.render_credit_ledger ENABLE ROW LEVEL SECURITY;

-- Company members (impersonation-aware) possono leggere il proprio ledger
DROP POLICY IF EXISTS "co_render_credit_ledger_select" ON public.render_credit_ledger;
CREATE POLICY "co_render_credit_ledger_select" ON public.render_credit_ledger
  FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id());

-- Super admin: accesso pieno (audit globale)
DROP POLICY IF EXISTS "sa_render_credit_ledger" ON public.render_credit_ledger;
CREATE POLICY "sa_render_credit_ledger" ON public.render_credit_ledger
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

COMMENT ON TABLE public.render_credit_ledger IS
'Append-only audit ledger dei movimenti render credits. Popolato dalle RPC
deduct_render_credit_v3 (consume), adjust_render_credits_atomic (adjust_admin)
e dagli scripts di topup. NON modificare/eliminare a mano — è audit log.';

-- ============================================================================
-- deduct_render_credit_v3 — successore di v2 con audit log
-- ============================================================================
CREATE OR REPLACE FUNCTION public.deduct_render_credit_v3(
  _company_id   uuid,
  _session_id   uuid    DEFAULT NULL,
  _user_id      uuid    DEFAULT NULL,
  _reason_meta  jsonb   DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _balance integer;
  _price numeric := 0;
  _purchase_id uuid;
  _new_balance integer;
  _ledger_id uuid;
BEGIN
  -- Lock balance row per evitare race on concurrent deducts
  SELECT balance INTO _balance
  FROM public.render_credits
  WHERE company_id = _company_id
  FOR UPDATE;

  IF NOT FOUND OR _balance <= 0 THEN
    RETURN json_build_object(
      'status', 'insufficient',
      'revenue_eur', 0,
      'balance_after', COALESCE(_balance, 0),
      'ledger_id', NULL
    );
  END IF;

  -- FIFO: trova il purchase più vecchio con crediti residui (revenue tracking)
  SELECT id, price_per_credit_eur
  INTO _purchase_id, _price
  FROM public.render_credit_purchases
  WHERE company_id = _company_id
    AND status = 'completed'
    AND credits_remaining > 0
  ORDER BY purchased_at ASC
  LIMIT 1
  FOR UPDATE;

  IF _purchase_id IS NULL THEN
    _price := 0;
  ELSE
    UPDATE public.render_credit_purchases
    SET credits_remaining = credits_remaining - 1
    WHERE id = _purchase_id;
  END IF;

  -- Deduci dal balance generale
  UPDATE public.render_credits
  SET balance    = balance - 1,
      total_used = total_used + 1,
      updated_at = now()
  WHERE company_id = _company_id
  RETURNING balance INTO _new_balance;

  -- Scrivi audit ledger (atomica con la deduct)
  INSERT INTO public.render_credit_ledger (
    company_id, delta, balance_after, reason,
    session_id, user_id, revenue_eur, purchase_id, metadata
  ) VALUES (
    _company_id, -1, _new_balance, 'consume',
    _session_id, _user_id, _price, _purchase_id, _reason_meta
  )
  RETURNING id INTO _ledger_id;

  RETURN json_build_object(
    'status', 'ok',
    'revenue_eur', _price,
    'purchase_id', _purchase_id,
    'balance_after', _new_balance,
    'ledger_id', _ledger_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_render_credit_v3(uuid, uuid, uuid, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.deduct_render_credit_v3(uuid, uuid, uuid, jsonb) IS
'Deduct 1 render credit + FIFO revenue tracking + audit log atomico.
Successore di deduct_render_credit_v2. Parametri:
  _company_id  — wallet da addebitare
  _session_id  — render session correlata (opzionale, per tracciamento)
  _user_id     — auth.users.id chi ha fatto partire il render (opzionale)
  _reason_meta — JSON con info extra (provider_key, render_type, ecc.)
Return: {status: ok|insufficient, revenue_eur, purchase_id,
         balance_after, ledger_id}';

-- ============================================================================
-- Notify PostgREST
-- ============================================================================
NOTIFY pgrst, 'reload schema';
