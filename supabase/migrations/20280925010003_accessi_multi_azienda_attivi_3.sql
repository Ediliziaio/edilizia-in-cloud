-- Accessi multi-azienda: contano solo se attivi e non scaduti — lotto 3 di 6
-- (25/09/2026). Il perché e il metodo sono in 20280925010001: in ogni
-- sottoquery su multi_company_access che guarda l'utente corrente si aggiunge
--   status = 'active' AND (expires_at IS NULL OR expires_at > now())
-- e il resto della policy è il testo che il database dava il 25/09.

SET LOCAL lock_timeout = '3s';

-- portal_course_enrollments
DROP POLICY IF EXISTS portal_enrollments_company_access ON public.portal_course_enrollments;
CREATE POLICY portal_enrollments_company_access ON public.portal_course_enrollments
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    (((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) OR (user_id = ( SELECT auth.uid() AS uid)) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)) AND (NOT public.utente_e_cliente_esterno()))
  )
  WITH CHECK (
    (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR ((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) AND ((EXISTS ( SELECT 1
       FROM public.portal_courses pc
      WHERE ((pc.company_id = portal_course_enrollments.company_id) AND (pc.id = portal_course_enrollments.course_id)))) OR (EXISTS ( SELECT 1
       FROM public.portal_course_grants g
      WHERE ((g.target_company_id = portal_course_enrollments.company_id) AND (g.course_id = portal_course_enrollments.course_id) AND (g.status = 'granted'::text)))))))
  );

-- portal_course_grants
DROP POLICY IF EXISTS portal_grants_target_read ON public.portal_course_grants;
CREATE POLICY portal_grants_target_read ON public.portal_course_grants
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (target_company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );

-- portal_course_modules
DROP POLICY IF EXISTS portal_modules_company_access ON public.portal_course_modules;
CREATE POLICY portal_modules_company_access ON public.portal_course_modules
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    (((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (EXISTS ( SELECT 1
       FROM public.portal_course_grants g
      WHERE ((g.source_company_id = portal_course_modules.company_id) AND (g.course_id = portal_course_modules.course_id) AND (g.status = 'granted'::text) AND (g.target_company_id IN ( SELECT profiles.company_id
               FROM public.profiles
              WHERE (profiles.id = ( SELECT auth.uid() AS uid))
            UNION
             SELECT multi_company_access.company_id
               FROM public.multi_company_access
              WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))))))) AND (NOT public.utente_e_cliente_esterno()))
  )
  WITH CHECK (
    ((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  );

-- portal_courses
DROP POLICY IF EXISTS portal_courses_company_access ON public.portal_courses;
CREATE POLICY portal_courses_company_access ON public.portal_courses
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    (((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (EXISTS ( SELECT 1
       FROM public.portal_course_grants g
      WHERE ((g.source_company_id = portal_courses.company_id) AND (g.course_id = portal_courses.id) AND (g.status = 'granted'::text) AND (g.target_company_id IN ( SELECT profiles.company_id
               FROM public.profiles
              WHERE (profiles.id = ( SELECT auth.uid() AS uid))
            UNION
             SELECT multi_company_access.company_id
               FROM public.multi_company_access
              WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))))))) AND (NOT public.utente_e_cliente_esterno()))
  )
  WITH CHECK (
    ((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  );

-- product_events
DROP POLICY IF EXISTS product_events_company_select ON public.product_events;
CREATE POLICY product_events_company_select ON public.product_events
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    ((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  );
DROP POLICY IF EXISTS product_events_insert_self ON public.product_events;
CREATE POLICY product_events_insert_self ON public.product_events
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  );

-- quote_clause_templates
DROP POLICY IF EXISTS clauses_company_read ON public.quote_clause_templates;
CREATE POLICY clauses_company_read ON public.quote_clause_templates
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (company_id IN ( SELECT p.company_id
       FROM public.profiles p
      WHERE (p.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT m.company_id
       FROM public.multi_company_access m
      WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND ((m.expires_at IS NULL) OR (m.expires_at > now())))))
  );

-- quote_generation_audit
DROP POLICY IF EXISTS quote_audit_company_read ON public.quote_generation_audit;
CREATE POLICY quote_audit_company_read ON public.quote_generation_audit
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    ((company_id IN ( SELECT p.company_id
       FROM public.profiles p
      WHERE (p.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT m.company_id
       FROM public.multi_company_access m
      WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND ((m.expires_at IS NULL) OR (m.expires_at > now()))))) AND public.has_role(( SELECT auth.uid() AS uid), 'company_admin'::public.app_role))
  );

-- sal_records
DROP POLICY IF EXISTS sal_records_company_access ON public.sal_records;
CREATE POLICY sal_records_company_access ON public.sal_records
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );

-- sal_voci
DROP POLICY IF EXISTS sal_voci_via_sal ON public.sal_voci;
CREATE POLICY sal_voci_via_sal ON public.sal_voci
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    (sal_id IN ( SELECT sal_records.id
       FROM public.sal_records
      WHERE (sal_records.company_id IN ( SELECT profiles.company_id
               FROM public.profiles
              WHERE (profiles.id = ( SELECT auth.uid() AS uid))
            UNION
             SELECT multi_company_access.company_id
               FROM public.multi_company_access
              WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))))
  );

-- sms_campaigns
DROP POLICY IF EXISTS sms_campaigns_delete ON public.sms_campaigns;
CREATE POLICY sms_campaigns_delete ON public.sms_campaigns
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );
DROP POLICY IF EXISTS sms_campaigns_insert ON public.sms_campaigns;
CREATE POLICY sms_campaigns_insert ON public.sms_campaigns
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );
DROP POLICY IF EXISTS sms_campaigns_select ON public.sms_campaigns;
CREATE POLICY sms_campaigns_select ON public.sms_campaigns
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );
DROP POLICY IF EXISTS sms_campaigns_update ON public.sms_campaigns;
CREATE POLICY sms_campaigns_update ON public.sms_campaigns
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );

-- sms_contacts
DROP POLICY IF EXISTS sms_contacts_delete ON public.sms_contacts;
CREATE POLICY sms_contacts_delete ON public.sms_contacts
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );
DROP POLICY IF EXISTS sms_contacts_insert ON public.sms_contacts;
CREATE POLICY sms_contacts_insert ON public.sms_contacts
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );
DROP POLICY IF EXISTS sms_contacts_select ON public.sms_contacts;
CREATE POLICY sms_contacts_select ON public.sms_contacts
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );
DROP POLICY IF EXISTS sms_contacts_update ON public.sms_contacts;
CREATE POLICY sms_contacts_update ON public.sms_contacts
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );
