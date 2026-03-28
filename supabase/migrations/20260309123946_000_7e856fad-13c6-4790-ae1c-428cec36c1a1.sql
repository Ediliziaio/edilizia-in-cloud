-- White-label addon columns on companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS white_label_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS brand_primary_color TEXT DEFAULT '#1E40AF',
  ADD COLUMN IF NOT EXISTS brand_secondary_color TEXT DEFAULT '#3B82F6',
  ADD COLUMN IF NOT EXISTS brand_accent_color TEXT DEFAULT '#DBEAFE',
  ADD COLUMN IF NOT EXISTS brand_text_on_primary TEXT DEFAULT '#FFFFFF',
  ADD COLUMN IF NOT EXISTS brand_platform_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_favicon_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_login_bg_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_hide_powered_by BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS white_label_enabled_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS white_label_enabled_by UUID REFERENCES auth.users(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS white_label_monthly_price NUMERIC(8,2) DEFAULT 0;
