
CREATE TABLE public.multi_company_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  access_role TEXT NOT NULL DEFAULT 'company_staff',
  granted_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, company_id)
);

ALTER TABLE public.multi_company_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_full_access" ON public.multi_company_access
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "multi_company_user_read_own" ON public.multi_company_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_multi_company_access_user_id ON public.multi_company_access(user_id);
CREATE INDEX idx_multi_company_access_company_id ON public.multi_company_access(company_id);
