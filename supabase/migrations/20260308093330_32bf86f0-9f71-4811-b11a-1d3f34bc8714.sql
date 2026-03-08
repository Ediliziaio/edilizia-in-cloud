
CREATE TABLE public.cost_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE public.cost_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own company cost categories"
ON public.cost_categories FOR ALL TO authenticated
USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX idx_cost_categories_company_id ON public.cost_categories(company_id);
