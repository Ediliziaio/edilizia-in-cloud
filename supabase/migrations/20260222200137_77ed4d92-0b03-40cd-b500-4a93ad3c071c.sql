
-- Marketing Calendars table
CREATE TABLE public.marketing_calendars (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  group_name text,
  duration_minutes integer NOT NULL DEFAULT 30,
  calendar_type text NOT NULL DEFAULT 'personal',
  is_active boolean NOT NULL DEFAULT true,
  owner_id uuid,
  description text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_calendars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their marketing calendars"
  ON public.marketing_calendars FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view marketing calendars if permitted"
  ON public.marketing_calendars FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all marketing calendars"
  ON public.marketing_calendars FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Marketing Calendar Availability table
CREATE TABLE public.marketing_calendar_availability (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  calendar_id uuid NOT NULL REFERENCES public.marketing_calendars(id) ON DELETE CASCADE,
  day_of_week integer,
  start_time time NOT NULL DEFAULT '09:00',
  end_time time NOT NULL DEFAULT '18:00',
  is_enabled boolean NOT NULL DEFAULT true,
  specific_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_calendar_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their calendar availability"
  ON public.marketing_calendar_availability FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view calendar availability if permitted"
  ON public.marketing_calendar_availability FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all calendar availability"
  ON public.marketing_calendar_availability FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Marketing Calendar Preferences table
CREATE TABLE public.marketing_calendar_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  week_start_day text NOT NULL DEFAULT 'monday',
  time_format text NOT NULL DEFAULT '24h',
  language text NOT NULL DEFAULT 'it',
  show_services_menu boolean NOT NULL DEFAULT true,
  show_rooms boolean NOT NULL DEFAULT true,
  show_equipment boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_calendar_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their calendar preferences"
  ON public.marketing_calendar_preferences FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view calendar preferences if permitted"
  ON public.marketing_calendar_preferences FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all calendar preferences"
  ON public.marketing_calendar_preferences FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at on marketing_calendars
CREATE TRIGGER update_marketing_calendars_updated_at
  BEFORE UPDATE ON public.marketing_calendars
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on marketing_calendar_preferences
CREATE TRIGGER update_marketing_calendar_preferences_updated_at
  BEFORE UPDATE ON public.marketing_calendar_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
