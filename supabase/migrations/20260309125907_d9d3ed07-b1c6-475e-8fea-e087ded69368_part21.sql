-- Update referrer tier
DROP FUNCTION IF EXISTS public.update_referrer_tier(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.update_referrer_tier(p_referrer_id UUID)
RETURNS VOID AS $$
DECLARE
  v_active_count INTEGER;
  v_tier_id UUID;
BEGIN
  SELECT COUNT(*) INTO v_active_count
  FROM referral_companies rc
  JOIN companies c ON rc.company_id = c.id
  WHERE rc.referrer_id = p_referrer_id
    AND rc.is_active = true
    AND c.status = 'active';

  SELECT id INTO v_tier_id
  FROM referral_tiers
  WHERE min_active_companies <= v_active_count
  ORDER BY min_active_companies DESC
  LIMIT 1;

  UPDATE referrers SET
    tier_id = v_tier_id,
    tier_updated_at = now(),
    total_conversions = v_active_count,
    conversion_rate = CASE
      WHEN COALESCE(total_clicks, 0) > 0 THEN (v_active_count::NUMERIC / total_clicks * 100)
      ELSE 0
    END
  WHERE id = p_referrer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
