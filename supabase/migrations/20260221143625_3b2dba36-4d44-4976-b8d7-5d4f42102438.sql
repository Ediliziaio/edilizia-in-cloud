
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

-- Indexes
CREATE INDEX idx_marketing_contacts_company_id ON public.marketing_contacts(company_id);
CREATE INDEX idx_marketing_contacts_created_at ON public.marketing_contacts(created_at DESC);

-- Enable RLS
ALTER TABLE public.marketing_contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies (same pattern as orders, employees, etc.)
CREATE POLICY "Company admins can manage their marketing contacts"
ON public.marketing_contacts
FOR ALL
USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view marketing contacts if permitted"
ON public.marketing_contacts
FOR SELECT
USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all marketing contacts"
ON public.marketing_contacts
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_marketing_contacts_updated_at
BEFORE UPDATE ON public.marketing_contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
