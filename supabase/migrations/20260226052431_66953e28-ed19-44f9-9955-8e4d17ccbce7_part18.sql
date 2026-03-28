-- 4. google_calendar_busy_slots (cached busy blocks)
CREATE TABLE public.google_calendar_busy_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_event_id text,
  google_calendar_id text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  summary text,
  is_all_day boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
