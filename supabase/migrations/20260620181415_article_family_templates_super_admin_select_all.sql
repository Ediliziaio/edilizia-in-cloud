-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.


-- Permette al super_admin di vedere TUTTI i template (anche is_active=false)
-- nella pagina di gestione. Gli altri authenticated continuano a vedere solo i attivi.
drop policy if exists aft_select_super_admin_all on public.article_family_templates;
create policy aft_select_super_admin_all
on public.article_family_templates
for select
to authenticated
using (
  exists (select 1 from public.user_roles
          where user_roles.user_id = (select auth.uid())
            and user_roles.role = 'super_admin'::app_role)
);
