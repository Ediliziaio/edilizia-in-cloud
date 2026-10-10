-- Permessi delle Impostazioni nel database — sedi e catalogo render: si modificano col permesso
-- Applicata il 10/10/2026 con apply_migration, registro riallineato al nome del file (CLAUDE.md). Si può rilanciare senza effetti (DROP … IF EXISTS prima di ogni CREATE).
--
-- Sedi: leggono tutti gli interni; scrive l'amministratore o chi ha «Ordini» in modifica (come SettingsSedi.tsx) e il super admin;
-- le scritture dell'app passano da gestisci-sede (service role).
-- Catalogo render e foto del bucket render-catalogo: leggono gli interni con accesso al render; scrive chi ha «Personalizzazione»
-- in modifica e il super admin. Il cliente del portale non vede e non carica le foto del catalogo.

set local lock_timeout = '3s';

drop policy if exists sedi_insert on public.sedi;
drop policy if exists sedi_update on public.sedi;
drop policy if exists sedi_delete on public.sedi;
drop policy if exists sedi_scrittura on public.sedi;
create policy sedi_scrittura on public.sedi
  for all to authenticated
  using (not (select public.utente_e_cliente_esterno())
         and ((company_id = (select public.get_my_company_id())
               and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_orders'))))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))))
  with check (not (select public.utente_e_cliente_esterno())
         and ((company_id = (select public.get_my_company_id())
               and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_orders'))))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))));

drop policy if exists co_render_catalog_assets on public.render_catalog_assets;
drop policy if exists render_catalogo_lettura on public.render_catalog_assets;
create policy render_catalogo_lettura on public.render_catalog_assets
  for select to authenticated
  using (public.can_access_render_company(company_id) and not (select public.utente_e_cliente_esterno()));
drop policy if exists render_catalogo_scrittura on public.render_catalog_assets;
create policy render_catalogo_scrittura on public.render_catalog_assets
  for all to authenticated
  using (public.can_access_render_company(company_id) and not (select public.utente_e_cliente_esterno())
         and (company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_customization')))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))))
  with check (public.can_access_render_company(company_id) and not (select public.utente_e_cliente_esterno())
         and (company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_customization')))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))));

-- I file del catalogo: leggere resta a chi ha accesso al render dell'azienda; caricare, sovrascrivere ed eliminare
-- chiede lo stesso permesso della tabella (e non è mai del cliente del portale).
create or replace function public.can_edit_render_storage_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'storage'
as $f$
  select public.can_access_render_storage_object(p_name)
     and not public.utente_e_cliente_esterno()
     and (
       public.has_role(auth.uid(), 'super_admin'::public.app_role)
       or coalesce((
            select (case
                      when (f.parts)[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then ((f.parts)[1])::uuid
                      when (f.parts)[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then ((f.parts)[2])::uuid
                    end) = any (public.aziende_con_permesso('can_edit_settings_customization'))
              from (select storage.foldername(p_name) as parts) f
          ), false)
     );
$f$;
revoke all on function public.can_edit_render_storage_object(text) from public, anon;
grant execute on function public.can_edit_render_storage_object(text) to authenticated;

drop policy if exists render_catalogo_select on storage.objects;
create policy render_catalogo_select on storage.objects
  for select to authenticated
  using (bucket_id = 'render-catalogo' and public.can_access_render_storage_object(name)
         and not (select public.utente_e_cliente_esterno()));
drop policy if exists render_catalogo_insert on storage.objects;
create policy render_catalogo_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'render-catalogo' and public.can_edit_render_storage_object(name));
drop policy if exists render_catalogo_update on storage.objects;
create policy render_catalogo_update on storage.objects
  for update to authenticated
  using (bucket_id = 'render-catalogo' and public.can_edit_render_storage_object(name))
  with check (bucket_id = 'render-catalogo' and public.can_edit_render_storage_object(name));
drop policy if exists render_catalogo_delete on storage.objects;
create policy render_catalogo_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'render-catalogo' and public.can_edit_render_storage_object(name));
