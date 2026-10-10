-- Permessi delle Impostazioni nel database — Modelli di sopralluogo: li cambia chi ha «Personalizzazione» in modifica
-- Applicata il 10/10/2026 con apply_migration, registro riallineato al nome del file (CLAUDE.md). Si può rilanciare senza effetti (DROP … IF EXISTS prima di ogni CREATE).
--
-- toggle_survey_template, clone_survey_template, le attivazioni (survey_template_settings) e i modelli propri (survey_templates)
-- chiedono can_edit_settings_customization (la pagina Sopralluoghi si apre con la vista di quel permesso) oppure il super admin.
-- Leggono tutti gli interni, come prima. Alternativa, se il permesso giusto fosse un altro: 'can_edit_settings_orders'.

set local lock_timeout = '3s';

create or replace function public.toggle_survey_template(p_template_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $f$
declare
  v_company uuid := public.get_my_company_id();
begin
  if v_company is null then
    raise exception 'Profilo senza azienda' using errcode = '42501';
  end if;
  if not (public.has_role(auth.uid(), 'super_admin'::public.app_role)
          or v_company = any (public.aziende_con_permesso('can_edit_settings_customization'))) then
    raise exception 'Per cambiare i modelli di sopralluogo serve il permesso «Personalizzazione» in modifica.'
      using errcode = '42501';
  end if;

  insert into public.survey_template_settings (company_id, template_id, is_enabled, updated_by)
  values (v_company, p_template_id, p_enabled, auth.uid())
  on conflict (company_id, template_id)
  do update set
    is_enabled = excluded.is_enabled,
    updated_by = auth.uid(),
    updated_at = now();
end;
$f$;

create or replace function public.clone_survey_template(p_source_id uuid, p_new_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $f$
declare
  v_company uuid := public.get_my_company_id();
  v_source record;
  v_new_id uuid;
begin
  if v_company is null then
    raise exception 'Profilo senza azienda' using errcode = '42501';
  end if;
  if not (public.has_role(auth.uid(), 'super_admin'::public.app_role)
          or v_company = any (public.aziende_con_permesso('can_edit_settings_customization'))) then
    raise exception 'Per cambiare i modelli di sopralluogo serve il permesso «Personalizzazione» in modifica.'
      using errcode = '42501';
  end if;
  if p_new_name is null or length(trim(p_new_name)) < 3 then
    raise exception 'Nome troppo corto (min 3 char)' using errcode = '22023';
  end if;

  select * into v_source from public.survey_templates where id = p_source_id;
  if not found then
    raise exception 'Template sorgente non trovato' using errcode = '42704';
  end if;
  -- Verifica accesso al template sorgente (system o stessa company)
  if not v_source.is_system and v_source.company_id <> v_company then
    raise exception 'Permesso negato sul template sorgente' using errcode = '42501';
  end if;

  insert into public.survey_templates (
    company_id, category, name, description, is_system, is_active,
    area_label, area_label_plural, element_label, schema, version,
    created_by
  ) values (
    v_company, v_source.category, trim(p_new_name), v_source.description,
    false, true,
    v_source.area_label, v_source.area_label_plural, v_source.element_label,
    v_source.schema, 1,
    auth.uid()
  )
  returning id into v_new_id;

  return v_new_id;
end;
$f$;

drop policy if exists tpl_settings_modify on public.survey_template_settings;
drop policy if exists tpl_settings_scrittura on public.survey_template_settings;
create policy tpl_settings_scrittura on public.survey_template_settings
  for all to authenticated
  using (not (select public.utente_e_cliente_esterno())
         and ((company_id = (select public.get_my_company_id())
               and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_customization'))))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))))
  with check (not (select public.utente_e_cliente_esterno())
         and ((company_id = (select public.get_my_company_id())
               and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_customization'))))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))));

drop policy if exists templates_insert_company on public.survey_templates;
create policy templates_insert_company on public.survey_templates
  for insert to authenticated
  with check (is_system = false and not (select public.utente_e_cliente_esterno())
              and company_id = (select public.get_my_company_id())
              and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_customization'))));
drop policy if exists templates_update_company on public.survey_templates;
create policy templates_update_company on public.survey_templates
  for update to authenticated
  using (is_system = false and not (select public.utente_e_cliente_esterno())
         and company_id = (select public.get_my_company_id())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_customization'))));
drop policy if exists templates_delete_company on public.survey_templates;
create policy templates_delete_company on public.survey_templates
  for delete to authenticated
  using (is_system = false and not (select public.utente_e_cliente_esterno())
         and company_id = (select public.get_my_company_id())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_customization'))));
