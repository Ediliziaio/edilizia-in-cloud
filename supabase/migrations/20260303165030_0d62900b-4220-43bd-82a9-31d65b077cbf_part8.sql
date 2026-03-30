-- reporting_preferences: user-specific report settings
CREATE TABLE IF NOT EXISTS public.reporting_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  report_key text NOT NULL DEFAULT 'facebook_ads',
  visible_columns jsonb DEFAULT '[]',
  default_sort text DEFAULT 'spend_desc',
  saved_filters jsonb DEFAULT '{}',
  last_ad_account text,
  last_date_range jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, user_id, report_key)
);
