-- meta_insights_cache: caches Meta API responses with TTL
CREATE TABLE IF NOT EXISTS public.meta_insights_cache (
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
