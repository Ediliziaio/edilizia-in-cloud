-- Correzione della migrazione 20280901180000 (render illimitati per azienda):
-- il ramo unlimited scriveva a ledger con reason 'consume_unlimited', che NON
-- e' fra i valori ammessi dal CHECK render_credit_ledger_reason_check
-- ('consume','adjust_admin','topup','refund','seed','correction').
--
-- Effetto: deduct_render_credit_v3 falliva sul constraint, renderCreditDeduct
-- lo interpretava come "v3 non disponibile" e ripiegava SILENZIOSAMENTE su v2 —
-- che scala il credito e non scrive ledger. Un'azienda con unlimited=true si
-- vedeva comunque azzerare il saldo. Applicata a prod via MCP il 2026-09-01.
--
-- Fix: reason 'consume' con delta 0 (nessun credito mosso), marcata
-- metadata.unlimited = true. Idempotente.

CREATE OR REPLACE FUNCTION public.deduct_render_credit_v3(
  _company_id uuid,
  _session_id uuid DEFAULT NULL::uuid,
  _user_id uuid DEFAULT NULL::uuid,
  _reason_meta jsonb DEFAULT NULL::jsonb
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _balance integer;
  _unlimited boolean := false;
  _price numeric := 0;
  _purchase_id uuid;
  _new_balance integer;
  _ledger_id uuid;
BEGIN
  IF NOT public.user_can_access_company(_company_id) THEN
    RAISE EXCEPTION 'accesso negato: azienda non consentita' USING ERRCODE = '42501';
  END IF;

  SELECT balance, unlimited INTO _balance, _unlimited
  FROM public.render_credits
  WHERE company_id = _company_id
  FOR UPDATE;

  IF FOUND AND _unlimited THEN
    INSERT INTO public.render_credit_ledger (
      company_id, delta, balance_after, reason,
      session_id, user_id, revenue_eur, purchase_id, metadata
    ) VALUES (
      _company_id, 0, COALESCE(_balance, 0), 'consume',
      _session_id, _user_id, 0, NULL,
      COALESCE(_reason_meta, '{}'::jsonb) || jsonb_build_object('unlimited', true)
    )
    RETURNING id INTO _ledger_id;

    RETURN json_build_object(
      'status', 'ok', 'revenue_eur', 0, 'purchase_id', NULL,
      'balance_after', COALESCE(_balance, 0), 'ledger_id', _ledger_id
    );
  END IF;

  IF NOT FOUND OR _balance <= 0 THEN
    RETURN json_build_object(
      'status', 'insufficient', 'revenue_eur', 0,
      'balance_after', COALESCE(_balance, 0), 'ledger_id', NULL
    );
  END IF;

  SELECT id, price_per_credit_eur INTO _purchase_id, _price
  FROM public.render_credit_purchases
  WHERE company_id = _company_id AND status = 'completed' AND credits_remaining > 0
  ORDER BY purchased_at ASC LIMIT 1 FOR UPDATE;

  IF _purchase_id IS NULL THEN
    _price := 0;
  ELSE
    UPDATE public.render_credit_purchases
    SET credits_remaining = credits_remaining - 1 WHERE id = _purchase_id;
  END IF;

  UPDATE public.render_credits
  SET balance = balance - 1, total_used = total_used + 1, updated_at = now()
  WHERE company_id = _company_id
  RETURNING balance INTO _new_balance;

  INSERT INTO public.render_credit_ledger (
    company_id, delta, balance_after, reason,
    session_id, user_id, revenue_eur, purchase_id, metadata
  ) VALUES (
    _company_id, -1, _new_balance, 'consume',
    _session_id, _user_id, _price, _purchase_id, _reason_meta
  )
  RETURNING id INTO _ledger_id;

  RETURN json_build_object(
    'status', 'ok', 'revenue_eur', _price, 'purchase_id', _purchase_id,
    'balance_after', _new_balance, 'ledger_id', _ledger_id
  );
END;
$function$;
