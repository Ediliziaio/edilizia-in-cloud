-- ════════════════════════════════════════════════════════════════════════════
-- MP-SILVIO-CREATIVE-01 (deferred #2) · cron del worker render artefatti
-- ────────────────────────────────────────────────────────────────────────────
-- Ogni 2 minuti processa i job 'image' queued (creati DOPO approvazione umana del
-- tool yellow genera_creativita). Riusa silvio_invoke_edge (secret dal Vault).
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  PERFORM cron.unschedule('silvio-generation-worker-2min');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'silvio-generation-worker-2min',
  '*/2 * * * *',
  $$ SELECT public.silvio_invoke_edge('silvio-generation-worker', '{}'::jsonb); $$
);
