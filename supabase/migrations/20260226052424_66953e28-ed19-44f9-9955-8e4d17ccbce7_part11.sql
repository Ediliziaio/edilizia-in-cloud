-- 3. google_calendar_event_map (bidirectional mapping)
CREATE TABLE public.google_calendar_event_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  google_event_id text NOT NULL,
  google_calendar_id text,
  source text NOT NULL DEFAULT 'crm',
  etag text,
  last_synced_at timestamptz,
  last_updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
