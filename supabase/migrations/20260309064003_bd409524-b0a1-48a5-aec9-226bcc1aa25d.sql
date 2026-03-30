-- Feature Flags System: 2 new tables

CREATE TABLE IF NOT EXISTS public.platform_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'core',
  is_beta BOOLEAN DEFAULT false,
  default_value BOOLEAN DEFAULT false,
  plans_included TEXT[] DEFAULT '{}',
  price_per_month DECIMAL(10,2),
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
