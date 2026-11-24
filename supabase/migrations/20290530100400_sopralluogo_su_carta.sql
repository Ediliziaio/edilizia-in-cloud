-- Il sopralluogo su carta: niente modulo da compilare, solo foto e PDF del foglio.
-- Piano: docs/piano-sopralluoghi-vendita-tecnico.md, lotto 8.
--
-- Un rilievo «su carta» usa il modello di sistema della registrazione rapida (feca0825…, quello
-- del Campo) e surveys.mode = 'express' (previsto dal vincolo, mai usato fino a oggi).
--   1. La consegna dall'app operai chiedeva almeno un elemento compilato: ora bastano le foto o i
--      PDF caricati (survey_media di tipo foto o documento).
--   2. Dall'appuntamento si può preparare il rilievo su carta (p_su_carta).

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function survey_private.guard_header()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if auth.uid() is not null and new.status is distinct from old.status
    and (new.status='reviewed' or (old.status in ('completed','reviewed') and new.status in ('draft','in_progress')))
    and (not survey_private.office_allowed(old.company_id) or length(trim(coalesce(new.field_review_note,'')))<5) then
    raise exception 'Revisione dell’ufficio e motivazione obbligatorie';
  end if;
  if survey_private.field_actor() then
    if not survey_private.field_allowed(old.id,true) then raise exception 'Rilievo non modificabile o accesso revocato'; end if;
    if (to_jsonb(new)-array['header_data','notes','general_audio_url','general_audio_transcription','status','started_at','completed_at','updated_at'])
      is distinct from (to_jsonb(old)-array['header_data','notes','general_audio_url','general_audio_transcription','status','started_at','completed_at','updated_at']) then
      raise exception 'L’operatore può modificare solo dati tecnici e note';
    end if;
    if new.status<>old.status and not ((old.status='draft' and new.status='in_progress')
      or (old.status in ('draft','in_progress') and new.status='completed')) then raise exception 'Stato riservato alla revisione dell’ufficio'; end if;
    if new.status='completed' and old.status<>'completed' then
      -- Su carta basta il foglio fotografato o il PDF: niente elementi da compilare (lotto 8).
      if not exists(select 1 from public.survey_elements where survey_id=old.id)
         and not exists(select 1 from public.survey_media where survey_id=old.id and type in ('photo','annotated_photo','document')) then
        raise exception 'Aggiungi almeno un elemento, oppure la foto o il PDF del rilievo, prima della consegna';
      end if;
      new.completed_at=now();
    end if;
  end if;
  if new.status is distinct from old.status then
    insert into public.survey_activity_log(survey_id,user_id,event_type,event_data)
      values(old.id,auth.uid(),'review_transition',jsonb_build_object('from',old.status,'to',new.status,'note',new.field_review_note));
  end if;
  return new;
end $function$;

-- Una firma in più (p_su_carta): la vecchia si toglie, altrimenti le chiamate con 4 argomenti
-- sarebbero ambigue.
drop function if exists public.sopralluogo_da_appuntamento(uuid, uuid, text, boolean);

create or replace function public.sopralluogo_da_appuntamento(
  p_appointment uuid,
  p_template uuid,
  p_tipo text default null,
  p_app_operai boolean default true,
  p_su_carta boolean default false
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
  v_modello uuid := case when p_su_carta then 'feca0825-6909-4208-9ed7-cd52070ea1d5'::uuid else p_template end;
begin
  select * into a from public.appointments where id = p_appointment;
  if a.id is null then
    raise exception 'Appuntamento non trovato' using errcode = 'P0002';
  end if;
  if auth.uid() is not null and not survey_private.office_allowed(a.company_id) then
    raise exception 'Per preparare il rilievo serve il permesso Sopralluoghi' using errcode = '42501';
  end if;

  select id into v_id from public.surveys
   where appointment_id = p_appointment and deleted_at is null limit 1;
  if v_id is not null then
    if a.assigned_to is not null then
      perform public.sopralluogo_assegna_tecnico(v_id, a.assigned_to, p_app_operai);
    end if;
    return v_id;
  end if;

  -- Su carta il modello è quello di sistema (non attivabile dalle impostazioni): niente controllo.
  if not p_su_carta and not exists (
    select 1 from public.survey_templates t
     where t.id = v_modello and t.is_active
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
    a.company_id, v_modello, v_tipo,
    case when v_tipo = 'commerciale' then 'preliminare' else 'definitivo' end,
    'draft', case when p_su_carta then 'express' else 'structured' end,
    v_cliente, a.contact_id, a.opportunity_id, a.order_id, a.id,
    v_quando, a.address_line, a.address_city, a.address_postal_code, a.address_province,
    coalesce(a.address_country, 'IT'), a.lat, a.lng,
    auth.uid()
  ) returning id into v_id;

  insert into public.survey_activity_log (survey_id, user_id, event_type, event_data)
  values (v_id, auth.uid(), 'creato_da_appuntamento',
          jsonb_build_object('appointment_id', a.id, 'tipo', v_tipo, 'su_carta', p_su_carta));

  if a.assigned_to is not null then
    perform public.sopralluogo_assegna_tecnico(v_id, a.assigned_to, p_app_operai);
  end if;

  return v_id;
end;
$function$;

revoke all on function public.sopralluogo_da_appuntamento(uuid, uuid, text, boolean, boolean) from public, anon;
grant execute on function public.sopralluogo_da_appuntamento(uuid, uuid, text, boolean, boolean) to authenticated, service_role;
