-- =============================================================================
-- Cron sync template Meta → wa_meta_templates (ogni 6h)
-- =============================================================================
-- Contesto: la tabella wa_meta_templates (usata da broadcast + composer +
-- finestra 24h) restava VUOTA perché:
--   1) non esisteva alcun cron che chiamasse sync-meta-templates;
--   2) il bottone UI "Sincronizza da Meta" invocava la funzione col JWT utente
--      (role=authenticated) ma la funzione autorizzava SOLO service_role/cron
--      → 401, sync mai eseguita.
-- Fix funzione: ammette anche l'admin azienda (getUser) per la PROPRIA azienda;
-- fix gateway: verify_jwt=false in config.toml così la chiamata cron (bearer
-- non-JWT da silvio_invoke_edge) non viene rifiutata.
--
-- Qui aggiungiamo il cron 6h che mantiene fresca la copia DB per tutte le
-- aziende. Idempotente: cron.schedule(name, ...) sostituisce per nome.
-- =============================================================================

select cron.schedule(
  'sync-meta-templates-6h',
  '7 */6 * * *',
  $$select public.silvio_invoke_edge('sync-meta-templates','{}'::jsonb);$$
);
