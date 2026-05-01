-- Fascicolo documentale cliente: documenti opzionali ma tracciati.

CREATE TABLE IF NOT EXISTS public.customer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('contract', 'identity', 'fiscal_code', 'other')),
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  file_size bigint,
  notes text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_documents_company
  ON public.customer_documents(company_id);

CREATE INDEX IF NOT EXISTS idx_customer_documents_customer
  ON public.customer_documents(customer_id);

ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_documents_company_manage" ON public.customer_documents;
CREATE POLICY "customer_documents_company_manage"
  ON public.customer_documents
  FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('customer-documents', 'customer-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "customer_documents_storage_read" ON storage.objects;
CREATE POLICY "customer_documents_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'customer-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id::text FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "customer_documents_storage_insert" ON storage.objects;
CREATE POLICY "customer_documents_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'customer-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id::text FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "customer_documents_storage_delete" ON storage.objects;
CREATE POLICY "customer_documents_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'customer-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id::text FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );
