
-- Enable pgvector in extensions schema
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ══════════════════════════════════════════════════════════════════
-- Table: preventivo_kb_documenti
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE public.preventivo_kb_documenti (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  azienda_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descrizione TEXT,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'pdf',
  file_size_kb INTEGER NOT NULL DEFAULT 0,
  categoria TEXT NOT NULL DEFAULT 'altro',
  stato TEXT NOT NULL DEFAULT 'caricato',
  tags TEXT[] DEFAULT '{}',
  pagine INTEGER,
  chunks_count INTEGER DEFAULT 0,
  indicizzato_at TIMESTAMPTZ,
  errore_msg TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_preventivo_kb_documenti_azienda ON public.preventivo_kb_documenti(azienda_id);
CREATE INDEX idx_preventivo_kb_documenti_stato ON public.preventivo_kb_documenti(stato);

ALTER TABLE public.preventivo_kb_documenti ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view their KB docs"
  ON public.preventivo_kb_documenti FOR SELECT TO authenticated
  USING (azienda_id = public.get_my_company_id());

CREATE POLICY "Company members can insert KB docs"
  ON public.preventivo_kb_documenti FOR INSERT TO authenticated
  WITH CHECK (azienda_id = public.get_my_company_id());

CREATE POLICY "Company members can update their KB docs"
  ON public.preventivo_kb_documenti FOR UPDATE TO authenticated
  USING (azienda_id = public.get_my_company_id());

CREATE POLICY "Company members can delete their KB docs"
  ON public.preventivo_kb_documenti FOR DELETE TO authenticated
  USING (azienda_id = public.get_my_company_id());

-- ══════════════════════════════════════════════════════════════════
-- Table: preventivo_kb_chunks (embedding uses extensions.vector)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE public.preventivo_kb_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  documento_id UUID NOT NULL REFERENCES public.preventivo_kb_documenti(id) ON DELETE CASCADE,
  azienda_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  testo TEXT NOT NULL,
  testo_preview TEXT,
  pagina INTEGER DEFAULT 1,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  embedding extensions.vector(768),
  categoria TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_preventivo_kb_chunks_documento ON public.preventivo_kb_chunks(documento_id);
CREATE INDEX idx_preventivo_kb_chunks_azienda ON public.preventivo_kb_chunks(azienda_id);

ALTER TABLE public.preventivo_kb_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view their KB chunks"
  ON public.preventivo_kb_chunks FOR SELECT TO authenticated
  USING (azienda_id = public.get_my_company_id());

CREATE POLICY "Company members can insert KB chunks"
  ON public.preventivo_kb_chunks FOR INSERT TO authenticated
  WITH CHECK (azienda_id = public.get_my_company_id());

CREATE POLICY "Company members can delete their KB chunks"
  ON public.preventivo_kb_chunks FOR DELETE TO authenticated
  USING (azienda_id = public.get_my_company_id());

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'preventivo-kb', 'preventivo-kb', false, 52428800,
  ARRAY['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Company users can upload KB files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'preventivo-kb');

CREATE POLICY "Company users can read KB files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'preventivo-kb');

CREATE POLICY "Company users can delete KB files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'preventivo-kb');
