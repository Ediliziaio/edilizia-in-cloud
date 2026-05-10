-- ════════════════════════════════════════════════════════════════════════════
-- GAP 1 — Apply personas example_questions seed
-- ────────────────────────────────────────────────────────────────────────────
-- Copia il contenuto di:
--   supabase/migrations/20260510010000_personas_example_questions.sql
-- nel SQL Editor di Supabase Studio (project rsbrguhkodgnqfomrevo).
--
-- Effetto: le 18 personas avranno 5 domande di esempio che l'utente vede
-- come chip cliccabili nella chat e nel Command Palette globale (Cmd+K).
--
-- NB: questa migration è idempotente — può essere riapplicata in caso di
-- modifiche/aggiornamenti future ai testi delle domande.
-- ════════════════════════════════════════════════════════════════════════════

\i supabase/migrations/20260510010000_personas_example_questions.sql

-- Verifica
SELECT
  persona_key,
  display_name,
  array_length(example_questions, 1) AS num_examples
FROM public.ai_personas
WHERE enabled = true
ORDER BY category, persona_key;
