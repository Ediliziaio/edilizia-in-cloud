-- Form Builder lato super-admin (Platform Admin CRM).
--
-- Le RLS di lead_forms / form_submissions erano solo tenant-scoped
-- (company_id = get_user_company_id(...) + permesso tenant), senza bypass
-- super_admin. Il super admin opera sulla "Platform Admin CRM" (company
-- 00000000-0000-0000-0000-000000000001) che NON è la sua company_id, quindi
-- non poteva creare/modificare i form da /admin/marketing/form-builder.
--
-- Aggiungiamo la stessa policy super_admin già presente su marketing_contacts
-- ("Super admins can manage all marketing contacts"): has_role(super_admin),
-- nessun vincolo di company → il super admin gestisce i form di qualsiasi
-- azienda (in pratica la Platform Admin CRM). Additiva: non tocca le policy
-- tenant esistenti.

-- lead_forms: gestione completa (SELECT/INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS "Super admins can manage all lead forms" ON public.lead_forms;
CREATE POLICY "Super admins can manage all lead forms"
  ON public.lead_forms
  FOR ALL
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role))
  WITH CHECK (has_role((SELECT auth.uid()), 'super_admin'::app_role));

-- form_submissions: lettura delle submission (l'insert resta via service role
-- dall'edge form-submit; qui serve la SELECT per l'analisi lato admin).
DROP POLICY IF EXISTS "Super admins can view all form submissions" ON public.form_submissions;
CREATE POLICY "Super admins can view all form submissions"
  ON public.form_submissions
  FOR SELECT
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role));
