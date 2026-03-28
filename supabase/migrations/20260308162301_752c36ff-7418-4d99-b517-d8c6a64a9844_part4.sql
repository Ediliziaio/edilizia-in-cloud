-- 3. Google Calendar webhook columns
ALTER TABLE public.google_calendar_connections
  ADD COLUMN IF NOT EXISTS webhook_channel_id text,
  ADD COLUMN IF NOT EXISTS webhook_resource_id text,
  ADD COLUMN IF NOT EXISTS webhook_expiry_at timestamptz;
