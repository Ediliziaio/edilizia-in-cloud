-- Accessi multi-azienda: contano solo se attivi e non scaduti — lotto 1 di 6
-- (25/09/2026).
--
-- 86 policy su 55 tabelle facevano entrare in un'azienda con una riga qualsiasi
-- in multi_company_access: anche un accesso sospeso, un invito mai accettato o
-- un accesso scaduto. user_can_access_company invece vuole status = 'active' ed
-- expires_at vuoto o futuro. Stesso difetto già chiuso sui social con
-- 20280925004000.
--
-- In ogni sottoquery su multi_company_access che guarda l'utente corrente
-- (user_id = auth.uid()) si aggiunge
--   status = 'active' AND (expires_at IS NULL OR expires_at > now())
-- e basta: nome, comando, ruoli e ogni altra condizione sono il testo che il
-- database dava il 25/09 (pg_get_expr con search_path vuoto). Le RESTRICTIVE
-- blocco_utente_bloccato non si toccano.
--
-- Restano come sono, apposta, le tre policy in cui la riga multi-azienda è
-- della persona gestita e non di chi legge: le due di staff_permissions (a chi
-- si possono dare i permessi) e profiles_lettura_authenticated (l'admin deve
-- vedere anche gli invitati e i sospesi per gestirli). Lì il lato di chi legge
-- passa da can_manage_company_people / can_view_company_people, sistemate con
-- le funzioni in 20280925010007.
--
-- Provato prima, in una transazione annullata, con tre utenti di altre aziende:
-- con l'accesso sospeso, invitato o scaduto vedevano le stesse righe che con
-- l'accesso attivo (per esempio 61 proposte AI, 935 articoli di magazzino, 325
-- esecuzioni di flussi). Il 25/09 le 12 righe di multi_company_access erano
-- tutte attive e senza scadenza: nessuno esposto, buco latente.
--
-- Lotti piccoli (al massimo 18 policy), una tabella alla volta tutta nello
-- stesso lotto, e lock_timeout: un CREATE POLICY prende un lock esclusivo sulla
-- tabella, meglio fallire che fermare l'app.

SET LOCAL lock_timeout = '3s';

-- accountant_audit_log
DROP POLICY IF EXISTS accountant_audit_log_lettura_authenticated ON public.accountant_audit_log;
CREATE POLICY accountant_audit_log_lettura_authenticated ON public.accountant_audit_log
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    ((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
       FROM public.multi_company_access mca
      WHERE ((mca.company_id = accountant_audit_log.company_id) AND (mca.user_id = ( SELECT auth.uid() AS uid)) AND (mca.access_role = ANY (ARRAY['company_admin'::text, 'super_admin'::text])) AND (mca.status = 'active'::text) AND ((mca.expires_at IS NULL) OR (mca.expires_at > now()))))))
  );

-- accountant_change_requests
DROP POLICY IF EXISTS accountant_change_requests_lettura_authenticated ON public.accountant_change_requests;
CREATE POLICY accountant_change_requests_lettura_authenticated ON public.accountant_change_requests
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    ((requested_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
       FROM public.multi_company_access mca
      WHERE ((mca.company_id = accountant_change_requests.company_id) AND (mca.user_id = ( SELECT auth.uid() AS uid)) AND (mca.access_role = ANY (ARRAY['company_admin'::text, 'super_admin'::text])) AND (mca.status = 'active'::text) AND ((mca.expires_at IS NULL) OR (mca.expires_at > now()))))))
  );
DROP POLICY IF EXISTS change_req_company_admin_decide ON public.accountant_change_requests;
CREATE POLICY change_req_company_admin_decide ON public.accountant_change_requests
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    ((status = 'pending'::text) AND (EXISTS ( SELECT 1
       FROM public.multi_company_access mca
      WHERE ((mca.company_id = accountant_change_requests.company_id) AND (mca.user_id = ( SELECT auth.uid() AS uid)) AND (mca.access_role = ANY (ARRAY['company_admin'::text, 'super_admin'::text])) AND (mca.status = 'active'::text) AND ((mca.expires_at IS NULL) OR (mca.expires_at > now()))))))
  )
  WITH CHECK (
    ((status = ANY (ARRAY['approved'::text, 'rejected'::text])) AND (decided_by = ( SELECT auth.uid() AS uid)))
  );

-- action_proposals_audit_log
DROP POLICY IF EXISTS audit_log_company_read ON public.action_proposals_audit_log;
CREATE POLICY audit_log_company_read ON public.action_proposals_audit_log
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (EXISTS ( SELECT 1
       FROM public.ai_action_proposals p
      WHERE ((p.id = action_proposals_audit_log.proposal_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))) OR (public.has_role(( SELECT auth.uid() AS uid), 'company_admin'::public.app_role) AND ((company_id = public.get_my_company_id()) OR (EXISTS ( SELECT 1
       FROM public.multi_company_access mca
      WHERE ((mca.user_id = ( SELECT auth.uid() AS uid)) AND (mca.company_id = action_proposals_audit_log.company_id) AND (mca.status = 'active'::text) AND ((mca.expires_at IS NULL) OR (mca.expires_at > now()))))))))
  );

-- adempimenti_fiscali
DROP POLICY IF EXISTS adempimenti_fiscali_company_access ON public.adempimenti_fiscali;
CREATE POLICY adempimenti_fiscali_company_access ON public.adempimenti_fiscali
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

-- adempimenti_sicurezza
DROP POLICY IF EXISTS adempimenti_company_access ON public.adempimenti_sicurezza;
CREATE POLICY adempimenti_company_access ON public.adempimenti_sicurezza
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

-- ai_action_proposals
DROP POLICY IF EXISTS ai_action_proposals_lettura_public ON public.ai_action_proposals;
CREATE POLICY ai_action_proposals_lettura_public ON public.ai_action_proposals
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'company_admin'::public.app_role) AS has_role)) OR ((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR (( SELECT public.has_role(( SELECT auth.uid() AS uid), 'company_admin'::public.app_role) AS has_role) AND ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) OR (EXISTS ( SELECT 1
       FROM public.multi_company_access mca
      WHERE ((mca.user_id = ( SELECT auth.uid() AS uid)) AND (mca.company_id = ai_action_proposals.company_id) AND (mca.status = 'active'::text) AND ((mca.expires_at IS NULL) OR (mca.expires_at > now())))))))))
  );

-- ai_company_action_permissions
DROP POLICY IF EXISTS ai_company_action_permissions_read ON public.ai_company_action_permissions;
CREATE POLICY ai_company_action_permissions_read ON public.ai_company_action_permissions
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    ((public.ai_is_service_role() OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
       FROM public.multi_company_access mca
      WHERE ((mca.user_id = ( SELECT auth.uid() AS uid)) AND (mca.company_id = ai_company_action_permissions.company_id) AND (mca.status = 'active'::text) AND ((mca.expires_at IS NULL) OR (mca.expires_at > now())))))) AND (NOT public.utente_e_cliente_esterno()))
  );

-- cantieri_geofence
DROP POLICY IF EXISTS geofence_company_all ON public.cantieri_geofence;
CREATE POLICY geofence_company_all ON public.cantieri_geofence
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
  )
  WITH CHECK (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))))
  );

-- cedolini_legacy
DROP POLICY IF EXISTS cedolini_admin ON public.cedolini_legacy;
CREATE POLICY cedolini_admin ON public.cedolini_legacy
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) AND (public.has_role(( SELECT auth.uid() AS uid), 'company_admin'::public.app_role) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  )
  WITH CHECK (
    ((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) AND (public.has_role(( SELECT auth.uid() AS uid), 'company_admin'::public.app_role) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

-- client_margin_history
DROP POLICY IF EXISTS margin_hist_company_read ON public.client_margin_history;
CREATE POLICY margin_hist_company_read ON public.client_margin_history
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

-- company_activity_summary
DROP POLICY IF EXISTS activity_summary_company_read ON public.company_activity_summary;
CREATE POLICY activity_summary_company_read ON public.company_activity_summary
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

-- company_billing_details
DROP POLICY IF EXISTS cbd_admin_write ON public.company_billing_details;
CREATE POLICY cbd_admin_write ON public.company_billing_details
  AS PERMISSIVE
  FOR ALL
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
  )
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
DROP POLICY IF EXISTS cbd_read ON public.company_billing_details;
CREATE POLICY cbd_read ON public.company_billing_details
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
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) OR (EXISTS ( SELECT 1
       FROM public.user_roles
      WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = 'super_admin'::public.app_role)))))
  );

-- company_kb_overrides
DROP POLICY IF EXISTS company_kb_overrides_read ON public.company_kb_overrides;
CREATE POLICY company_kb_overrides_read ON public.company_kb_overrides
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))))
  );

-- company_qr_codes
DROP POLICY IF EXISTS company_qr_codes_company_access ON public.company_qr_codes;
CREATE POLICY company_qr_codes_company_access ON public.company_qr_codes
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
  )
  WITH CHECK (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );

-- company_qr_scan_logs
DROP POLICY IF EXISTS company_qr_scan_logs_company_insert ON public.company_qr_scan_logs;
CREATE POLICY company_qr_scan_logs_company_insert ON public.company_qr_scan_logs
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
DROP POLICY IF EXISTS company_qr_scan_logs_company_read ON public.company_qr_scan_logs;
CREATE POLICY company_qr_scan_logs_company_read ON public.company_qr_scan_logs
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
