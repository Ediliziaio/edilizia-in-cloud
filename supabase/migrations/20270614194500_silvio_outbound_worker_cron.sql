-- ════════════════════════════════════════════════════════════════════════════
-- MP-SILVIO-ACTIONS-EXTERNAL-01 · cron del worker di consegna outbound
-- ────────────────────────────────────────────────────────────────────────────
-- Ogni 3 minuti consegna i messaggi 'queued' approvati (silvio_outbound_messages).
-- Destinatario risolto SOLO via silvio_outbound_resolve_recipient (mai indovinato).
-- Riusa silvio_invoke_edge (secret cron dal Vault).
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  PERFORM cron.unschedule('silvio-outbound-worker-3min');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'silvio-outbound-worker-3min',
  '*/3 * * * *',
  $$ SELECT public.silvio_invoke_edge('silvio-outbound-worker', '{}'::jsonb); $$
);
