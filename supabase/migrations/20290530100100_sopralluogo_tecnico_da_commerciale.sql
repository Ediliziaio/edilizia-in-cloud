-- «Crea il tecnico da questo commerciale»: il tecnico trova l'elenco già pronto.
-- Piano: docs/piano-sopralluoghi-vendita-tecnico.md, lotto 2.
--
-- Copia testata, ambienti ed elementi del sopralluogo commerciale in un rilievo tecnico nuovo
-- (misure definitive), con lo stesso modello, cliente, opportunità, commessa e indirizzo. Il
-- commerciale resta com'era: è la prova di cosa si è detto al cliente. Le foto non si copiano
-- (restano nel commerciale). Un commerciale ha al massimo un tecnico vivo: chiamarla due volte
-- restituisce lo stesso.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.surveys add column if not exists origine_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'surveys_origine_id_fkey' and conrelid = 'public.surveys'::regclass) then
    alter table public.surveys add constraint surveys_origine_id_fkey
      foreign key (origine_id) references public.surveys(id) on delete set null;
  end if;
end $$;
comment on column public.surveys.origine_id is
  'Il sopralluogo commerciale da cui è nato questo rilievo tecnico.';
create unique index if not exists surveys_tecnico_da_commerciale_unico
  on public.surveys (origine_id) where origine_id is not null and deleted_at is null;

create or replace function public.sopralluogo_tecnico_da_commerciale(p_survey uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s public.surveys;
  v_id uuid;
  a record;
  v_area uuid;
begin
  select * into s from public.surveys where id = p_survey and deleted_at is null;
  if s.id is null then
    raise exception 'Sopralluogo non trovato' using errcode = 'P0002';
  end if;
  if auth.uid() is not null and not survey_private.office_allowed(s.company_id) then
    raise exception 'Per creare il rilievo tecnico serve il permesso Sopralluoghi' using errcode = '42501';
  end if;
  if s.tipo <> 'commerciale' then
    raise exception 'Il rilievo tecnico si crea da un sopralluogo commerciale' using errcode = '22023';
  end if;

  select id into v_id from public.surveys where origine_id = p_survey and deleted_at is null limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.surveys (
    company_id, template_id, tipo, ruolo_misure, status, mode, origine_id,
    client_id, contact_id, opportunity_id, order_id, header_data, notes,
    address, address_number, city, zip, province, country, latitude, longitude,
    created_by
  ) values (
    s.company_id, s.template_id, 'tecnico', 'definitivo', 'draft', s.mode, s.id,
    s.client_id, s.contact_id, s.opportunity_id, s.order_id, coalesce(s.header_data, '{}'::jsonb), s.notes,
    s.address, s.address_number, s.city, s.zip, s.province, s.country, s.latitude, s.longitude,
    auth.uid()
  ) returning id into v_id;

  for a in select * from public.survey_areas where survey_id = p_survey order by position loop
    insert into public.survey_areas (survey_id, name, position, area_data, notes)
    values (v_id, a.name, a.position, a.area_data, a.notes)
    returning id into v_area;
    -- is_complete riparte da false: il tecnico ha campi che il commerciale non aveva.
    insert into public.survey_elements (survey_id, area_id, element_type, element_label, position, values, quantity, notes)
    select v_id, v_area, e.element_type, e.element_label, e.position, e.values, e.quantity, e.notes
      from public.survey_elements e
     where e.survey_id = p_survey and e.area_id = a.id
     order by e.position;
  end loop;

  insert into public.survey_activity_log (survey_id, user_id, event_type, event_data)
  values (v_id, auth.uid(), 'creato_da_commerciale', jsonb_build_object('origine_id', p_survey)),
         (p_survey, auth.uid(), 'tecnico_creato', jsonb_build_object('tecnico_id', v_id));

  return v_id;
end;
$function$;

revoke all on function public.sopralluogo_tecnico_da_commerciale(uuid) from public, anon;
grant execute on function public.sopralluogo_tecnico_da_commerciale(uuid) to authenticated, service_role;
