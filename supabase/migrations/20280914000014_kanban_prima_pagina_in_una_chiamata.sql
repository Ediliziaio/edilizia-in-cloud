-- All'apertura del kanban ogni colonna visibile chiedeva le sue prime schede
-- con una chiamata a sé: sei o sette chiamate insieme, ognuna con la sua
-- pianificazione e le sue regole di visibilità, che sul database si mettevano
-- in fila (tra 80 e 900 ms l'una, 11/09/2026 sul «Nuovo» di BeMade).
--
-- opportunita_kanban restituisce la prima pagina di PIÙ colonne in una volta
-- sola: { "<fase>": [schede…], … }. Scorrendo una colonna, le pagine dopo la
-- prima continuano ad arrivare da opportunita_pagina.
--
-- La costruzione della scheda (contatto, persone, note, documenti, prossimo
-- appuntamento) passa in opportunita_schede, usata da entrambe: una forma
-- sola, così colonna e lista non possono divergere.

create or replace function public.opportunita_schede(p_ids uuid[])
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(
           to_jsonb(o) || jsonb_build_object(
             'marketing_contacts', (
               select jsonb_build_object(
                        'id', c.id, 'first_name', c.first_name, 'last_name', c.last_name,
                        'email', c.email, 'phone', c.phone, 'city', c.city, 'address', c.address,
                        'province', c.province, 'region', c.region, 'postal_code', c.postal_code,
                        'source', c.source, 'company_name', c.company_name, 'tags', c.tags,
                        'last_activity_at', c.last_activity_at, 'created_at', c.created_at)
                 from public.marketing_contacts c
                where c.id = o.contact_id),
             'assigned_profile', (
               select jsonb_build_object('id', p.id, 'first_name', p.first_name,
                                         'last_name', p.last_name, 'avatar_url', p.avatar_url)
                 from public.profiles p
                where p.id = o.assigned_to),
             'call_center_profile', (
               select jsonb_build_object('id', p.id, 'first_name', p.first_name,
                                         'last_name', p.last_name, 'avatar_url', p.avatar_url)
                 from public.profiles p
                where p.id = o.call_center_id),
             'notes_count', (
               select count(*)
                 from public.marketing_contact_notes n
                where n.opportunity_id = o.id and n.company_id = o.company_id),
             'documents_count', (
               select count(*)
                 from public.marketing_documents d
                where d.opportunity_id = o.id and d.company_id = o.company_id),
             'next_appointment', (
               select jsonb_build_object('date', a.appointment_date, 'time', a.appointment_time)
                 from public.appointments a
                where a.company_id = o.company_id
                  and a.contact_id = o.contact_id
                  and a.appointment_date >= (now() at time zone 'Europe/Rome')::date
                  and a.status <> 'annullato'
                order by a.appointment_date, a.appointment_time nulls last
                limit 1)
           )
           order by array_position(p_ids, o.id)), '[]'::jsonb)
    from public.marketing_opportunities o
   where o.id = any (p_ids)
$$;

-- Ordinamento da una lista chiusa: nel testo delle query entra solo uno di
-- questi frammenti, mai quello che arriva dal browser.
create or replace function public.opportunita_ordine_sql(p_ordine text, p_direzione text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_ordine
    when 'name' then 'lower(coalesce(o.name, '''')) ' || case when lower(coalesce(p_direzione, 'desc')) = 'asc' then 'asc' else 'desc' end
    when 'value' then 'coalesce(o.value, 0) ' || case when lower(coalesce(p_direzione, 'desc')) = 'asc' then 'asc' else 'desc' end
    when 'updated_at' then 'o.updated_at ' || case when lower(coalesce(p_direzione, 'desc')) = 'asc' then 'asc nulls first' else 'desc nulls last' end
    else 'o.created_at ' || case when lower(coalesce(p_direzione, 'desc')) = 'asc' then 'asc nulls first' else 'desc nulls last' end
  end
$$;

create or replace function public.opportunita_pagina(
  p_pipeline uuid,
  p_filtri jsonb default '{}'::jsonb,
  p_fase uuid default null,
  p_ordine text default 'created_at',
  p_direzione text default 'desc',
  p_da integer default 0,
  p_quante integer default 50
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  -- Query costruita al momento: il pianificatore vede i filtri veri e scarta
  -- quelli vuoti, e con la colonna fissata usa l'indice (pipeline, fase, data).
  execute format(
    'select array(select o.id from public.opportunita_filtrate($1, $2) o %s order by %s, o.id limit $3 offset $4)',
    case when p_fase is null then '' else 'where o.stage_id = $5' end,
    public.opportunita_ordine_sql(p_ordine, p_direzione)
  )
  into v_ids
  using p_pipeline, coalesce(p_filtri, '{}'::jsonb),
        least(greatest(coalesce(p_quante, 50), 1), 200), greatest(coalesce(p_da, 0), 0), p_fase;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return '[]'::jsonb;
  end if;
  return public.opportunita_schede(v_ids);
end;
$$;

create or replace function public.opportunita_kanban(
  p_pipeline uuid,
  p_filtri jsonb default '{}'::jsonb,
  p_fasi uuid[] default null,
  p_ordine text default 'created_at',
  p_direzione text default 'desc',
  p_quante integer default 30
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if coalesce(array_length(p_fasi, 1), 0) = 0 then
    return '{}'::jsonb;
  end if;

  -- Le prime p_quante di ogni colonna richiesta, in ordine: fase per fase.
  execute format(
    'select array(select x.id from (select o.id, o.stage_id, row_number() over (partition by o.stage_id order by %s, o.id) as rn from public.opportunita_filtrate($1, $2) o where o.stage_id = any ($3)) x where x.rn <= $4 order by x.stage_id, x.rn)',
    public.opportunita_ordine_sql(p_ordine, p_direzione)
  )
  into v_ids
  using p_pipeline, coalesce(p_filtri, '{}'::jsonb), p_fasi, least(greatest(coalesce(p_quante, 30), 1), 100);

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return '{}'::jsonb;
  end if;

  return coalesce((
    select jsonb_object_agg(g.fase, g.schede)
      from (select s.scheda->>'stage_id' as fase,
                   jsonb_agg(s.scheda order by s.posizione) as schede
              from jsonb_array_elements(public.opportunita_schede(v_ids)) with ordinality as s(scheda, posizione)
             group by s.scheda->>'stage_id') g
  ), '{}'::jsonb);
end;
$$;

revoke all on function public.opportunita_schede(uuid[]) from public, anon;
revoke all on function public.opportunita_ordine_sql(text, text) from public, anon;
revoke all on function public.opportunita_kanban(uuid, jsonb, uuid[], text, text, integer) from public, anon;

grant execute on function public.opportunita_schede(uuid[]) to authenticated, service_role;
grant execute on function public.opportunita_ordine_sql(text, text) to authenticated, service_role;
grant execute on function public.opportunita_kanban(uuid, jsonb, uuid[], text, text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
