-- File: supabase/migrations/20260409000006_render_stanza_tables.sql
-- Render Stanza (Room/Interiors) AI — Tabelle principali

-- ── render_stanza_sessions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.render_stanza_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  original_photo_url text,
  result_urls text[],
  config jsonb,
  config_snapshot jsonb,
  config_summary jsonb,
  saved_to_gallery boolean DEFAULT false,
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

ALTER TABLE public.render_stanza_sessions ENABLE ROW LEVEL SECURITY;

-- Company members can manage their own stanza sessions
CREATE POLICY "co_render_stanza_sessions" ON public.render_stanza_sessions
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Super admins can manage all
CREATE POLICY "sa_render_stanza_sessions" ON public.render_stanza_sessions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ── Indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_render_stanza_sessions_company
  ON public.render_stanza_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_render_stanza_sessions_status
  ON public.render_stanza_sessions(status);
CREATE INDEX IF NOT EXISTS idx_render_stanza_sessions_created_at
  ON public.render_stanza_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_render_stanza_sessions_gallery
  ON public.render_stanza_sessions(company_id, status, created_at DESC)
  WHERE status = 'completed';

-- ── Storage buckets ─────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('stanza-originals', 'stanza-originals', false, 20971520, ARRAY['image/jpeg','image/png','image/webp']),
  ('stanza-results', 'stanza-results', true, 20971520, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies: stanza-originals (private — authenticated upload/read)
CREATE POLICY "stanza_originals_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'stanza-originals');

CREATE POLICY "stanza_originals_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'stanza-originals');

-- Storage policies: stanza-results (public read, service insert)
CREATE POLICY "stanza_results_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'stanza-results');

CREATE POLICY "stanza_results_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'stanza-results');

-- Allow service_role full access (for edge function uploads)
CREATE POLICY "stanza_results_service_insert" ON storage.objects
  FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'stanza-results');

CREATE POLICY "stanza_originals_service_all" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'stanza-originals');
