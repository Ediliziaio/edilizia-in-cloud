-- Render illimitati per singola azienda.
--
-- Serviva poter dare a un'azienda (oggi: Demo Azienda 2, usata per le demo e le
-- prove) render senza consumo di credito. L'alternativa scorciatoia — gonfiare
-- `balance` a un numero enorme — e' peggiore: si esaurisce comunque, sporca i
-- contatori total_used, falsa il revenue tracking FIFO e non dice a nessuno
-- che quell'azienda e' un caso speciale.
--
-- Qui il concetto diventa esplicito: un flag sui crediti render. Quando e'
-- acceso, deduct_render_credit_v3 restituisce 'ok' senza toccare balance,
-- senza consumare purchase e senza generare revenue — ma scrive comunque una
-- riga di ledger con reason 'consume_unlimited', cosi' i render restano
-- tracciati e contabilizzabili anche se non costano nulla.
--
-- La guardia anti cross-tenant resta la prima cosa che viene eseguita.

ALTER TABLE public.render_credits
  ADD COLUMN IF NOT EXISTS unlimited boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.render_credits.unlimited IS
  'Se true, i render di questa azienda non consumano credito: deduct_render_credit_v3 torna ok senza decrementare. Usato per demo e account comped.';

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
  -- [audit sicurezza 2026-08-27] guardia anti cross-tenant
  IF NOT public.user_can_access_company(_company_id) THEN
    RAISE EXCEPTION 'accesso negato: azienda non consentita' USING ERRCODE = '42501';
  END IF;

  -- Lock balance row per evitare race on concurrent deducts
  SELECT balance, unlimited INTO _balance, _unlimited
  FROM public.render_credits
  WHERE company_id = _company_id
  FOR UPDATE;

  -- Azienda a render illimitati: nessun consumo, nessun revenue, ma il render
  -- resta tracciato a ledger per non perdere lo storico di utilizzo.
  IF FOUND AND _unlimited THEN
    INSERT INTO public.render_credit_ledger (
      company_id, delta, balance_after, reason,
      session_id, user_id, revenue_eur, purchase_id, metadata
    ) VALUES (
      _company_id, 0, COALESCE(_balance, 0), 'consume_unlimited',
      _session_id, _user_id, 0, NULL, _reason_meta
    )
    RETURNING id INTO _ledger_id;

    RETURN json_build_object(
      'status', 'ok',
      'revenue_eur', 0,
      'purchase_id', NULL,
      'balance_after', COALESCE(_balance, 0),
      'ledger_id', _ledger_id
    );
  END IF;

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

  UPDATE public.render_credits
  SET balance    = balance - 1,
      total_used = total_used + 1,
      updated_at = now()
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
    'status', 'ok',
    'revenue_eur', _price,
    'purchase_id', _purchase_id,
    'balance_after', _new_balance,
    'ledger_id', _ledger_id
  );
END;
$function$;

-- Attivazione per la sola Demo Azienda 2.
UPDATE public.render_credits
   SET unlimited = true, updated_at = now()
 WHERE company_id = 'd2000000-0000-4000-a000-000000000002';
