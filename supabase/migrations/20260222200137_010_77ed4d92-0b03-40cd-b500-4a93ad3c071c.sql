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
