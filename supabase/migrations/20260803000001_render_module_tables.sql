-- File: supabase/migrations/20260803000001_render_module_tables.sql
-- Render Infissi AI — Tabelle principali

-- ── render_provider_config ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.render_provider_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_key text NOT NULL UNIQUE,
  label text NOT NULL,
  model text NOT NULL,
  api_endpoint text NOT NULL,
  is_active boolean DEFAULT false,
  is_default boolean DEFAULT false,
  quality text DEFAULT 'high',
  timeout_sec integer DEFAULT 120,
  cost_real_per_render numeric DEFAULT 0.04,
  markup_multiplier numeric DEFAULT 2.5,
  cost_billed_per_render numeric DEFAULT 0.10,
  renders_generated integer DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.render_provider_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sa_render_provider" ON public.render_provider_config;
CREATE POLICY "sa_render_provider" ON public.render_provider_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ── render_sessions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.render_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  original_photo_url text,
  result_urls text[],
  config jsonb,
  config_snapshot jsonb,
  foto_analisi jsonb,
  prompt_used text,
  prompt_blocks jsonb,
  prompt_version text,
  prompt_char_count integer,
  provider_key text,
  cost_real numeric(10,4),
  cost_billed numeric(10,4),
  error_message text,
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.render_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "co_render_sessions" ON public.render_sessions;
CREATE POLICY "co_render_sessions" ON public.render_sessions
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "sa_render_sessions" ON public.render_sessions;
CREATE POLICY "sa_render_sessions" ON public.render_sessions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ── render_gallery ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.render_gallery (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.render_sessions(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  title text,
  original_url text,
  render_url text,
  tags text[],
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.render_gallery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "co_render_gallery" ON public.render_gallery;
CREATE POLICY "co_render_gallery" ON public.render_gallery
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- ── render_credits ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.render_credits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_purchased integer NOT NULL DEFAULT 0,
  total_used integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.render_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "co_render_credits_select" ON public.render_credits;
CREATE POLICY "co_render_credits_select" ON public.render_credits
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "sa_render_credits" ON public.render_credits;
CREATE POLICY "sa_render_credits" ON public.render_credits
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_render_sessions_company ON public.render_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_render_gallery_company ON public.render_gallery(company_id);
CREATE INDEX IF NOT EXISTS idx_render_sessions_status ON public.render_sessions(status);
CREATE INDEX IF NOT EXISTS idx_render_sessions_created_at ON public.render_sessions(created_at DESC);
