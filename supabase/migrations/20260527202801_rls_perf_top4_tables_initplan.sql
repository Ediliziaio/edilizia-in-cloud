-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- PERF: wrappa auth.uid() in (SELECT auth.uid()) sulle 11 policy delle 4
-- tabelle next-hot (after user_roles + multi_company_access):
--   - company_branding (3.6k reads)
--   - email_inbox (3.5k reads, 17MB)
--   - internal_chat_members (2.1k reads)
--   - internal_chat_messages (8.5k reads)
-- Semantica IDENTICA, solo InitPlan optimization.

-- ─── company_branding ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "company_admin_manage_branding" ON public.company_branding;
CREATE POLICY "company_admin_manage_branding"
  ON public.company_branding FOR ALL TO authenticated
  USING (
    (company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = (SELECT auth.uid()))
     AND has_role((SELECT auth.uid()), 'company_admin'::app_role))
    OR has_role((SELECT auth.uid()), 'super_admin'::app_role)
  )
  WITH CHECK (
    (company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = (SELECT auth.uid()))
     AND has_role((SELECT auth.uid()), 'company_admin'::app_role))
    OR has_role((SELECT auth.uid()), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS "company_members_read_branding" ON public.company_branding;
CREATE POLICY "company_members_read_branding"
  ON public.company_branding FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = (SELECT auth.uid()))
    OR has_role((SELECT auth.uid()), 'super_admin'::app_role)
  );

-- ─── email_inbox ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "email_inbox_delete" ON public.email_inbox;
CREATE POLICY "email_inbox_delete"
  ON public.email_inbox FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "email_inbox_select" ON public.email_inbox;
CREATE POLICY "email_inbox_select"
  ON public.email_inbox FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (
      user_id IS NULL
      AND company_id = get_my_company_id()
      AND (is_super_admin() OR has_role((SELECT auth.uid()), 'company_admin'::app_role))
    )
  );

DROP POLICY IF EXISTS "email_inbox_super_admin" ON public.email_inbox;
CREATE POLICY "email_inbox_super_admin"
  ON public.email_inbox FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role));

DROP POLICY IF EXISTS "email_inbox_update" ON public.email_inbox;
CREATE POLICY "email_inbox_update"
  ON public.email_inbox FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ─── internal_chat_members ─────────────────────────────────────────────
DROP POLICY IF EXISTS "icm_del" ON public.internal_chat_members;
CREATE POLICY "icm_del"
  ON public.internal_chat_members FOR DELETE TO authenticated
  USING (
    internal_chat_company_allowed(company_id)
    AND (user_id = (SELECT auth.uid()) OR internal_chat_can_manage_members(channel_id, company_id))
  );

DROP POLICY IF EXISTS "icm_upd" ON public.internal_chat_members;
CREATE POLICY "icm_upd"
  ON public.internal_chat_members FOR UPDATE TO authenticated
  USING (
    internal_chat_company_allowed(company_id)
    AND (user_id = (SELECT auth.uid()) OR internal_chat_can_manage_members(channel_id, company_id))
  )
  WITH CHECK (
    internal_chat_company_allowed(company_id)
    AND (user_id = (SELECT auth.uid()) OR internal_chat_can_manage_members(channel_id, company_id))
  );

-- ─── internal_chat_messages ────────────────────────────────────────────
DROP POLICY IF EXISTS "icmsg_del" ON public.internal_chat_messages;
CREATE POLICY "icmsg_del"
  ON public.internal_chat_messages FOR DELETE TO authenticated
  USING (
    sender_id = (SELECT auth.uid())
    AND internal_chat_membership_allowed(channel_id, company_id)
  );

DROP POLICY IF EXISTS "icmsg_ins" ON public.internal_chat_messages;
CREATE POLICY "icmsg_ins"
  ON public.internal_chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND internal_chat_membership_allowed(channel_id, company_id)
  );

DROP POLICY IF EXISTS "icmsg_upd" ON public.internal_chat_messages;
CREATE POLICY "icmsg_upd"
  ON public.internal_chat_messages FOR UPDATE TO authenticated
  USING (
    sender_id = (SELECT auth.uid())
    AND internal_chat_membership_allowed(channel_id, company_id)
  )
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND internal_chat_membership_allowed(channel_id, company_id)
  );
