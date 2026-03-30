-- RPC per segnare tutte le notifiche come lette
DROP FUNCTION IF EXISTS public.mark_all_notifications_read(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(
  p_company_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
  SET is_read = true
  WHERE user_id = auth.uid()
    AND company_id = p_company_id
    AND is_read = false;
END;
$$;
