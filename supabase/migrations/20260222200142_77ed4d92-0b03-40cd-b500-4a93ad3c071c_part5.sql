-- Marketing Calendar Availability table
CREATE TABLE IF NOT EXISTS public.marketing_calendar_availability (
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
