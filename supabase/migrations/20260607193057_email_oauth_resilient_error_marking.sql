-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Email OAuth — marcatura errori resiliente (riduce scollegamenti inutili)
CREATE OR REPLACE FUNCTION public.email_oauth_mark_sync(
  p_connection_id uuid,
  p_success boolean,
  p_emails_fetched integer DEFAULT 0,
  p_error text DEFAULT NULL::text,
  p_provider_metadata jsonb DEFAULT NULL::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_success THEN
    UPDATE public.email_oauth_connections
       SET last_synced_at = now(),
           last_sync_error = NULL,
           consecutive_errors = 0,
           emails_fetched_total = emails_fetched_total + GREATEST(p_emails_fetched, 0),
           provider_metadata = COALESCE(p_provider_metadata, provider_metadata),
           status = CASE WHEN status IN ('error', 'expired') THEN 'active' ELSE status END
     WHERE id = p_connection_id;
  ELSE
    UPDATE public.email_oauth_connections
       SET last_synced_at = now(),
           last_sync_error = LEFT(COALESCE(p_error, 'unknown'), 500),
           consecutive_errors = consecutive_errors + 1,
           status = CASE
             WHEN COALESCE(p_error, '') ~* '(refresh_token_missing|invalid_grant|invalid_client|unauthorized_client|invalid_token)'
               THEN 'expired'
             WHEN consecutive_errors + 1 >= 5 THEN 'error'
             ELSE status
           END
     WHERE id = p_connection_id;
  END IF;
END;
$function$;
