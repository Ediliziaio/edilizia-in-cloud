-- Tabella marketing_pipeline_stages
CREATE TABLE IF NOT EXISTS public.marketing_pipeline_stages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_id uuid NOT NULL REFERENCES public.marketing_pipelines(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  show_in_reports boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
