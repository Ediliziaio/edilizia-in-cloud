
-- Create marketing_contact_lists table
CREATE TABLE public.marketing_contact_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create marketing_contact_list_members join table
CREATE TABLE public.marketing_contact_list_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID NOT NULL REFERENCES public.marketing_contact_lists(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (list_id, contact_id)
);

-- Indexes
CREATE INDEX idx_mcl_company_id ON public.marketing_contact_lists(company_id);
CREATE INDEX idx_mclm_list_id ON public.marketing_contact_list_members(list_id);
CREATE INDEX idx_mclm_contact_id ON public.marketing_contact_list_members(contact_id);

-- Enable RLS
ALTER TABLE public.marketing_contact_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_contact_list_members ENABLE ROW LEVEL SECURITY;

-- RLS for marketing_contact_lists
CREATE POLICY "Company admins can manage their contact lists"
  ON public.marketing_contact_lists FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view contact lists if permitted"
  ON public.marketing_contact_lists FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all contact lists"
  ON public.marketing_contact_lists FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- RLS for marketing_contact_list_members
CREATE POLICY "Company admins can manage list members"
  ON public.marketing_contact_list_members FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.marketing_contact_lists l
    WHERE l.id = marketing_contact_list_members.list_id
    AND l.company_id = get_user_company_id(auth.uid())
  ));

CREATE POLICY "Staff can view list members if permitted"
  ON public.marketing_contact_list_members FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND EXISTS (
    SELECT 1 FROM public.marketing_contact_lists l
    WHERE l.id = marketing_contact_list_members.list_id
    AND l.company_id = get_user_company_id(auth.uid())
  ));

CREATE POLICY "Super admins can manage all list members"
  ON public.marketing_contact_list_members FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Updated_at trigger for lists
CREATE TRIGGER update_marketing_contact_lists_updated_at
  BEFORE UPDATE ON public.marketing_contact_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
