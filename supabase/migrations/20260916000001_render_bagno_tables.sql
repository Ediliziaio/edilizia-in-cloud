-- ============================================================
-- Render Bagno — Tables, Indexes, RLS, Storage
-- ============================================================

CREATE TABLE IF NOT EXISTS public.render_bagno_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stato text NOT NULL DEFAULT 'pending'
    CHECK (stato IN ('pending','analyzing','analysis_done','processing','completato','errore')),
  foto_originale_path text,
  foto_originale_url text,
  analisi_bagno jsonb DEFAULT '{}',
  configurazione jsonb DEFAULT '{}',
  tipo_intervento text,
  render_result_path text,
  render_result_url text,
  prompt_usato text,
  prompt_version text DEFAULT '1.0.0',
  provider_key text,
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  salvato_in_galleria boolean DEFAULT false,
  galleria_titolo text,
  galleria_note text
);

CREATE INDEX idx_render_bagno_company ON public.render_bagno_sessions(company_id);
CREATE INDEX idx_render_bagno_user ON public.render_bagno_sessions(user_id);
CREATE INDEX idx_render_bagno_stato ON public.render_bagno_sessions(stato);
CREATE INDEX idx_render_bagno_created ON public.render_bagno_sessions(created_at DESC);

ALTER TABLE public.render_bagno_sessions ENABLE ROW LEVEL SECURITY;

-- RLS: SELECT — company members can read their own company sessions
CREATE POLICY render_bagno_select ON public.render_bagno_sessions
  FOR SELECT USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- RLS: INSERT — authenticated users can insert for their company
CREATE POLICY render_bagno_insert ON public.render_bagno_sessions
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    AND user_id = auth.uid()
  );

-- RLS: UPDATE — company members can update their own company sessions
CREATE POLICY render_bagno_update ON public.render_bagno_sessions
  FOR UPDATE USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- ============================================================
-- Storage buckets
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('bagno-originals', 'bagno-originals', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('bagno-results', 'bagno-results', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: bagno-originals (private)
CREATE POLICY bagno_originals_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'bagno-originals'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY bagno_originals_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'bagno-originals'
    AND auth.uid() IS NOT NULL
  );

-- Storage policies: bagno-results (public read, auth write)
CREATE POLICY bagno_results_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'bagno-results'
  );

CREATE POLICY bagno_results_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'bagno-results'
    AND auth.uid() IS NOT NULL
  );
