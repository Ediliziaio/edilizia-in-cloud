-- Create marketing_contacts table
CREATE TABLE public.marketing_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text,
  phone text,
  email text,
  company_name text,
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  source text,
  last_activity_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
