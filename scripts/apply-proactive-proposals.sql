-- ════════════════════════════════════════════════════════════════════════════
-- GAP 2 — Apply proactive proposals schema + cron
-- ────────────────────────────────────────────────────────────────────────────
-- Da incollare nel SQL Editor di Supabase Studio (project rsbrguhkodgnqfomrevo)
--
-- Effetti:
--   1. ALTER TABLE ai_action_proposals (4 colonne nuove + 2 indici)
--   2. RPC create_proactive_proposal (idempotente)
--   3. pg_cron schedule daily 07:00 UTC chiamando edge ai-proactive-proposals-daily
--
-- Pre-requisiti env:
--   - app.supabase_url    (URL del progetto)
--   - app.proactive_cron_secret  (secret matchato da edge function)
--
-- Set/check con:
--   ALTER DATABASE postgres SET app.proactive_cron_secret = 'qualsiasi-stringa';
--   ALTER DATABASE postgres SET app.supabase_url = 'https://rsbrguhkodgnqfomrevo.supabase.co';
-- ════════════════════════════════════════════════════════════════════════════

\i supabase/migrations/20260510020000_proactive_proposals.sql

-- Verifica
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_action_proposals' AND column_name='auto_generated') AS auto_gen_col_ok,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_action_proposals' AND column_name='signal_type')    AS signal_type_col_ok,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='create_proactive_proposal' AND pronamespace='public'::regnamespace) AS rpc_ok,
  (SELECT COUNT(*)::int FROM cron.job WHERE jobname='ai-proactive-proposals-daily') AS cron_job_count;
