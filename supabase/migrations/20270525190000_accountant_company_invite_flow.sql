-- Accountant ⇆ company invite flow
-- L'azienda invita il proprio commercialista dal pannello "Persone & Utenti";
-- l'invito crea (o aggiorna) un record in accountant_company_access con
-- status='invited' e una notifica in accountant_notifications per il
-- commercialista (in-app + email via edge function).

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Extra columns su accountant_company_access per supportare invito
--    ad accountant non ancora registrato + accept/revoke flow
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.accountant_company_access
  ADD COLUMN IF NOT EXISTS invited_email text,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_accountant_company_access_invited_email
  ON public.accountant_company_access (lower(invited_email))
  WHERE invited_email IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Tabella notifiche dedicate al commercialista
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accountant_notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id      uuid NOT NULL REFERENCES public.accountant_firms(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Tipo: company_invite, company_revoked, new_request, doc_uploaded, ecc.
  type         text NOT NULL,
  title        text NOT NULL,
  body         text,
  -- Link ad entità correlata (es. company_id, request_id)
  entity_type  text,
  entity_id    uuid,
  action_url   text,
  is_read      boolean NOT NULL DEFAULT false,
  is_dismissed boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_accountant_notifications_user_unread
  ON public.accountant_notifications (user_id, is_read, created_at DESC)
  WHERE is_dismissed = false;

CREATE INDEX IF NOT EXISTS idx_accountant_notifications_firm_created
  ON public.accountant_notifications (firm_id, created_at DESC);

ALTER TABLE public.accountant_notifications ENABLE ROW LEVEL SECURITY;

-- RLS: ogni user vede solo le proprie notifiche
DROP POLICY IF EXISTS "accountant_notifications_own_select" ON public.accountant_notifications;
CREATE POLICY "accountant_notifications_own_select"
  ON public.accountant_notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "accountant_notifications_own_update" ON public.accountant_notifications;
CREATE POLICY "accountant_notifications_own_update"
  ON public.accountant_notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "accountant_notifications_service_role_all" ON public.accountant_notifications;
CREATE POLICY "accountant_notifications_service_role_all"
  ON public.accountant_notifications FOR ALL
  USING (current_setting('role'::text, true) = 'service_role'::text)
  WITH CHECK (current_setting('role'::text, true) = 'service_role'::text);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Helper RPC: invited_email → user_id (se esistente)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lookup_user_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;
  RETURN v_user_id;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. RPC: list_company_accountant_invites
--    Restituisce le deleghe attive/invited per una company, usabile via RLS
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_company_accountant_invites(p_company_id uuid)
RETURNS TABLE (
  access_id uuid,
  firm_id uuid,
  firm_name text,
  firm_vat text,
  owner_email text,
  invited_email text,
  status text,
  access_mode text,
  permissions jsonb,
  invited_at timestamptz,
  accepted_at timestamptz,
  notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS access_id,
    a.firm_id,
    f.name AS firm_name,
    f.vat_number AS firm_vat,
    coalesce(f.email, owner_user.email) AS owner_email,
    a.invited_email,
    a.status,
    a.access_mode,
    a.permissions,
    a.invited_at,
    a.accepted_at,
    a.notes
  FROM public.accountant_company_access a
  JOIN public.accountant_firms f ON f.id = a.firm_id
  LEFT JOIN auth.users owner_user ON owner_user.id = f.owner_user_id
  WHERE a.company_id = p_company_id
    AND a.status IN ('invited', 'active', 'suspended')
  ORDER BY a.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_company_accountant_invites(uuid) TO authenticated;
