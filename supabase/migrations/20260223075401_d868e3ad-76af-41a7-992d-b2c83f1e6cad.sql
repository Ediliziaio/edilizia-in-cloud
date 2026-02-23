
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS html_content text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS sender_email text,
  ADD COLUMN IF NOT EXISTS preview_text text,
  ADD COLUMN IF NOT EXISTS track_clicks boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS utm_tracking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_tag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resend_to_unopened boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS send_mode text NOT NULL DEFAULT 'immediate';
