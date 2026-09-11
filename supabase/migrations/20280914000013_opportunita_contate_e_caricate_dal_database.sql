-- La pagina Opportunità scaricava le opportunità nel browser 500 alla volta e
-- si fermava a 1.500. Con le 17.879 del «Nuovo» di BeMade ogni colonna ne
-- mostrava una piccola parte, e i numeri in alto (Aperte, Vinte, Pipeline, In
-- stallo…) erano calcolati solo su quelle 1.500: «100% win-rate», «0 perse».
--
-- Ora il conto e i filtri li fa il database:
--   · opportunita_filtrate  — le opportunità di una pipeline che passano i
--                             filtri della pagina (ricerca, stato, persone,
--                             fonte, valore, date, etichette, «Da fare»,
--                             «In stallo»). È la regola unica: le funzioni
--                             qui sotto la usano tutte, così numeri e schede
--                             non possono divergere;
--   · opportunita_riepilogo — i numeri della striscia e il conteggio di ogni
--                             colonna, esatti su tutte le opportunità;
--   · opportunita_pagina    — una pagina di schede di una colonna (o della
--                             lista), già con contatto, persone, note,
--                             documenti e prossimo appuntamento: una chiamata
--                             sola invece di cinque;
--   · opportunita_ids       — gli id di tutte quelle filtrate (o di una
--                             colonna), per «Seleziona tutti»;
--   · opportunita_etichette — le etichette usate, per il pannello Filtri.
--
-- Sono SECURITY INVOKER: le regole di visibilità (RLS) valgono come prima, e
-- chi vede solo le proprie opportunità continua a vedere solo quelle.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Nessun indice copriva la pipeline: ogni colonna leggeva tutte le
-- opportunità dell'azienda. Questo serve alle colonne ordinate per data.
create index if not exists idx_mkt_opp_pipeline_stage_created
  on public.marketing_opportunities (pipeline_id, stage_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_marketing_documents_opportunity
  on public.marketing_documents (opportunity_id);

-- La regola «utente bloccato» (20280908…) chiamava utente_bloccato() su OGNI
-- riga letta: sul «Nuovo» di BeMade 17.882 chiamate per un solo conteggio,
-- quasi un secondo. Tra parentesi con SELECT il database la calcola una volta
-- per query. Stesso significato: se l'utente è bloccato non vede niente.
-- Qui solo le tabelle che la pagina Opportunità legge.
alter policy blocco_utente_bloccato on public.marketing_opportunities
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
alter policy blocco_utente_bloccato on public.marketing_contacts
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
alter policy blocco_utente_bloccato on public.marketing_contact_notes
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
alter policy blocco_utente_bloccato on public.marketing_pipelines
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
alter policy blocco_utente_bloccato on public.marketing_pipeline_stages
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
alter policy blocco_utente_bloccato on public.marketing_documents
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
alter policy blocco_utente_bloccato on public.appointments
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- Niente «set search_path» qui, e nomi tutti qualificati: una funzione SQL con
-- un SET non viene espansa dal pianificatore dentro la query che la chiama, e
-- allora il filtro sulla colonna non userebbe l'indice.
create or replace function public.opportunita_filtrate(
  p_pipeline uuid,
  p_filtri jsonb default '{}'::jsonb
)
returns setof public.marketing_opportunities
language sql
stable
as $$
  select o.*
    from public.marketing_opportunities o
   where o.pipeline_id = p_pipeline
     and o.deleted_at is null
     -- Ricerca: ogni parola scritta deve comparire in almeno un campo.
     and (coalesce(btrim(p_filtri->>'cerca'), '') = ''
          or not exists (
            select 1
              from unnest(string_to_array(lower(btrim(p_filtri->>'cerca')), ' ')) as parola
             where parola <> ''
               and strpos(lower(concat_ws(' ', o.name, o.source, o.company_name,
                     (select concat_ws(' ', c.first_name, c.last_name, c.email, c.phone, c.company_name)
                        from public.marketing_contacts c
                       where c.id = o.contact_id))), parola) = 0))
     and (coalesce(jsonb_array_length(p_filtri->'stati'), 0) = 0
          or o.status in (select jsonb_array_elements_text(p_filtri->'stati')))
     and (coalesce(p_filtri->>'venditore', '') = '' or o.assigned_to = (p_filtri->>'venditore')::uuid)
     and (coalesce(p_filtri->>'follower', '') = '' or o.follower_id = (p_filtri->>'follower')::uuid)
     and (coalesce(p_filtri->>'call_center', '') = '' or o.call_center_id = (p_filtri->>'call_center')::uuid)
     and (coalesce(p_filtri->>'fonte', '') = ''
          or strpos(lower(coalesce(o.source, '')), lower(p_filtri->>'fonte')) > 0)
     and (coalesce(p_filtri->>'valore_min', '') = '' or coalesce(o.value, 0) >= (p_filtri->>'valore_min')::numeric)
     and (coalesce(p_filtri->>'valore_max', '') = '' or coalesce(o.value, 0) <= (p_filtri->>'valore_max')::numeric)
     -- Le date del filtro sono giorni italiani, non UTC.
     and (coalesce(p_filtri->>'dal', '') = ''
          or o.created_at >= ((p_filtri->>'dal')::date::timestamp at time zone 'Europe/Rome'))
     and (coalesce(p_filtri->>'al', '') = ''
          or o.created_at < (((p_filtri->>'al')::date + 1)::timestamp at time zone 'Europe/Rome'))
     and (coalesce(jsonb_array_length(p_filtri->'tag'), 0) = 0
          or exists (select 1
                       from unnest(o.tags) as t
                      where lower(btrim(regexp_replace(t, '\s+', ' ', 'g')))
                            in (select jsonb_array_elements_text(p_filtri->'tag'))))
     -- «I miei deal» e «vede solo i propri»: venditore, call center o follower
     -- (stesso criterio delle regole del database, 20280914000010).
     and (coalesce(p_filtri->>'miei', '') = ''
          or (p_filtri->>'miei')::uuid in (o.assigned_to, o.call_center_id, o.follower_id))
     and (coalesce(p_filtri->>'visibili_a', '') = ''
          or (p_filtri->>'visibili_a')::uuid in (o.assigned_to, o.call_center_id, o.follower_id))
     -- I due filtri della striscia: «Da fare» (prossima azione scaduta) e
     -- «In stallo» (ferma nella fase oltre la soglia della fase, 14 giorni se
     -- non impostata). Le soglie si leggono UNA volta, come mappa fase→giorni:
     -- cercarle riga per riga faceva scattare le regole di visibilità delle
     -- fasi a ogni opportunità (mezzo secondo in più per un operatore).
     and (case p_filtri->>'striscia'
            when 'azioni_scadute' then
              o.status = 'open' and o.next_action_date < (now() at time zone 'Europe/Rome')::date
            when 'stallo' then
              o.status = 'open'
              and coalesce(o.stage_changed_at, o.updated_at, o.created_at)
                  < now() - make_interval(days => coalesce(
                      ((select jsonb_object_agg(s.id, nullif(s.stalled_threshold_days, 0))
                          from public.marketing_pipeline_stages s
                         where s.pipeline_id = p_pipeline) ->> o.stage_id::text)::int, 14))
            else true
          end)
$$;

create or replace function public.opportunita_riepilogo(
  p_pipeline uuid,
  p_filtri jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_riepilogo jsonb;
begin
  -- Query costruita al momento (EXECUTE): il pianificatore vede i filtri veri
  -- e toglie di mezzo quelli vuoti invece di valutarli riga per riga.
  execute $q$
    with soglie as materialized (
      select coalesce(jsonb_object_agg(s.id, nullif(s.stalled_threshold_days, 0)), '{}'::jsonb) as giorni
        from public.marketing_pipeline_stages s
       where s.pipeline_id = $1
    ),
    base as materialized (
      select o.stage_id,
             o.status,
             coalesce(o.value, 0)::numeric as valore,
             o.probability,
             coalesce(o.status = 'open'
               and o.next_action_date < (now() at time zone 'Europe/Rome')::date, false) as scaduta,
             coalesce(o.status = 'open'
               and coalesce(o.stage_changed_at, o.updated_at, o.created_at)
                   < now() - make_interval(days => coalesce(((select giorni from soglie) ->> o.stage_id::text)::int, 14)), false) as in_stallo
        from public.opportunita_filtrate($1, $2) o
    ),
    -- Le colonne mostrano quello che resta DOPO il filtro della striscia; i
    -- numeri della striscia no, altrimenti cliccando «In stallo» le altre
    -- caselle andrebbero a zero.
    visibili as (
      select *
        from base
       where case $3
               when 'stallo' then in_stallo
               when 'azioni_scadute' then scaduta
               else true
             end
    )
    select jsonb_build_object(
      'totale', (select count(*) from visibili),
      'per_fase', coalesce((
          select jsonb_object_agg(f.stage_id, jsonb_build_object('n', f.n, 'valore', f.valore))
            from (select stage_id, count(*) as n, sum(valore) as valore
                    from visibili
                   where stage_id is not null
                   group by stage_id) f
        ), '{}'::jsonb),
      'aperte', count(*) filter (where status = 'open'),
      'vinte', count(*) filter (where status = 'won'),
      'perse', count(*) filter (where status = 'lost'),
      'abbandonate', count(*) filter (where status = 'abandoned'),
      'valore_pipeline', coalesce(sum(valore) filter (where status = 'open'), 0),
      -- Probabilità non impostata = 50%, come nella striscia di prima.
      'valore_ponderato', coalesce(sum(valore * greatest(0, least(100, coalesce(probability, 50))) / 100.0)
                                   filter (where status = 'open'), 0),
      'senza_stima', count(*) filter (where status = 'open' and probability is null),
      'valore_vinto', coalesce(sum(valore) filter (where status = 'won'), 0),
      'in_stallo', count(*) filter (where in_stallo),
      'azioni_scadute', count(*) filter (where scaduta)
    )
    from base
  $q$
  into v_riepilogo
  using p_pipeline, coalesce(p_filtri, '{}'::jsonb) - 'striscia', coalesce(p_filtri->>'striscia', '');

  return v_riepilogo;
end;
$$;

-- Le etichette usate nella pipeline, per il pannello Filtri. A parte dal
-- riepilogo: servono solo quando il pannello si apre, non a ogni spostamento.
create or replace function public.opportunita_etichette(p_pipeline uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(z.t order by z.t), '[]'::jsonb)
    from (select distinct lower(btrim(regexp_replace(x, '\s+', ' ', 'g'))) as t
            from public.marketing_opportunities o
           cross join lateral unnest(o.tags) as x
           where o.pipeline_id = p_pipeline
             and o.deleted_at is null) z
   where z.t <> ''
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
  v_da     integer := greatest(coalesce(p_da, 0), 0);
  v_quante integer := least(greatest(coalesce(p_quante, 50), 1), 200);
  v_asc    boolean := lower(coalesce(p_direzione, 'desc')) = 'asc';
  v_ordine text;
  v_ids    uuid[];
  v_oggi   date := (now() at time zone 'Europe/Rome')::date;
begin
  -- Ordinamento da una lista chiusa: nel testo della query entra solo uno di
  -- questi quattro frammenti, mai quello che arriva dal browser.
  v_ordine := case p_ordine
    when 'name' then 'lower(coalesce(o.name, '''')) ' || case when v_asc then 'asc' else 'desc' end
    when 'value' then 'coalesce(o.value, 0) ' || case when v_asc then 'asc' else 'desc' end
    when 'updated_at' then 'o.updated_at ' || case when v_asc then 'asc nulls first' else 'desc nulls last' end
    else 'o.created_at ' || case when v_asc then 'asc nulls first' else 'desc nulls last' end
  end;

  -- Query costruita al momento: il pianificatore vede i filtri veri e scarta
  -- quelli vuoti (la ricerca, se non si cerca niente, non costa nulla), e con
  -- la colonna fissata usa l'indice (pipeline, fase, data).
  execute format(
    'select array(select o.id from public.opportunita_filtrate($1, $2) o %s order by %s, o.id limit $3 offset $4)',
    case when p_fase is null then '' else 'where o.stage_id = $5' end,
    v_ordine
  )
  into v_ids
  using p_pipeline, coalesce(p_filtri, '{}'::jsonb), v_quante, v_da, p_fase;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return '[]'::jsonb;
  end if;

  -- Stessa forma che la pagina riceveva prima (tabella + contatto + le
  -- aggiunte di enrichPage), così schede, lista e dettaglio non cambiano.
  return coalesce((
    select jsonb_agg(
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
                    and a.appointment_date >= v_oggi
                    and a.status <> 'annullato'
                  order by a.appointment_date, a.appointment_time nulls last
                  limit 1)
             )
             order by array_position(v_ids, o.id))
      from public.marketing_opportunities o
     where o.id = any (v_ids)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.opportunita_ids(
  p_pipeline uuid,
  p_filtri jsonb default '{}'::jsonb,
  p_fase uuid default null
)
returns uuid[]
language plpgsql
stable
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  execute format(
    'select coalesce(array_agg(o.id), ''{}''::uuid[]) from public.opportunita_filtrate($1, $2) o %s',
    case when p_fase is null then '' else 'where o.stage_id = $3' end
  )
  into v_ids
  using p_pipeline, coalesce(p_filtri, '{}'::jsonb), p_fase;
  return v_ids;
end;
$$;

revoke all on function public.opportunita_filtrate(uuid, jsonb) from public, anon;
revoke all on function public.opportunita_riepilogo(uuid, jsonb) from public, anon;
revoke all on function public.opportunita_pagina(uuid, jsonb, uuid, text, text, integer, integer) from public, anon;
revoke all on function public.opportunita_ids(uuid, jsonb, uuid) from public, anon;
revoke all on function public.opportunita_etichette(uuid) from public, anon;

grant execute on function public.opportunita_filtrate(uuid, jsonb) to authenticated, service_role;
grant execute on function public.opportunita_riepilogo(uuid, jsonb) to authenticated, service_role;
grant execute on function public.opportunita_pagina(uuid, jsonb, uuid, text, text, integer, integer) to authenticated, service_role;
grant execute on function public.opportunita_ids(uuid, jsonb, uuid) to authenticated, service_role;
grant execute on function public.opportunita_etichette(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
