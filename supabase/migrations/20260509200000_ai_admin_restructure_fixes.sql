-- AI Admin Restructure — fix critici emersi durante refactor Strategia C
-- ════════════════════════════════════════════════════════════════════════════
-- 1. RLS ai_test_runs: estendi policy SELECT a super_admin (CRIT-1 audit)
--    Prima la policy era limitata a Demo Azienda → super_admin vedeva 0 righe
--    delle proprie chiamate silvio-admin-chat (che usano company_id=PLATFORM).
--
-- 2. Seed ai_router_config per task admin (CRIT-5 audit): se manca riga
--    per silvio_admin_chat / silvio_agent_worker / silvio_chief_brief
--    usavamo fallback a openai/gpt-4o-mini in produzione. Adesso seed espliciti.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- FIX 1 — RLS ai_test_runs SELECT estesa a super_admin
-- ────────────────────────────────────────────────────────────────────────────
-- Drop tutte le policy SELECT esistenti su ai_test_runs (nome variato in
-- diverse migrations: ai_test_runs_select, ai_test_runs_demo_select).
DROP POLICY IF EXISTS ai_test_runs_select ON public.ai_test_runs;
DROP POLICY IF EXISTS ai_test_runs_demo_select ON public.ai_test_runs;
DROP POLICY IF EXISTS ai_test_runs_select_v2 ON public.ai_test_runs;

CREATE POLICY ai_test_runs_select_v2 ON public.ai_test_runs
  FOR SELECT
  USING (
    -- Super admin vede TUTTE le run (incluse quelle PLATFORM_ADMIN_COMPANY
    -- inserite da silvio-admin-chat per tracking modelli admin)
    public.is_silvio_superadmin()
    OR
    -- Demo Azienda vede solo le proprie (comportamento legacy preservato)
    (
      company_id = '778a2c76-1253-49f2-a5e8-283363ac3e29'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.company_id = '778a2c76-1253-49f2-a5e8-283363ac3e29'
      )
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- FIX 2 — Seed ai_router_config per task admin (defensive)
-- ────────────────────────────────────────────────────────────────────────────
-- Verifica se ai_router_config esiste (non è garantito in tutte le installazioni)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ai_router_config'
  ) THEN
    RAISE NOTICE 'ai_router_config table missing — skipping seed';
    RETURN;
  END IF;

  -- Seed silvio_admin_chat se mancante
  INSERT INTO public.ai_router_config (
    task_key, task_label, primary_model, fallback_models, default_params, tier_key, category, enabled
  )
  SELECT
    'silvio_admin_chat',
    'Silvio Admin Chat',
    'anthropic/claude-3-5-sonnet-20241022',
    '["openai/gpt-4o", "openai/gpt-4o-mini"]'::jsonb,
    '{"temperature": 0.3, "max_tokens": 3000}'::jsonb,
    'premium',
    'admin',
    true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ai_router_config WHERE task_key = 'silvio_admin_chat'
  );

  -- Seed silvio_agent_worker se mancante
  INSERT INTO public.ai_router_config (
    task_key, task_label, primary_model, fallback_models, default_params, tier_key, category, enabled
  )
  SELECT
    'silvio_agent_worker',
    'Silvio Agent Worker (multi-agent missions)',
    'anthropic/claude-3-5-sonnet-20241022',
    '["openai/gpt-4o", "openai/gpt-4o-mini"]'::jsonb,
    '{"temperature": 0.2, "max_tokens": 4000, "response_format": {"type": "json_object"}}'::jsonb,
    'premium',
    'admin',
    true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ai_router_config WHERE task_key = 'silvio_agent_worker'
  );

  -- Seed silvio_chief_brief se mancante
  INSERT INTO public.ai_router_config (
    task_key, task_label, primary_model, fallback_models, default_params, tier_key, category, enabled
  )
  SELECT
    'silvio_chief_brief',
    'Silvio Chief of Staff Daily Brief',
    'anthropic/claude-3-5-sonnet-20241022',
    '["openai/gpt-4o", "openai/gpt-4o-mini"]'::jsonb,
    '{"temperature": 0.4, "max_tokens": 4000}'::jsonb,
    'premium',
    'admin',
    true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ai_router_config WHERE task_key = 'silvio_chief_brief'
  );

  -- Seed public_chat (usato da public-chat-widget per lead capture sito web)
  INSERT INTO public.ai_router_config (
    task_key, task_label, primary_model, fallback_models, default_params, tier_key, category, enabled
  )
  SELECT
    'public_chat',
    'Chatbot pubblico sito web',
    'openai/gpt-4o-mini',
    '["anthropic/claude-3-haiku-20240307"]'::jsonb,
    '{"temperature": 0.4, "max_tokens": 500}'::jsonb,
    'economic',
    'crm',
    true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ai_router_config WHERE task_key = 'public_chat'
  );
END $$;

DO $$ BEGIN RAISE NOTICE 'AI Admin Restructure fixes applied (RLS + 4 seed router config)'; END $$;
