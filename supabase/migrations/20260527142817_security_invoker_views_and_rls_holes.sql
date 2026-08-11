-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- ============================================================
-- FIX #1: Email views were running as supabase_admin → RLS bypass
-- Switch to security_invoker so caller's RLS on email_inbox/email_threads/email_message_activity applies
-- ============================================================
ALTER VIEW public.v_my_email_inbox SET (security_invoker = on);
ALTER VIEW public.v_my_email_threads SET (security_invoker = on);
ALTER VIEW public.v_email_inbox_pending_count SET (security_invoker = on);
ALTER VIEW public.v_email_thread_activity SET (security_invoker = on);

-- ============================================================
-- FIX #2: Other sensitive views without security_invoker
-- (selecting from companies, render_sessions, referral data, credit ledgers)
-- ============================================================
ALTER VIEW public.customer_profile SET (security_invoker = on);
ALTER VIEW public.admin_company_features SET (security_invoker = on);
ALTER VIEW public.company_renders_recent SET (security_invoker = on);
ALTER VIEW public.credit_transactions_unified SET (security_invoker = on);
ALTER VIEW public.referral_leaderboard SET (security_invoker = on);
ALTER VIEW public.unified_calendar_busy_slots SET (security_invoker = on);
ALTER VIEW public.customer_workflow_daily_stats SET (security_invoker = on);

-- ============================================================
-- FIX #3: platform_webhook_deliveries has RLS enabled but ZERO policies
--   AND anon/authenticated have full DML grants → empty-allow = total deny on RLS,
--   but the SELECT/INSERT/UPDATE grants exposed to 'anon' are dangerous as drift.
-- Revoke direct grants (service_role keeps access)
-- ============================================================
REVOKE ALL ON public.platform_webhook_deliveries FROM anon, authenticated;
GRANT SELECT ON public.platform_webhook_deliveries TO authenticated;
-- Add explicit super_admin-only SELECT policy so it's clearly defined
DROP POLICY IF EXISTS pwd_super_admin_read ON public.platform_webhook_deliveries;
CREATE POLICY pwd_super_admin_read ON public.platform_webhook_deliveries
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ============================================================
-- FIX #4: render_credits_log: RLS enabled but ZERO policies, anon has full grants
-- Restrict to company members (using company_id) + service_role for inserts
-- ============================================================
REVOKE ALL ON public.render_credits_log FROM anon, authenticated;
GRANT SELECT ON public.render_credits_log TO authenticated;
DROP POLICY IF EXISTS rcl_company_read ON public.render_credits_log;
CREATE POLICY rcl_company_read ON public.render_credits_log
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- ============================================================
-- FIX #5: personnel-attachments storage bucket is public + has "Anyone can read" policy
-- HR attachments (CV, ID, payslip) world-readable via direct URL.
-- Lock to authenticated company members only.
-- ============================================================
UPDATE storage.buckets SET public = false WHERE name = 'personnel-attachments';
DROP POLICY IF EXISTS "Anyone can read personnel attachments" ON storage.objects;
CREATE POLICY "Authenticated can read personnel attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'personnel-attachments'
    AND (storage.foldername(name))[1] = (public.get_user_company_id(auth.uid()))::text
  );
