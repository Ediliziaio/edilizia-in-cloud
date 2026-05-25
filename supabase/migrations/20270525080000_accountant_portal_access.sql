-- Portale commercialista: studi, collaboratori, aziende collegate, richieste e audit.
-- Il modello tiene separato l'accesso dello studio dai normali utenti aziendali:
-- il commercialista vede solo le aziende per cui esiste una delega attiva.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant';

CREATE TABLE IF NOT EXISTS public.accountant_firms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vat_number text,
  fiscal_code text,
  email text,
  phone text,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending_contract', 'suspended', 'archived')),
  brand_name text,
  brand_logo_url text,
  brand_primary_color text,
  contract_status text NOT NULL DEFAULT 'pending'
    CHECK (contract_status IN ('pending', 'sent', 'signed', 'approved', 'rejected')),
  dpa_status text NOT NULL DEFAULT 'pending'
    CHECK (dpa_status IN ('pending', 'sent', 'signed', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accountant_firm_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.accountant_firms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'collaborator'
    CHECK (role IN ('owner', 'admin', 'collaborator', 'viewer')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'suspended')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.accountant_company_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.accountant_firms(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
  access_mode text NOT NULL DEFAULT 'read_only'
    CHECK (access_mode IN ('read_only', 'operational', 'approval_required')),
  permissions jsonb NOT NULL DEFAULT jsonb_build_object(
    'finance', true,
    'documents', true,
    'management_control', true,
    'jobs', true,
    'requests', true,
    'exports', true,
    'write_actions', false
  ),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, company_id)
);

CREATE TABLE IF NOT EXISTS public.accountant_company_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.accountant_firms(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  area text NOT NULL DEFAULT 'documents'
    CHECK (area IN ('documents', 'finance', 'management_control', 'jobs', 'tax', 'other')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'waiting_company', 'in_review', 'resolved', 'cancelled')),
  due_date date,
  blocker_kind text
    CHECK (blocker_kind IS NULL OR blocker_kind IN ('export', 'monthly_close', 'invoice', 'job_margin', 'cashflow')),
  source_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accountant_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid REFERENCES public.accountant_firms(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accountant_firm_members_user
  ON public.accountant_firm_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_accountant_company_access_company
  ON public.accountant_company_access(company_id, status);
CREATE INDEX IF NOT EXISTS idx_accountant_company_access_firm
  ON public.accountant_company_access(firm_id, status);
CREATE INDEX IF NOT EXISTS idx_accountant_requests_company_status
  ON public.accountant_company_requests(company_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_accountant_audit_company_created
  ON public.accountant_audit_log(company_id, created_at DESC);

DROP TRIGGER IF EXISTS update_accountant_firms_updated_at ON public.accountant_firms;
CREATE TRIGGER update_accountant_firms_updated_at
  BEFORE UPDATE ON public.accountant_firms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_accountant_firm_members_updated_at ON public.accountant_firm_members;
CREATE TRIGGER update_accountant_firm_members_updated_at
  BEFORE UPDATE ON public.accountant_firm_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_accountant_company_access_updated_at ON public.accountant_company_access;
CREATE TRIGGER update_accountant_company_access_updated_at
  BEFORE UPDATE ON public.accountant_company_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_accountant_company_requests_updated_at ON public.accountant_company_requests;
CREATE TRIGGER update_accountant_company_requests_updated_at
  BEFORE UPDATE ON public.accountant_company_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_accountant_firm_member(p_firm_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.accountant_firm_members afm
    WHERE afm.firm_id = p_firm_id
      AND afm.user_id = auth.uid()
      AND afm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_accountant_firm_admin(p_firm_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.accountant_firm_members afm
    WHERE afm.firm_id = p_firm_id
      AND afm.user_id = auth.uid()
      AND afm.status = 'active'
      AND afm.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_accountant_access_company(
  p_company_id uuid,
  p_permission text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.accountant_company_access aca
    JOIN public.accountant_firm_members afm ON afm.firm_id = aca.firm_id
    WHERE aca.company_id = p_company_id
      AND aca.status = 'active'
      AND afm.user_id = auth.uid()
      AND afm.status = 'active'
      AND (
        p_permission IS NULL
        OR COALESCE((aca.permissions ->> p_permission)::boolean, false)
      )
  );
$$;

ALTER TABLE public.accountant_firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountant_firm_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountant_company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountant_company_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountant_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Accountant firm members can read firm" ON public.accountant_firms;
CREATE POLICY "Accountant firm members can read firm"
  ON public.accountant_firms
  FOR SELECT TO authenticated
  USING (
    public.is_accountant_firm_member(id)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Super admins can manage accountant firms" ON public.accountant_firms;
CREATE POLICY "Super admins can manage accountant firms"
  ON public.accountant_firms
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Firm admins can update their firm" ON public.accountant_firms;
CREATE POLICY "Firm admins can update their firm"
  ON public.accountant_firms
  FOR UPDATE TO authenticated
  USING (public.is_accountant_firm_admin(id))
  WITH CHECK (public.is_accountant_firm_admin(id));

DROP POLICY IF EXISTS "Firm members can read members" ON public.accountant_firm_members;
CREATE POLICY "Firm members can read members"
  ON public.accountant_firm_members
  FOR SELECT TO authenticated
  USING (
    public.is_accountant_firm_member(firm_id)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Firm admins can manage members" ON public.accountant_firm_members;
CREATE POLICY "Firm admins can manage members"
  ON public.accountant_firm_members
  FOR ALL TO authenticated
  USING (
    public.is_accountant_firm_admin(firm_id)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.is_accountant_firm_admin(firm_id)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Accountant and company can read access" ON public.accountant_company_access;
CREATE POLICY "Accountant and company can read access"
  ON public.accountant_company_access
  FOR SELECT TO authenticated
  USING (
    public.is_accountant_firm_member(firm_id)
    OR company_id = public.get_user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Company admins and firm admins can manage access" ON public.accountant_company_access;
CREATE POLICY "Company admins and firm admins can manage access"
  ON public.accountant_company_access
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      company_id = public.get_user_company_id(auth.uid())
      AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
    )
    OR public.is_accountant_firm_admin(firm_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      company_id = public.get_user_company_id(auth.uid())
      AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
    )
    OR public.is_accountant_firm_admin(firm_id)
  );

DROP POLICY IF EXISTS "Accountant and company can read requests" ON public.accountant_company_requests;
CREATE POLICY "Accountant and company can read requests"
  ON public.accountant_company_requests
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR company_id = public.get_user_company_id(auth.uid())
    OR (
      public.is_accountant_firm_member(firm_id)
      AND public.can_accountant_access_company(company_id, 'requests')
    )
  );

DROP POLICY IF EXISTS "Accountant and company can manage requests" ON public.accountant_company_requests;
CREATE POLICY "Accountant and company can manage requests"
  ON public.accountant_company_requests
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR company_id = public.get_user_company_id(auth.uid())
    OR (
      public.is_accountant_firm_member(firm_id)
      AND public.can_accountant_access_company(company_id, 'requests')
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR company_id = public.get_user_company_id(auth.uid())
    OR (
      public.is_accountant_firm_member(firm_id)
      AND public.can_accountant_access_company(company_id, 'requests')
    )
  );

DROP POLICY IF EXISTS "Accountant and company can read audit" ON public.accountant_audit_log;
CREATE POLICY "Accountant and company can read audit"
  ON public.accountant_audit_log
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR company_id = public.get_user_company_id(auth.uid())
    OR (firm_id IS NOT NULL AND public.is_accountant_firm_member(firm_id))
  );

DROP POLICY IF EXISTS "Authenticated users can insert accountant audit" ON public.accountant_audit_log;
CREATE POLICY "Authenticated users can insert accountant audit"
  ON public.accountant_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR company_id = public.get_user_company_id(auth.uid())
      OR (firm_id IS NOT NULL AND public.is_accountant_firm_member(firm_id))
    )
  );
