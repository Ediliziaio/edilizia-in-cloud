
-- 1. New columns on marketing_contacts
ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS follower_id uuid,
  ADD COLUMN IF NOT EXISTS contact_type text NOT NULL DEFAULT 'lead',
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Italia',
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS date_of_birth date;

-- 2. marketing_custom_fields
CREATE TABLE public.marketing_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  options text[] DEFAULT '{}',
  section text NOT NULL DEFAULT 'general_info',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.marketing_custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their custom fields"
  ON public.marketing_custom_fields FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view custom fields if permitted"
  ON public.marketing_custom_fields FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all custom fields"
  ON public.marketing_custom_fields FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- 3. marketing_contact_field_values
CREATE TABLE public.marketing_contact_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.marketing_custom_fields(id) ON DELETE CASCADE,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contact_id, field_id)
);
ALTER TABLE public.marketing_contact_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage contact field values"
  ON public.marketing_contact_field_values FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.marketing_contacts mc WHERE mc.id = marketing_contact_field_values.contact_id AND mc.company_id = get_user_company_id(auth.uid())
  ));

CREATE POLICY "Staff can view contact field values if permitted"
  ON public.marketing_contact_field_values FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND EXISTS (
    SELECT 1 FROM public.marketing_contacts mc WHERE mc.id = marketing_contact_field_values.contact_id AND mc.company_id = get_user_company_id(auth.uid())
  ));

CREATE POLICY "Super admins can manage all contact field values"
  ON public.marketing_contact_field_values FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- 4. marketing_contact_notes
CREATE TABLE public.marketing_contact_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.marketing_contact_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage contact notes"
  ON public.marketing_contact_notes FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view contact notes if permitted"
  ON public.marketing_contact_notes FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all contact notes"
  ON public.marketing_contact_notes FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- 5. marketing_contact_activities
CREATE TABLE public.marketing_contact_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  description text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.marketing_contact_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage contact activities"
  ON public.marketing_contact_activities FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view contact activities if permitted"
  ON public.marketing_contact_activities FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all contact activities"
  ON public.marketing_contact_activities FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
