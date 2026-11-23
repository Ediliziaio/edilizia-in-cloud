-- Sopralluogo commerciale o tecnico; il tecnico scelto ha davvero il rilievo.
-- Piano: docs/piano-sopralluoghi-vendita-tecnico.md, lotto 1.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.surveys add column if not exists tipo text not null default 'tecnico';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'surveys_tipo_check' and conrelid = 'public.surveys'::regclass) then
    alter table public.surveys add constraint surveys_tipo_check check (tipo in ('commerciale', 'tecnico'));
  end if;
end $$;

update public.surveys set tipo = 'commerciale'
 where tipo = 'tecnico' and ruolo_misure = 'preliminare';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'surveys_commerciale_non_definitivo' and conrelid = 'public.surveys'::regclass) then
    alter table public.surveys add constraint surveys_commerciale_non_definitivo
      check (tipo <> 'commerciale' or ruolo_misure is distinct from 'definitivo');
  end if;
end $$;

comment on column public.surveys.tipo is
  'commerciale: misure di massima per l''offerta; tecnico: misure precise per computo, preventivo e ordini.';

create unique index if not exists surveys_appuntamento_unico
  on public.surveys (appointment_id)
  where appointment_id is not null and deleted_at is null;

create or replace function public.sopralluogo_assegna_tecnico(
  p_survey uuid,
  p_tecnico uuid,
  p_app_operai boolean default true
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s public.surveys;
  v_prima uuid;
  v_operaio boolean := false;
  v_gia boolean := false;
  v_autorizza boolean := false;
  v_notifica boolean := false;
begin
  select * into s from public.surveys where id = p_survey and deleted_at is null for update;
  if s.id is null then
    raise exception 'Sopralluogo non trovato' using errcode = 'P0002';
  end if;
  -- Il service role (auth.uid() nullo) passa: lo usano le automazioni del server.
  if auth.uid() is not null and not survey_private.office_allowed(s.company_id) then
    raise exception 'Solo l''ufficio con il permesso Sopralluoghi può scegliere il tecnico' using errcode = '42501';
  end if;
  if p_tecnico is not null and not exists (
       select 1 from public.profiles p where p.id = p_tecnico and p.company_id = s.company_id) then
    raise exception 'Il tecnico non è una persona di questa azienda' using errcode = '22023';
  end if;

  v_prima := s.technician_id;

  if v_prima is distinct from p_tecnico then
    update public.surveys set technician_id = p_tecnico where id = p_survey;
    -- Il tecnico sostituito perde l'incarico (e l'accesso dall'app): resta nel registro.
    if v_prima is not null then
      delete from public.survey_assignees
       where survey_id = p_survey and user_id = v_prima and role = 'technician';
    end if;
  end if;

  if p_tecnico is null then
    return jsonb_build_object('tecnico', null, 'app_operai', false, 'notificato', false);
  end if;

  v_operaio := exists (select 1 from public.user_roles r
                        where r.user_id = p_tecnico and r.role::text in ('employee', 'subcontractor'));
  v_autorizza := coalesce(p_app_operai, false) and v_operaio;

  select true into v_gia from public.survey_assignees where survey_id = p_survey and user_id = p_tecnico;

  insert into public.survey_assignees (survey_id, user_id, role, field_authorized)
  values (p_survey, p_tecnico, 'technician', v_autorizza)
  on conflict (survey_id, user_id) do update
     set role = case when public.survey_assignees.role = 'observer' then 'technician' else public.survey_assignees.role end,
         -- Si accende qui, non si spegne: per togliere l'accesso c'è il pannello «Assegna».
         field_authorized = public.survey_assignees.field_authorized or excluded.field_authorized;

  if not coalesce(v_gia, false) and p_tecnico is distinct from auth.uid() then
    select coalesce((select pr.task_assigned_in_app from public.user_notification_preferences pr
                      where pr.user_id = p_tecnico
                      order by (pr.company_id = s.company_id) desc nulls last limit 1), true)
      into v_notifica;
    if v_notifica then
      insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
      values (s.company_id, p_tecnico, 'generic', 'Nuovo sopralluogo assegnato',
              concat('Sei il tecnico del sopralluogo ', coalesce(s.code, ''),
                     case when s.scheduled_at is not null
                          then ' del ' || to_char(s.scheduled_at at time zone 'Europe/Rome', 'DD/MM/YYYY "alle" HH24:MI')
                          else '' end, '.'),
              'survey', p_survey,
              case when v_autorizza then '/campo/sopralluoghi/' || p_survey else '/azienda/sopralluoghi/' || p_survey end);
    end if;
  end if;

  return jsonb_build_object('tecnico', p_tecnico, 'app_operai', v_autorizza or exists (
           select 1 from public.survey_assignees a where a.survey_id = p_survey and a.user_id = p_tecnico and a.field_authorized),
         'operaio', v_operaio, 'notificato', coalesce(v_notifica, false));
end;
$function$;

revoke all on function public.sopralluogo_assegna_tecnico(uuid, uuid, boolean) from public, anon;
grant execute on function public.sopralluogo_assegna_tecnico(uuid, uuid, boolean) to authenticated, service_role;

create or replace function public.sopralluogo_da_appuntamento(
  p_appointment uuid,
  p_template uuid,
  p_tipo text default null,
  p_app_operai boolean default true
) returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  a public.appointments;
  v_id uuid;
  v_tipo text;
  v_cliente uuid;
  v_quando timestamptz;
begin
  select * into a from public.appointments where id = p_appointment;
  if a.id is null then
    raise exception 'Appuntamento non trovato' using errcode = 'P0002';
  end if;
  if auth.uid() is not null and not survey_private.office_allowed(a.company_id) then
    raise exception 'Per preparare il rilievo serve il permesso Sopralluoghi' using errcode = '42501';
  end if;

  -- Già preparato: lo stesso rilievo, col tecnico dell'appuntamento.
  select id into v_id from public.surveys
   where appointment_id = p_appointment and deleted_at is null limit 1;
  if v_id is not null then
    if a.assigned_to is not null then
      perform public.sopralluogo_assegna_tecnico(v_id, a.assigned_to, p_app_operai);
    end if;
    return v_id;
  end if;

  if not exists (
    select 1 from public.survey_templates t
     where t.id = p_template and t.is_active
       and (t.company_id is null or t.company_id = a.company_id)
       and not exists (select 1 from public.survey_template_settings st
                        where st.template_id = t.id and st.company_id = a.company_id and not st.is_enabled)) then
    raise exception 'Modello di sopralluogo non disponibile' using errcode = '22023';
  end if;

  v_tipo := coalesce(p_tipo, case when a.appointment_type = 'sopralluogo_preventivo' then 'commerciale' else 'tecnico' end);
  if v_tipo not in ('commerciale', 'tecnico') then
    raise exception 'Tipo di sopralluogo non valido' using errcode = '22023';
  end if;

  if a.order_id is not null then
    select o.customer_id into v_cliente from public.orders o
     where o.id = a.order_id and o.company_id = a.company_id;
  end if;

  v_quando := case when a.appointment_date is not null and a.appointment_time is not null
                   then (a.appointment_date + a.appointment_time) at time zone 'Europe/Rome' end;

  insert into public.surveys (
    company_id, template_id, tipo, ruolo_misure, status, mode,
    client_id, contact_id, opportunity_id, order_id, appointment_id,
    scheduled_at, address, city, zip, province, country, latitude, longitude,
    created_by
  ) values (
    a.company_id, p_template, v_tipo,
    case when v_tipo = 'commerciale' then 'preliminare' else 'definitivo' end,
    'draft', 'structured',
    v_cliente, a.contact_id, a.opportunity_id, a.order_id, a.id,
    v_quando, a.address_line, a.address_city, a.address_postal_code, a.address_province,
    coalesce(a.address_country, 'IT'), a.lat, a.lng,
    auth.uid()
  ) returning id into v_id;

  insert into public.survey_activity_log (survey_id, user_id, event_type, event_data)
  values (v_id, auth.uid(), 'creato_da_appuntamento',
          jsonb_build_object('appointment_id', a.id, 'tipo', v_tipo));

  if a.assigned_to is not null then
    perform public.sopralluogo_assegna_tecnico(v_id, a.assigned_to, p_app_operai);
  end if;

  return v_id;
end;
$function$;

revoke all on function public.sopralluogo_da_appuntamento(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.sopralluogo_da_appuntamento(uuid, uuid, text, boolean) to authenticated, service_role;
