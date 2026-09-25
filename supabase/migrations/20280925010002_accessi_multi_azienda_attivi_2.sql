-- Accessi multi-azienda: contano solo se attivi e non scaduti — lotto 2 di 6
-- (25/09/2026). Il perché e il metodo sono in 20280925010001: in ogni
-- sottoquery su multi_company_access che guarda l'utente corrente si aggiunge
--   status = 'active' AND (expires_at IS NULL OR expires_at > now())
-- e il resto della policy è il testo che il database dava il 25/09.

SET LOCAL lock_timeout = '3s';

-- document_analysis_results
DROP POLICY IF EXISTS doc_analysis_company_read ON public.document_analysis_results;
CREATE POLICY doc_analysis_company_read ON public.document_analysis_results
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

-- email_oauth_connections
DROP POLICY IF EXISTS email_oauth_owner_manage_personal ON public.email_oauth_connections;
CREATE POLICY email_oauth_owner_manage_personal ON public.email_oauth_connections
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((user_id = ( SELECT auth.uid() AS uid)) AND (company_id IN ( SELECT p.company_id
       FROM public.profiles p
      WHERE (p.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT m.company_id
       FROM public.multi_company_access m
      WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND ((m.expires_at IS NULL) OR (m.expires_at > now()))))))
  )
  WITH CHECK (
    ((user_id = ( SELECT auth.uid() AS uid)) AND (company_id IN ( SELECT p.company_id
       FROM public.profiles p
      WHERE (p.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT m.company_id
       FROM public.multi_company_access m
      WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND ((m.expires_at IS NULL) OR (m.expires_at > now()))))))
  );

-- email_reply_routes
DROP POLICY IF EXISTS email_reply_routes_company_read ON public.email_reply_routes;
CREATE POLICY email_reply_routes_company_read ON public.email_reply_routes
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)) AND (NOT public.utente_e_cliente_esterno()))
  );

-- entity_attachments
DROP POLICY IF EXISTS entity_attachments_select ON public.entity_attachments;
CREATE POLICY entity_attachments_select ON public.entity_attachments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    ((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (company_id IN ( SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))))
  );

-- feature_unlock_requests
DROP POLICY IF EXISTS unlock_req_insert ON public.feature_unlock_requests;
CREATE POLICY unlock_req_insert ON public.feature_unlock_requests
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
DROP POLICY IF EXISTS unlock_req_read ON public.feature_unlock_requests;
CREATE POLICY unlock_req_read ON public.feature_unlock_requests
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    ((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) OR (assigned_to = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
       FROM public.user_roles
      WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = 'super_admin'::public.app_role)))))
  );

-- flow_execution_runs
DROP POLICY IF EXISTS "Users can view own company execution runs" ON public.flow_execution_runs;
CREATE POLICY "Users can view own company execution runs" ON public.flow_execution_runs
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (company_id IN ( SELECT p.company_id
       FROM public.profiles p
      WHERE (p.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT mca.company_id
       FROM public.multi_company_access mca
      WHERE ((mca.user_id = ( SELECT auth.uid() AS uid)) AND (mca.status = 'active'::text) AND ((mca.expires_at IS NULL) OR (mca.expires_at > now())))
    UNION
     SELECT ai.target_company_id
       FROM public.active_impersonations ai
      WHERE ((ai.admin_user_id = ( SELECT auth.uid() AS uid)) AND (ai.expires_at > now()))))
  );

-- google_ads_stats
DROP POLICY IF EXISTS company_members_insert_google_ads_stats ON public.google_ads_stats;
CREATE POLICY company_members_insert_google_ads_stats ON public.google_ads_stats
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
DROP POLICY IF EXISTS company_members_select_google_ads_stats ON public.google_ads_stats;
CREATE POLICY company_members_select_google_ads_stats ON public.google_ads_stats
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
DROP POLICY IF EXISTS company_members_update_google_ads_stats ON public.google_ads_stats;
CREATE POLICY company_members_update_google_ads_stats ON public.google_ads_stats
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

-- gps_positions
DROP POLICY IF EXISTS gps_positions_company_select ON public.gps_positions;
CREATE POLICY gps_positions_company_select ON public.gps_positions
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

-- marketing_custom_field_folders
DROP POLICY IF EXISTS mcff_admin_delete ON public.marketing_custom_field_folders;
CREATE POLICY mcff_admin_delete ON public.marketing_custom_field_folders
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (
    ((EXISTS ( SELECT 1
       FROM public.user_roles
      WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = ANY (ARRAY['super_admin'::public.app_role, 'company_admin'::public.app_role]))))) AND (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))))
  );
DROP POLICY IF EXISTS mcff_admin_insert ON public.marketing_custom_field_folders;
CREATE POLICY mcff_admin_insert ON public.marketing_custom_field_folders
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    ((EXISTS ( SELECT 1
       FROM public.user_roles
      WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = ANY (ARRAY['super_admin'::public.app_role, 'company_admin'::public.app_role]))))) AND (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))))
  );
DROP POLICY IF EXISTS mcff_admin_update ON public.marketing_custom_field_folders;
CREATE POLICY mcff_admin_update ON public.marketing_custom_field_folders
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    ((EXISTS ( SELECT 1
       FROM public.user_roles
      WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = ANY (ARRAY['super_admin'::public.app_role, 'company_admin'::public.app_role]))))) AND (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))))
  );
DROP POLICY IF EXISTS mcff_company_read ON public.marketing_custom_field_folders;
CREATE POLICY mcff_company_read ON public.marketing_custom_field_folders
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

-- media_library_folders
DROP POLICY IF EXISTS media_library_folders_select ON public.media_library_folders;
CREATE POLICY media_library_folders_select ON public.media_library_folders
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

-- portal_course_activity
DROP POLICY IF EXISTS portal_activity_company_access ON public.portal_course_activity;
CREATE POLICY portal_activity_company_access ON public.portal_course_activity
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
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)) AND (NOT public.utente_e_cliente_esterno()))
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

-- portal_course_assets
DROP POLICY IF EXISTS portal_assets_company_access ON public.portal_course_assets;
CREATE POLICY portal_assets_company_access ON public.portal_course_assets
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
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR (EXISTS ( SELECT 1
       FROM public.portal_course_grants g
      WHERE ((g.source_company_id = portal_course_assets.company_id) AND (g.course_id = portal_course_assets.course_id) AND (g.status = 'granted'::text) AND (g.target_company_id IN ( SELECT profiles.company_id
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
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role))
  );
