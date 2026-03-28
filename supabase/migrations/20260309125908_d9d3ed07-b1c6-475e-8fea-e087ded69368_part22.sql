-- Calculate monthly commissions
CREATE OR REPLACE FUNCTION public.calculate_monthly_commissions(
  p_month INTEGER,
  p_year INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  v_referrer RECORD;
  v_company RECORD;
  v_plan_mrr NUMERIC;
  v_commission NUMERIC;
  v_multiplier NUMERIC;
  v_count INTEGER := 0;
BEGIN
  FOR v_referrer IN
    SELECT r.*, COALESCE(rt.commission_multiplier, 1.00) AS tier_multiplier
    FROM referrers r
    LEFT JOIN referral_tiers rt ON r.tier_id = rt.id
    WHERE r.is_active = true
  LOOP
    FOR v_company IN
      SELECT rc.company_id, sp.price_monthly, sp.name AS plan_name
      FROM referral_companies rc
      JOIN companies c ON rc.company_id = c.id
      JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
      WHERE rc.referrer_id = v_referrer.id
        AND rc.is_active = true
        AND c.status = 'active'
    LOOP
      v_plan_mrr := COALESCE(v_company.price_monthly, 0);
      v_multiplier := COALESCE(v_referrer.tier_multiplier, 1.00);

      IF v_referrer.commission_type = 'percentage' THEN
        v_commission := v_plan_mrr * (v_referrer.commission_value / 100) * v_multiplier;
      ELSE
        v_commission := v_referrer.commission_value * v_multiplier;
      END IF;

      INSERT INTO referral_commission_ledger (
        referrer_id, company_id, period_month, period_year,
        subscription_plan_name, plan_mrr,
        commission_type, commission_rate, tier_multiplier, commission_amount,
        status
      ) VALUES (
        v_referrer.id, v_company.company_id, p_month, p_year,
        v_company.plan_name, v_plan_mrr,
        v_referrer.commission_type, v_referrer.commission_value,
        v_multiplier, v_commission,
        'pending'
      )
      ON CONFLICT (referrer_id, company_id, period_month, period_year)
      DO UPDATE SET
        plan_mrr = EXCLUDED.plan_mrr,
        commission_amount = EXCLUDED.commission_amount,
        tier_multiplier = EXCLUDED.tier_multiplier,
        subscription_plan_name = EXCLUDED.subscription_plan_name,
        calculated_at = now();

      v_count := v_count + 1;
    END LOOP;

    UPDATE referrers SET
      total_earned = (
        SELECT COALESCE(SUM(commission_amount), 0)
        FROM referral_commission_ledger
        WHERE referrer_id = v_referrer.id AND status != 'cancelled'
      )
    WHERE id = v_referrer.id;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
