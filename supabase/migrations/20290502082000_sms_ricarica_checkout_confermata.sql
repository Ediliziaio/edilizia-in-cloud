-- Una ricevuta compare solo insieme alla registrazione del relativo accredito.
CREATE TABLE public.sms_checkout_receipts (
  checkout_id text PRIMARY KEY,
  payment_intent_id text NOT NULL UNIQUE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  credit_cents integer NOT NULL CHECK (credit_cents > 0),
  credited_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_checkout_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_checkout_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT (checkout_id, company_id, credit_cents, credited_at) ON public.sms_checkout_receipts TO authenticated;
GRANT SELECT, INSERT ON public.sms_checkout_receipts TO service_role;
CREATE POLICY sms_checkout_read_company ON public.sms_checkout_receipts
  FOR SELECT TO authenticated
  USING (public.user_can_access_company(company_id) AND NOT (SELECT public.utente_bloccato()));

CREATE FUNCTION public.sms_accredita_checkout(
  p_checkout_id text,
  p_payment_intent_id text,
  p_company_id uuid,
  p_amount_cents integer,
  p_credit_cents integer
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_balance numeric;
  v_credit numeric;
BEGIN
  IF p_checkout_id IS NULL OR p_checkout_id !~ '^cs_(test|live)_[a-zA-Z0-9_]+$'
     OR p_payment_intent_id IS NULL OR p_payment_intent_id !~ '^pi_[a-zA-Z0-9_]+$'
     OR p_amount_cents IS NULL OR p_amount_cents <= 0
     OR p_credit_cents IS NULL OR p_credit_cents <= 0 THEN
    RAISE EXCEPTION 'Estremi della ricarica SMS non validi' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.sms_checkout_receipts(checkout_id, payment_intent_id, company_id, amount_cents, credit_cents)
    VALUES (p_checkout_id, p_payment_intent_id, p_company_id, p_amount_cents, p_credit_cents)
    ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.sms_checkout_receipts
      WHERE checkout_id = p_checkout_id AND payment_intent_id = p_payment_intent_id
        AND company_id = p_company_id AND amount_cents = p_amount_cents AND credit_cents = p_credit_cents) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Identificativo di pagamento già associato a una ricarica diversa' USING ERRCODE = '23505';
  END IF;

  v_credit := p_credit_cents / 100.0;
  INSERT INTO public.sms_wallet AS wallet(company_id, crediti, totale_ricaricato, ultima_ricarica_at)
    VALUES (p_company_id, v_credit, v_credit, statement_timestamp())
    ON CONFLICT (company_id) DO UPDATE
      SET crediti = wallet.crediti + EXCLUDED.crediti,
          totale_ricaricato = wallet.totale_ricaricato + EXCLUDED.totale_ricaricato,
          ultima_ricarica_at = EXCLUDED.ultima_ricarica_at
    RETURNING crediti INTO v_balance;

  INSERT INTO public.sms_wallet_transazioni(company_id, tipo, importo, saldo_dopo, descrizione, stripe_payment_intent_id)
  VALUES (p_company_id, 'ricarica', v_credit, v_balance, 'Ricarica crediti SMS con Stripe Checkout', p_payment_intent_id);
END;
$$;

REVOKE ALL ON FUNCTION public.sms_accredita_checkout(text, text, uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_accredita_checkout(text, text, uuid, integer, integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';
