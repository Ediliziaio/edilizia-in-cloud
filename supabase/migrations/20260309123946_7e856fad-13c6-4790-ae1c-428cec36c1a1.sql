
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

-- Addon log table
CREATE TABLE IF NOT EXISTS public.company_addons_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  addon_key TEXT NOT NULL,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES auth.users(id),
  performed_by_email TEXT,
  old_value JSONB,
  new_value JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.company_addons_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admins_manage_addons_log"
ON public.company_addons_log FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Storage bucket for white-label assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('white-label-assets', 'white-label-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "company_members_upload_wl_assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'white-label-assets' AND
  (storage.foldername(name))[1] = (
    SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
);

CREATE POLICY "super_admin_manage_wl_assets"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'white-label-assets' AND public.has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  bucket_id = 'white-label-assets' AND public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "public_read_wl_assets"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'white-label-assets');

-- Helper function
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role = 'super_admin'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
