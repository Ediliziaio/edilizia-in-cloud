-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- ═══ CRM: RLS con permesso giusto + multi-azienda ══════════════════════════
-- Bug storico: le policy staff del CRM chiedevano can_view_orders (permesso
-- COMMESSE) e scopavano su get_user_company_id (= SOLO azienda del profilo).
-- Risultato: staff marketing-only → CRM vuoto; utenti multi-azienda → CRM
-- vuoto nella seconda azienda; e NESSUNA policy di scrittura staff (solo gli
-- admin potevano creare/spostare contatti e opportunità).

-- 1) Helper: permesso verificato SULL'AZIENDA della riga.
--    - super_admin: sempre
--    - company_admin: solo sulla propria azienda (profilo) o su un'azienda a
--      cui accede in multi-azienda con access_role=company_admin
--    - staff: riga staff_permissions di QUELLA azienda (multi-azienda inclusa)
create or replace function public.has_permission_for_company(
  _user_id uuid, _permission text, _company_id uuid
) returns boolean
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  _has boolean;
begin
  if _user_id is null or _company_id is null then
    return false;
  end if;

  if has_role(_user_id, 'super_admin'::app_role) then
    return true;
  end if;

  if has_role(_user_id, 'company_admin'::app_role)
     and _company_id = get_user_company_id(_user_id) then
    return true;
  end if;

  if exists (
    select 1 from public.multi_company_access mca
    where mca.user_id = _user_id
      and mca.company_id = _company_id
      and mca.status = 'active'
      and (mca.expires_at is null or mca.expires_at > now())
      and mca.access_role::text = 'company_admin'
  ) then
    return true;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'staff_permissions'
      and column_name = _permission
  ) then
    return false;
  end if;

  begin
    execute format(
      'select %I from public.staff_permissions where user_id = $1 and company_id = $2 limit 1',
      _permission
    ) into _has using _user_id, _company_id;
  exception when others then
    return false;
  end;

  return coalesce(_has, false);
end;
$$;

-- 2) Policy di LETTURA staff: permesso CRM corretto (con can_view_orders in OR
--    per retro-compatibilità con gli staff gestionale che già vedevano il CRM).

drop policy if exists "Staff can view marketing contacts if permitted" on public.marketing_contacts;
create policy "Staff can view marketing contacts if permitted" on public.marketing_contacts
for select using (
  (has_permission_for_company((select auth.uid()), 'can_view_marketing_contacts', company_id)
   or has_permission_for_company((select auth.uid()), 'can_view_orders', company_id))
  and check_staff_visibility((select auth.uid()), assigned_to)
);

drop policy if exists "Staff can view contact activities if permitted" on public.marketing_contact_activities;
create policy "Staff can view contact activities if permitted" on public.marketing_contact_activities
for select using (
  (has_permission_for_company((select auth.uid()), 'can_view_marketing_contacts', company_id)
   or has_permission_for_company((select auth.uid()), 'can_view_orders', company_id))
  and check_staff_visibility((select auth.uid()), created_by)
);

drop policy if exists "Staff can view contact field values if permitted" on public.marketing_contact_field_values;
create policy "Staff can view contact field values if permitted" on public.marketing_contact_field_values
for select using (
  exists (
    select 1 from public.marketing_contacts mc
    where mc.id = marketing_contact_field_values.contact_id
      and (has_permission_for_company((select auth.uid()), 'can_view_marketing_contacts', mc.company_id)
        or has_permission_for_company((select auth.uid()), 'can_view_orders', mc.company_id))
  )
);

drop policy if exists "Staff can view list members if permitted" on public.marketing_contact_list_members;
create policy "Staff can view list members if permitted" on public.marketing_contact_list_members
for select using (
  exists (
    select 1 from public.marketing_contact_lists l
    where l.id = marketing_contact_list_members.list_id
      and (has_permission_for_company((select auth.uid()), 'can_view_marketing_contacts', l.company_id)
        or has_permission_for_company((select auth.uid()), 'can_view_orders', l.company_id))
  )
);

drop policy if exists "Staff can view contact lists if permitted" on public.marketing_contact_lists;
create policy "Staff can view contact lists if permitted" on public.marketing_contact_lists
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_contacts', company_id)
  or has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
);

drop policy if exists "Staff can view contact notes if permitted" on public.marketing_contact_notes;
create policy "Staff can view contact notes if permitted" on public.marketing_contact_notes
for select using (
  (has_permission_for_company((select auth.uid()), 'can_view_marketing_contacts', company_id)
   or has_permission_for_company((select auth.uid()), 'can_view_orders', company_id))
  and check_staff_visibility((select auth.uid()), created_by)
);

drop policy if exists "Staff can view custom fields if permitted" on public.marketing_custom_fields;
create policy "Staff can view custom fields if permitted" on public.marketing_custom_fields
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_contacts', company_id)
  or has_permission_for_company((select auth.uid()), 'can_view_marketing_opportunities', company_id)
  or has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
);

drop policy if exists "Staff can view marketing documents if permitted" on public.marketing_documents;
create policy "Staff can view marketing documents if permitted" on public.marketing_documents
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_contacts', company_id)
  or has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
);

drop policy if exists "Staff can view marketing tags if permitted" on public.marketing_tags;
create policy "Staff can view marketing tags if permitted" on public.marketing_tags
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_contacts', company_id)
  or has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
  or has_permission_for_company((select auth.uid()), 'can_view_settings', company_id)
  or has_permission_for_company((select auth.uid()), 'can_view_settings_customization', company_id)
);

drop policy if exists "Staff can view pipelines if permitted" on public.marketing_pipelines;
create policy "Staff can view pipelines if permitted" on public.marketing_pipelines
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_opportunities', company_id)
  or has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
);

drop policy if exists "Staff can view pipeline stages if permitted" on public.marketing_pipeline_stages;
create policy "Staff can view pipeline stages if permitted" on public.marketing_pipeline_stages
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_opportunities', company_id)
  or has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
);

drop policy if exists "Staff can view opportunities if permitted" on public.marketing_opportunities;
create policy "Staff can view opportunities if permitted" on public.marketing_opportunities
for select using (
  (has_permission_for_company((select auth.uid()), 'can_view_marketing_opportunities', company_id)
   or has_permission_for_company((select auth.uid()), 'can_view_orders', company_id))
  and check_staff_visibility((select auth.uid()), assigned_to)
);

drop policy if exists "Staff can view opportunity field values if permitted" on public.marketing_opportunity_field_values;
create policy "Staff can view opportunity field values if permitted" on public.marketing_opportunity_field_values
for select using (
  exists (
    select 1 from public.marketing_opportunities mo
    where mo.id = marketing_opportunity_field_values.opportunity_id
      and (has_permission_for_company((select auth.uid()), 'can_view_marketing_opportunities', mo.company_id)
        or has_permission_for_company((select auth.uid()), 'can_view_orders', mo.company_id))
  )
);

drop policy if exists "Staff can view opportunity notes if permitted" on public.marketing_opportunity_notes;
create policy "Staff can view opportunity notes if permitted" on public.marketing_opportunity_notes
for select using (
  (has_permission_for_company((select auth.uid()), 'can_view_marketing_opportunities', company_id)
   or has_permission_for_company((select auth.uid()), 'can_view_orders', company_id))
  and check_staff_visibility((select auth.uid()), created_by)
);

drop policy if exists "Staff can view marketing calendars if permitted" on public.marketing_calendars;
create policy "Staff can view marketing calendars if permitted" on public.marketing_calendars
for select using (
  (has_permission_for_company((select auth.uid()), 'can_view_marketing_appointments', company_id)
   or has_permission_for_company((select auth.uid()), 'can_view_orders', company_id))
  and check_staff_visibility((select auth.uid()), owner_id)
);

drop policy if exists "Staff can view calendar availability if permitted" on public.marketing_calendar_availability;
create policy "Staff can view calendar availability if permitted" on public.marketing_calendar_availability
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_appointments', company_id)
  or has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
);

drop policy if exists "Staff can view calendar preferences if permitted" on public.marketing_calendar_preferences;
create policy "Staff can view calendar preferences if permitted" on public.marketing_calendar_preferences
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_appointments', company_id)
  or has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
);

-- 3) Policy di SCRITTURA staff (prima inesistenti: solo gli admin scrivevano).
--    Gated sui permessi can_edit_marketing_* della SPECIFICA azienda.

create policy "Staff can manage marketing contacts if permitted" on public.marketing_contacts
for all using (
  has_permission_for_company((select auth.uid()), 'can_edit_marketing_contacts', company_id)
  and check_staff_visibility((select auth.uid()), assigned_to)
) with check (
  has_permission_for_company((select auth.uid()), 'can_edit_marketing_contacts', company_id)
);

create policy "Staff can manage contact notes if permitted" on public.marketing_contact_notes
for all using (
  has_permission_for_company((select auth.uid()), 'can_edit_marketing_contacts', company_id)
) with check (
  has_permission_for_company((select auth.uid()), 'can_edit_marketing_contacts', company_id)
);

create policy "Staff can manage contact activities if permitted" on public.marketing_contact_activities
for all using (
  has_permission_for_company((select auth.uid()), 'can_edit_marketing_contacts', company_id)
) with check (
  has_permission_for_company((select auth.uid()), 'can_edit_marketing_contacts', company_id)
);

create policy "Staff can manage contact field values if permitted" on public.marketing_contact_field_values
for all using (
  exists (
    select 1 from public.marketing_contacts mc
    where mc.id = marketing_contact_field_values.contact_id
      and has_permission_for_company((select auth.uid()), 'can_edit_marketing_contacts', mc.company_id)
  )
) with check (
  exists (
    select 1 from public.marketing_contacts mc
    where mc.id = marketing_contact_field_values.contact_id
      and has_permission_for_company((select auth.uid()), 'can_edit_marketing_contacts', mc.company_id)
  )
);

create policy "Staff can manage list members if permitted" on public.marketing_contact_list_members
for all using (
  exists (
    select 1 from public.marketing_contact_lists l
    where l.id = marketing_contact_list_members.list_id
      and has_permission_for_company((select auth.uid()), 'can_edit_marketing_contacts', l.company_id)
  )
) with check (
  exists (
    select 1 from public.marketing_contact_lists l
    where l.id = marketing_contact_list_members.list_id
      and has_permission_for_company((select auth.uid()), 'can_edit_marketing_contacts', l.company_id)
  )
);

create policy "Staff can manage opportunities if permitted" on public.marketing_opportunities
for all using (
  has_permission_for_company((select auth.uid()), 'can_edit_marketing_opportunities', company_id)
  and check_staff_visibility((select auth.uid()), assigned_to)
) with check (
  has_permission_for_company((select auth.uid()), 'can_edit_marketing_opportunities', company_id)
);

create policy "Staff can manage opportunity notes if permitted" on public.marketing_opportunity_notes
for all using (
  has_permission_for_company((select auth.uid()), 'can_edit_marketing_opportunities', company_id)
) with check (
  has_permission_for_company((select auth.uid()), 'can_edit_marketing_opportunities', company_id)
);

create policy "Staff can manage opportunity field values if permitted" on public.marketing_opportunity_field_values
for all using (
  exists (
    select 1 from public.marketing_opportunities mo
    where mo.id = marketing_opportunity_field_values.opportunity_id
      and has_permission_for_company((select auth.uid()), 'can_edit_marketing_opportunities', mo.company_id)
  )
) with check (
  exists (
    select 1 from public.marketing_opportunities mo
    where mo.id = marketing_opportunity_field_values.opportunity_id
      and has_permission_for_company((select auth.uid()), 'can_edit_marketing_opportunities', mo.company_id)
  )
);
