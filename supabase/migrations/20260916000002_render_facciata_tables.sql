-- File: supabase/migrations/20260409000002_render_facciata_tables.sql
-- Render Facciata AI — Tabelle e storage buckets

-- ── render_facciata_sessions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.render_facciata_sessions (
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

ALTER TABLE public.render_facciata_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "co_render_facciata_sessions" ON public.render_facciata_sessions
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "sa_render_facciata_sessions" ON public.render_facciata_sessions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_render_facciata_sessions_company
  ON public.render_facciata_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_render_facciata_sessions_status
  ON public.render_facciata_sessions(status);
CREATE INDEX IF NOT EXISTS idx_render_facciata_sessions_created_at
  ON public.render_facciata_sessions(created_at DESC);

-- ── Storage buckets ──────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('facciata-originals', 'facciata-originals', false, 20971520, ARRAY['image/jpeg','image/png','image/webp']),
  ('facciata-results', 'facciata-results', true, 20971520, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ── Storage policies: facciata-originals (private) ───────────────────
CREATE POLICY "facciata_originals_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'facciata-originals'
    AND (storage.foldername(name))[1] = (SELECT company_id::text FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "facciata_originals_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'facciata-originals'
    AND (storage.foldername(name))[1] = (SELECT company_id::text FROM public.profiles WHERE id = auth.uid())
  );

-- ── Storage policies: facciata-results (public read) ─────────────────
CREATE POLICY "facciata_results_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'facciata-results');

CREATE POLICY "facciata_results_select"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'facciata-results');

-- Service role full access for edge functions
CREATE POLICY "facciata_originals_service"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'facciata-originals')
  WITH CHECK (bucket_id = 'facciata-originals');

CREATE POLICY "facciata_results_service"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'facciata-results')
  WITH CHECK (bucket_id = 'facciata-results');
