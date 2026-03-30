-- 1) Tabella stripe_events_log per idempotenza e audit
CREATE TABLE IF NOT EXISTS public.stripe_events_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  payload jsonb,
  processed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'processed',
  error_message text
);
