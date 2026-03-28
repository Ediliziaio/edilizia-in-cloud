-- Company branding / white-label table
CREATE TABLE public.company_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL UNIQUE,
  -- Logo & visual
  logo_url TEXT,
  favicon_url TEXT,
  -- Colors (HSL format stored as text)
  primary_color TEXT DEFAULT '222 47% 11%',
  secondary_color TEXT,
  accent_color TEXT,
  sidebar_bg_color TEXT,
  sidebar_text_color TEXT,
  -- Login page
  login_bg_color TEXT,
  login_logo_url TEXT,
  login_title TEXT,
  login_subtitle TEXT,
  -- Custom domain
  custom_domain TEXT,
  -- Email branding
  email_header_logo_url TEXT,
  email_footer_text TEXT,
  -- Misc
  hide_platform_branding BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
