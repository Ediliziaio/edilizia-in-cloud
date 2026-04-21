-- ============================================================
-- B1 — HARDENING RLS LISTINO MANUTENZIONE
-- ============================================================
-- Motivazione:
--   La migration 20260814000001 ha creato 4 policy `FOR ALL` con
--   l'unica condizione `company_id = public.get_my_company_id()`.
--   Conseguenza: QUALUNQUE utente della company (commerciale, tecnico,
--   dispatcher, ecc.) può INSERT/UPDATE/DELETE sul listino. L'UI gating
--   company_admin/super_admin è quindi solo cosmetico — un client
--   malevolo può bypassarlo chiamando direttamente PostgREST.
--
-- Fix: split FOR ALL in SELECT (tutti i membri company) + WRITE (solo
--       company_admin/super_admin). Pattern coerente con il resto del
--       repo (vedi 20260922000004_fix_superadmin_rls_jwt_role.sql).
-- ============================================================

-- Drop vecchie policy too-permissive
DROP POLICY IF EXISTS tipi_impianto_company           ON public.tipi_impianto;
DROP POLICY IF EXISTS tipi_intervento_company         ON public.tipi_intervento;
DROP POLICY IF EXISTS listino_prezzi_company          ON public.listino_prezzi;
DROP POLICY IF EXISTS listino_override_company        ON public.listino_override_cliente;

-- =========== tipi_impianto ===========
CREATE POLICY tipi_impianto_select ON public.tipi_impianto
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY tipi_impianto_admin_write ON public.tipi_impianto
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

CREATE POLICY tipi_impianto_admin_update ON public.tipi_impianto
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

CREATE POLICY tipi_impianto_admin_delete ON public.tipi_impianto
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

-- =========== tipi_intervento ===========
CREATE POLICY tipi_intervento_select ON public.tipi_intervento
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY tipi_intervento_admin_write ON public.tipi_intervento
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

CREATE POLICY tipi_intervento_admin_update ON public.tipi_intervento
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

CREATE POLICY tipi_intervento_admin_delete ON public.tipi_intervento
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

-- =========== listino_prezzi ===========
CREATE POLICY listino_prezzi_select ON public.listino_prezzi
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY listino_prezzi_admin_write ON public.listino_prezzi
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

CREATE POLICY listino_prezzi_admin_update ON public.listino_prezzi
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

CREATE POLICY listino_prezzi_admin_delete ON public.listino_prezzi
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

-- =========== listino_override_cliente ===========
CREATE POLICY listino_override_select ON public.listino_override_cliente
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY listino_override_admin_write ON public.listino_override_cliente
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

CREATE POLICY listino_override_admin_update ON public.listino_override_cliente
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

CREATE POLICY listino_override_admin_delete ON public.listino_override_cliente
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

-- Reload schema cache PostgREST
NOTIFY pgrst, 'reload schema';
