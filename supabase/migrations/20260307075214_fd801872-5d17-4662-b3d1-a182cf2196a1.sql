
CREATE TABLE public.marketing_opportunity_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.marketing_pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  filters jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketing_opportunity_lists_company ON public.marketing_opportunity_lists(company_id);
CREATE INDEX idx_marketing_opportunity_lists_pipeline ON public.marketing_opportunity_lists(pipeline_id);

ALTER TABLE public.marketing_opportunity_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company lists"
  ON public.marketing_opportunity_lists FOR SELECT TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "Users can insert own company lists"
  ON public.marketing_opportunity_lists FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "Users can update own company lists"
  ON public.marketing_opportunity_lists FOR UPDATE TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "Users can delete own company lists"
  ON public.marketing_opportunity_lists FOR DELETE TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));
