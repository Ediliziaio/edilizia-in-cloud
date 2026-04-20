-- ============================================================================
-- Refund idempotente del credito email su hard bounce
-- ============================================================================
-- Il webhook provider (email-provider-webhook) oggi aggiorna solo lo status del
-- log (`email_logs`, `email_delivery_log`) e aggiunge il contatto a
-- `email_suppressions`. NON rifonde il credito sottratto all'invio — il cliente
-- paga per un'email che il provider ha accettato ma che non è stata recapitata.
--
-- Questa RPC cerca la transazione di deduzione relativa allo specifico
-- `provider_message_id` in `email_credits_log.metadata` e, se presente,
-- emette una contro-transazione di tipo 'refund' per lo stesso importo.
-- Idempotente: se esiste già un refund con `metadata.refund_of_message_id =
-- provider_message_id`, non ne emette uno nuovo.
--
-- Sicurezza: SECURITY DEFINER, search_path = public, utilizzabile solo dal
-- service_role (non concediamo EXECUTE a authenticated).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refund_email_credit_on_bounce(
  p_provider_message_id text,
  p_reason              text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deduct_row  record;
  v_already     int;
  v_balance_after numeric;
BEGIN
  IF p_provider_message_id IS NULL OR length(btrim(p_provider_message_id)) = 0 THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'missing_message_id');
  END IF;

  -- 1. Cerca la deduzione originale per quel message_id
  SELECT company_id, amount_eur, id
    INTO v_deduct_row
    FROM public.email_credits_log
   WHERE type = 'deduct'
     AND (metadata ->> 'provider_message_id') = p_provider_message_id
   ORDER BY created_at ASC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'deduction_not_found');
  END IF;

  -- 2. Idempotenza: esiste già un refund per lo stesso message_id?
  SELECT count(*) INTO v_already
    FROM public.email_credits_log
   WHERE type = 'refund'
     AND (metadata ->> 'refund_of_message_id') = p_provider_message_id;

  IF v_already > 0 THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'already_refunded');
  END IF;

  -- 3. Emetti il refund atomicamente
  UPDATE public.email_credits
     SET balance_eur         = balance_eur + v_deduct_row.amount_eur,
         total_spent_eur     = GREATEST(COALESCE(total_spent_eur, 0) - v_deduct_row.amount_eur, 0),
         updated_at          = now()
   WHERE company_id = v_deduct_row.company_id
   RETURNING balance_eur INTO v_balance_after;

  INSERT INTO public.email_credits_log (
    company_id, type, amount_eur, balance_before, balance_after,
    description, metadata
  )
  VALUES (
    v_deduct_row.company_id,
    'refund',
    v_deduct_row.amount_eur,
    v_balance_after - v_deduct_row.amount_eur,
    v_balance_after,
    'Hard bounce refund: ' || COALESCE(p_reason, 'provider-reported'),
    jsonb_build_object(
      'refund_of_message_id', p_provider_message_id,
      'refund_of_log_id',     v_deduct_row.id,
      'bounce_reason',        p_reason
    )
  );

  RETURN jsonb_build_object(
    'refunded',     true,
    'company_id',   v_deduct_row.company_id,
    'amount_eur',   v_deduct_row.amount_eur,
    'balance_after', v_balance_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_email_credit_on_bounce(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_email_credit_on_bounce(text, text) TO service_role;
