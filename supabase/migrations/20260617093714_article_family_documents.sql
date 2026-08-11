-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.article_family_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  family_id   uuid NOT NULL REFERENCES public.article_families(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  url         text NOT NULL,
  tipo        text NOT NULL DEFAULT 'scheda_tecnica',
  file_size   integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid
);
CREATE INDEX IF NOT EXISTS idx_afd_family   ON public.article_family_documents(family_id);
CREATE INDEX IF NOT EXISTS idx_afd_company  ON public.article_family_documents(company_id);
ALTER TABLE public.article_family_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS afd_select ON public.article_family_documents;
CREATE POLICY afd_select ON public.article_family_documents
  FOR SELECT USING (company_id = get_user_company_id((SELECT auth.uid())) OR has_role((SELECT auth.uid()), 'super_admin'::app_role));
DROP POLICY IF EXISTS afd_cud ON public.article_family_documents;
CREATE POLICY afd_cud ON public.article_family_documents
  FOR ALL USING (company_id = get_user_company_id((SELECT auth.uid())) OR has_role((SELECT auth.uid()), 'super_admin'::app_role))
  WITH CHECK (company_id = get_user_company_id((SELECT auth.uid())) OR has_role((SELECT auth.uid()), 'super_admin'::app_role));

INSERT INTO storage.buckets (id, name, public) VALUES ('article-pdfs', 'article-pdfs', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view article pdfs" ON storage.objects;
CREATE POLICY "Anyone can view article pdfs" ON storage.objects FOR SELECT USING (bucket_id = 'article-pdfs');
DROP POLICY IF EXISTS "Company users can upload article pdfs" ON storage.objects;
CREATE POLICY "Company users can upload article pdfs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'article-pdfs' AND (storage.foldername(name))[1] = (get_user_company_id(auth.uid()))::text);
DROP POLICY IF EXISTS "Company users can update article pdfs" ON storage.objects;
CREATE POLICY "Company users can update article pdfs" ON storage.objects FOR UPDATE USING (bucket_id = 'article-pdfs' AND (storage.foldername(name))[1] = (get_user_company_id(auth.uid()))::text);
DROP POLICY IF EXISTS "Company users can delete article pdfs" ON storage.objects;
CREATE POLICY "Company users can delete article pdfs" ON storage.objects FOR DELETE USING (bucket_id = 'article-pdfs' AND (storage.foldername(name))[1] = (get_user_company_id(auth.uid()))::text);
DROP POLICY IF EXISTS "Super admins can manage all article pdfs" ON storage.objects;
CREATE POLICY "Super admins can manage all article pdfs" ON storage.objects FOR ALL USING (bucket_id = 'article-pdfs' AND has_role(auth.uid(), 'super_admin'::app_role));
