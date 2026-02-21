
-- Create marketing_tags table
CREATE TABLE public.marketing_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique constraint per company
ALTER TABLE public.marketing_tags ADD CONSTRAINT marketing_tags_company_name_unique UNIQUE (company_id, name);

-- Enable RLS
ALTER TABLE public.marketing_tags ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Company admins can manage their marketing tags"
ON public.marketing_tags FOR ALL
USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view marketing tags if permitted"
ON public.marketing_tags FOR SELECT
USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all marketing tags"
ON public.marketing_tags FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Indexes
CREATE INDEX idx_marketing_tags_company_id ON public.marketing_tags(company_id);
