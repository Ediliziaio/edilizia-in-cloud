ALTER TABLE public.referral_payouts
  ALTER COLUMN paid_at DROP NOT NULL,
  ALTER COLUMN paid_at DROP DEFAULT,
  ADD COLUMN request_key uuid;

CREATE UNIQUE INDEX referral_payout_request_key
  ON public.referral_payouts (referrer_id, request_key) WHERE request_key IS NOT NULL;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE private.referral_payout_allocations (
  payout_id uuid REFERENCES public.referral_payouts(id) ON DELETE RESTRICT,
  ledger_id uuid REFERENCES public.referral_commission_ledger(id) ON DELETE RESTRICT,
  amount numeric(16, 2) NOT NULL CHECK (amount > 0),
  PRIMARY KEY (payout_id, ledger_id)
);
CREATE INDEX referral_allocations_by_ledger ON private.referral_payout_allocations (ledger_id);

CREATE TABLE private.referral_payment_instructions (
  payout_id uuid PRIMARY KEY REFERENCES public.referral_payouts(id) ON DELETE RESTRICT,
  payment_method text NOT NULL,
  amount numeric(16, 2) NOT NULL,
  reference text NOT NULL UNIQUE,
  beneficiary text,
  iban text,
  prepared_by uuid,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid,
  confirmed_at timestamptz
);

REVOKE ALL ON private.referral_payout_allocations, private.referral_payment_instructions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.referral_payouts, public.referral_commission_ledger FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.can_manage_referral_payments() RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'service_role'
    OR current_setting('role', true) = 'service_role'
    OR COALESCE(public.has_role(auth.uid(), 'super_admin'::public.app_role), false);
$$;

CREATE FUNCTION private.referral_lock_balance(p_referrer uuid) RETURNS void
LANGUAGE sql SET search_path = '' AS $$
  SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('referral-balance:' || p_referrer, 0));
$$;

CREATE FUNCTION private.referral_check_terms(p_referrer public.referrers, p_amount numeric, p_method text)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_policy jsonb := public.get_referral_commission_policy();
BEGIN
  IF p_referrer.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Il partner non è attivo';
  END IF;
  IF p_amount < COALESCE((v_policy->>'minPayoutAmount')::numeric, 50) THEN
    RAISE EXCEPTION 'Importo inferiore alla soglia minima';
  END IF;
  IF NOT public.is_referrer_payout_compliant(p_referrer.payout_details, p_referrer.has_accepted_terms, p_method) THEN
    RAISE EXCEPTION 'Completa la verifica del contratto e delle coordinate di pagamento';
  END IF;
  IF COALESCE((v_policy->>'autoBlockFraud')::boolean, true) AND EXISTS (
    SELECT 1 FROM public.referral_fraud_log
    WHERE referrer_id = p_referrer.id AND COALESCE(detected_at, now()) >= now() - interval '60 days'
  ) THEN
    RAISE EXCEPTION 'È necessaria una verifica delle segnalazioni del partner';
  END IF;
END;
$$;

CREATE FUNCTION private.referral_balance_at(p_referrer uuid, p_cutoff date) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH credits AS (
    SELECT COALESCE(sum(trunc(commission_amount, 2)), 0) AS earned
    FROM public.referral_commission_ledger
    WHERE referrer_id = p_referrer AND status <> 'cancelled'
      AND make_date(period_year, period_month, 1) < p_cutoff
  ), debits AS (
    SELECT COALESCE(sum(amount) FILTER (WHERE status = 'paid'), 0) AS paid,
      COALESCE(sum(amount) FILTER (WHERE status IN ('pending', 'approved', 'processing')), 0) AS reserved
    FROM public.referral_payouts WHERE referrer_id = p_referrer
  )
  SELECT jsonb_build_object('earned', earned, 'paid', paid, 'reserved', reserved,
    'available', greatest(0, earned - paid - reserved))
  FROM credits, debits;
$$;

CREATE FUNCTION public.referral_payout_balance(p_referrer_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.can_manage_referral_payments() AND (public.utente_bloccato() OR NOT EXISTS (
    SELECT 1 FROM public.referrers WHERE id = p_referrer_id AND user_id = auth.uid()
  )) THEN
    RAISE EXCEPTION 'Accesso al saldo non consentito' USING ERRCODE = '42501';
  END IF;
  RETURN private.referral_balance_at(p_referrer_id, date_trunc('month', now() AT TIME ZONE 'Europe/Rome')::date);
END;
$$;

CREATE FUNCTION private.referral_reserve_payout(
  p_referrer public.referrers, p_amount numeric, p_key uuid, p_notes text,
  p_cutoff date, p_automatic boolean, p_requested boolean
) RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_id uuid;
  v_existing numeric;
  v_remaining numeric;
  v_unallocated numeric;
  v_entry record;
  v_slice numeric;
  v_start date;
  v_method text := COALESCE(p_referrer.payout_method, 'bank_transfer');
BEGIN
  IF p_key IS NOT NULL THEN
    SELECT id, amount INTO v_id, v_existing FROM public.referral_payouts
    WHERE referrer_id = p_referrer.id AND request_key = p_key;
    IF FOUND THEN
      IF v_existing IS DISTINCT FROM p_amount THEN
        RAISE EXCEPTION 'La richiesta esiste già con un importo diverso';
      END IF;
      RETURN v_id;
    END IF;
  END IF;
  PERFORM private.referral_check_terms(p_referrer, p_amount, v_method);
  IF p_amount > (private.referral_balance_at(p_referrer.id, p_cutoff)->>'available')::numeric THEN
    RAISE EXCEPTION 'L’importo supera il saldo disponibile';
  END IF;

  SELECT min(make_date(period_year, period_month, 1)) INTO v_start
  FROM public.referral_commission_ledger WHERE referrer_id = p_referrer.id
    AND status <> 'cancelled' AND make_date(period_year, period_month, 1) < p_cutoff;

  INSERT INTO public.referral_payouts (
    referrer_id, amount, period_start, period_end, paid_at, payment_method, status, notes,
    request_key, requested_by_referrer, auto_generated, scheduled_payment_date
  ) VALUES (p_referrer.id, p_amount, v_start, p_cutoff - 1, NULL, v_method, 'pending',
    NULLIF(trim(p_notes), ''), p_key, p_requested, p_automatic,
    CASE WHEN p_automatic THEN p_cutoff + 11 END)
  RETURNING id INTO v_id;

  -- Historical payouts without allocations consume the oldest remaining credit first.
  SELECT greatest(0, COALESCE(sum(unallocated), 0)) INTO v_unallocated
  FROM (
    SELECT p.amount - COALESCE((
      SELECT sum(l.commission_amount) FROM public.referral_commission_ledger l
      WHERE l.payout_id = p.id AND l.status <> 'cancelled'
    ), 0) AS unallocated
    FROM public.referral_payouts p
    WHERE p.referrer_id = p_referrer.id AND p.id <> v_id AND p.request_key IS NULL
      AND p.status IN ('pending','approved','processing','paid')
      AND NOT EXISTS (SELECT 1 FROM private.referral_payout_allocations a WHERE a.payout_id = p.id)
  ) historic;

  v_remaining := p_amount;
  FOR v_entry IN
    SELECT l.id, trunc(l.commission_amount, 2) - COALESCE((
      SELECT sum(a.amount) FROM private.referral_payout_allocations a
      JOIN public.referral_payouts p ON p.id = a.payout_id
      WHERE a.ledger_id = l.id AND p.status IN ('pending','approved','processing','paid')
    ), 0) AS free
    FROM public.referral_commission_ledger l
    WHERE l.referrer_id = p_referrer.id AND l.status <> 'cancelled' AND l.payout_id IS NULL
      AND make_date(l.period_year, l.period_month, 1) < p_cutoff
    ORDER BY l.period_year, l.period_month, l.id
  LOOP
    IF v_entry.free <= 0 THEN CONTINUE; END IF;
    v_slice := least(v_entry.free, v_unallocated);
    v_unallocated := v_unallocated - v_slice;
    v_slice := least(v_entry.free - v_slice, v_remaining);
    IF v_slice <= 0 THEN CONTINUE; END IF;
    INSERT INTO private.referral_payout_allocations VALUES (v_id, v_entry.id, v_slice);
    v_remaining := v_remaining - v_slice;
    EXIT WHEN v_remaining = 0;
  END LOOP;
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'Il registro delle commissioni richiede una riconciliazione';
  END IF;
  UPDATE public.referral_payouts SET period_start = (
    SELECT min(make_date(l.period_year, l.period_month, 1))
    FROM private.referral_payout_allocations a
    JOIN public.referral_commission_ledger l ON l.id = a.ledger_id WHERE a.payout_id = v_id
  ) WHERE id = v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.referral_request_payout(
  p_referrer_id uuid, p_amount numeric, p_key uuid, p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_referrer public.referrers%ROWTYPE;
BEGIN
  SELECT * INTO v_referrer FROM public.referrers WHERE id = p_referrer_id;
  IF NOT FOUND OR (NOT private.can_manage_referral_payments()
    AND (public.utente_bloccato() OR v_referrer.user_id IS DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Accesso al pagamento non consentito' USING ERRCODE = '42501';
  END IF;
  IF p_key IS NULL OR p_amount IS NULL OR p_amount <= 0 OR p_amount >= 1e14 OR p_amount <> trunc(p_amount, 2)
     OR length(p_notes) > 2000 THEN
    RAISE EXCEPTION 'Verifica l’importo e le note della richiesta';
  END IF;
  PERFORM private.referral_lock_balance(p_referrer_id);
  SELECT * INTO STRICT v_referrer FROM public.referrers WHERE id = p_referrer_id FOR UPDATE;
  RETURN private.referral_reserve_payout(v_referrer, p_amount, p_key, p_notes,
    date_trunc('month', now() AT TIME ZONE 'Europe/Rome')::date, false,
    v_referrer.user_id IS NOT NULL AND v_referrer.user_id = auth.uid());
END;
$$;

CREATE FUNCTION public.referral_payout_transition(p_payout_id uuid, p_action text, p_reference text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_partner uuid;
  v_payout public.referral_payouts%ROWTYPE;
  v_referrer public.referrers%ROWTYPE;
  v_instruction private.referral_payment_instructions%ROWTYPE;
  v_reference text := NULLIF(trim(p_reference), '');
  v_iban text;
BEGIN
  IF NOT private.can_manage_referral_payments() THEN
    RAISE EXCEPTION 'Operazione riservata allo staff' USING ERRCODE = '42501';
  END IF;
  SELECT referrer_id INTO STRICT v_partner FROM public.referral_payouts WHERE id = p_payout_id;
  PERFORM private.referral_lock_balance(v_partner);
  SELECT * INTO STRICT v_referrer FROM public.referrers WHERE id = v_partner FOR UPDATE;
  SELECT * INTO STRICT v_payout FROM public.referral_payouts WHERE id = p_payout_id FOR UPDATE;

  CASE p_action
    WHEN 'approve' THEN
      IF v_payout.status = 'approved' THEN RETURN jsonb_build_object('status', 'approved'); END IF;
      IF v_payout.status IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'Richiesta non approvabile'; END IF;
      PERFORM private.referral_check_terms(v_referrer, v_payout.amount, v_payout.payment_method);
      UPDATE public.referral_payouts SET status = 'approved', approved_by = auth.uid(), approved_at = now()
      WHERE id = p_payout_id;
      RETURN jsonb_build_object('status', 'approved');

    WHEN 'prepare' THEN
      IF v_payout.status NOT IN ('approved', 'processing') OR v_payout.status IS NULL THEN
        RAISE EXCEPTION 'Approva la richiesta prima di preparare il pagamento';
      END IF;
      SELECT * INTO v_instruction FROM private.referral_payment_instructions WHERE payout_id = p_payout_id;
      IF FOUND THEN RETURN to_jsonb(v_instruction) || jsonb_build_object('created', false); END IF;
      IF COALESCE(v_referrer.payout_method, 'bank_transfer') <> v_payout.payment_method THEN
        RAISE EXCEPTION 'Metodo di pagamento cambiato. Annulla la richiesta e creane una nuova';
      END IF;
      PERFORM private.referral_check_terms(v_referrer, v_payout.amount, v_payout.payment_method);
      v_iban := upper(regexp_replace(COALESCE(v_referrer.payout_details->>'iban', ''), '[[:space:]]', '', 'g'));
      IF v_payout.payment_method = 'bank_transfer' AND (
        v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'
        OR NULLIF(trim(v_referrer.payout_details->>'account_holder'), '') IS NULL
      ) THEN
        RAISE EXCEPTION 'IBAN o intestatario assente nel conto verificato';
      END IF;
      INSERT INTO private.referral_payment_instructions (payout_id, payment_method, amount, reference, beneficiary, iban, prepared_by)
      VALUES (p_payout_id, v_payout.payment_method, v_payout.amount, 'EIC-' || replace(p_payout_id::text, '-', ''),
        COALESCE(NULLIF(trim(v_referrer.payout_details->>'account_holder'), ''), v_referrer.name),
        CASE WHEN v_payout.payment_method = 'bank_transfer' THEN v_iban END, auth.uid())
      RETURNING * INTO v_instruction;
      UPDATE public.referral_payouts SET status = 'processing' WHERE id = p_payout_id;
      RETURN to_jsonb(v_instruction) || jsonb_build_object('created', true);

    WHEN 'confirm' THEN
      IF v_reference IS NULL OR length(v_reference) NOT BETWEEN 3 AND 120 THEN
        RAISE EXCEPTION 'Inserisci il riferimento effettivo del pagamento';
      END IF;
      IF v_payout.status = 'paid' AND lower(trim(v_payout.transaction_reference)) = lower(v_reference) THEN
        RETURN jsonb_build_object('status', 'paid');
      END IF;
      IF v_payout.status IS DISTINCT FROM 'processing' OR NOT EXISTS (
        SELECT 1 FROM private.referral_payment_instructions WHERE payout_id = p_payout_id
      ) THEN
        RAISE EXCEPTION 'Prepara il pagamento prima di riconciliarlo';
      END IF;
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('referral-bank-ref:' || lower(v_reference), 0));
      IF EXISTS (
        SELECT 1 FROM public.referral_payouts WHERE status = 'paid' AND id <> p_payout_id
          AND lower(trim(transaction_reference)) = lower(v_reference)
      ) THEN
        RAISE EXCEPTION 'Riferimento già usato per un altro pagamento' USING ERRCODE = '23505';
      END IF;
      UPDATE public.referral_payouts SET status = 'paid', transaction_reference = v_reference, paid_at = now()
      WHERE id = p_payout_id;
      UPDATE private.referral_payment_instructions SET confirmed_by = auth.uid(), confirmed_at = now()
      WHERE payout_id = p_payout_id;
      UPDATE public.referral_commission_ledger l SET status = 'paid'
      WHERE l.referrer_id = v_partner AND l.status IN ('pending', 'approved') AND l.commission_amount > 0
        AND EXISTS (SELECT 1 FROM private.referral_payout_allocations a WHERE a.ledger_id = l.id AND a.payout_id = p_payout_id)
        AND trunc(l.commission_amount, 2) <= (
          SELECT sum(a.amount) FROM private.referral_payout_allocations a
          JOIN public.referral_payouts p ON p.id = a.payout_id WHERE a.ledger_id = l.id AND p.status = 'paid'
        );
      UPDATE public.referrers SET total_paid = (
        SELECT COALESCE(sum(amount), 0) FROM public.referral_payouts WHERE referrer_id = v_partner AND status = 'paid'
      ) WHERE id = v_partner;
      RETURN jsonb_build_object('status', 'paid');

    WHEN 'reject' THEN
      IF v_payout.status = 'rejected' THEN RETURN jsonb_build_object('status', 'rejected'); END IF;
      IF v_payout.status NOT IN ('pending', 'approved') OR v_payout.status IS NULL THEN
        RAISE EXCEPTION 'La richiesta non può più essere rifiutata';
      END IF;
      IF v_reference IS NULL OR length(v_reference) NOT BETWEEN 3 AND 500 THEN
        RAISE EXCEPTION 'Indica il motivo del rifiuto';
      END IF;
      UPDATE public.referral_payouts SET status = 'rejected', rejection_reason = v_reference WHERE id = p_payout_id;
      RETURN jsonb_build_object('status', 'rejected');

    WHEN 'bank_rejected' THEN
      IF v_payout.status = 'rejected' THEN RETURN jsonb_build_object('status', 'rejected'); END IF;
      IF v_payout.status IS DISTINCT FROM 'processing' OR v_reference IS NULL OR length(v_reference) NOT BETWEEN 3 AND 500 THEN
        RAISE EXCEPTION 'Indica il motivo e il riferimento dello scarto bancario';
      END IF;
      UPDATE public.referral_payouts SET status = 'rejected', rejection_reason = v_reference WHERE id = p_payout_id;
      RETURN jsonb_build_object('status', 'rejected');

    ELSE RAISE EXCEPTION 'Azione non valida';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_monthly_payouts(p_month integer, p_year integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_referrer public.referrers%ROWTYPE;
  v_id uuid;
  v_cutoff date := (make_date(p_year, p_month, 1) + interval '1 month')::date;
  v_amount numeric;
  v_count integer := 0;
  v_policy jsonb;
BEGIN
  IF NOT private.can_manage_referral_payments() THEN RAISE EXCEPTION 'Operazione riservata allo staff' USING ERRCODE = '42501'; END IF;
  IF v_cutoff > date_trunc('month', now() AT TIME ZONE 'Europe/Rome')::date THEN
    RAISE EXCEPTION 'Il mese non è ancora chiuso';
  END IF;
  v_policy := public.get_referral_commission_policy();
  FOR v_id IN SELECT id FROM public.referrers WHERE is_active ORDER BY id LOOP
    PERFORM private.referral_lock_balance(v_id);
    SELECT * INTO STRICT v_referrer FROM public.referrers WHERE id = v_id FOR UPDATE;
    v_amount := (private.referral_balance_at(v_id, v_cutoff)->>'available')::numeric;
    IF v_amount <= 0 OR v_amount < COALESCE((v_policy->>'minPayoutAmount')::numeric, 50)
      OR NOT public.is_referrer_payout_compliant(v_referrer.payout_details, v_referrer.has_accepted_terms, v_referrer.payout_method)
      OR (COALESCE((v_policy->>'autoBlockFraud')::boolean, true) AND EXISTS (
        SELECT 1 FROM public.referral_fraud_log WHERE referrer_id = v_id
          AND COALESCE(detected_at, now()) >= now() - interval '60 days'
      ))
      OR EXISTS (SELECT 1 FROM public.referral_payouts
        WHERE referrer_id = v_id AND auto_generated AND period_end = v_cutoff - 1)
    THEN CONTINUE; END IF;
    PERFORM private.referral_reserve_payout(v_referrer, v_amount, NULL,
      'Ciclo mensile delle commissioni maturate', v_cutoff, true, false);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION private.can_manage_referral_payments(), private.referral_lock_balance(uuid), private.referral_balance_at(uuid, date),
  private.referral_check_terms(public.referrers, numeric, text),
  private.referral_reserve_payout(public.referrers, numeric, uuid, text, date, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.referral_payout_balance(uuid), public.referral_request_payout(uuid, numeric, uuid, text),
  public.referral_payout_transition(uuid, text, text), public.generate_monthly_payouts(integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.referral_payout_balance(uuid), public.referral_request_payout(uuid, numeric, uuid, text),
  public.referral_payout_transition(uuid, text, text), public.generate_monthly_payouts(integer, integer)
  TO authenticated, service_role;

-- Close each month once per company and partner. The commercial basis remains the
-- plan list price and active add-ons plus billed usage, as in the existing program.
CREATE OR REPLACE FUNCTION public.calculate_monthly_commissions(p_month integer, p_year integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_start date := make_date(p_year, p_month, 1);
  v_end date := (v_start + interval '1 month')::date;
  v_start_ts timestamptz := v_start::timestamp AT TIME ZONE 'Europe/Rome';
  v_end_ts timestamptz := v_end::timestamp AT TIME ZONE 'Europe/Rome';
  v_partner uuid;
  v_count integer := 0;
  v_inserted integer;
BEGIN
  IF NOT private.can_manage_referral_payments() THEN
    RAISE EXCEPTION 'Operazione riservata allo staff' USING ERRCODE = '42501';
  END IF;
  IF v_end > date_trunc('month', now() AT TIME ZONE 'Europe/Rome')::date THEN
    RAISE EXCEPTION 'Il mese non è ancora chiuso';
  END IF;

  FOR v_partner IN SELECT id FROM public.referrers WHERE is_active ORDER BY id LOOP
    PERFORM private.referral_lock_balance(v_partner);
    WITH eligible AS (
      SELECT rc.company_id,
        CASE WHEN c.status = 'active' THEN sp.name END AS plan_name,
        CASE WHEN c.status = 'active' AND sp.id IS NOT NULL THEN COALESCE(sp.price_monthly, 0) END AS plan_price,
        COALESCE(t.commission_plan_pct, 20) AS plan_rate,
        COALESCE(t.commission_addon_pct, 5) AS addon_rate,
        COALESCE(t.commission_multiplier, 1) AS multiplier,
        COALESCE(t.commission_on_usage, false) AS on_usage,
        COALESCE(t.usage_commission_pct, 5) AS usage_rate
      FROM public.referral_companies rc
      JOIN public.referrers r ON r.id = rc.referrer_id AND r.is_active
      JOIN public.companies c ON c.id = rc.company_id
      LEFT JOIN public.subscription_plans sp ON sp.id = c.subscription_plan_id
      LEFT JOIN public.referral_tiers t ON t.id = r.tier_id
      WHERE rc.referrer_id = v_partner AND rc.is_active AND rc.referred_at < v_end_ts
        AND NOT EXISTS (
          SELECT 1 FROM public.referral_conversions cv
          WHERE cv.referrer_id = rc.referrer_id AND cv.company_id = rc.company_id AND cv.fraud_status = 'blocked'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.referral_commission_ledger l WHERE l.referrer_id = v_partner
            AND l.company_id = rc.company_id AND l.period_month = p_month AND l.period_year = p_year
        )
    ), commission AS (
      SELECT e.*,
        CASE WHEN e.plan_price IS NULL THEN 0 ELSE COALESCE((
          SELECT sum(pff.price_per_month)
          FROM public.company_feature_overrides cfo
          JOIN public.platform_feature_flags pff ON pff.key = cfo.feature_key
          WHERE cfo.company_id = e.company_id AND cfo.is_enabled AND pff.category = 'addon'
            AND (cfo.expires_at IS NULL OR cfo.expires_at >= v_end_ts)
        ), 0) END AS addons,
        CASE WHEN e.on_usage THEN
          COALESCE((SELECT sum(abs(u.amount_eur)) FROM public.email_credits_log u
            WHERE u.company_id = e.company_id AND u.type = 'deduct' AND u.created_at >= v_start_ts AND u.created_at < v_end_ts), 0)
          + COALESCE((SELECT sum(abs(u.amount_eur)) FROM public.whatsapp_credits_log u
            WHERE u.company_id = e.company_id AND u.type = 'deduct' AND u.created_at >= v_start_ts AND u.created_at < v_end_ts), 0)
          + COALESCE((SELECT sum(u.cost_billed_total) FROM public.ai_credit_usage u
            WHERE u.company_id = e.company_id AND u.created_at >= v_start_ts AND u.created_at < v_end_ts), 0)
        ELSE 0 END AS usage_amount
      FROM eligible e
    )
    INSERT INTO public.referral_commission_ledger (
      referrer_id, company_id, period_month, period_year, subscription_plan_name, plan_mrr,
      commission_type, commission_rate, tier_multiplier, commission_amount, status
    )
    SELECT v_partner, company_id, p_month, p_year, COALESCE(plan_name, 'usage_commission'),
      COALESCE(plan_price, usage_amount),
      CASE WHEN plan_price IS NULL THEN 'usage' ELSE 'percentage' END,
      CASE WHEN plan_price IS NULL THEN usage_rate ELSE plan_rate END,
      CASE WHEN plan_price IS NULL THEN 1 ELSE multiplier END,
      round(COALESCE(plan_price, 0) * plan_rate * multiplier / 100, 2)
        + round(addons * addon_rate * multiplier / 100, 2)
        + round(usage_amount * usage_rate / 100, 2), 'pending'
    FROM commission
    WHERE plan_price IS NOT NULL OR usage_amount > 0
    ON CONFLICT (referrer_id, company_id, period_month, period_year) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_count := v_count + v_inserted;

    UPDATE public.referrers SET total_earned = (
      SELECT COALESCE(sum(commission_amount), 0) FROM public.referral_commission_ledger
      WHERE referrer_id = v_partner AND status <> 'cancelled'
    ) WHERE id = v_partner;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_monthly_commissions(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_monthly_commissions(integer, integer) TO authenticated, service_role;

CREATE FUNCTION private.referral_single_active_partner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.is_active THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('referral-company:' || NEW.company_id, 0));
    IF EXISTS (
      SELECT 1 FROM public.referral_companies
      WHERE company_id = NEW.company_id AND referrer_id <> NEW.referrer_id AND is_active
    ) THEN
      RAISE EXCEPTION 'L’azienda è già assegnata a un altro partner' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.referral_single_active_partner() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER referral_single_active_partner
  BEFORE INSERT OR UPDATE OF company_id, referrer_id, is_active ON public.referral_companies
  FOR EACH ROW EXECUTE FUNCTION private.referral_single_active_partner();


CREATE OR REPLACE FUNCTION public.record_referral_conversion(
  p_referral_code text,
  p_company_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_click_id uuid DEFAULT NULL,
  p_revenue numeric DEFAULT 0,
  p_status text DEFAULT 'registered'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer public.referrers%ROWTYPE;
  v_conversion_id uuid;
  v_existing public.referral_conversions%ROWTYPE;
  v_commission numeric := 0;
  v_fraud_status text := 'clear';
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('referral-company:' || p_company_id, 0));

  SELECT * INTO v_referrer
  FROM public.referrers
  WHERE referral_code = p_referral_code
    AND is_active = true;

  IF v_referrer.id IS NULL THEN
    RAISE EXCEPTION 'Invalid referral code';
  END IF;

  SELECT * INTO v_existing FROM public.referral_conversions
  WHERE referrer_id = v_referrer.id AND company_id = p_company_id;
  IF (v_existing.status = 'paying' AND p_status IN ('registered','active'))
      OR (v_existing.status = 'active' AND p_status = 'registered') THEN
    p_status := v_existing.status;
  END IF;

  IF v_referrer.user_id IS NOT NULL AND p_user_id IS NOT NULL AND v_referrer.user_id = p_user_id THEN
    v_fraud_status := 'blocked';
    IF v_existing.fraud_status IS DISTINCT FROM 'blocked' THEN
      INSERT INTO public.referral_fraud_log(referrer_id, company_id, fraud_type, details)
      VALUES (v_referrer.id, p_company_id, 'self_referral', jsonb_build_object('user_id', p_user_id, 'source', 'record_referral_conversion'));
    END IF;
  END IF;

  IF COALESCE(p_revenue, 0) > 0 THEN
    IF v_referrer.commission_type = 'percentage' THEN
      v_commission := round((p_revenue * v_referrer.commission_value / 100)::numeric, 2);
    ELSE
      v_commission := v_referrer.commission_value;
    END IF;
  END IF;

  IF v_existing.id IS NOT NULL AND v_existing.status = p_status
    AND (p_user_id IS NULL OR v_existing.referred_user_id IS NOT DISTINCT FROM p_user_id)
    AND (p_click_id IS NULL OR v_existing.source_click_id IS NOT DISTINCT FROM p_click_id)
    AND COALESCE(p_revenue, 0) <= COALESCE(v_existing.revenue, 0)
    AND v_commission <= COALESCE(v_existing.commission_amount, 0)
    AND (v_fraud_status = 'clear' OR v_fraud_status = v_existing.fraud_status)
    AND (v_existing.fraud_status = 'blocked' OR EXISTS (
      SELECT 1 FROM public.referral_companies WHERE referrer_id = v_referrer.id AND company_id = p_company_id
    ))
  THEN
    RETURN v_existing.id;
  END IF;

  IF v_fraud_status = 'clear' AND NOT EXISTS (
    SELECT 1
    FROM public.referral_companies
    WHERE referrer_id = v_referrer.id
      AND company_id = p_company_id
  ) THEN
    INSERT INTO public.referral_companies(referrer_id, company_id, referred_at, is_active, notes)
    VALUES (v_referrer.id, p_company_id, now(), true, 'Auto-tracked referral conversion');
  END IF;

  INSERT INTO public.referral_conversions(
    referrer_id,
    referred_user_id,
    company_id,
    source_click_id,
    status,
    revenue,
    commission_amount,
    fraud_status
  )
  VALUES (
    v_referrer.id,
    p_user_id,
    p_company_id,
    p_click_id,
    p_status,
    COALESCE(p_revenue, 0),
    v_commission,
    v_fraud_status
  )
  ON CONFLICT (referrer_id, company_id)
  DO UPDATE SET
    referred_user_id = COALESCE(EXCLUDED.referred_user_id, referral_conversions.referred_user_id),
    source_click_id = COALESCE(EXCLUDED.source_click_id, referral_conversions.source_click_id),
    status = EXCLUDED.status,
    revenue = GREATEST(referral_conversions.revenue, EXCLUDED.revenue),
    commission_amount = GREATEST(referral_conversions.commission_amount, EXCLUDED.commission_amount),
    fraud_status = CASE
      WHEN referral_conversions.fraud_status = 'blocked' OR EXCLUDED.fraud_status = 'blocked' THEN 'blocked'
      WHEN referral_conversions.fraud_status = 'review' OR EXCLUDED.fraud_status = 'review' THEN 'review'
      ELSE 'clear'
    END,
    updated_at = now()
  RETURNING id INTO v_conversion_id;

  IF p_click_id IS NOT NULL THEN
    UPDATE public.referral_clicks
    SET converted = true, converted_at = now(), converted_company_id = p_company_id
    WHERE id = p_click_id;
  END IF;

  UPDATE public.referrers
  SET
    total_conversions = (
      SELECT count(*)::integer
      FROM public.referral_conversions
      WHERE referrer_id = v_referrer.id
        AND status IN ('registered', 'active', 'paying', 'approved')
        AND fraud_status <> 'blocked'
    ),
    conversion_rate = CASE
      WHEN COALESCE(total_clicks, 0) > 0 THEN round(((
        SELECT count(*)::numeric
        FROM public.referral_conversions
        WHERE referrer_id = v_referrer.id
          AND status IN ('registered', 'active', 'paying', 'approved')
          AND fraud_status <> 'blocked'
      ) / total_clicks) * 100, 2)
      ELSE 0
    END,
    last_event_at = now()
  WHERE id = v_referrer.id;

  PERFORM public.log_referral_event(
    CASE
      WHEN p_status = 'paying' THEN 'payment'
      WHEN p_status = 'active' THEN 'activation'
      ELSE 'register'
    END,
    v_referrer.id,
    p_referral_code,
    p_click_id,
    p_user_id,
    p_company_id,
    jsonb_build_object('status', p_status, 'revenue', COALESCE(p_revenue, 0), 'commission', v_commission, 'fraud_status', v_fraud_status)
  );

  RETURN v_conversion_id;
END;
$$;
