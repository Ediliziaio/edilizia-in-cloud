-- Tabella marketing_opportunities
CREATE TABLE IF NOT EXISTS public.marketing_opportunities (
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
