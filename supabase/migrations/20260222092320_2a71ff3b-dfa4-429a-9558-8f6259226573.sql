
-- Tabella marketing_pipelines
CREATE TABLE public.marketing_pipelines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their pipelines"
  ON public.marketing_pipelines FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view pipelines if permitted"
  ON public.marketing_pipelines FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all pipelines"
  ON public.marketing_pipelines FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_marketing_pipelines_updated_at
  BEFORE UPDATE ON public.marketing_pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabella marketing_pipeline_stages
CREATE TABLE public.marketing_pipeline_stages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_id uuid NOT NULL REFERENCES public.marketing_pipelines(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  show_in_reports boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their pipeline stages"
  ON public.marketing_pipeline_stages FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view pipeline stages if permitted"
  ON public.marketing_pipeline_stages FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all pipeline stages"
  ON public.marketing_pipeline_stages FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Tabella marketing_opportunities
CREATE TABLE public.marketing_opportunities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.marketing_pipelines(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.marketing_pipeline_stages(id) ON DELETE CASCADE,
  name text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  source text,
  assigned_to uuid,
  follower_id uuid,
  company_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their opportunities"
  ON public.marketing_opportunities FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view opportunities if permitted"
  ON public.marketing_opportunities FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all opportunities"
  ON public.marketing_opportunities FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_marketing_opportunities_updated_at
  BEFORE UPDATE ON public.marketing_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
