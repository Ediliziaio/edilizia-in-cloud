-- 2. google_calendar_settings (sync config per-user)
CREATE TABLE IF NOT EXISTS public.google_calendar_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.google_calendar_connections(id) ON DELETE CASCADE,
  primary_calendar_id text,
  conflict_calendar_ids text[] NOT NULL DEFAULT '{}',
  sync_mode text NOT NULL DEFAULT 'one_way',
  import_google_events_to_crm boolean NOT NULL DEFAULT false,
  create_contacts_from_guests boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
