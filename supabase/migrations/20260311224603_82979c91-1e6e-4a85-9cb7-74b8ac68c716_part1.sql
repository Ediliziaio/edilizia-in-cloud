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
