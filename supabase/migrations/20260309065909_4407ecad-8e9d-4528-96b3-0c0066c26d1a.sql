
-- 1) Tabella stripe_events_log per idempotenza e audit
CREATE TABLE public.stripe_events_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  payload jsonb,
  processed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'processed',
  error_message text
);

CREATE INDEX idx_stripe_events_log_event_id ON public.stripe_events_log(stripe_event_id);
CREATE INDEX idx_stripe_events_log_company ON public.stripe_events_log(company_id);
CREATE INDEX idx_stripe_events_log_type ON public.stripe_events_log(event_type);

ALTER TABLE public.stripe_events_log ENABLE ROW LEVEL SECURITY;

-- Solo super_admin possono leggere
CREATE POLICY "Super admins can read stripe events"
  ON public.stripe_events_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- 2) Aggiungere colonne dunning a companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_subscription_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS payment_failure_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dunning_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_payment_failure_at timestamptz,
  ADD COLUMN IF NOT EXISTS dunning_started_at timestamptz;
