-- ============================================================================
-- Fix RLS super_admin spezzata: pattern `auth.jwt() ->> 'role' = 'super_admin'`
-- ============================================================================
-- Il JWT Supabase non contiene mai il ruolo applicativo: espone solo
-- `role = 'authenticated' | 'anon' | 'service_role'`. Qualsiasi policy che
-- confronta `auth.jwt()->>'role'` con un ruolo app (super_admin, company_admin)
-- nega SEMPRE l'accesso — anche al SuperAdmin.
--
-- La migration `20260417000003_reconcile_overrides_and_fix_rls.sql` aveva già
-- sostituito queste policy sulle tabelle esistenti al 17/04. Successivamente
-- la migration `20260910000001_superadmin_gap_features.sql` ha creato 9 nuove
-- tabelle ricadendo nello stesso bug (righe 54, 96, 162, 179, 201, 222, 246, 304).
--
-- Questa migration ricrea le 9 policy con `public.has_role(...)` — unica
-- fonte di verità (tabella `user_roles`). Idempotente: DROP IF EXISTS + CREATE.
-- ============================================================================

DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('dunning_email_templates',  'superadmin_dunning_all'),
      ('csv_import_jobs',          'superadmin_csv_all'),
      ('campaign_variants',        'superadmin_cv_all'),
      ('campaign_events',          'superadmin_ce_all'),
      ('lifecycle_playbooks',      'superadmin_playbooks_all'),
      ('playbook_executions',      'superadmin_pe_all'),
      ('company_flag_audit_log',   'superadmin_audit_all'),
      ('failure_alerts',           'superadmin_fa_all')
    ) AS t(tbl, pol)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = target.tbl
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target.pol, target.tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
        'USING (public.has_role(auth.uid(), ''super_admin''::app_role)) '
        'WITH CHECK (public.has_role(auth.uid(), ''super_admin''::app_role))',
        target.pol, target.tbl
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- Ulteriore hardening: scansiona TUTTE le policy correnti in public e ricrea
-- quelle che usano ancora il pattern `auth.jwt()->>'role'` (sia 'super_admin'
-- che altri ruoli app) sostituendole con `public.has_role(...)`.
-- Sicuro perché:
--   - idempotente (DROP IF EXISTS + CREATE)
--   - opera solo su policy che contengono la stringa buggata
--   - usa has_role() che è SECURITY DEFINER STABLE
-- ============================================================================

DO $$
DECLARE
  rec RECORD;
  v_uses_app_role text[];
  v_first_role text;
  v_expr text;
BEGIN
  FOR rec IN
    SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (qual ILIKE '%auth.jwt()%role%' OR with_check ILIKE '%auth.jwt()%role%')
  LOOP
    -- Estrai il primo ruolo app menzionato (best effort)
    IF (rec.qual || COALESCE(rec.with_check,'')) ILIKE '%''super_admin''%' THEN
      v_first_role := 'super_admin';
    ELSIF (rec.qual || COALESCE(rec.with_check,'')) ILIKE '%''company_admin''%' THEN
      v_first_role := 'company_admin';
    ELSE
      CONTINUE; -- pattern non riconosciuto, lascia stare
    END IF;

    v_expr := format('public.has_role(auth.uid(), %L::app_role)', v_first_role);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      rec.policyname, rec.schemaname, rec.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR %s TO authenticated '
      'USING (%s) WITH CHECK (%s)',
      rec.policyname, rec.schemaname, rec.tablename,
      CASE rec.cmd
        WHEN 'ALL' THEN 'ALL'
        WHEN 'SELECT' THEN 'SELECT'
        WHEN 'INSERT' THEN 'INSERT'
        WHEN 'UPDATE' THEN 'UPDATE'
        WHEN 'DELETE' THEN 'DELETE'
        ELSE 'ALL'
      END,
      v_expr, v_expr
    );
  END LOOP;
END $$;
