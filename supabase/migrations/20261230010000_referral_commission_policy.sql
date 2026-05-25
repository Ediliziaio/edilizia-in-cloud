-- Referral commission policy stored in platform_settings.
-- The UI can save the policy immediately; these functions make it reusable by SQL/Edge jobs.

INSERT INTO public.platform_settings (key, value)
VALUES (
  'referral_commission_policy',
  '{
    "attributionWindowDays": 90,
    "clawbackDays": 30,
    "minPayoutAmount": 50,
    "qualityThreshold": 70,
    "qualityPenaltyPct": 25,
    "errorThresholdPct": 10,
    "errorPenaltyPct": 20,
    "volumeBonusMinDeals": 5,
    "volumeBonusPct": 10,
    "autoBlockFraud": true,
    "requireAcceptedTerms": true,
    "requirePayoutDetails": true
  }'
)
ON CONFLICT (key) DO NOTHING;

DROP POLICY IF EXISTS "authenticated_read_referral_commission_policy" ON public.platform_settings;
CREATE POLICY "authenticated_read_referral_commission_policy"
ON public.platform_settings FOR SELECT TO authenticated
USING (key = 'referral_commission_policy');

CREATE OR REPLACE FUNCTION public.get_referral_commission_policy()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy jsonb;
BEGIN
  SELECT value::jsonb
  INTO v_policy
  FROM public.platform_settings
  WHERE key = 'referral_commission_policy';

  RETURN COALESCE(v_policy, '{
    "attributionWindowDays": 90,
    "clawbackDays": 30,
    "minPayoutAmount": 50,
    "qualityThreshold": 70,
    "qualityPenaltyPct": 25,
    "errorThresholdPct": 10,
    "errorPenaltyPct": 20,
    "volumeBonusMinDeals": 5,
    "volumeBonusPct": 10,
    "autoBlockFraud": true,
    "requireAcceptedTerms": true,
    "requirePayoutDetails": true
  }'::jsonb);
EXCEPTION WHEN others THEN
  RETURN '{
    "attributionWindowDays": 90,
    "clawbackDays": 30,
    "minPayoutAmount": 50,
    "qualityThreshold": 70,
    "qualityPenaltyPct": 25,
    "errorThresholdPct": 10,
    "errorPenaltyPct": 20,
    "volumeBonusMinDeals": 5,
    "volumeBonusPct": 10,
    "autoBlockFraud": true,
    "requireAcceptedTerms": true,
    "requirePayoutDetails": true
  }'::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_referral_commission_policy(
  p_base_amount numeric,
  p_quality_score numeric DEFAULT 100,
  p_error_rate numeric DEFAULT 0,
  p_volume_deals integer DEFAULT 1,
  p_months_active numeric DEFAULT 2,
  p_has_fraud boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy jsonb := public.get_referral_commission_policy();
  v_final numeric := GREATEST(COALESCE(p_base_amount, 0), 0);
  v_adjustments jsonb := '[]'::jsonb;
  v_hold boolean := false;
  v_blocked boolean := false;
  v_quality_threshold numeric := COALESCE((v_policy->>'qualityThreshold')::numeric, 70);
  v_quality_penalty numeric := COALESCE((v_policy->>'qualityPenaltyPct')::numeric, 25);
  v_error_threshold numeric := COALESCE((v_policy->>'errorThresholdPct')::numeric, 10);
  v_error_penalty numeric := COALESCE((v_policy->>'errorPenaltyPct')::numeric, 20);
  v_volume_min integer := COALESCE((v_policy->>'volumeBonusMinDeals')::integer, 5);
  v_volume_bonus numeric := COALESCE((v_policy->>'volumeBonusPct')::numeric, 10);
  v_clawback_days numeric := COALESCE((v_policy->>'clawbackDays')::numeric, 30);
  v_auto_block boolean := COALESCE((v_policy->>'autoBlockFraud')::boolean, true);
BEGIN
  IF v_auto_block AND COALESCE(p_has_fraud, false) THEN
    RETURN jsonb_build_object(
      'baseAmount', GREATEST(COALESCE(p_base_amount, 0), 0),
      'finalAmount', 0,
      'hold', false,
      'blocked', true,
      'adjustments', jsonb_build_array('Anomalia/frode: payout bloccato')
    );
  END IF;

  IF COALESCE(p_quality_score, 100) < v_quality_threshold THEN
    v_final := v_final * (1 - v_quality_penalty / 100);
    v_adjustments := v_adjustments || to_jsonb(format('Qualita sotto %s: -%s%%', v_quality_threshold, v_quality_penalty));
  END IF;

  IF COALESCE(p_error_rate, 0) > v_error_threshold THEN
    v_final := v_final * (1 - v_error_penalty / 100);
    v_adjustments := v_adjustments || to_jsonb(format('Errori sopra %s%%: -%s%%', v_error_threshold, v_error_penalty));
  END IF;

  IF COALESCE(p_volume_deals, 0) >= v_volume_min THEN
    v_final := v_final * (1 + v_volume_bonus / 100);
    v_adjustments := v_adjustments || to_jsonb(format('Volume da %s+ vendite: +%s%%', v_volume_min, v_volume_bonus));
  END IF;

  v_hold := COALESCE(p_months_active, 0) * 30 < v_clawback_days;
  IF v_hold THEN
    v_adjustments := v_adjustments || to_jsonb(format('Finestra clawback %s giorni: payout in sospeso', v_clawback_days));
  END IF;

  RETURN jsonb_build_object(
    'baseAmount', GREATEST(COALESCE(p_base_amount, 0), 0),
    'finalAmount', CASE WHEN v_hold THEN 0 ELSE ROUND(v_final, 2) END,
    'hold', v_hold,
    'blocked', v_blocked,
    'adjustments', v_adjustments
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_referral_commission_policy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_referral_commission_policy(numeric, numeric, numeric, integer, numeric, boolean) TO authenticated;

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
        OR (
          COALESCE(r.payout_method, '') <> ''
          AND COALESCE(r.payout_details, '{}'::jsonb) <> '{}'::jsonb
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.referral_fraud_log rfl
        WHERE rfl.referrer_id = r.id
          AND COALESCE(rfl.detected_at, now()) >= now() - interval '60 days'
      )
    GROUP BY r.id, r.name, r.email, r.payout_method
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
        'Generato da policy referral: soglia minima ' || v_min_payout::text
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
