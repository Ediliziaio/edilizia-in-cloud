CREATE TABLE public.google_calendar_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  connections_found integer NOT NULL DEFAULT 0,
  connections_synced integer NOT NULL DEFAULT 0,
  connections_failed integer NOT NULL DEFAULT 0,
  results jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'running',
  error_message text
);