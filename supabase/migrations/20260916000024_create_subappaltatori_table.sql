-- Create the main subappaltatori table for managing subcontractor profiles & campo access.
-- This is separate from subappaltatori_sicurezza (safety docs) and sal_subappaltatori (SAL records).
CREATE TABLE IF NOT EXISTS subappaltatori (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ragione_sociale TEXT NOT NULL,
  responsabile TEXT,
  telefono TEXT,
  email TEXT,
  piva TEXT,
  indirizzo TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE subappaltatori ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_select_subappaltatori"
  ON subappaltatori FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "company_admin_manage_subappaltatori"
  ON subappaltatori FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role))
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role))
  );

-- Index for fast lookups
CREATE INDEX idx_subappaltatori_company ON subappaltatori(company_id);
CREATE INDEX idx_subappaltatori_user ON subappaltatori(user_id) WHERE user_id IS NOT NULL;
