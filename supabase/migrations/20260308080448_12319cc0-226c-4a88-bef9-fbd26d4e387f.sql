
-- 1. Create cost_budgets table
CREATE TABLE public.cost_budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  month DATE NOT NULL,
  budget_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, category, month)
);

-- Enable RLS
ALTER TABLE public.cost_budgets ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own company budgets" ON public.cost_budgets
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert own company budgets" ON public.cost_budgets
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update own company budgets" ON public.cost_budgets
  FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete own company budgets" ON public.cost_budgets
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Index
CREATE INDEX idx_cost_budgets_company_id ON public.cost_budgets(company_id);

-- 2. Add recurrence columns to company_costs (if not existing)
ALTER TABLE public.company_costs 
  ADD COLUMN IF NOT EXISTS recurrence_auto BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE;
