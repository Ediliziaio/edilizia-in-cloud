-- ════════════════════════════════════════════════════════════════════════════
-- GAP 9 — Apply ai_persona_memory schema + RPC
-- ────────────────────────────────────────────────────────────────────────────
-- Da incollare nel SQL Editor di Supabase Studio (project rsbrguhkodgnqfomrevo)
-- ════════════════════════════════════════════════════════════════════════════

\i supabase/migrations/20260510040000_ai_persona_memory.sql

-- Verifica
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ai_persona_memory') AS table_ok,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='recall_persona_memory' AND pronamespace='public'::regnamespace) AS recall_rpc_ok,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='record_persona_memory' AND pronamespace='public'::regnamespace) AS record_rpc_ok,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='bump_persona_memory_hit' AND pronamespace='public'::regnamespace) AS bump_rpc_ok;
