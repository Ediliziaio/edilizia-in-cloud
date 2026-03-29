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
