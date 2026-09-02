-- La lista thread era troncata a 200 righe: con 50 righe/pagina il pulsante
-- "Carica altre" spariva alla 5a pagina e le conversazioni oltre la 200a
-- erano irraggiungibili (anche dal deep link ?chat=).
CREATE OR REPLACE FUNCTION public.openwa_threads_lista(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_stato text DEFAULT 'aperta'::text, p_assegnato uuid DEFAULT NULL::uuid, p_solo_non_letti boolean DEFAULT false)
 RETURNS TABLE(wa_chat_id text, contact_phone text, contact_name text, contact_id uuid, number_id uuid, ultimo_testo text, ultimo_at timestamp with time zone, ultima_direzione text, non_letti bigint, totale bigint, stato text, assegnato_a uuid, assegnato_nome text, note_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Stesso perimetro delle altre letture del canale: solo super admin.
  if not public.is_platform_staff() then
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
  limit greatest(1, least(p_limit, 1000))
  offset greatest(0, p_offset);
end;
$function$;
