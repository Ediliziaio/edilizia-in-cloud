-- Paid invoices and confirmed refunds are separate journal entries. The
-- original month-based key remains in force for the historical ledger.
ALTER TABLE public.referral_commission_ledger
  ADD COLUMN source_key text,
  ADD COLUMN cash_paid_at timestamptz;

DO $$
DECLARE v_legacy_constraint text;
BEGIN
  SELECT conname INTO STRICT v_legacy_constraint FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.referral_commission_ledger'::regclass AND contype = 'u'
    AND pg_catalog.pg_get_constraintdef(oid) = 'UNIQUE (referrer_id, company_id, period_month, period_year)';
  EXECUTE format('ALTER TABLE public.referral_commission_ledger DROP CONSTRAINT %I', v_legacy_constraint);
END;
$$;

CREATE UNIQUE INDEX referral_ledger_legacy_month
  ON public.referral_commission_ledger (referrer_id, company_id, period_month, period_year) WHERE source_key IS NULL;
CREATE UNIQUE INDEX referral_ledger_cash_source
  ON public.referral_commission_ledger (source_key) WHERE source_key IS NOT NULL;

CREATE TABLE private.referral_cash_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  starts_at timestamptz NOT NULL DEFAULT now(),
  synced_through timestamptz NOT NULL DEFAULT now()
);
INSERT INTO private.referral_cash_settings DEFAULT VALUES;

CREATE TABLE private.referral_cash_receipts (
  invoice_id text PRIMARY KEY,
  charge_id text NOT NULL UNIQUE,
  referrer_id uuid NOT NULL REFERENCES public.referrers(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  paid_at timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN ('plan', 'addon')),
  gross_cents bigint NOT NULL CHECK (gross_cents > 0),
  net_cents bigint NOT NULL CHECK (net_cents BETWEEN 0 AND gross_cents),
  rate_pct numeric NOT NULL CHECK (rate_pct >= 0),
  multiplier numeric NOT NULL CHECK (multiplier >= 0),
  commission_cents bigint NOT NULL CHECK (commission_cents >= 0)
);

CREATE TABLE private.referral_cash_refunds (
  refund_id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES private.referral_cash_receipts(invoice_id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL CHECK (status IN ('succeeded', 'failed', 'canceled'))
);
CREATE INDEX referral_cash_refunds_invoice ON private.referral_cash_refunds (invoice_id);

ALTER TABLE private.referral_cash_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.referral_cash_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.referral_cash_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.referral_cash_settings, private.referral_cash_receipts, private.referral_cash_refunds
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.referral_balance_at(p_referrer uuid, p_cutoff date) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH credits AS (
    SELECT COALESCE(sum(trunc(commission_amount, 2)) FILTER (WHERE eligible), 0) AS earned,
      COALESCE(sum(trunc(commission_amount, 2)) FILTER (WHERE NOT eligible), 0) AS unvested
    FROM (
      SELECT commission_amount, COALESCE((cash_paid_at AT TIME ZONE 'Europe/Rome')::date,
        make_date(period_year, period_month, 1)) < p_cutoff AS eligible
      FROM public.referral_commission_ledger WHERE referrer_id = p_referrer AND status <> 'cancelled'
    ) movements
  ), debits AS (
    SELECT COALESCE(sum(amount) FILTER (WHERE status = 'paid'), 0) AS paid,
      COALESCE(sum(amount) FILTER (WHERE status IN ('pending', 'approved', 'processing')), 0) AS reserved
    FROM public.referral_payouts WHERE referrer_id = p_referrer
  )
  SELECT jsonb_build_object('earned', earned, 'paid', paid, 'reserved', reserved, 'unvested', unvested,
    'available', greatest(0, earned - paid - reserved), 'shortfall', greatest(0, paid + reserved - earned))
  FROM credits, debits;
$$;

-- An instruction already prepared can have been submitted to the bank. Keep it
-- reserved, show the deficit and offset it against future earnings. Pending and
-- approved requests that no longer have funds are closed with a visible reason.
CREATE FUNCTION private.referral_revalidate_reservations(p_referrer uuid) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_budget numeric := (private.referral_balance_at(
    p_referrer, date_trunc('month', now() AT TIME ZONE 'Europe/Rome')::date
  )->>'earned')::numeric;
  v_request record;
BEGIN
  v_budget := v_budget - (
    SELECT COALESCE(sum(amount), 0) FROM public.referral_payouts WHERE referrer_id = p_referrer
      AND status IN ('paid', 'processing')
  );
  FOR v_request IN
    SELECT id, amount FROM public.referral_payouts WHERE referrer_id = p_referrer
      AND status IN ('approved', 'pending') ORDER BY created_at, id FOR UPDATE
  LOOP
    IF v_request.amount <= v_budget THEN
      v_budget := v_budget - v_request.amount;
    ELSE
      UPDATE public.referral_payouts SET status = 'rejected',
        rejection_reason = 'Saldo ridotto da uno storno. Puoi richiedere di nuovo l’importo disponibile.'
      WHERE id = v_request.id;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION private.referral_revalidate_reservations(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.referral_record_stripe_receipt(
  p_invoice_id text, p_charge_id text, p_company_id uuid, p_paid_at timestamptz,
  p_kind text, p_gross_cents bigint, p_net_cents bigint, p_refunds jsonb DEFAULT '[]'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_receipt private.referral_cash_receipts%ROWTYPE;
  v_refund private.referral_cash_refunds%ROWTYPE;
  v_item record;
  v_partner uuid;
  v_referral_code text;
  v_rate numeric;
  v_multiplier numeric;
  v_plan text;
  v_period date;
  v_delta bigint;
  v_refunded bigint;
  v_reversed bigint;
  v_new_reversed bigint;
  v_key text;
  v_count integer := 0;
  v_credit boolean := false;
BEGIN
  IF NOT (current_setting('role', true) = 'service_role' OR COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'service_role') THEN
    RAISE EXCEPTION 'Operazione riservata al servizio pagamenti' USING ERRCODE = '42501';
  END IF;
  IF p_invoice_id IS NULL OR p_invoice_id !~ '^in_[a-zA-Z0-9_]+$' OR
    p_charge_id IS NULL OR p_charge_id !~ '^ch_[a-zA-Z0-9_]+$' OR
    p_paid_at IS NULL OR p_kind IS NULL OR p_kind NOT IN ('plan', 'addon') OR
    p_gross_cents IS NULL OR p_net_cents IS NULL OR p_gross_cents NOT BETWEEN 1 AND 9999999999
    OR p_net_cents NOT BETWEEN 0 AND p_gross_cents OR jsonb_typeof(p_refunds) IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'Dati di incasso Stripe non validi' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('referral-stripe:' || p_invoice_id, 0));
  SELECT * INTO v_receipt FROM private.referral_cash_receipts WHERE invoice_id = p_invoice_id;

  IF FOUND THEN
    IF v_receipt.charge_id <> p_charge_id OR (p_company_id IS NOT NULL AND v_receipt.company_id <> p_company_id)
      OR v_receipt.gross_cents <> p_gross_cents THEN
      RAISE EXCEPTION 'Incasso già associato a un altro movimento' USING ERRCODE = '23505';
    END IF;
    PERFORM private.referral_lock_balance(v_receipt.referrer_id);
  ELSE
    IF p_company_id IS NULL THEN RETURN jsonb_build_object('result', 'no_attribution'); END IF;
    IF p_paid_at < (SELECT starts_at FROM private.referral_cash_settings) THEN
      RETURN jsonb_build_object('result', 'before_cutover');
    END IF;

    -- "invoice.paid" can arrive before "customer.subscription.created".
    -- A code already stored on the company can create its existing referral link.
    SELECT rc.referrer_id INTO v_partner
    FROM public.referral_companies rc
    JOIN public.companies c ON c.id = rc.company_id
    WHERE rc.company_id = p_company_id AND rc.is_active
      AND (rc.referred_at <= p_paid_at OR rc.referrer_id = c.referred_by)
    ORDER BY (rc.referrer_id = c.referred_by) DESC NULLS LAST, rc.referred_at, rc.referrer_id LIMIT 1;
    IF NOT FOUND THEN
      SELECT r.id, r.referral_code INTO v_partner, v_referral_code
      FROM public.companies c
      JOIN public.referrers r ON r.id = c.referred_by AND r.is_active
      WHERE c.id = p_company_id
        AND NOT EXISTS (SELECT 1 FROM public.referral_companies rc WHERE rc.company_id = c.id);
      IF NOT FOUND THEN RETURN jsonb_build_object('result', 'no_attribution'); END IF;
      PERFORM public.record_referral_conversion(v_referral_code, p_company_id, p_status => 'active');
    END IF;
    PERFORM private.referral_lock_balance(v_partner);

    SELECT greatest(0, CASE WHEN p_kind = 'addon' THEN COALESCE(t.commission_addon_pct, 5)
           ELSE COALESCE(t.commission_plan_pct, 20) END),
      greatest(0, COALESCE(t.commission_multiplier, 1)), sp.name
    INTO v_rate, v_multiplier, v_plan
    FROM public.referrers r
    JOIN public.companies c ON c.id = p_company_id
    LEFT JOIN public.subscription_plans sp ON sp.id = c.subscription_plan_id
    LEFT JOIN public.referral_tiers t ON t.id = r.tier_id
    WHERE r.id = v_partner AND r.is_active AND NOT EXISTS (
      SELECT 1 FROM public.referral_conversions cv WHERE cv.referrer_id = v_partner
        AND cv.company_id = p_company_id AND cv.fraud_status = 'blocked'
    );
    IF NOT FOUND THEN RETURN jsonb_build_object('result', 'ineligible'); END IF;

    v_period := (p_paid_at AT TIME ZONE 'Europe/Rome')::date;
    IF EXISTS (
      SELECT 1 FROM public.referral_commission_ledger WHERE source_key IS NULL AND status <> 'cancelled'
        AND referrer_id = v_partner AND company_id = p_company_id
        AND period_year = extract(year FROM v_period) AND period_month = extract(month FROM v_period)
    ) THEN
      RETURN jsonb_build_object('result', 'legacy_period');
    END IF;

    INSERT INTO private.referral_cash_receipts VALUES (
      p_invoice_id, p_charge_id, v_partner, p_company_id, p_paid_at, p_kind, p_gross_cents, p_net_cents,
      v_rate, v_multiplier, round(p_net_cents * v_rate * v_multiplier / 100)
    ) RETURNING * INTO v_receipt;

    INSERT INTO public.referral_commission_ledger (
      referrer_id, company_id, period_month, period_year, subscription_plan_name, plan_mrr,
      commission_type, commission_rate, tier_multiplier, commission_amount, status, source_key, cash_paid_at
    ) VALUES (
      v_partner, p_company_id, extract(month FROM v_period), extract(year FROM v_period),
      CASE WHEN p_kind = 'addon' THEN 'Servizio aggiuntivo' ELSE v_plan END, p_net_cents / 100.0,
      'stripe_receipt', v_rate, v_multiplier, v_receipt.commission_cents / 100.0, 'pending',
      'stripe:invoice:' || p_invoice_id, p_paid_at
    );
    v_credit := true;
  END IF;

  SELECT COALESCE(sum(amount_cents), 0) INTO v_refunded
  FROM private.referral_cash_refunds WHERE invoice_id = p_invoice_id AND status = 'succeeded';
  v_reversed := round(v_receipt.commission_cents::numeric *
    least(v_refunded, v_receipt.gross_cents) / v_receipt.gross_cents);

  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_refunds) AS r(
      refund_id text, amount_cents bigint, status text, occurred_at timestamptz
    ) ORDER BY occurred_at, refund_id
  LOOP
    IF v_item.refund_id IS NULL OR v_item.refund_id !~ '^re_[a-zA-Z0-9_]+$'
      OR v_item.amount_cents IS NULL OR v_item.amount_cents NOT BETWEEN 1 AND v_receipt.gross_cents
      OR v_item.status IS NULL OR v_item.status NOT IN ('succeeded', 'failed', 'canceled')
      OR v_item.occurred_at IS NULL THEN
      RAISE EXCEPTION 'Dati di rimborso Stripe non validi' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_refund FROM private.referral_cash_refunds WHERE refund_id = v_item.refund_id;
    IF FOUND THEN
      IF v_refund.invoice_id <> p_invoice_id OR v_refund.amount_cents <> v_item.amount_cents THEN
        RAISE EXCEPTION 'Rimborso già associato a un altro movimento' USING ERRCODE = '23505';
      END IF;
      -- A failed or canceled refund cannot be reinstated by an older webhook.
      IF v_refund.status <> 'succeeded' OR v_item.status = 'succeeded' THEN CONTINUE; END IF;
      UPDATE private.referral_cash_refunds SET status = v_item.status WHERE refund_id = v_item.refund_id;
      v_refunded := v_refunded - v_item.amount_cents;
      v_key := 'stripe:refund-reversal:' || v_item.refund_id;
    ELSE
      INSERT INTO private.referral_cash_refunds VALUES (v_item.refund_id, p_invoice_id, v_item.amount_cents, v_item.status);
      IF v_item.status <> 'succeeded' THEN CONTINUE; END IF;
      v_refunded := v_refunded + v_item.amount_cents;
      v_key := 'stripe:refund:' || v_item.refund_id;
    END IF;

    v_new_reversed := round(v_receipt.commission_cents::numeric *
      least(v_refunded, v_receipt.gross_cents) / v_receipt.gross_cents);
    v_delta := v_reversed - v_new_reversed;
    v_reversed := v_new_reversed;
    v_period := (v_item.occurred_at AT TIME ZONE 'Europe/Rome')::date;

    INSERT INTO public.referral_commission_ledger (
      referrer_id, company_id, period_month, period_year, subscription_plan_name, plan_mrr,
      commission_type, commission_rate, tier_multiplier, commission_amount, status, source_key, cash_paid_at
    ) VALUES (
      v_receipt.referrer_id, v_receipt.company_id, extract(month FROM v_period), extract(year FROM v_period),
      CASE WHEN v_item.status = 'succeeded' THEN 'Rimborso Stripe' ELSE 'Rimborso Stripe non riuscito' END,
      round(v_receipt.net_cents::numeric * v_item.amount_cents / v_receipt.gross_cents)
        * CASE WHEN v_item.status = 'succeeded' THEN -1 ELSE 1 END / 100.0,
      CASE WHEN v_item.status = 'succeeded' THEN 'stripe_refund' ELSE 'stripe_refund_reversal' END,
      v_receipt.rate_pct, v_receipt.multiplier, v_delta / 100.0, 'pending', v_key, v_receipt.paid_at
    );
    v_count := v_count + 1;
  END LOOP;

  IF v_credit OR v_count > 0 THEN
    UPDATE public.referrers SET total_earned = (
      SELECT COALESCE(sum(commission_amount), 0) FROM public.referral_commission_ledger
      WHERE referrer_id = v_receipt.referrer_id AND status <> 'cancelled'
    ) WHERE id = v_receipt.referrer_id;
  END IF;
  IF v_count > 0 THEN PERFORM private.referral_revalidate_reservations(v_receipt.referrer_id); END IF;

  RETURN jsonb_build_object('result', 'recorded', 'credit_created', v_credit, 'refund_movements', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.referral_record_stripe_receipt(text,text,uuid,timestamptz,text,bigint,bigint,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.referral_record_stripe_receipt(text,text,uuid,timestamptz,text,bigint,bigint,jsonb)
  TO service_role;

-- Keep the existing admin and cron entry point. Eligibility is now based on
-- posted cash movements only, so a monthly run never credits catalog prices.
CREATE OR REPLACE FUNCTION public.calculate_monthly_commissions(p_month integer, p_year integer)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_period date := make_date(p_year, p_month, 1);
BEGIN
  IF NOT private.can_manage_referral_payments() THEN
    RAISE EXCEPTION 'Operazione riservata allo staff' USING ERRCODE = '42501';
  END IF;
  IF v_period >= date_trunc('month', now() AT TIME ZONE 'Europe/Rome')::date THEN
    RAISE EXCEPTION 'Il mese non è ancora chiuso';
  END IF;
  RETURN (SELECT count(*) FROM public.referral_commission_ledger
    WHERE period_month = p_month AND period_year = p_year AND status <> 'cancelled');
END;
$$;

CREATE FUNCTION public.referral_stripe_sync_cursor(p_synced_through timestamptz DEFAULT NULL)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_cursor timestamptz;
BEGIN
  IF NOT (current_setting('role', true) = 'service_role' OR COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'service_role') THEN
    RAISE EXCEPTION 'Operazione riservata al servizio pagamenti' USING ERRCODE = '42501';
  END IF;
  IF p_synced_through IS NOT NULL THEN
    IF p_synced_through > now() THEN RAISE EXCEPTION 'Data riconciliazione non valida'; END IF;
    UPDATE private.referral_cash_settings
    SET synced_through = greatest(synced_through, p_synced_through) WHERE singleton;
  END IF;
  SELECT synced_through INTO STRICT v_cursor FROM private.referral_cash_settings WHERE singleton;
  RETURN v_cursor;
END;
$$;
REVOKE ALL ON FUNCTION public.referral_stripe_sync_cursor(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.referral_stripe_sync_cursor(timestamptz) TO service_role;

-- Reconcile daily even if a Stripe webhook failed or its refund event was not enabled.
-- Derive the endpoint from the existing environment's scheduled job.
DO $$
DECLARE v_endpoint text;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN; END IF;
  SELECT substring(command from '(https?://[^'' ]+/functions/v1/referral-monthly-cycle)')
  INTO v_endpoint FROM cron.job WHERE jobname = 'referral-monthly-cycle';
  IF v_endpoint IS NULL THEN RETURN; END IF;
  PERFORM cron.schedule('referral-stripe-sync', '17 2,8,14,20 * * *', format($job$
    SELECT net.http_post(
      url := %L, headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')),
      body := '{"sync_only":true}'::jsonb, timeout_milliseconds := 115000
    );
  $job$, v_endpoint));
END;
$$;
