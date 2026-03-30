-- CREATE TABLE IF NOT EXISTS for opportunity notes
CREATE TABLE IF NOT EXISTS public.marketing_opportunity_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES public.marketing_opportunities(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  content TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
