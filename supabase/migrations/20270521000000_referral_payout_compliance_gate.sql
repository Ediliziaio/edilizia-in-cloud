-- Referral payout compliance hardening.
-- A payout can be generated or processed only after bank verification and contract approval.

CREATE OR REPLACE FUNCTION public.is_referrer_payout_compliant(
  p_payout_details jsonb,
  p_has_accepted_terms boolean,
  p_payout_method text DEFAULT 'bank_transfer'
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    (
      COALESCE(p_payout_method, 'bank_transfer') <> 'bank_transfer'
      OR COALESCE(p_payout_details #>> '{bank_verification,status}', '') = 'verified'
    )
    AND COALESCE(p_has_accepted_terms, false) = true
    AND COALESCE(p_payout_details #>> '{contract,status}', '') = 'approved';
$$;

CREATE OR REPLACE FUNCTION public.partner_submit_referral_payout_details(
  p_name text,
  p_phone text,
  p_partner_type text,
  p_payout_method text,
  p_iban text,
  p_account_holder text,
  p_bank text,
  p_fiscal_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer public.referrers%ROWTYPE;
  v_current jsonb;
  v_next jsonb;
  v_bank_changed boolean;
  v_next_bank_status text;
BEGIN
  SELECT *
  INTO v_referrer
  FROM public.referrers
  WHERE user_id = auth.uid()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_referrer.id IS NULL THEN
    RAISE EXCEPTION 'Profilo partner non trovato';
  END IF;

  IF COALESCE(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'Nome partner obbligatorio';
  END IF;

  IF COALESCE(p_payout_method, 'bank_transfer') = 'bank_transfer' THEN
    IF COALESCE(trim(p_iban), '') = '' OR COALESCE(trim(p_account_holder), '') = '' THEN
      RAISE EXCEPTION 'IBAN e intestatario sono obbligatori';
    END IF;
  END IF;

  v_current := COALESCE(v_referrer.payout_details, '{}'::jsonb);
  v_bank_changed :=
    COALESCE(upper(replace(p_iban, ' ', '')), '') <> COALESCE(v_current->>'iban', '')
    OR COALESCE(trim(p_account_holder), '') <> COALESCE(v_current->>'account_holder', '')
    OR COALESCE(trim(p_bank), '') <> COALESCE(v_current->>'bank', '')
    OR COALESCE(trim(p_fiscal_code), '') <> COALESCE(v_current->>'fiscal_code', '');

  v_next_bank_status := CASE
    WHEN COALESCE(p_payout_method, 'bank_transfer') <> 'bank_transfer' THEN COALESCE(v_current #>> '{bank_verification,status}', 'missing')
    WHEN v_bank_changed OR COALESCE(v_current #>> '{bank_verification,status}', '') IN ('', 'draft', 'rejected') THEN 'pending'
    ELSE COALESCE(v_current #>> '{bank_verification,status}', 'pending')
  END;

  v_next := jsonb_set(
    v_current,
    '{iban}',
    COALESCE(to_jsonb(NULLIF(upper(replace(COALESCE(p_iban, ''), ' ', '')), '')), 'null'::jsonb),
    true
  );
  v_next := jsonb_set(
    v_next,
    '{account_holder}',
    COALESCE(to_jsonb(NULLIF(trim(COALESCE(p_account_holder, '')), '')), 'null'::jsonb),
    true
  );
  v_next := jsonb_set(
    v_next,
    '{bank}',
    COALESCE(to_jsonb(NULLIF(trim(COALESCE(p_bank, '')), '')), 'null'::jsonb),
    true
  );
  v_next := jsonb_set(
    v_next,
    '{fiscal_code}',
    COALESCE(to_jsonb(NULLIF(trim(COALESCE(p_fiscal_code, '')), '')), 'null'::jsonb),
    true
  );
  v_next := jsonb_set(
    v_next,
    '{bank_verification}',
    jsonb_build_object(
      'status', v_next_bank_status,
      'submitted_at', CASE WHEN v_next_bank_status = 'pending' THEN now() ELSE v_current #>> '{bank_verification,submitted_at}' END,
      'verified_at', CASE WHEN v_next_bank_status = 'verified' THEN COALESCE(v_current #>> '{bank_verification,verified_at}', now()::text) ELSE NULL END,
      'rejected_at', NULL,
      'reviewed_by', CASE WHEN v_next_bank_status = 'verified' THEN v_current #>> '{bank_verification,reviewed_by}' ELSE NULL END,
      'rejection_reason', NULL
    ),
    true
  );

  UPDATE public.referrers
  SET
    name = trim(p_name),
    phone = NULLIF(trim(COALESCE(p_phone, '')), ''),
    partner_type = COALESCE(NULLIF(trim(p_partner_type), ''), partner_type),
    payout_method = COALESCE(NULLIF(trim(p_payout_method), ''), 'bank_transfer'),
    payout_details = v_next
  WHERE id = v_referrer.id;

  RETURN jsonb_build_object('bank_status', v_next_bank_status, 'bank_changed', v_bank_changed);
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_sign_referral_contract(
  p_signed_name text,
  p_ip_address text,
  p_user_agent text,
  p_contract_version text DEFAULT '1.0'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer public.referrers%ROWTYPE;
  v_current jsonb;
  v_contract jsonb;
  v_signed_at timestamptz := now();
BEGIN
  SELECT *
  INTO v_referrer
  FROM public.referrers
  WHERE user_id = auth.uid()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_referrer.id IS NULL THEN
    RAISE EXCEPTION 'Profilo partner non trovato';
  END IF;

  IF COALESCE(trim(p_signed_name), '') = '' THEN
    RAISE EXCEPTION 'Nome firmatario obbligatorio';
  END IF;

  v_current := COALESCE(v_referrer.payout_details, '{}'::jsonb);
  v_contract := jsonb_build_object(
    'status', 'signed_pending_approval',
    'version', COALESCE(NULLIF(trim(p_contract_version), ''), '1.0'),
    'signed_name', trim(p_signed_name),
    'signed_at', v_signed_at,
    'ip_address', NULLIF(trim(COALESCE(p_ip_address, '')), ''),
    'user_agent', NULLIF(trim(COALESCE(p_user_agent, '')), ''),
    'approved_at', NULL,
    'rejected_at', NULL,
    'reviewed_by', NULL,
    'rejection_reason', NULL
  );

  UPDATE public.referrers
  SET
    has_accepted_terms = true,
    terms_accepted_at = v_signed_at,
    payout_details = jsonb_set(
      jsonb_set(v_current, '{contract}', v_contract, true),
      '{contract_signature}',
      v_contract,
      true
    )
  WHERE id = v_referrer.id;

  RETURN jsonb_build_object('contract_status', 'signed_pending_approval');
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_referrer_payout_compliant(jsonb, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.partner_submit_referral_payout_details(text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_sign_referral_contract(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_monthly_payouts(p_month int, p_year int)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer record;
  v_period_start date;
  v_period_end date;
  v_payment_date date;
  v_count integer := 0;
  v_policy jsonb := public.get_referral_commission_policy();
  v_min_payout numeric := COALESCE((v_policy->>'minPayoutAmount')::numeric, 50);
  v_require_terms boolean := COALESCE((v_policy->>'requireAcceptedTerms')::boolean, true);
  v_require_payout_details boolean := COALESCE((v_policy->>'requirePayoutDetails')::boolean, true);
BEGIN
  v_period_start := make_date(p_year, p_month, 1);
  v_period_end := (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date;
  v_payment_date := make_date(
    CASE WHEN p_month = 12 THEN p_year + 1 ELSE p_year END,
    CASE WHEN p_month = 12 THEN 1 ELSE p_month + 1 END,
    12
  );

  FOR v_referrer IN
    SELECT
      r.id,
      r.name,
      r.email,
      r.payout_method,
      r.payout_details,
      r.has_accepted_terms,
      COALESCE(SUM(rcl.commission_amount), 0) AS total_commission
    FROM public.referrers r
    JOIN public.referral_commission_ledger rcl ON rcl.referrer_id = r.id
    WHERE rcl.period_month = p_month
      AND rcl.period_year = p_year
      AND rcl.status = 'pending'
      AND r.is_active = true
      AND (NOT v_require_terms OR COALESCE(r.has_accepted_terms, false) = true)
      AND (
        NOT v_require_payout_details
        OR public.is_referrer_payout_compliant(r.payout_details, r.has_accepted_terms, r.payout_method)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.referral_fraud_log rfl
        WHERE rfl.referrer_id = r.id
          AND COALESCE(rfl.detected_at, now()) >= now() - interval '60 days'
      )
    GROUP BY r.id, r.name, r.email, r.payout_method, r.payout_details, r.has_accepted_terms
    HAVING COALESCE(SUM(rcl.commission_amount), 0) >= v_min_payout
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.referral_payouts
      WHERE referrer_id = v_referrer.id
        AND period_start = v_period_start
        AND auto_generated = true
    ) THEN
      INSERT INTO public.referral_payouts (
        referrer_id,
        amount,
        period_start,
        period_end,
        paid_at,
        payment_method,
        status,
        scheduled_payment_date,
        auto_generated,
        notes
      )
      VALUES (
        v_referrer.id,
        v_referrer.total_commission,
        v_period_start,
        v_period_end,
        now(),
        COALESCE(v_referrer.payout_method, 'bank_transfer'),
        'pending',
        v_payment_date,
        true,
        'Generato da policy referral con compliance payout approvata'
      );

      UPDATE public.referral_commission_ledger
      SET status = 'approved'
      WHERE referrer_id = v_referrer.id
        AND period_month = p_month
        AND period_year = p_year
        AND status = 'pending';

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_monthly_payouts(int, int) TO authenticated;
