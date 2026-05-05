-- ============================================================================
-- Ensure admin render credit adjustments work in production
-- ============================================================================
-- Production reported PostgREST/PGRST202:
--   Could not find function public.adjust_render_credits_atomic(...)
--
-- This migration intentionally recreates the RPC with the exact named
-- parameters used by the admin-adjust-credits Edge Function and reloads
-- PostgREST schema cache.
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

DO $migration$
BEGIN
  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION public.adjust_render_credits_atomic(
      p_company_id   uuid,
      p_delta        integer,
      p_reason       text,
      p_adjusted_by  uuid
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
    DECLARE
      v_balance_before  integer;
      v_balance_after   integer;
      v_total_purchased integer;
      v_ledger_id       uuid;
    BEGIN
      IF p_delta = 0 THEN
        RETURN jsonb_build_object('error', 'Il delta render deve essere diverso da zero');
      END IF;

      IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object('error', 'Motivazione obbligatoria');
      END IF;

      INSERT INTO public.render_credits (company_id, balance, total_purchased, total_used)
      VALUES (p_company_id, 0, 0, 0)
      ON CONFLICT (company_id) DO NOTHING;

      SELECT balance, total_purchased
      INTO v_balance_before, v_total_purchased
      FROM public.render_credits
      WHERE company_id = p_company_id
      FOR UPDATE;

      v_balance_after := GREATEST(0, v_balance_before + p_delta);

      UPDATE public.render_credits
      SET
        balance = v_balance_after,
        total_purchased = v_total_purchased + GREATEST(0, v_balance_after - v_balance_before),
        updated_at = now()
      WHERE company_id = p_company_id;

      INSERT INTO public.render_credit_ledger (
        company_id,
        delta,
        balance_after,
        reason,
        session_id,
        user_id,
        metadata
      ) VALUES (
        p_company_id,
        v_balance_after - v_balance_before,
        v_balance_after,
        'adjust_admin',
        NULL,
        p_adjusted_by,
        jsonb_build_object(
          'reason_text', p_reason,
          'delta_requested', p_delta,
          'source', 'admin-adjust-credits'
        )
      )
      RETURNING id INTO v_ledger_id;

      RETURN jsonb_build_object(
        'success', true,
        'balance_before', v_balance_before,
        'balance_after', v_balance_after,
        'delta_applied', v_balance_after - v_balance_before,
        'ledger_id', v_ledger_id
      );
    END;
    $fn$;
  $sql$;

  EXECUTE 'GRANT EXECUTE ON FUNCTION public.adjust_render_credits_atomic(uuid, integer, text, uuid) TO authenticated, service_role';
  EXECUTE $sql$
    COMMENT ON FUNCTION public.adjust_render_credits_atomic(uuid, integer, text, uuid) IS
      'Atomic admin adjustment for render_credits. Used by admin-adjust-credits for Render AI wallet topups/deductions.'
  $sql$;
  EXECUTE 'NOTIFY pgrst, ''reload schema''';
END;
$migration$;
