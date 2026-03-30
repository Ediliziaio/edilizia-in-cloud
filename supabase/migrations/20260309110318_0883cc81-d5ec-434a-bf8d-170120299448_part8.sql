-- Trigger to auto-calculate expires_at from validity_days
DROP FUNCTION IF EXISTS public.calculate_quote_expires_at() CASCADE;
CREATE OR REPLACE FUNCTION public.calculate_quote_expires_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.validity_days IS NOT NULL THEN
    NEW.expires_at = NOW() + (NEW.validity_days * INTERVAL '1 day');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
