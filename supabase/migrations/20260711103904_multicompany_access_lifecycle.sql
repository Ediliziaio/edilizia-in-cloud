-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.


ALTER TABLE public.multi_company_access
  ADD COLUMN IF NOT EXISTS status        text        NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS invited_email text,
  ADD COLUMN IF NOT EXISTS expires_at    timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.multi_company_access DROP CONSTRAINT IF EXISTS mca_status_chk;
ALTER TABLE public.multi_company_access
  ADD CONSTRAINT mca_status_chk CHECK (status IN ('invited', 'active', 'suspended'));

ALTER TABLE public.multi_company_access DROP CONSTRAINT IF EXISTS mca_access_role_chk;
ALTER TABLE public.multi_company_access
  ADD CONSTRAINT mca_access_role_chk CHECK (access_role IN (
    'company_admin', 'company_staff', 'salesperson', 'call_center', 'employee', 'subcontractor'
  ));

CREATE INDEX IF NOT EXISTS idx_mca_company_status ON public.multi_company_access (company_id, status);

CREATE OR REPLACE FUNCTION public.mca_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$function$;

DROP TRIGGER IF EXISTS trg_mca_touch ON public.multi_company_access;
CREATE TRIGGER trg_mca_touch BEFORE UPDATE ON public.multi_company_access
  FOR EACH ROW EXECUTE FUNCTION public.mca_touch_updated_at();

CREATE OR REPLACE FUNCTION public.user_can_access_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    p_company_id IS NOT NULL
    AND (
      COALESCE(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role'
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR p_company_id = public.get_user_company_id(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.multi_company_access mca
        WHERE mca.user_id = auth.uid()
          AND mca.company_id = p_company_id
          AND mca.status = 'active'
          AND (mca.expires_at IS NULL OR mca.expires_at > now())
      )
      OR public.can_accountant_access_company(p_company_id, NULL)
    ),
  false);
$function$;

CREATE OR REPLACE FUNCTION public.get_effective_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE(
    (SELECT ai.target_company_id
       FROM public.active_impersonations ai
      WHERE ai.admin_user_id = auth.uid()
        AND ai.expires_at > now()
      ORDER BY ai.created_at DESC
      LIMIT 1),
    (SELECT acs.company_id
       FROM public.active_company_selection acs
      WHERE acs.user_id = auth.uid()
        AND (
          acs.company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.multi_company_access mca
            WHERE mca.user_id = auth.uid()
              AND mca.company_id = acs.company_id
              AND mca.status = 'active'
              AND (mca.expires_at IS NULL OR mca.expires_at > now())
          )
        )
      LIMIT 1),
    (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );
$function$;
