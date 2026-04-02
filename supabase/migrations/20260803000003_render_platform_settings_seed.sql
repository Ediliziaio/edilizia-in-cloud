-- File: supabase/migrations/20260803000003_render_platform_settings_seed.sql
-- Seed platform_settings keys render + provider_config

-- Aggiunge le chiavi render in platform_settings (vuote — superadmin le compilerà da UI)
INSERT INTO public.platform_settings (key, value) VALUES
  ('render_default_provider', 'openai'),
  ('render_openai_api_key',   ''),
  ('render_gemini_api_key',   ''),
  ('render_anthropic_api_key',''),
  ('render_enabled',          'true')
ON CONFLICT (key) DO NOTHING;

-- Seed provider config (configurazione operativa — no API keys qui)
INSERT INTO public.render_provider_config
  (provider_key, label, model, api_endpoint, is_active, is_default,
   cost_real_per_render, markup_multiplier, cost_billed_per_render, notes)
VALUES
  (
    'openai',
    'OpenAI GPT-Image-1',
    'gpt-image-1',
    'https://api.openai.com/v1/images/edits',
    true, true, 0.04, 2.5, 0.10,
    'Miglior qualità image editing. Raccomandato per MVP.'
  ),
  (
    'gemini',
    'Google Gemini Flash',
    'gemini-2.0-flash-preview-image-generation',
    'https://generativelanguage.googleapis.com/v1beta/models',
    true, false, 0.02, 2.5, 0.05,
    'Economico e veloce. Richiede Google AI Studio API key.'
  ),
  (
    'anthropic',
    'Anthropic Claude (solo analisi)',
    'claude-opus-4-5',
    'https://api.anthropic.com/v1/messages',
    false, false, 0.01, 2.5, 0.025,
    'Solo per fase analisi foto. NON genera immagini.'
  )
ON CONFLICT (provider_key) DO NOTHING;

-- Storage buckets render
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('render-originals', 'render-originals', false),
  ('render-results',   'render-results',   true)
ON CONFLICT DO NOTHING;

-- RLS storage render-originals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'co_render_orig_insert' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "co_render_orig_insert" ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (
        bucket_id = 'render-originals'
        AND (storage.foldername(name))[1] = (
          SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'co_render_orig_select' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "co_render_orig_select" ON storage.objects
      FOR SELECT TO authenticated USING (
        bucket_id = 'render-originals'
        AND (storage.foldername(name))[1] = (
          SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;

  -- RLS storage render-results (public read, company write)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'pub_render_res_select' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "pub_render_res_select" ON storage.objects
      FOR SELECT TO public USING (bucket_id = 'render-results');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'co_render_res_insert' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "co_render_res_insert" ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (
        bucket_id = 'render-results'
        AND (storage.foldername(name))[1] = (
          SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;
