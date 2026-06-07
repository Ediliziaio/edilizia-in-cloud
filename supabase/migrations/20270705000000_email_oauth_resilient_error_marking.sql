-- =============================================================================
-- Email OAuth — marcatura errori resiliente (riduce scollegamenti inutili)
-- =============================================================================
-- Problema: email_oauth_mark_sync marcava la casella come 'expired' (= serve
-- riconnessione) ogni volta che il messaggio d'errore conteneva il GENERICO
-- 'token_refresh_failed'. Ma email-poll-inbox / email-send lanciano quel prefisso
-- per QUALSIASI non-200 del token endpoint, inclusi i TRANSITORI:
--   • 5xx di Google/Microsoft (token endpoint temporaneamente down)
--   • 429 rate limit
--   • timeout di rete
-- Risultato: un hiccup transitorio scollegava la casella come se il refresh token
-- fosse stato revocato → l'utente doveva riconnettere senza reale necessità.
--
-- Fix: marca 'expired' SOLO per errori OAuth realmente PERMANENTI (token revocato/
-- scaduto, client non autorizzato). Per i transitori la casella resta 'active' e
-- il poll successivo ritenta; solo dopo 5 errori consecutivi passa a 'error' soft
-- (che si auto-risana al primo sync riuscito). invalid_grant & co. continuano a
-- marcare 'expired' perché il messaggio Google contiene "invalid_grant".
--
-- NB: la causa PRINCIPALE degli scollegamenti settimanali resta la pubblicazione
-- della OAuth consent screen (Testing mode → refresh token scadono dopo 7 giorni).
-- Questa migration riduce gli scollegamenti SPURI da errori transitori; la config
-- Google (pubblicare l'app) è l'azione che elimina la scadenza a 7 giorni.
-- =============================================================================

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
             -- SOLO errori OAuth PERMANENTI → 'expired' (richiede riconnessione).
             -- Rimosso il generico 'token_refresh_failed' (veniva lanciato anche
             -- per 5xx/429/timeout transitori del token endpoint). I messaggi reali
             -- di token revocato contengono 'invalid_grant', quindi continuano a
             -- matchare correttamente.
             WHEN COALESCE(p_error, '') ~* '(refresh_token_missing|invalid_grant|invalid_client|unauthorized_client|invalid_token)'
               THEN 'expired'
             -- Errori transitori: la casella resta com'è; dopo 5 consecutivi passa
             -- a 'error' soft (auto-risanato al primo sync riuscito).
             WHEN consecutive_errors + 1 >= 5 THEN 'error'
             ELSE status
           END
     WHERE id = p_connection_id;
  END IF;
END;
$function$;
