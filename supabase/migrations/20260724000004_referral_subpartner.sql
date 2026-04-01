-- ============================================================
-- Sprint 5: Sub-partner 2° livello + Leaderboard
-- ============================================================

-- 1. Aggiungi parent_referrer_id e sublevel_commission_pct a referrers
ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS parent_referrer_id      UUID        REFERENCES public.referrers(id),
  ADD COLUMN IF NOT EXISTS sublevel_commission_pct NUMERIC(5,2) DEFAULT 2.0;

-- 2. Funzione calculate_monthly_commissions aggiornata con 2° livello.
--    Sostituisce la funzione esistente mantenendo la logica già presente
--    e aggiungendo la commissione sub-partner al parent_referrer.
--
--    NOTA: La funzione originale è in 20260330320000_referral_usage_commission.sql
--    Qui aggiungiamo solo la logica sub-partner via PLPGSQL separata per evitare
--    di riscrivere l'intera funzione. Un wrapper la chiama dopo.

CREATE OR REPLACE FUNCTION public.calculate_sublevel_commissions(p_month INT, p_year INT)
RETURNS INTEGER AS $$
DECLARE
  v_sub         RECORD;
  v_parent_pct  NUMERIC;
  v_sub_total   NUMERIC;
  v_parent_comm NUMERIC;
  v_count       INTEGER := 0;
BEGIN
  -- Per ogni referrer che ha un parent_referrer_id
  FOR v_sub IN
    SELECT r.id, r.parent_referrer_id,
           COALESCE(r.sublevel_commission_pct, 2.0) AS sub_pct
    FROM referrers r
    WHERE r.parent_referrer_id IS NOT NULL
      AND r.is_active = true
  LOOP
    -- Calcola il totale commissioni del sub per il periodo
    SELECT COALESCE(SUM(commission_amount), 0) INTO v_sub_total
    FROM referral_commission_ledger
    WHERE referrer_id   = v_sub.id
      AND period_month  = p_month
      AND period_year   = p_year
      AND commission_type != 'sublevel'; -- Evita calcoli ricorsivi

    IF v_sub_total > 0 THEN
      v_parent_comm := ROUND(v_sub_total * v_sub.sub_pct / 100, 4);

      IF v_parent_comm > 0 THEN
        INSERT INTO referral_commission_ledger (
          referrer_id, company_id, period_month, period_year,
          subscription_plan_name, plan_mrr,
          commission_type, commission_rate, tier_multiplier, commission_amount,
          status, notes
        )
        SELECT
          v_sub.parent_referrer_id,
          NULL,            -- Nessuna company specifica (aggregata)
          p_month, p_year,
          'Sub-partner commissioni',
          v_sub_total,
          'sublevel',
          v_sub.sub_pct,
          1.0,
          v_parent_comm,
          'pending',
          'Commissione 2° livello da sub-partner ' || v_sub.id::TEXT
        WHERE NOT EXISTS (
          SELECT 1 FROM referral_commission_ledger
          WHERE referrer_id    = v_sub.parent_referrer_id
            AND period_month   = p_month
            AND period_year    = p_year
            AND commission_type = 'sublevel'
            AND notes          = 'Commissione 2° livello da sub-partner ' || v_sub.id::TEXT
        );

        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. View leaderboard (usata dall'admin)
CREATE OR REPLACE VIEW public.referral_leaderboard AS
SELECT
  r.id,
  r.name,
  rt.name  AS tier_name,
  rt.icon  AS tier_icon,
  COUNT(DISTINCT rc.company_id) FILTER (WHERE rc.is_active = true) AS active_companies,
  COALESCE(SUM(rcl.commission_amount) FILTER (
    WHERE rcl.period_month = EXTRACT(MONTH FROM NOW())::INT
      AND rcl.period_year  = EXTRACT(YEAR  FROM NOW())::INT
  ), 0) AS current_month_commission,
  r.total_earned,
  r.total_clicks,
  r.conversion_rate
FROM referrers r
LEFT JOIN referral_tiers rt           ON rt.id = r.tier_id
LEFT JOIN referral_companies rc       ON rc.referrer_id = r.id
LEFT JOIN referral_commission_ledger rcl ON rcl.referrer_id = r.id
WHERE r.is_active = true
GROUP BY r.id, r.name, rt.name, rt.icon, r.total_earned, r.total_clicks, r.conversion_rate
ORDER BY active_companies DESC, current_month_commission DESC;

-- 4. View leaderboard pubblica (anonimizzata per portale partner — top 10)
CREATE OR REPLACE VIEW public.referral_leaderboard_public AS
SELECT
  ROW_NUMBER() OVER (ORDER BY active_companies DESC) AS rank,
  LEFT(name, 1) || '. ' || SPLIT_PART(name, ' ', 2)  AS name_masked,
  tier_name,
  tier_icon,
  active_companies,
  current_month_commission
FROM referral_leaderboard
LIMIT 10;
