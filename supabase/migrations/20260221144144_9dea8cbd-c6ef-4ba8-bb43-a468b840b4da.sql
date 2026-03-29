-- Create marketing_tags table
CREATE TABLE public.marketing_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
