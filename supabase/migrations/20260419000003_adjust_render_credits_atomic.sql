-- ============================================================================
-- 20260419000003 — adjust_render_credits_atomic
-- ============================================================================
-- Bug fix P2.1 + P2.2 + P3.3 del report stabilization:
--
-- L'adjust dei render_credits era fatto client-side (CreditManagerCard) con
-- pattern read-modify-write non atomico:
--   SELECT balance → compute newBalance → UPSERT
-- → race condition fra admin concorrenti o admin + generate-render.
--
-- Inoltre l'edge function `admin-adjust-credits` escludeva esplicitamente
-- service='render' (whitelist ['email','ai_agents','whatsapp']), quindi non
-- esisteva un percorso server-side sicuro.
--
-- Questa migration introduce:
--   - adjust_render_credits_atomic(p_company_id, p_delta, p_reason, p_adjusted_by)
--     Con FOR UPDATE, upsert row, scrittura del ledger (audit P3.3).
--
-- L'edge function admin-adjust-credits verrà aggiornata separatamente per
-- dispatchare su questa RPC quando service='render'.
-- ============================================================================

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
AS $$
DECLARE
  v_balance_before integer;
  v_balance_after  integer;
  v_total_purchased integer;
  v_total_used     integer;
  v_ledger_id      uuid;
BEGIN
  IF p_delta = 0 THEN
    RAISE EXCEPTION 'p_delta deve essere diverso da zero' USING ERRCODE = '22023';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'p_reason è obbligatorio' USING ERRCODE = '22023';
  END IF;

  -- Lock row (upsert pattern): inserisce se mancante, poi aggiorna.
  INSERT INTO public.render_credits (company_id, balance, total_purchased, total_used)
  VALUES (p_company_id, 0, 0, 0)
  ON CONFLICT (company_id) DO NOTHING;

  SELECT balance, total_purchased, total_used
  INTO v_balance_before, v_total_purchased, v_total_used
  FROM public.render_credits
  WHERE company_id = p_company_id
  FOR UPDATE;

  v_balance_after := GREATEST(0, v_balance_before + p_delta);

  -- total_purchased cresce con incrementi positivi (topup admin),
  -- total_used non varia qui (quello lo gestisce deduct_render_credit_v*).
  UPDATE public.render_credits
  SET
    balance          = v_balance_after,
    total_purchased  = v_total_purchased + GREATEST(0, p_delta),
    updated_at       = now()
  WHERE company_id = p_company_id;

  -- Scrivi audit ledger (atomica con l'update)
  INSERT INTO public.render_credit_ledger (
    company_id, delta, balance_after, reason,
    session_id, user_id, metadata
  ) VALUES (
    p_company_id,
    v_balance_after - v_balance_before, -- usa delta effettivo applicato (clampato a 0)
    v_balance_after,
    'adjust_admin',
    NULL,
    p_adjusted_by,
    jsonb_build_object('reason_text', p_reason, 'delta_requested', p_delta)
  )
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'success',        true,
    'balance_before', v_balance_before,
    'balance_after',  v_balance_after,
    'delta_applied',  v_balance_after - v_balance_before,
    'ledger_id',      v_ledger_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_render_credits_atomic(uuid, integer, text, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.adjust_render_credits_atomic(uuid, integer, text, uuid) IS
'Adjust atomico (FOR UPDATE) del balance render_credits di una company.
Comportamento:
  - p_delta positivo = topup/ricarica (cresce total_purchased)
  - p_delta negativo = storno/scarico (non abbassa total_used)
  - balance è clamped a >= 0 (se delta negativo > balance, balance diventa 0)
Scrive sempre una riga in render_credit_ledger con reason=adjust_admin.
Return: {success, balance_before, balance_after, delta_applied, ledger_id}.';

NOTIFY pgrst, 'reload schema';
