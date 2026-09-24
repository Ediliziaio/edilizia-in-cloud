-- Azienda effettiva (vista cliente, multi-azienda) invece del profilo, che per il
-- super admin è NULL: lo stesso cambio di 20280924090000_call_logs_azienda_effettiva,
-- sulle tabelle che l'app legge o scrive. In ogni policy cambia solo la funzione,
-- get_user_company_id(auth.uid()) → get_my_company_id(): ruoli, altre condizioni
-- e policy RESTRICTIVE restano come erano.
--
-- Restano com'erano, perché l'app non le legge né le scrive: ad_audit_log,
-- automation_global_settings, company_ai_usage, form_views,
-- google_ads_insights_cache, google_calendar_order_events, meta_campaign_versions.
--
-- task_dependencies, task_tag_assignments, warehouse_transfer_items e
-- dashboard_versions non hanno la RESTRICTIVE sull'utente bloccato, che
-- get_user_company_id copriva restituendo NULL: resta coperto, perché la policy
-- passa da tasks, warehouse_transfers e dashboards, che la RESTRICTIVE ce l'hanno.

SET LOCAL lock_timeout = '3s';

-- attribution_sessions: le sessioni nella scheda contatto (useContactAttribution)
DROP POLICY IF EXISTS attribution_sessions_tenant_insert ON public.attribution_sessions;
CREATE POLICY attribution_sessions_tenant_insert ON public.attribution_sessions
  FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.get_my_company_id()));

DROP POLICY IF EXISTS attribution_sessions_tenant_select ON public.attribution_sessions;
CREATE POLICY attribution_sessions_tenant_select ON public.attribution_sessions
  FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_my_company_id()));

-- billing_sync_log: la scrivono le funzioni, l'app la legge in Impostazioni → Fatturazione
DROP POLICY IF EXISTS company_billing_sync_log ON public.billing_sync_log;
CREATE POLICY company_billing_sync_log ON public.billing_sync_log
  FOR SELECT TO public
  USING (
    company_id = (SELECT public.get_my_company_id())
    AND NOT (SELECT public.utente_e_cliente_esterno())
  );

-- contact_attributions: l'attribuzione nella scheda contatto
DROP POLICY IF EXISTS contact_attributions_tenant_all ON public.contact_attributions;
CREATE POLICY contact_attributions_tenant_all ON public.contact_attributions
  FOR ALL TO authenticated
  USING (company_id = (SELECT public.get_my_company_id()))
  WITH CHECK (company_id = (SELECT public.get_my_company_id()));

DROP POLICY IF EXISTS contact_attributions_tenant_select ON public.contact_attributions;
CREATE POLICY contact_attributions_tenant_select ON public.contact_attributions
  FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_my_company_id()));

-- dashboards, dashboard_versions, dashboard_user_access: il costruttore di dashboard
DROP POLICY IF EXISTS dashboards_read ON public.dashboards;
CREATE POLICY dashboards_read ON public.dashboards
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_my_company_id())
    AND (
      scope = 'company'
      OR (scope = 'personal' AND owner_id = (SELECT auth.uid()))
      OR (scope LIKE 'role:%' AND public.has_role((SELECT auth.uid()), (substring(scope FROM 6))::public.app_role))
    )
  );

DROP POLICY IF EXISTS dashboards_insert ON public.dashboards;
CREATE POLICY dashboards_insert ON public.dashboards
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT public.get_my_company_id())
    AND owner_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS dashboards_update ON public.dashboards;
CREATE POLICY dashboards_update ON public.dashboards
  FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT public.get_my_company_id())
    AND (owner_id = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()), 'company_admin'::public.app_role))
  )
  WITH CHECK (company_id = (SELECT public.get_my_company_id()));

DROP POLICY IF EXISTS dashboards_delete ON public.dashboards;
CREATE POLICY dashboards_delete ON public.dashboards
  FOR DELETE TO authenticated
  USING (
    company_id = (SELECT public.get_my_company_id())
    AND (owner_id = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()), 'company_admin'::public.app_role))
  );

DROP POLICY IF EXISTS dashboard_versions_insert ON public.dashboard_versions;
CREATE POLICY dashboard_versions_insert ON public.dashboard_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.dashboards d
       WHERE d.id = dashboard_versions.dashboard_id
         AND d.company_id = (SELECT public.get_my_company_id())
         AND (d.owner_id = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()), 'company_admin'::public.app_role))
    )
  );

DROP POLICY IF EXISTS dashboard_versions_toggle_current ON public.dashboard_versions;
CREATE POLICY dashboard_versions_toggle_current ON public.dashboard_versions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dashboards d
       WHERE d.id = dashboard_versions.dashboard_id
         AND d.company_id = (SELECT public.get_my_company_id())
         AND (d.owner_id = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()), 'company_admin'::public.app_role))
    )
  );

DROP POLICY IF EXISTS dua_read_company ON public.dashboard_user_access;
CREATE POLICY dua_read_company ON public.dashboard_user_access
  FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_my_company_id()));

-- purchase_order_verifications, verification_discrepancies: lo storico delle verifiche OdA
DROP POLICY IF EXISTS pov_tenant_select ON public.purchase_order_verifications;
CREATE POLICY pov_tenant_select ON public.purchase_order_verifications
  FOR SELECT TO public
  USING (company_id = (SELECT public.get_my_company_id()));

DROP POLICY IF EXISTS pov_tenant_insert ON public.purchase_order_verifications;
CREATE POLICY pov_tenant_insert ON public.purchase_order_verifications
  FOR INSERT TO public
  WITH CHECK (company_id = (SELECT public.get_my_company_id()));

DROP POLICY IF EXISTS pov_tenant_update ON public.purchase_order_verifications;
CREATE POLICY pov_tenant_update ON public.purchase_order_verifications
  FOR UPDATE TO public
  USING (company_id = (SELECT public.get_my_company_id()));

DROP POLICY IF EXISTS vd_tenant_select ON public.verification_discrepancies;
CREATE POLICY vd_tenant_select ON public.verification_discrepancies
  FOR SELECT TO public
  USING (company_id = (SELECT public.get_my_company_id()));

DROP POLICY IF EXISTS vd_tenant_insert ON public.verification_discrepancies;
CREATE POLICY vd_tenant_insert ON public.verification_discrepancies
  FOR INSERT TO public
  WITH CHECK (company_id = (SELECT public.get_my_company_id()));

DROP POLICY IF EXISTS vd_tenant_update ON public.verification_discrepancies;
CREATE POLICY vd_tenant_update ON public.verification_discrepancies
  FOR UPDATE TO public
  USING (company_id = (SELECT public.get_my_company_id()));

-- task_dependencies, task_tag_assignments, task_tags, task_templates: le attività
DROP POLICY IF EXISTS task_dependencies_policy ON public.task_dependencies;
CREATE POLICY task_dependencies_policy ON public.task_dependencies
  FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
       WHERE t.id = task_dependencies.task_id
         AND t.company_id = (SELECT public.get_my_company_id())
    )
  );

DROP POLICY IF EXISTS task_tag_assignments_policy ON public.task_tag_assignments;
CREATE POLICY task_tag_assignments_policy ON public.task_tag_assignments
  FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
       WHERE t.id = task_tag_assignments.task_id
         AND t.company_id = (SELECT public.get_my_company_id())
    )
  );

DROP POLICY IF EXISTS task_tags_company_policy ON public.task_tags;
CREATE POLICY task_tags_company_policy ON public.task_tags
  FOR ALL TO public
  USING (
    company_id = (SELECT public.get_my_company_id())
    AND NOT public.utente_e_cliente_esterno()
  );

DROP POLICY IF EXISTS task_templates_company_policy ON public.task_templates;
CREATE POLICY task_templates_company_policy ON public.task_templates
  FOR ALL TO public
  USING (company_id = (SELECT public.get_my_company_id()));

-- warehouses, warehouse_transfer_items: il magazzino
DROP POLICY IF EXISTS company_warehouses ON public.warehouses;
CREATE POLICY company_warehouses ON public.warehouses
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT public.get_my_company_id())
    AND NOT public.utente_e_cliente_esterno()
  );

DROP POLICY IF EXISTS company_warehouse_transfer_items ON public.warehouse_transfer_items;
CREATE POLICY company_warehouse_transfer_items ON public.warehouse_transfer_items
  FOR ALL TO authenticated
  USING (
    transfer_id IN (
      SELECT warehouse_transfers.id FROM public.warehouse_transfers
       WHERE warehouse_transfers.company_id = (SELECT public.get_my_company_id())
    )
  );
