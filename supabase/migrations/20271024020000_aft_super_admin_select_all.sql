-- Permette al super_admin di vedere TUTTI i template articolo (anche
-- is_active=false) nella pagina di gestione /admin/template-articoli.
-- Gli altri authenticated continuano a vedere solo i template attivi
-- (policy aft_select_authenticated, invariata).
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
