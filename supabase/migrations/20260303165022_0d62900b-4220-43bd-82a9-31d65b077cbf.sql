
-- meta_ad_accounts: stores ad accounts linked to an integration
CREATE TABLE public.meta_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  ad_account_id text NOT NULL,
  ad_account_name text NOT NULL DEFAULT '',
  account_status integer DEFAULT 0,
  currency text DEFAULT 'EUR',
  selected boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, ad_account_id)
);

ALTER TABLE public.meta_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company ad accounts"
  ON public.meta_ad_accounts FOR SELECT TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "Users can manage own company ad accounts"
  ON public.meta_ad_accounts FOR ALL TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

-- meta_insights_cache: caches Meta API responses with TTL
CREATE TABLE public.meta_insights_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ad_account_id text NOT NULL,
  date_start date NOT NULL,
  date_end date NOT NULL,
  level text NOT NULL DEFAULT 'campaign',
  payload_json jsonb NOT NULL DEFAULT '{}',
  fetched_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '15 minutes'),
  UNIQUE(company_id, ad_account_id, date_start, date_end, level)
);

ALTER TABLE public.meta_insights_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company insights cache"
  ON public.meta_insights_cache FOR SELECT TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "Users can manage own company insights cache"
  ON public.meta_insights_cache FOR ALL TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

-- reporting_preferences: user-specific report settings
CREATE TABLE public.reporting_preferences (
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

ALTER TABLE public.reporting_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences"
  ON public.reporting_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own preferences"
  ON public.reporting_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
