-- ============================================================
-- SQL FUNCTIONS
-- ============================================================

-- Increment clicks
DROP FUNCTION IF EXISTS public.increment_referrer_clicks(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.increment_referrer_clicks(p_referrer_id UUID)
RETURNS VOID AS $$
  UPDATE public.referrers SET total_clicks = COALESCE(total_clicks, 0) + 1 WHERE id = p_referrer_id;
$$ LANGUAGE SQL SECURITY DEFINER;
