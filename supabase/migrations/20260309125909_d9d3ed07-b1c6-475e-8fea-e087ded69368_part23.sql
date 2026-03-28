-- Index for performance
CREATE INDEX IF NOT EXISTS idx_referral_clicks_referrer_id ON public.referral_clicks(referrer_id);
