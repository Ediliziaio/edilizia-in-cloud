-- Collegamenti calendario: i token cifrati non arrivano più al browser.
--
-- google/outlook/apple_calendar_connections avevano tutti i privilegi per anon
-- e authenticated, protetti solo dalla RLS. Risultato:
--   - le schede facevano select("*") e scaricavano token e password Apple
--     cifrati; la policy di lettura degli admin li dava anche per i colleghi;
--   - la policy personale permetteva a ogni utente di riscrivere a mano la
--     propria riga, token e company_id compresi.
-- Token e password servono solo alle edge function (service role). Qui:
--   - anon: niente;
--   - authenticated: SELECT delle sole colonne senza segreti; su Outlook
--     UPDATE della sola scelta dei calendari da sincronizzare (la scheda la
--     salva dal browser). Inserimenti e cancellazioni passano dalle edge
--     function (collega / scollega).
-- Il frontend dello stesso commit legge colonne esplicite e scollega dalla
-- edge function.

set local lock_timeout = '3s';

revoke all on table public.google_calendar_connections from anon, authenticated;
revoke all on table public.outlook_calendar_connections from anon, authenticated;
revoke all on table public.apple_calendar_connections from anon, authenticated;

grant select (id, company_id, user_id, google_account_email, google_sub, token_expires_at, status,
              last_sync_at, last_error, created_at, updated_at, webhook_channel_id, webhook_resource_id,
              webhook_expiry_at, last_webhook_processed_at, last_sync_source)
  on public.google_calendar_connections to authenticated;

grant select (id, company_id, user_id, microsoft_account_email, microsoft_oid, token_expires_at, granted_scopes,
              primary_calendar_id, primary_calendar_name, synced_calendar_ids, status, last_sync_at,
              last_sync_event_count, last_error, webhook_subscription_id, webhook_expires_at, created_at, updated_at)
  on public.outlook_calendar_connections to authenticated;
grant update (synced_calendar_ids) on public.outlook_calendar_connections to authenticated;

grant select (id, company_id, user_id, apple_id_email, caldav_principal_url, caldav_home_url, status,
              last_sync_at, last_error, ctag, created_at, updated_at)
  on public.apple_calendar_connections to authenticated;
