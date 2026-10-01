-- Amministratore DI QUALE azienda — lotto 3: le 14 policy che univano il ruolo
-- company_admin a un accesso multi-azienda di qualunque grado (26/09/2026).
-- Richiede il lotto 1 (aziende_amministrate).
--
-- Queste policy chiedevano «ha il ruolo company_admin» e «l'azienda della riga
-- è la sua o una di quelle a cui ha accesso» (user_can_access_company, oppure
-- azienda del profilo UNION accessi multi-azienda attivi, oppure azienda
-- attiva OR accesso). Il ruolo non ha azienda e l'accesso non guardava il
-- grado: l'amministratore della propria azienda A, entrato in B come staff,
-- in B scriveva la fatturazione e il dominio email, le preferenze e la
-- governance dell'azienda, le soppressioni email, le cartelle dei campi
-- personalizzati, i numeri SMS, e leggeva e scriveva i cedolini storici, lo
-- storico delle generazioni dei preventivi e le proposte dell'AI.
--
-- Ora il pezzo «ha il ruolo company_admin» diventa «l'azienda della riga è fra
-- quelle che amministra» (company_id IN aziende_amministrate()): azienda del
-- profilo col ruolo, o accesso multi-azienda attivo da amministratore. Il
-- resto di ogni policy (nome, comando, ruoli, le altre condizioni) è il testo
-- che il database dava il 26/09 (pg_get_expr con search_path vuoto).
--
-- Il 26/09 nessun amministratore aveva un accesso da staff a un'altra azienda:
-- per gli utenti di oggi le policy danno le stesse righe di prima. Devono
-- continuare a funzionare l'amministratore nella propria azienda, quello
-- entrato da amministratore con un accesso multi-azienda, il super admin.
--
-- Rilanciabile: DROP POLICY IF EXISTS + CREATE POLICY. Le RESTRICTIVE
-- blocco_utente_bloccato non si toccano.

SET LOCAL lock_timeout = '3s';

-- ── Guardia: le policy sono ancora quelle censite ──────────────────────────
-- Impronta = md5 del testo che il database dà con search_path vuoto (USING e
-- WITH CHECK separati da '#'). «segno» riconosce la versione già riscritta da
-- questo lotto, così la migrazione resta rilanciabile.
DO $guardia$
DECLARE
  r record;
  v_path text := current_setting('search_path');
  v_testo text;
BEGIN
  PERFORM set_config('search_path', '', true);
  FOR r IN SELECT * FROM (VALUES
    ('public', 'action_proposals_audit_log', 'audit_log_company_read', 'cf019a0320ae179bf0830a7e2ba590e9', 'aziende_amministrate'),
    ('public', 'ai_action_proposals', 'ai_action_proposals_lettura_public', '70e41a0acaffd99b1eeaa284ef81d9f7', 'aziende_amministrate'),
    ('public', 'cedolini_legacy', 'cedolini_admin', 'f94a45fe98182b78bf7b4a8f1167be5c', 'aziende_amministrate'),
    ('public', 'company_billing_details', 'cbd_admin_write', '722184e8e35f0ddcaab49b19d7b25da9', 'aziende_amministrate'),
    ('public', 'company_email_domains', 'ced_company_write', '2f7c78152976fff11c189a8c1ca78c96', 'aziende_amministrate'),
    ('public', 'company_email_preferences', 'cep_write', '2f7c78152976fff11c189a8c1ca78c96', 'aziende_amministrate'),
    ('public', 'company_governance_settings', 'cgs_write', '2f7c78152976fff11c189a8c1ca78c96', 'aziende_amministrate'),
    ('public', 'email_suppressions', 'email_suppressions_write', 'f6adb9158e98ebbf973f903839b8de32', 'aziende_amministrate'),
    ('public', 'marketing_custom_field_folders', 'mcff_admin_delete', '60a0d04530c76e885fd151e4d47469da', 'aziende_amministrate'),
    ('public', 'marketing_custom_field_folders', 'mcff_admin_insert', 'd656f8f86c8413706fc9ea8ffdf8fd67', 'aziende_amministrate'),
    ('public', 'marketing_custom_field_folders', 'mcff_admin_update', '60a0d04530c76e885fd151e4d47469da', 'aziende_amministrate'),
    ('public', 'quote_generation_audit', 'quote_audit_company_read', 'bd585d424a1605fc8ca38425730c7c45', 'aziende_amministrate'),
    ('public', 'sms_telnyx_numbers', 'sms_telnyx_numbers_insert', '74bf5b2ea8f0c975890325c165a0fab5', 'aziende_amministrate'),
    ('public', 'sms_telnyx_numbers', 'sms_telnyx_numbers_update', '11d2f08213188569ee2ea97db72502f8', 'aziende_amministrate')
  ) AS v(schema_, tabella, policy, impronta, segno)
  LOOP
    SELECT coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '#' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
      INTO v_testo
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = r.schema_ AND c.relname = r.tabella AND p.polname = r.policy;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Policy %.% «%» non trovata: il lotto va rivisto', r.schema_, r.tabella, r.policy;
    END IF;
    IF md5(v_testo) <> r.impronta AND v_testo !~ r.segno THEN
      RAISE EXCEPTION 'Policy %.% «%» cambiata dopo il censimento: il lotto va rivisto', r.schema_, r.tabella, r.policy;
    END IF;
  END LOOP;
  PERFORM set_config('search_path', v_path, true);
END
$guardia$;

-- action_proposals_audit_log
DROP POLICY IF EXISTS audit_log_company_read ON public.action_proposals_audit_log;
CREATE POLICY audit_log_company_read ON public.action_proposals_audit_log
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.ai_action_proposals p
  WHERE ((p.id = action_proposals_audit_log.proposal_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))) OR ((company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest)) AND ((company_id = public.get_my_company_id()) OR (EXISTS ( SELECT 1
   FROM public.multi_company_access mca
  WHERE ((mca.user_id = ( SELECT auth.uid() AS uid)) AND (mca.company_id = action_proposals_audit_log.company_id) AND (mca.status = 'active'::text) AND ((mca.expires_at IS NULL) OR (mca.expires_at > now()))))))))
  );

-- ai_action_proposals
DROP POLICY IF EXISTS ai_action_proposals_lettura_public ON public.ai_action_proposals;
CREATE POLICY ai_action_proposals_lettura_public ON public.ai_action_proposals
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND (company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))) OR ((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ((company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest)) AND ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) OR (EXISTS ( SELECT 1
   FROM public.multi_company_access mca
  WHERE ((mca.user_id = ( SELECT auth.uid() AS uid)) AND (mca.company_id = ai_action_proposals.company_id) AND (mca.status = 'active'::text) AND ((mca.expires_at IS NULL) OR (mca.expires_at > now())))))))))
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
  WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) AND ((company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest)) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  )
  WITH CHECK (
    ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))
UNION
 SELECT multi_company_access.company_id
   FROM public.multi_company_access
  WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) AND ((company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest)) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

-- company_billing_details
DROP POLICY IF EXISTS cbd_admin_write ON public.company_billing_details;
CREATE POLICY cbd_admin_write ON public.company_billing_details
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR (company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))) AND (company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))
UNION
 SELECT multi_company_access.company_id
   FROM public.multi_company_access
  WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))))
  )
  WITH CHECK (
    ((( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR (company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))) AND (company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))
UNION
 SELECT multi_company_access.company_id
   FROM public.multi_company_access
  WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))))
  );

-- company_email_domains
DROP POLICY IF EXISTS ced_company_write ON public.company_email_domains;
CREATE POLICY ced_company_write ON public.company_email_domains
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    (public.user_can_access_company(company_id) AND (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))) AND (NOT public.utente_e_cliente_esterno()))
  )
  WITH CHECK (
    (public.user_can_access_company(company_id) AND (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))) AND (NOT public.utente_e_cliente_esterno()))
  );

-- company_email_preferences
DROP POLICY IF EXISTS cep_write ON public.company_email_preferences;
CREATE POLICY cep_write ON public.company_email_preferences
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    (public.user_can_access_company(company_id) AND (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))) AND (NOT public.utente_e_cliente_esterno()))
  )
  WITH CHECK (
    (public.user_can_access_company(company_id) AND (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))) AND (NOT public.utente_e_cliente_esterno()))
  );

-- company_governance_settings
DROP POLICY IF EXISTS cgs_write ON public.company_governance_settings;
CREATE POLICY cgs_write ON public.company_governance_settings
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    (public.user_can_access_company(company_id) AND (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))) AND (NOT public.utente_e_cliente_esterno()))
  )
  WITH CHECK (
    (public.user_can_access_company(company_id) AND (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))) AND (NOT public.utente_e_cliente_esterno()))
  );

-- email_suppressions
DROP POLICY IF EXISTS email_suppressions_write ON public.email_suppressions;
CREATE POLICY email_suppressions_write ON public.email_suppressions
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id IS NOT NULL) AND public.user_can_access_company(company_id) AND (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))) AND (NOT public.utente_e_cliente_esterno()))
  )
  WITH CHECK (
    ((company_id IS NOT NULL) AND public.user_can_access_company(company_id) AND (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))) AND (NOT public.utente_e_cliente_esterno()))
  );

-- marketing_custom_field_folders
DROP POLICY IF EXISTS mcff_admin_delete ON public.marketing_custom_field_folders;
CREATE POLICY mcff_admin_delete ON public.marketing_custom_field_folders
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (
    ((( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR (company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))) AND (company_id IN ( SELECT profiles.company_id
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
    ((( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR (company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))) AND (company_id IN ( SELECT profiles.company_id
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
    ((( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR (company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))) AND (company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))
UNION
 SELECT multi_company_access.company_id
   FROM public.multi_company_access
  WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))))
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
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text) AND ((m.expires_at IS NULL) OR (m.expires_at > now()))))) AND (company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest)))
  );

-- sms_telnyx_numbers
DROP POLICY IF EXISTS sms_telnyx_numbers_insert ON public.sms_telnyx_numbers;
CREATE POLICY sms_telnyx_numbers_insert ON public.sms_telnyx_numbers
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest)) AND (company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))
UNION
 SELECT multi_company_access.company_id
   FROM public.multi_company_access
  WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))))
  );

DROP POLICY IF EXISTS sms_telnyx_numbers_update ON public.sms_telnyx_numbers;
CREATE POLICY sms_telnyx_numbers_update ON public.sms_telnyx_numbers
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    ((company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest)) AND (company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))
UNION
 SELECT multi_company_access.company_id
   FROM public.multi_company_access
  WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))))
  );
