-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- email_poll_selfheal — il cron di polling recupera da solo le caselle in 'error'.
CREATE OR REPLACE FUNCTION public.email_oauth_list_due_for_poll(p_limit int DEFAULT 50)
RETURNS TABLE (id uuid, provider text, email_address text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, provider, email_address
  FROM public.email_oauth_connections
  WHERE poll_enabled = true
    AND status IN ('active', 'error')
    AND (
      (status = 'active' AND (
        last_synced_at IS NULL
        OR last_synced_at < now() - (poll_interval_minutes || ' minutes')::interval
      ))
      OR
      (status = 'error' AND (
        last_synced_at IS NULL
        OR last_synced_at < now() - interval '60 minutes'
      ))
    )
  ORDER BY COALESCE(last_synced_at, '1970-01-01'::timestamptz) ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.email_oauth_list_due_for_poll(int) TO service_role;
