-- ============================================================================
-- Render credits refund RPC
-- ============================================================================
-- Quando una edge function render scala un credito e poi fallisce per provider,
-- upload o timeout, il credito deve tornare nel wallet. La RPC e' idempotente:
-- per una stessa sessione registra al massimo un refund.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.render_credit_ledger (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid         NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  delta         integer      NOT NULL,
  balance_after integer      NOT NULL CHECK (balance_after >= 0),
  reason        text         NOT NULL
    CHECK (reason IN ('consume', 'adjust_admin', 'topup', 'refund', 'seed', 'correction')),
  session_id    uuid,
  user_id       uuid,
  revenue_eur   numeric(10,4) DEFAULT 0,
  purchase_id   uuid,
  metadata      jsonb,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rcl_company_created
  ON public.render_credit_ledger(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rcl_session
  ON public.render_credit_ledger(session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rcl_reason
  ON public.render_credit_ledger(reason);

ALTER TABLE public.render_credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "co_render_credit_ledger_select" ON public.render_credit_ledger;
CREATE POLICY "co_render_credit_ledger_select" ON public.render_credit_ledger
  FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS "sa_render_credit_ledger" ON public.render_credit_ledger;
CREATE POLICY "sa_render_credit_ledger" ON public.render_credit_ledger
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.refund_render_credit_v1(
  _company_id   uuid,
  _session_id   uuid,
  _user_id      uuid  DEFAULT NULL,
  _reason_meta  jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _consume_id uuid;
  _purchase_id uuid;
  _revenue_eur numeric := 0;
  _balance_after integer;
  _ledger_id uuid;
BEGIN
  IF _company_id IS NULL OR _session_id IS NULL THEN
    RETURN json_build_object(
      'status', 'skipped',
      'reason', 'missing_company_or_session',
      'balance_after', NULL,
      'ledger_id', NULL
    );
  END IF;

  SELECT id, purchase_id, COALESCE(revenue_eur, 0)
  INTO _consume_id, _purchase_id, _revenue_eur
  FROM public.render_credit_ledger
  WHERE company_id = _company_id
    AND session_id = _session_id
    AND reason = 'consume'
  ORDER BY created_at DESC
  LIMIT 1;

  IF _consume_id IS NULL THEN
    RETURN json_build_object(
      'status', 'no_consume',
      'reason', 'no_consume_ledger_for_session',
      'balance_after', NULL,
      'ledger_id', NULL
    );
  END IF;

  SELECT id, balance_after
  INTO _ledger_id, _balance_after
  FROM public.render_credit_ledger
  WHERE company_id = _company_id
    AND session_id = _session_id
    AND reason = 'refund'
  ORDER BY created_at DESC
  LIMIT 1;

  IF _ledger_id IS NOT NULL THEN
    RETURN json_build_object(
      'status', 'already_refunded',
      'balance_after', _balance_after,
      'ledger_id', _ledger_id
    );
  END IF;

  INSERT INTO public.render_credits (company_id, balance, total_purchased, total_used)
  VALUES (_company_id, 0, 0, 0)
  ON CONFLICT (company_id) DO NOTHING;

  UPDATE public.render_credits
  SET
    balance = balance + 1,
    total_used = GREATEST(total_used - 1, 0),
    updated_at = now()
  WHERE company_id = _company_id
  RETURNING balance INTO _balance_after;

  IF _purchase_id IS NOT NULL AND to_regclass('public.render_credit_purchases') IS NOT NULL THEN
    EXECUTE
      'UPDATE public.render_credit_purchases SET credits_remaining = credits_remaining + 1 WHERE id = $1'
    USING _purchase_id;
  END IF;

  INSERT INTO public.render_credit_ledger (
    company_id, delta, balance_after, reason,
    session_id, user_id, revenue_eur, purchase_id, metadata
  ) VALUES (
    _company_id,
    1,
    _balance_after,
    'refund',
    _session_id,
    _user_id,
    -COALESCE(_revenue_eur, 0),
    _purchase_id,
    COALESCE(_reason_meta, '{}'::jsonb) || jsonb_build_object(
      'reason_text', 'Refund automatico per render fallito dopo addebito',
      'consume_ledger_id', _consume_id
    )
  )
  RETURNING id INTO _ledger_id;

  RETURN json_build_object(
    'status', 'refunded',
    'balance_after', _balance_after,
    'ledger_id', _ledger_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_render_credit_v1(uuid, uuid, uuid, jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.refund_render_credit_v1(uuid, uuid, uuid, jsonb) IS
  'Refund idempotente di un credito render consumato da deduct_render_credit_v3 quando una generazione fallisce.';

NOTIFY pgrst, 'reload schema';
