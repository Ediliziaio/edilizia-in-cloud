-- File: supabase/migrations/20260409000003_render_pavimento_tables.sql
-- Render Pavimento AI — Tabelle, indici, RLS, storage buckets

-- ── render_pavimento_sessions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.render_pavimento_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  original_photo_url text,
  result_urls text[],
  config jsonb,
  config_snapshot jsonb,
  analisi_pavimento jsonb,
  prompt_used text,
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

ALTER TABLE public.render_pavimento_sessions ENABLE ROW LEVEL SECURITY;

-- Company members can manage their own sessions
CREATE POLICY "co_render_pavimento_sessions" ON public.render_pavimento_sessions
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Super admins have full access
CREATE POLICY "sa_render_pavimento_sessions" ON public.render_pavimento_sessions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ── Indexes ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_render_pavimento_sessions_company
  ON public.render_pavimento_sessions(company_id);

CREATE INDEX IF NOT EXISTS idx_render_pavimento_sessions_status
  ON public.render_pavimento_sessions(status);

CREATE INDEX IF NOT EXISTS idx_render_pavimento_sessions_created_at
  ON public.render_pavimento_sessions(created_at DESC);

-- ── Storage buckets ───────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('pavimento-originals', 'pavimento-originals', false, 20971520,
   ARRAY['image/jpeg','image/png','image/webp']),
  ('pavimento-results', 'pavimento-results', true, 20971520,
   ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for pavimento-originals (private)
CREATE POLICY "pavimento_originals_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pavimento-originals');

CREATE POLICY "pavimento_originals_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'pavimento-originals');

-- Storage policies for pavimento-results (public read)
CREATE POLICY "pavimento_results_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pavimento-results');

CREATE POLICY "pavimento_results_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'pavimento-results');
