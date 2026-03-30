-- Create marketing_opportunity_field_values table
CREATE TABLE IF NOT EXISTS public.marketing_opportunity_field_values (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES public.marketing_opportunities(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.marketing_custom_fields(id) ON DELETE CASCADE,
  value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
