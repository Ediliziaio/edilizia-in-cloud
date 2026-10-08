-- Local repair for the existing administrative learning pipeline.
-- This does not install/enable cron jobs, nor publish private material as universal KB.
ALTER TABLE public.ai_brain_documents DROP CONSTRAINT IF EXISTS ai_brain_documents_scope_check;
ALTER TABLE public.ai_brain_documents ADD CONSTRAINT ai_brain_documents_scope_check
  CHECK (scope IN ('company', 'universal', 'silvio_admin'));
ALTER TABLE public.ai_brain_documents DROP CONSTRAINT IF EXISTS ai_brain_documents_scope_company_chk;
ALTER TABLE public.ai_brain_documents ADD CONSTRAINT ai_brain_documents_scope_company_chk
  CHECK ((scope = 'company' AND company_id IS NOT NULL)
    OR (scope IN ('universal', 'silvio_admin') AND company_id IS NULL));

ALTER TABLE public.ai_brain_documents ENABLE ROW LEVEL SECURITY;
-- Defense in depth: an unrelated permissive policy cannot expose administrative material.
DROP POLICY IF EXISTS silvio_private_admin_boundary ON public.ai_brain_documents;
CREATE POLICY silvio_private_admin_boundary ON public.ai_brain_documents AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (scope <> 'silvio_admin' OR public.is_silvio_superadmin())
  WITH CHECK (scope <> 'silvio_admin' OR public.is_silvio_superadmin());
DROP POLICY IF EXISTS silvio_private_admin_read ON public.ai_brain_documents;
CREATE POLICY silvio_private_admin_read ON public.ai_brain_documents
  FOR SELECT TO authenticated USING (scope = 'silvio_admin' AND public.is_silvio_superadmin());

-- New source_type is used only by the repaired worker: retry/concurrent inserts
-- of the same version cannot create duplicate feedback examples.
CREATE UNIQUE INDEX IF NOT EXISTS idx_silvio_admin_feedback_version
  ON public.ai_brain_documents(source_path, content_hash)
  WHERE scope = 'silvio_admin' AND source_type = 'admin_feedback' AND deleted_at IS NULL;
