-- Migration: webhook_logs table for Module 8 (P0) Webhook Alerts
-- Stores all incoming webhook events with processing status

CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'failed', 'retried')),
  error_message text,
  attempts int NOT NULL DEFAULT 1,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_manage_webhook_logs"
  ON public.webhook_logs
  FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Indexes for efficient filtering
CREATE INDEX IF NOT EXISTS webhook_logs_provider_status_idx
  ON public.webhook_logs (provider, status, created_at DESC);

CREATE INDEX IF NOT EXISTS webhook_logs_created_at_idx
  ON public.webhook_logs (created_at DESC);
