CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'generale', -- 'preventivo' | 'sollecito' | 'benvenuto' | 'appuntamento' | 'generale'
  subject TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Resolve membership through the real permission helper, not a nonexistent
-- company_users table or stale company claims in a JWT.
DROP POLICY IF EXISTS "company_access" ON public.email_templates;
DROP POLICY IF EXISTS email_templates_company_read ON public.email_templates;
CREATE POLICY email_templates_company_read ON public.email_templates FOR SELECT TO authenticated USING (
 public.has_permission_for_company((SELECT auth.uid()),'can_view_marketing',company_id));
DROP POLICY IF EXISTS email_templates_company_write ON public.email_templates;
CREATE POLICY email_templates_company_write ON public.email_templates FOR ALL TO authenticated USING (
 public.has_permission_for_company((SELECT auth.uid()),'can_edit_marketing',company_id) AND NOT public.utente_sola_lettura(company_id)) WITH CHECK (
 public.has_permission_for_company((SELECT auth.uid()),'can_edit_marketing',company_id) AND NOT public.utente_sola_lettura(company_id));

CREATE INDEX IF NOT EXISTS idx_email_templates_company ON email_templates(company_id);
