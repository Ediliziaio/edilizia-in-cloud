-- Amministratore DI QUALE azienda — lotto 9: 16 policy legate
-- all'azienda attiva (26/09/2026). Richiede il lotto 1 (e_amministratore_di).
--
-- Tabelle: ai_payg_topups, ai_persona_memory, ai_rbac_violations, ai_usage_logs, silvio_alerts, silvio_reminders, dashboards, dashboard_versions, integration_field_mappings, integrations, meta_assets, meta_lead_forms.
--
-- Queste policy legano la riga all'azienda in cui si lavora
-- (get_my_company_id) e poi chiedono il ruolo company_admin, che in user_roles
-- non ha azienda. L'amministratore della propria azienda A, entrato in B con
-- un accesso multi-azienda da staff senza permessi e con B selezionata, in B
-- aveva i poteri dell'amministratore. Provato in una transazione annullata
-- con due aziende demo, per esempio sui preventivi: 45 su 45 visibili.
--
-- Unico cambiamento: has_role(auth.uid(), 'company_admin') diventa
--   ( SELECT public.e_amministratore_di(public.get_my_company_id()) )
-- cioè «amministratore dell'azienda in cui lavora» (azienda del profilo col
-- ruolo, o accesso multi-azienda attivo da amministratore). Tra parentesi con
-- SELECT si calcola una volta per richiesta e non riga per riga. Il resto di
-- ogni policy (nome, comando, ruoli, le altre condizioni) è il testo che il
-- database dava il 26/09 (pg_get_expr con search_path vuoto).
--
-- Il 26/09 nessun amministratore lavorava in un'azienda diversa dalla propria
-- se non da amministratore: per gli utenti di oggi le righe restano le
-- stesse. Devono continuare a funzionare l'amministratore nella propria
-- azienda, quello entrato da amministratore con un accesso multi-azienda, il
-- super admin, lo staff coi suoi permessi.
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
    ('public', 'ai_payg_topups', 'topups_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'ai_persona_memory', 'ai_persona_memory_delete', '8b54d76ad075f1cbc3c7970109a5200e', 'e_amministratore_di'),
    ('public', 'ai_persona_memory', 'ai_persona_memory_insert', 'd09261beb091836f8526a07dae73401e', 'e_amministratore_di'),
    ('public', 'ai_persona_memory', 'ai_persona_memory_update', 'df61758aa47b6c15ade2c3588859c9d8', 'e_amministratore_di'),
    ('public', 'ai_rbac_violations', 'ai_rbac_violations_lettura_public', '09b4be5dac9ff7fc3dd2d6d2cf19e63d', 'e_amministratore_di'),
    ('public', 'ai_usage_logs', 'ai_usage_logs_lettura_public', '72f7066401c09ab0ad83e34137fd8c9d', 'e_amministratore_di'),
    ('public', 'silvio_alerts', 'silvio_alerts_lettura_public', '3fbc59e20e8ea2d0b1a6064fa3a864f0', 'e_amministratore_di'),
    ('public', 'silvio_reminders', 'silvio_reminders_lettura_public', '15aebeb273306efc68c33e8ba901aebb', 'e_amministratore_di'),
    ('public', 'dashboards', 'dashboards_delete', 'a1a82475995686705fdf8c9673f27a08', 'e_amministratore_di'),
    ('public', 'dashboards', 'dashboards_update', '9b6bda7b2c881d3aa6e59986dcec1a9e', 'e_amministratore_di'),
    ('public', 'dashboard_versions', 'dashboard_versions_insert', '29ed8865cc6562e5c270d9a19090ea24', 'e_amministratore_di'),
    ('public', 'dashboard_versions', 'dashboard_versions_toggle_current', 'd4d4a6f1076309cbaf0a97136d7d4d9a', 'e_amministratore_di'),
    ('public', 'integration_field_mappings', 'Admins can manage own company field mappings', '536318257140de81a5e2b0c5a37860c4', 'e_amministratore_di'),
    ('public', 'integrations', 'Admins can manage own company integrations', '24358c42b89e6549309136ad24ced670', 'e_amministratore_di'),
    ('public', 'meta_assets', 'Admins can manage own company meta assets', 'f64d6a0f8a612a8114b4f3b5e7c42f9f', 'e_amministratore_di'),
    ('public', 'meta_lead_forms', 'Admins can manage own company lead forms', '24358c42b89e6549309136ad24ced670', 'e_amministratore_di')
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

-- ai_payg_topups
DROP POLICY IF EXISTS topups_admin ON public.ai_payg_topups;
CREATE POLICY topups_admin ON public.ai_payg_topups
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- ai_persona_memory
DROP POLICY IF EXISTS ai_persona_memory_delete ON public.ai_persona_memory;
CREATE POLICY ai_persona_memory_delete ON public.ai_persona_memory
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    ((public.ai_is_service_role() OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ((company_id = public.get_effective_company_id()) AND ((user_id = ( SELECT auth.uid() AS uid)) OR ((user_id IS NULL) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))))) AND (NOT ( SELECT public.utente_e_cliente_esterno() AS utente_e_cliente_esterno)))
  );

DROP POLICY IF EXISTS ai_persona_memory_insert ON public.ai_persona_memory;
CREATE POLICY ai_persona_memory_insert ON public.ai_persona_memory
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (public.ai_is_service_role() OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ((company_id = public.get_effective_company_id()) AND ((user_id = ( SELECT auth.uid() AS uid)) OR ((user_id IS NULL) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)))))
  );

DROP POLICY IF EXISTS ai_persona_memory_update ON public.ai_persona_memory;
CREATE POLICY ai_persona_memory_update ON public.ai_persona_memory
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    ((public.ai_is_service_role() OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ((company_id = public.get_effective_company_id()) AND ((user_id = ( SELECT auth.uid() AS uid)) OR ((user_id IS NULL) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))))) AND (NOT ( SELECT public.utente_e_cliente_esterno() AS utente_e_cliente_esterno)))
  )
  WITH CHECK (
    (public.ai_is_service_role() OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ((company_id = public.get_effective_company_id()) AND ((user_id = ( SELECT auth.uid() AS uid)) OR ((user_id IS NULL) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)))))
  );

-- ai_rbac_violations
DROP POLICY IF EXISTS ai_rbac_violations_lettura_public ON public.ai_rbac_violations;
CREATE POLICY ai_rbac_violations_lettura_public ON public.ai_rbac_violations
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)))
  );

-- ai_usage_logs
DROP POLICY IF EXISTS ai_usage_logs_lettura_public ON public.ai_usage_logs;
CREATE POLICY ai_usage_logs_lettura_public ON public.ai_usage_logs
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  );

-- silvio_alerts
DROP POLICY IF EXISTS silvio_alerts_lettura_public ON public.silvio_alerts;
CREATE POLICY silvio_alerts_lettura_public ON public.silvio_alerts
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR ((company_id = public.get_my_company_id()) AND ((target_user_id IS NULL) OR (target_user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)) AND (NOT public.utente_e_cliente_esterno())))
  );

-- silvio_reminders
DROP POLICY IF EXISTS silvio_reminders_lettura_public ON public.silvio_reminders;
CREATE POLICY silvio_reminders_lettura_public ON public.silvio_reminders
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR ((company_id = public.get_my_company_id()) AND ((user_id IS NULL) OR (user_id = ( SELECT auth.uid() AS uid)) OR (created_by = ( SELECT auth.uid() AS uid)) OR ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))))
  );

-- dashboards
DROP POLICY IF EXISTS dashboards_delete ON public.dashboards;
CREATE POLICY dashboards_delete ON public.dashboards
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND ((owner_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)))
  );

DROP POLICY IF EXISTS dashboards_update ON public.dashboards;
CREATE POLICY dashboards_update ON public.dashboards
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND ((owner_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)))
  )
  WITH CHECK (
    (company_id = ( SELECT public.get_my_company_id() AS get_my_company_id))
  );

-- dashboard_versions
DROP POLICY IF EXISTS dashboard_versions_insert ON public.dashboard_versions;
CREATE POLICY dashboard_versions_insert ON public.dashboard_versions
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.dashboards d
  WHERE ((d.id = dashboard_versions.dashboard_id) AND (d.company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND ((d.owner_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))))))
  );

DROP POLICY IF EXISTS dashboard_versions_toggle_current ON public.dashboard_versions;
CREATE POLICY dashboard_versions_toggle_current ON public.dashboard_versions
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    (EXISTS ( SELECT 1
   FROM public.dashboards d
  WHERE ((d.id = dashboard_versions.dashboard_id) AND (d.company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND ((d.owner_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)))))
  );

-- integration_field_mappings
DROP POLICY IF EXISTS "Admins can manage own company field mappings" ON public.integration_field_mappings;
CREATE POLICY "Admins can manage own company field mappings" ON public.integration_field_mappings
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_effective_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  )
  WITH CHECK (
    ((company_id = public.get_effective_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

-- integrations
DROP POLICY IF EXISTS "Admins can manage own company integrations" ON public.integrations;
CREATE POLICY "Admins can manage own company integrations" ON public.integrations
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_effective_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)) AND (NOT public.utente_e_cliente_esterno()))
  )
  WITH CHECK (
    ((company_id = public.get_effective_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

-- meta_assets
DROP POLICY IF EXISTS "Admins can manage own company meta assets" ON public.meta_assets;
CREATE POLICY "Admins can manage own company meta assets" ON public.meta_assets
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_effective_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role)) AND (NOT ( SELECT public.utente_e_cliente_esterno() AS utente_e_cliente_esterno)))
  )
  WITH CHECK (
    ((company_id = public.get_effective_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role)))
  );

-- meta_lead_forms
DROP POLICY IF EXISTS "Admins can manage own company lead forms" ON public.meta_lead_forms;
CREATE POLICY "Admins can manage own company lead forms" ON public.meta_lead_forms
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_effective_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)) AND (NOT public.utente_e_cliente_esterno()))
  )
  WITH CHECK (
    ((company_id = public.get_effective_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );
