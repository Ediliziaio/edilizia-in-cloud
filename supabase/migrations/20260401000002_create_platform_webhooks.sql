CREATE TABLE IF NOT EXISTS platform_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  secret_token TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  last_status_code INTEGER,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE platform_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sa_only" ON platform_webhooks
  USING (auth.jwt() ->> 'role' IN ('super_admin','admin'));

CREATE TABLE IF NOT EXISTS platform_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES platform_webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB,
  status_code INTEGER,
  response_body TEXT,
  delivered_at TIMESTAMPTZ DEFAULT NOW(),
  duration_ms INTEGER
);
