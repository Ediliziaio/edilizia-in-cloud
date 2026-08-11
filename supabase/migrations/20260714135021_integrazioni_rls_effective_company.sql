-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Le RLS delle tabelle integrazioni usavano get_user_company_id (= SOLO la
-- company del profilo): in impersonation super admin e in multi-azienda le
-- query tornavano SEMPRE vuote → card "Da configurare" con integrazione
-- connected, picker pagine bianco con 83 pagine in DB. Stessa famiglia di
-- bug già bonificata sulle tabelle marketing_* il 13/7. Pattern corretto:
-- get_effective_company_id() (impersonation > selezione attiva > profilo).

-- integrations ---------------------------------------------------------------
drop policy if exists "Users can view own company integrations" on public.integrations;
create policy "Users can view own company integrations"
on public.integrations for select
using (company_id = get_effective_company_id());

drop policy if exists "Admins can manage own company integrations" on public.integrations;
create policy "Admins can manage own company integrations"
on public.integrations for all
using (
  company_id = get_effective_company_id()
  and (has_role((select auth.uid()), 'company_admin'::app_role) or has_role((select auth.uid()), 'super_admin'::app_role))
)
with check (
  company_id = get_effective_company_id()
  and (has_role((select auth.uid()), 'company_admin'::app_role) or has_role((select auth.uid()), 'super_admin'::app_role))
);

-- meta_assets ----------------------------------------------------------------
drop policy if exists "Users can view own company meta assets" on public.meta_assets;
create policy "Users can view own company meta assets"
on public.meta_assets for select
using (company_id = get_effective_company_id());

drop policy if exists "Admins can manage own company meta assets" on public.meta_assets;
create policy "Admins can manage own company meta assets"
on public.meta_assets for all
using (
  company_id = get_effective_company_id()
  and (has_role((select auth.uid()), 'company_admin'::app_role) or has_role((select auth.uid()), 'super_admin'::app_role))
)
with check (
  company_id = get_effective_company_id()
  and (has_role((select auth.uid()), 'company_admin'::app_role) or has_role((select auth.uid()), 'super_admin'::app_role))
);

-- meta_lead_forms ------------------------------------------------------------
drop policy if exists "Users can view own company lead forms" on public.meta_lead_forms;
create policy "Users can view own company lead forms"
on public.meta_lead_forms for select
using (company_id = get_effective_company_id());

drop policy if exists "Admins can manage own company lead forms" on public.meta_lead_forms;
create policy "Admins can manage own company lead forms"
on public.meta_lead_forms for all
using (
  company_id = get_effective_company_id()
  and (has_role((select auth.uid()), 'company_admin'::app_role) or has_role((select auth.uid()), 'super_admin'::app_role))
)
with check (
  company_id = get_effective_company_id()
  and (has_role((select auth.uid()), 'company_admin'::app_role) or has_role((select auth.uid()), 'super_admin'::app_role))
);

-- integration_field_mappings --------------------------------------------------
drop policy if exists "Users can view own company field mappings" on public.integration_field_mappings;
create policy "Users can view own company field mappings"
on public.integration_field_mappings for select
using (company_id = get_effective_company_id());

drop policy if exists "Admins can manage own company field mappings" on public.integration_field_mappings;
create policy "Admins can manage own company field mappings"
on public.integration_field_mappings for all
using (
  company_id = get_effective_company_id()
  and (has_role((select auth.uid()), 'company_admin'::app_role) or has_role((select auth.uid()), 'super_admin'::app_role))
)
with check (
  company_id = get_effective_company_id()
  and (has_role((select auth.uid()), 'company_admin'::app_role) or has_role((select auth.uid()), 'super_admin'::app_role))
);

-- integration_audit_log (sola lettura lato client) ----------------------------
drop policy if exists "Users can view own company audit log" on public.integration_audit_log;
create policy "Users can view own company audit log"
on public.integration_audit_log for select
using (company_id = get_effective_company_id());
