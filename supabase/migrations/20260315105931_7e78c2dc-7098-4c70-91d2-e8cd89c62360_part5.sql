-- Validation trigger for sync_status
CREATE OR REPLACE FUNCTION public.validate_kb_sync_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.sync_status NOT IN ('pending', 'syncing', 'synced', 'error', 'deleted') THEN
    RAISE EXCEPTION 'Invalid sync_status: %', NEW.sync_status;
  END IF;
  RETURN NEW;
END;
$$;
