-- Sprint 6 — Commissioni referral su consumi variabili

ALTER TABLE public.referral_tiers
  ADD COLUMN IF NOT EXISTS commission_on_usage  BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS usage_commission_pct NUMERIC(5,2) DEFAULT 5.0;

-- Updated calculate_monthly_commissions with usage-based commissions
CREATE OR REPLACE FUNCTION public.calculate_monthly_commissions(
  p_month INTEGER,
  p_year INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  v_referrer       RECORD;
  v_company        RECORD;
  v_plan_mrr       NUMERIC;
  v_commission     NUMERIC;
  v_multiplier     NUMERIC;
  v_usage          NUMERIC;
  v_usage_comm     NUMERIC;
  v_usage_pct      NUMERIC;
  v_period_start   TIMESTAMPTZ;
  v_period_end     TIMESTAMPTZ;
  v_count          INTEGER := 0;
BEGIN
  v_period_start := make_date(p_year, p_month, 1)::TIMESTAMPTZ;
  v_period_end   := (make_date(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ;

  FOR v_referrer IN
    SELECT r.*,
           COALESCE(rt.commission_multiplier, 1.00) AS tier_multiplier,
           COALESCE(rt.commission_on_usage, false) AS on_usage,
           COALESCE(rt.usage_commission_pct, 5.0)  AS tier_usage_pct
    FROM referrers r
    LEFT JOIN referral_tiers rt ON r.tier_id = rt.id
    WHERE r.is_active = true
  LOOP
    -- ── Existing plan-based commissions ──────────────────────────────────
    FOR v_company IN
      SELECT rc.company_id, sp.price_monthly, sp.name AS plan_name
      FROM referral_companies rc
      JOIN companies c ON rc.company_id = c.id
      JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
      WHERE rc.referrer_id = v_referrer.id
        AND rc.is_active = true
        AND c.status = 'active'
    LOOP
      v_plan_mrr   := COALESCE(v_company.price_monthly, 0);
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
        plan_mrr              = EXCLUDED.plan_mrr,
        commission_amount     = EXCLUDED.commission_amount,
        tier_multiplier       = EXCLUDED.tier_multiplier,
        subscription_plan_name = EXCLUDED.subscription_plan_name,
        calculated_at         = now();

      v_count := v_count + 1;
    END LOOP;

    -- ── Usage-based commissions ───────────────────────────────────────────
    IF v_referrer.on_usage THEN
      v_usage_pct := COALESCE(v_referrer.tier_usage_pct, 5.0);

      FOR v_company IN
        SELECT rc.company_id
        FROM referral_companies rc
        WHERE rc.referrer_id = v_referrer.id
          AND rc.is_active = true
      LOOP
        -- Sum absolute deductions across all three credit services in the period
        SELECT COALESCE(
          (
            SELECT SUM(ABS(ecl.amount_eur))
            FROM email_credits_log ecl
            WHERE ecl.company_id = v_company.company_id
              AND ecl.type = 'deduct'
              AND ecl.created_at >= v_period_start
              AND ecl.created_at <  v_period_end
          ), 0
        ) +
        COALESCE(
          (
            SELECT SUM(ABS(wcl.amount_eur))
            FROM whatsapp_credits_log wcl
            WHERE wcl.company_id = v_company.company_id
              AND wcl.type = 'deduct'
              AND wcl.created_at >= v_period_start
              AND wcl.created_at <  v_period_end
          ), 0
        ) +
        COALESCE(
          (
            SELECT SUM(acu.cost_eur)
            FROM ai_credit_usage acu
            WHERE acu.company_id = v_company.company_id
              AND acu.created_at >= v_period_start
              AND acu.created_at <  v_period_end
          ), 0
        )
        INTO v_usage;

        IF v_usage > 0 THEN
          v_usage_comm := ROUND(v_usage * v_usage_pct / 100, 4);

          INSERT INTO referral_commission_ledger (
            referrer_id, company_id, period_month, period_year,
            subscription_plan_name, plan_mrr,
            commission_type, commission_rate, tier_multiplier, commission_amount,
            status
          ) VALUES (
            v_referrer.id, v_company.company_id, p_month, p_year,
            'usage_commission', v_usage,
            'usage', v_usage_pct,
            1.0, v_usage_comm,
            'pending'
          )
          ON CONFLICT (referrer_id, company_id, period_month, period_year)
          DO UPDATE SET
            commission_amount = referral_commission_ledger.commission_amount + v_usage_comm,
            plan_mrr          = EXCLUDED.plan_mrr,
            calculated_at     = now();

          UPDATE referrers SET
            total_earned = total_earned + v_usage_comm
          WHERE id = v_referrer.id;

          v_count := v_count + 1;
        END IF;
      END LOOP;
    END IF;

    -- Update total_earned for plan commissions
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
