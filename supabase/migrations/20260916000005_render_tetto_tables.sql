-- File: supabase/migrations/20260409000005_render_tetto_tables.sql
-- Render Tetto AI — Tabelle, indici, RLS, storage buckets

-- ── render_tetto_sessions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.render_tetto_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  original_photo_url text,
  result_urls text[],
  config jsonb,
  config_snapshot jsonb,
  analisi_tetto jsonb,
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

ALTER TABLE public.render_tetto_sessions ENABLE ROW LEVEL SECURITY;

-- RLS: utenti della stessa azienda
CREATE POLICY "co_render_tetto_sessions" ON public.render_tetto_sessions
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- RLS: super admin
CREATE POLICY "sa_render_tetto_sessions" ON public.render_tetto_sessions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ── Indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_render_tetto_sessions_company
  ON public.render_tetto_sessions(company_id);

CREATE INDEX IF NOT EXISTS idx_render_tetto_sessions_status
  ON public.render_tetto_sessions(status);

CREATE INDEX IF NOT EXISTS idx_render_tetto_sessions_created
  ON public.render_tetto_sessions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_render_tetto_sessions_company_status
  ON public.render_tetto_sessions(company_id, status);

-- ── Storage buckets ──────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('tetto-originals', 'tetto-originals', false, 20971520, ARRAY['image/jpeg','image/png','image/webp']),
  ('tetto-results', 'tetto-results', true, 20971520, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: tetto-originals (private — utenti della stessa azienda)
CREATE POLICY "tetto_originals_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tetto-originals' AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "tetto_originals_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'tetto-originals' AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  ));

-- Storage RLS: tetto-results (public read, autenticati write per la propria azienda)
CREATE POLICY "tetto_results_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'tetto-results');

CREATE POLICY "tetto_results_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tetto-results' AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  ));
