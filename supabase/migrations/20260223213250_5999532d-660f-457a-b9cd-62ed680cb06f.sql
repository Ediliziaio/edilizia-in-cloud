
CREATE TABLE IF NOT EXISTS public.automation_global_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  config_json jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_global_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company can manage own global automation settings"
  ON public.automation_global_settings FOR ALL
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));
