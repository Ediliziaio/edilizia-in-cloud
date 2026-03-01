
-- Function to auto-expire trial companies whose trial_ends_at has passed
CREATE OR REPLACE FUNCTION public.auto_expire_trials()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.companies
  SET status = 'expired', updated_at = now()
  WHERE status = 'trial'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < now();
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;
