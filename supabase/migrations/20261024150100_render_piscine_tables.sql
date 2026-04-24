-- Render Piscine AI — Tabelle, indici, RLS, storage buckets

CREATE TABLE IF NOT EXISTS public.render_piscine_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.marketing_opportunities(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  original_photo_url text,
  result_urls text[],
  config jsonb,
  config_snapshot jsonb,
  analisi_piscine jsonb,
  prompt_used text,
  prompt_version text,
  prompt_char_count integer,
  provider_key text,
  cost_real numeric(10,4),
  cost_billed numeric(10,4),
  error_message text,
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.render_piscine_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "co_render_piscine_sessions" ON public.render_piscine_sessions;
CREATE POLICY "co_render_piscine_sessions" ON public.render_piscine_sessions
  FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id())
  WITH CHECK (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS "sa_render_piscine_sessions" ON public.render_piscine_sessions;
CREATE POLICY "sa_render_piscine_sessions" ON public.render_piscine_sessions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_render_piscine_sessions_company
  ON public.render_piscine_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_render_piscine_sessions_status
  ON public.render_piscine_sessions(status);
CREATE INDEX IF NOT EXISTS idx_render_piscine_sessions_created
  ON public.render_piscine_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_render_piscine_sessions_gallery
  ON public.render_piscine_sessions(company_id, status, created_at DESC)
  WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_render_piscine_sessions_contact
  ON public.render_piscine_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_render_piscine_sessions_opportunity
  ON public.render_piscine_sessions(opportunity_id);

CREATE OR REPLACE FUNCTION public.update_render_piscine_sessions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_render_piscine_sessions_updated_at
  ON public.render_piscine_sessions;

CREATE TRIGGER trg_render_piscine_sessions_updated_at
  BEFORE UPDATE ON public.render_piscine_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_render_piscine_sessions_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('piscine-originals', 'piscine-originals', false, 20971520, ARRAY['image/jpeg','image/png','image/webp']),
  ('piscine-results', 'piscine-results', true, 20971520, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "piscine_originals_insert" ON storage.objects;
CREATE POLICY "piscine_originals_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'piscine-originals'
    AND (storage.foldername(name))[1] = public.get_effective_company_id()::text
  );

DROP POLICY IF EXISTS "piscine_originals_select" ON storage.objects;
CREATE POLICY "piscine_originals_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'piscine-originals'
    AND (
      (storage.foldername(name))[1] = public.get_effective_company_id()::text
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

DROP POLICY IF EXISTS "piscine_results_public_read" ON storage.objects;
CREATE POLICY "piscine_results_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'piscine-results');

DROP POLICY IF EXISTS "piscine_results_insert" ON storage.objects;
CREATE POLICY "piscine_results_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'piscine-results'
    AND (storage.foldername(name))[1] = public.get_effective_company_id()::text
  );

NOTIFY pgrst, 'reload schema';
