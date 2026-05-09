-- ═══════════════════════════════════════════════════════════════════════════
-- BUGFIX: RLS internal_chat_* per super_admin sulla platform_admin_company
-- -----------------------------------------------------------------------
-- Problema: il canale silvio-admin vive nella platform_admin_company
-- (00000000-...-000001), ma Florin ha la sua company_id personale.
-- Le RLS esistenti filtrano `company_id = get_my_company_id()` → Florin
-- non vede né il canale né i messaggi → "Nessuna chat" in /admin/chat.
--
-- Fix: aggiungo policy "super_admin_platform" che permette accesso a TUTTE
-- le righe in internal_chat_* dove company_id = platform_admin_company,
-- per chiunque abbia ruolo super_admin. Le policy esistenti restano per
-- gli utenti normali (clienti aziende).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Helper: ritorna l'id della platform_admin_company
CREATE OR REPLACE FUNCTION public.get_platform_admin_company_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.companies WHERE is_platform_admin_company = true LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_admin_company_id() TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) internal_chat_members — super_admin vede/modifica righe della platform
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "icm_super_admin_platform" ON public.internal_chat_members;
CREATE POLICY "icm_super_admin_platform" ON public.internal_chat_members
  FOR ALL TO authenticated
  USING (
    public.is_silvio_superadmin()
    AND company_id = public.get_platform_admin_company_id()
  )
  WITH CHECK (
    public.is_silvio_superadmin()
    AND company_id = public.get_platform_admin_company_id()
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 2) internal_chat_channels — super_admin vede canali della platform
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "icc_super_admin_platform" ON public.internal_chat_channels;
CREATE POLICY "icc_super_admin_platform" ON public.internal_chat_channels
  FOR ALL TO authenticated
  USING (
    public.is_silvio_superadmin()
    AND company_id = public.get_platform_admin_company_id()
  )
  WITH CHECK (
    public.is_silvio_superadmin()
    AND company_id = public.get_platform_admin_company_id()
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 3) internal_chat_messages — super_admin vede/scrive messaggi della platform
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "icmsg_super_admin_platform" ON public.internal_chat_messages;
CREATE POLICY "icmsg_super_admin_platform" ON public.internal_chat_messages
  FOR ALL TO authenticated
  USING (
    public.is_silvio_superadmin()
    AND company_id = public.get_platform_admin_company_id()
  )
  WITH CHECK (
    public.is_silvio_superadmin()
    AND company_id = public.get_platform_admin_company_id()
  );

COMMENT ON FUNCTION public.get_platform_admin_company_id IS
  'Ritorna l''id della company con flag is_platform_admin_company=true. Usato dalle RLS per dare accesso super_admin alle chat team admin.';

COMMIT;
