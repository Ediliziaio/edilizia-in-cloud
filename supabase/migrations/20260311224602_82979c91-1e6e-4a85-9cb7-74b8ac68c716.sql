
CREATE TABLE IF NOT EXISTS webhooks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         text NOT NULL,
  url          text NOT NULL,
  secret       text,
  is_active    boolean NOT NULL DEFAULT true,
  events       text[] NOT NULL DEFAULT '{}',
  created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      uuid NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type      text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'pending',
  http_status     integer,
  response_body   text,
  duration_ms     integer,
  attempt_count   integer NOT NULL DEFAULT 1,
  last_attempt_at timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_webhooks_company_id   ON webhooks(company_id);
CREATE INDEX idx_wh_deliveries_wh_id   ON webhook_deliveries(webhook_id);
CREATE INDEX idx_wh_deliveries_created ON webhook_deliveries(created_at DESC);
CREATE INDEX idx_wh_deliveries_status  ON webhook_deliveries(status);

ALTER TABLE webhooks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_webhooks" ON webhooks
  FOR ALL USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "company_webhook_deliveries" ON webhook_deliveries
  FOR ALL USING (
    webhook_id IN (
      SELECT w.id FROM webhooks w
      JOIN profiles p ON p.id = auth.uid()
      WHERE w.company_id = p.company_id
    )
    OR public.has_role(auth.uid(), 'super_admin')
  );
