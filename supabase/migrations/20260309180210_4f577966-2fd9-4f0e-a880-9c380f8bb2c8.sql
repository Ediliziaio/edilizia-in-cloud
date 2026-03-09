
-- =============================================
-- Form Builder — Step 5
-- =============================================

-- 1. lead_forms: form definitions
CREATE TABLE public.lead_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_published boolean NOT NULL DEFAULT false,
  total_views int NOT NULL DEFAULT 0,
  total_submissions int NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, slug)
);

CREATE INDEX idx_lead_forms_company ON public.lead_forms(company_id);
CREATE INDEX idx_lead_forms_slug ON public.lead_forms(slug);

ALTER TABLE public.lead_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_forms_tenant_all" ON public.lead_forms
  FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "lead_forms_service_all" ON public.lead_forms
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow anon to read published forms (for form-render edge function)
CREATE POLICY "lead_forms_anon_select" ON public.lead_forms
  FOR SELECT TO anon
  USING (is_published = true);

-- 2. form_views: tracking views
CREATE TABLE public.form_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.lead_forms(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  visitor_id text,
  session_id text,
  ip_hash text,
  referrer text,
  user_agent text,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_views_form ON public.form_views(form_id);
CREATE INDEX idx_form_views_company ON public.form_views(company_id);

ALTER TABLE public.form_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "form_views_tenant_select" ON public.form_views
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "form_views_service_all" ON public.form_views
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. form_submissions: submitted data
CREATE TABLE public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.lead_forms(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  session_id text,
  ip_hash text,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_submissions_form ON public.form_submissions(form_id);
CREATE INDEX idx_form_submissions_company ON public.form_submissions(company_id);
CREATE INDEX idx_form_submissions_contact ON public.form_submissions(contact_id);

ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "form_submissions_tenant_select" ON public.form_submissions
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "form_submissions_service_all" ON public.form_submissions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Trigger: update form stats on submission insert
CREATE OR REPLACE FUNCTION public.fn_update_form_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE lead_forms
  SET total_submissions = total_submissions + 1, updated_at = now()
  WHERE id = NEW.form_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_form_stats
  AFTER INSERT ON public.form_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_form_stats();

-- 5. Trigger: update form stats on view insert
CREATE OR REPLACE FUNCTION public.fn_update_form_views()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE lead_forms
  SET total_views = total_views + 1
  WHERE id = NEW.form_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_form_views
  AFTER INSERT ON public.form_views
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_form_views();
