
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

-- RLS
ALTER TABLE public.company_branding ENABLE ROW LEVEL SECURITY;

-- Company members can read their own branding
CREATE POLICY "company_members_read_branding"
  ON public.company_branding FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Company admins can insert/update their own branding
CREATE POLICY "company_admin_manage_branding"
  ON public.company_branding FOR ALL
  TO authenticated
  USING (
    (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
     AND public.has_role(auth.uid(), 'company_admin'::app_role))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
     AND public.has_role(auth.uid(), 'company_admin'::app_role))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Index for fast lookup
CREATE INDEX idx_company_branding_company_id ON public.company_branding(company_id);

-- Storage bucket for branding assets
INSERT INTO storage.buckets (id, name, public) VALUES ('branding', 'branding', true);

-- Storage policies for branding bucket
CREATE POLICY "branding_read_all" ON storage.objects FOR SELECT TO public USING (bucket_id = 'branding');
CREATE POLICY "branding_insert_admin" ON storage.objects FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'branding' AND (
    public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)
  ));
CREATE POLICY "branding_update_admin" ON storage.objects FOR UPDATE TO authenticated 
  USING (bucket_id = 'branding' AND (
    public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)
  ));
CREATE POLICY "branding_delete_admin" ON storage.objects FOR DELETE TO authenticated 
  USING (bucket_id = 'branding' AND (
    public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)
  ));
