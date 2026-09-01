-- WhatsApp Locale: i thread arrivano aggregati dal database.
--
-- Prima la pagina scaricava gli ultimi 1000 messaggi e li raggruppava in
-- JavaScript. Con l'uso vero significa due cose: le conversazioni piu' vecchie
-- del millesimo messaggio spariscono dalla lista (non "sono in fondo": non
-- esistono proprio), e la ricerca puo' guardare solo cio' che e' gia' in
-- memoria. Qui l'aggregazione torna dove deve stare.

create or replace function public.openwa_threads_lista(
  p_limit      integer default 50,
  p_offset     integer default 0,
  p_stato      text    default 'aperta',   -- 'aperta' | 'chiusa' | 'tutte'
  p_assegnato  uuid    default null,       -- filtra per assegnatario
  p_solo_non_letti boolean default false
)
returns table (
  wa_chat_id     text,
  contact_phone  text,
  contact_name   text,
  contact_id     uuid,
  number_id      uuid,
  ultimo_testo   text,
  ultimo_at      timestamptz,
  ultima_direzione text,
  non_letti      bigint,
  totale         bigint,
  stato          text,
  assegnato_a    uuid,
  assegnato_nome text,
  note_count     bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Stesso perimetro delle altre letture del canale: solo super admin.
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;

  return query
  with agg as (
    select m.wa_chat_id,
           max(m.created_at) as ultimo_at,
           count(*) as totale,
           count(*) filter (where m.direction = 'inbound' and m.read_at is null) as non_letti,
           -- Il numero e il nome vengono dal messaggio piu' recente che ce li ha:
           -- i primi messaggi di una chat possono non averli ancora.
           (array_agg(m.contact_phone order by m.created_at desc)
              filter (where m.contact_phone is not null))[1] as contact_phone,
           (array_agg(m.contact_name order by m.created_at desc)
              filter (where m.contact_name is not null))[1] as contact_name,
           (array_agg(m.contact_id order by m.created_at desc)
              filter (where m.contact_id is not null))[1] as contact_id,
           (array_agg(m.number_id order by m.created_at desc)
              filter (where m.number_id is not null))[1] as number_id
    from public.openwa_messages m
    group by m.wa_chat_id
  ),
  ultimo as (
    select distinct on (m.wa_chat_id)
           m.wa_chat_id,
           coalesce(nullif(m.body, ''), case when m.media_url is not null then '📎 media' else '' end) as testo,
           m.direction
    from public.openwa_messages m
    order by m.wa_chat_id, m.created_at desc
  )
  select a.wa_chat_id, a.contact_phone, a.contact_name, a.contact_id, a.number_id,
         u.testo, a.ultimo_at, u.direction,
         a.non_letti, a.totale,
         coalesce(c.stato, 'aperta'),
         c.assegnato_a,
         nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
         coalesce(n.n, 0)
  from agg a
  join ultimo u on u.wa_chat_id = a.wa_chat_id
  left join public.openwa_conversazioni c on c.wa_chat_id = a.wa_chat_id
  left join public.profiles p on p.id = c.assegnato_a
  left join lateral (
    select count(*) as n from public.openwa_note nt where nt.wa_chat_id = a.wa_chat_id
  ) n on true
  where (p_stato = 'tutte' or coalesce(c.stato, 'aperta') = p_stato)
    and (p_assegnato is null or c.assegnato_a = p_assegnato)
    and (not p_solo_non_letti or a.non_letti > 0)
  order by a.ultimo_at desc
  limit greatest(1, least(p_limit, 200))
  offset greatest(0, p_offset);
end;
$$;

comment on function public.openwa_threads_lista is
  'WhatsApp Locale: conversazioni aggregate lato DB, con stato, assegnatario e non letti. Sostituisce il raggruppamento nel browser.';

-- Ricerca DENTRO i testi: prima si cercava solo fra i thread gia' caricati,
-- quindi un messaggio di tre mesi fa era irraggiungibile.
create or replace function public.openwa_cerca_messaggi(
  p_query text,
  p_limit integer default 40
)
returns table (
  wa_chat_id    text,
  contact_phone text,
  contact_name  text,
  testo         text,
  direction     text,
  created_at    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  if coalesce(trim(p_query), '') = '' then return; end if;

  return query
  select m.wa_chat_id, m.contact_phone, m.contact_name, m.body, m.direction, m.created_at
  from public.openwa_messages m
  where m.body ilike '%' || trim(p_query) || '%'
  order by m.created_at desc
  limit greatest(1, least(p_limit, 100));
end;
$$;

comment on function public.openwa_cerca_messaggi is
  'WhatsApp Locale: cerca nel testo dei messaggi (indice trigram su body).';

grant execute on function public.openwa_threads_lista to authenticated;
grant execute on function public.openwa_cerca_messaggi to authenticated;
