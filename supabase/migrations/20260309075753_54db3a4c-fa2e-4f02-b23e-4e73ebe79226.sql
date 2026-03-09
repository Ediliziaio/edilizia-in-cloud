
-- Active impersonations table for secure impersonation tracking
CREATE TABLE public.active_impersonations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  target_company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.active_impersonations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage their own impersonations"
ON public.active_impersonations
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role) AND admin_user_id = auth.uid())
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) AND admin_user_id = auth.uid());

-- Index for cleanup and lookup
CREATE INDEX idx_active_impersonations_admin ON public.active_impersonations(admin_user_id);
CREATE INDEX idx_active_impersonations_expires ON public.active_impersonations(expires_at);

-- Admin IP allowlist table
CREATE TABLE public.admin_ip_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  label TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ip_address)
);

ALTER TABLE public.admin_ip_allowlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage IP allowlist"
ON public.admin_ip_allowlist
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
