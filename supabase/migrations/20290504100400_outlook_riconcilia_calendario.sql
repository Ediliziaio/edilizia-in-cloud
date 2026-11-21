create table private.outlook_calendario_snapshot (
  connection_id uuid not null references public.outlook_calendar_connections(id) on delete cascade,
  calendar_id text not null,
  letto_da timestamptz not null,
  primary key (connection_id, calendar_id)
);
alter table private.outlook_calendario_snapshot enable row level security;
revoke all on private.outlook_calendario_snapshot from public, anon, authenticated;
grant select, insert, update on private.outlook_calendario_snapshot to service_role;

create function public.outlook_applica_snapshot(
  p_connessione uuid, p_calendario text,
  p_da timestamptz, p_fino timestamptz, p_letto_da timestamptz, p_eventi jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conn record;
begin
  if p_calendario is null or p_calendario = '' or p_da is null or p_fino is null
     or p_da >= p_fino or p_letto_da is null
     or jsonb_typeof(p_eventi) is distinct from 'array' then
    raise exception 'Snapshot Outlook non valido' using errcode = '22023';
  end if;

  select company_id, user_id into v_conn
    from public.outlook_calendar_connections where id = p_connessione for update;
  if not found then return false; end if;

  insert into private.outlook_calendario_snapshot as s(connection_id, calendar_id, letto_da)
  values (p_connessione, p_calendario, p_letto_da)
  on conflict (connection_id, calendar_id) do update set letto_da = excluded.letto_da
    where s.letto_da < excluded.letto_da;
  if not found then return false; end if;

  insert into public.outlook_calendar_events (
    connection_id, company_id, user_id, outlook_event_id, outlook_calendar_id,
    outlook_ical_uid, subject, body_preview, start_time, end_time, is_all_day,
    location_display_name, organizer_email, attendees, show_as, series_master_id,
    is_cancelled, web_link, raw
  )
  select p_connessione, v_conn.company_id, v_conn.user_id, e.outlook_event_id, p_calendario,
    e.outlook_ical_uid, e.subject, e.body_preview, e.start_time, e.end_time, e.is_all_day,
    e.location_display_name, e.organizer_email, e.attendees, e.show_as, e.series_master_id,
    e.is_cancelled, e.web_link, e.raw
  from jsonb_populate_recordset(null::public.outlook_calendar_events, p_eventi) e
  on conflict (connection_id, outlook_event_id) do update set
    outlook_calendar_id = excluded.outlook_calendar_id, outlook_ical_uid = excluded.outlook_ical_uid,
    subject = excluded.subject, body_preview = excluded.body_preview, start_time = excluded.start_time,
    end_time = excluded.end_time, is_all_day = excluded.is_all_day,
    location_display_name = excluded.location_display_name, organizer_email = excluded.organizer_email,
    attendees = excluded.attendees, show_as = excluded.show_as, series_master_id = excluded.series_master_id,
    is_cancelled = excluded.is_cancelled, web_link = excluded.web_link, raw = excluded.raw, updated_at = now();

  delete from public.outlook_calendar_events e
    where e.connection_id = p_connessione and e.outlook_calendar_id = p_calendario
      and e.start_time < p_fino and (
        e.end_time > p_da or (coalesce(e.end_time, e.start_time) <= e.start_time and e.start_time >= p_da)
      )
      and not exists (
        select 1 from jsonb_array_elements(p_eventi) p where p->>'outlook_event_id' = e.outlook_event_id
      );

  update public.outlook_calendar_connections
    set last_sync_at = now(), last_sync_event_count = jsonb_array_length(p_eventi), last_error = null
    where id = p_connessione;
  return true;
end;
$$;
revoke all on function public.outlook_applica_snapshot(uuid,text,timestamptz,timestamptz,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.outlook_applica_snapshot(uuid,text,timestamptz,timestamptz,timestamptz,jsonb) to service_role;
