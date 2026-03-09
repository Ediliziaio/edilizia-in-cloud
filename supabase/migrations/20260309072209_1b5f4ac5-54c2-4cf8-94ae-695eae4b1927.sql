
-- GDPR Data Export/Deletion Requests
CREATE TABLE public.gdpr_data_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  request_type text NOT NULL DEFAULT 'export',
  status text NOT NULL DEFAULT 'pending',
  reason text,
  download_url text,
  expires_at timestamptz,
  processed_at timestamptz,
  processed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gdpr_request_type_check CHECK (request_type IN ('export', 'deletion', 'rectification')),
  CONSTRAINT gdpr_status_check CHECK (status IN ('pending', 'processing', 'completed', 'rejected', 'expired'))
);

-- GDPR Consent Records
CREATE TABLE public.gdpr_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  consent_type text NOT NULL,
  granted boolean NOT NULL DEFAULT false,
  ip_address text,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id, consent_type)
);

-- GDPR Audit Trail (immutable log)
CREATE TABLE public.gdpr_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL,
  details jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_gdpr_requests_company ON public.gdpr_data_requests(company_id);
CREATE INDEX idx_gdpr_requests_user ON public.gdpr_data_requests(user_id);
CREATE INDEX idx_gdpr_requests_status ON public.gdpr_data_requests(status);
CREATE INDEX idx_gdpr_consents_company ON public.gdpr_consents(company_id);
CREATE INDEX idx_gdpr_consents_user ON public.gdpr_consents(user_id);
CREATE INDEX idx_gdpr_audit_company ON public.gdpr_audit_log(company_id, created_at DESC);

-- RLS
ALTER TABLE public.gdpr_data_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gdpr_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gdpr_audit_log ENABLE ROW LEVEL SECURITY;

-- Users can see/create their own requests; admins can see all for their company
CREATE POLICY "Users manage own gdpr requests"
ON public.gdpr_data_requests FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  OR company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- Users manage own consents
CREATE POLICY "Users manage own consents"
ON public.gdpr_consents FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  OR company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- Audit log: read-only for company admins and super admins
CREATE POLICY "Admins read gdpr audit log"
ON public.gdpr_audit_log FOR SELECT TO authenticated
USING (
  company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- Insert policy for audit log (system can insert for any authenticated user)
CREATE POLICY "System inserts gdpr audit log"
ON public.gdpr_audit_log FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
