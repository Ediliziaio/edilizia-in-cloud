-- Kanban delle opportunità più leggero (censito di nuovo il 27/10/2026).
--
-- Preparata il 12/10/2026 e non applicata: nel frattempo opportunita_schede è cambiata (ci è stato aggiunto un
-- «offset 0» per non ricalcolare le richieste ripetute). Qui il censimento è rifatto sulle definizioni di oggi e
-- l'equivalenza riprovata in produzione, in transazioni annullate, contro quelle definizioni.
--
-- opportunita_kanban è la chiamata più frequente tra quelle pesanti: in media 407 ms, il 15% della CPU del
-- database, su una pipeline di circa 19.000 opportunità e 22 colonne, sette colonne a schermo:
--
--   call center (vede solo le sue):   194 ms di pianificazione + 343 ms
--   di cui: prime 30 per colonna       34 ms (legge e ordina 4.713 righe)
--           schede (opportunita_schede) ~300 ms, quasi tutto regole RLS
--
-- Quattro interventi, stesso risultato al byte:
--
-- 1. opportunita_kanban prende le prime p_quante di ogni colonna con una ricerca per colonna e LIMIT, invece di
--    numerare tutte le schede delle colonne richieste. Con l'ordinamento predefinito l'indice
--    idx_mkt_opp_pipeline_stage_created (pipeline, fase, created_at desc) dà già l'ordine e la lettura si ferma a
--    30 schede anche nelle colonne da migliaia di schede.
--
-- 2. opportunita_ordine_sql scrive «created_at desc» invece di «created_at desc nulls last» (e lo stesso per
--    updated_at e per asc): le due colonne sono NOT NULL, l'ordine è identico, e solo così l'indice serve anche
--    l'ordinamento. Un controllo qui sotto ferma la migrazione se una delle due colonne diventasse nullable.
--
-- 3. opportunita_schede in plpgsql: come funzione SQL viene ripianificata a ogni chiamata (circa 160 ms, per le
--    regole RLS di nove tabelle); in plpgsql il piano resta in cache sulla connessione. Le due letture dei
--    profili, le due degli appuntamenti e le due delle attività diventano una per tabella: meno regole da
--    espandere e da valutare. Il lavoro che l'«offset 0» di oggi fa per le richieste ripetute lo fa la LATERAL.
--
-- 4. contatti_seguiti_da_me in plpgsql: la usano le regole dei contatti per chi vede solo i propri. Come SQL si
--    ripianifica a ogni espansione delle regole (8 ms) e calcola le pipeline nascoste anche quando non ce ne
--    sono: in quel caso (quasi sempre) le quattro ricerche non hanno bisogno di leggere pipeline_id e bastano
--    gli indici.
--
-- Provato il 27/10/2026 in produzione, in transazioni annullate, con copie delle funzioni nuove in pg_temp
-- (niente policy: vedi la nota su supautils) e le funzioni vere chiamate come l'utente:
--   · opportunita_schede: 6 utenti (amministratori, staff, call center, venditori) × 40 opportunità → 0 differenze;
--   · opportunita_kanban: 72 chiamate (6 utenti × 2 pipeline × 5 ordinamenti + un filtro di ricerca) → 0 differenze;
--   · contatti_seguiti_da_me: 25 utenti, 4 dei quali con pipeline nascoste (entrambi i rami), 12.692 contatti
--     confrontati uno per uno → 0 differenze.
--
-- Rilanciabile: CREATE OR REPLACE con gli stessi parametri, GRANT invariati. Ogni funzione deve avere il corpo
-- censito il 27/10/2026 oppure esattamente quello nuovo (impronte md5 di entrambi); se è stata cambiata da altri
-- nel frattempo, la migrazione si ferma senza toccare niente.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare
  -- Per ogni funzione: [impronta del corpo censito il 27/10/2026, impronta del corpo nuovo].
  v_attese constant jsonb := jsonb_build_object(
    'public.opportunita_ordine_sql(text,text)', jsonb_build_array('dceda814f21254182dd320c622285109', '60aaf597f15cff37bfd34a2c89ab30c0'),
    'public.opportunita_kanban(uuid,jsonb,uuid[],text,text,integer)', jsonb_build_array('0446f7212d9d638e3478eb223681d8d8', '8f46d693d51e93a9cb1876ea48421aa4'),
    'public.opportunita_schede(uuid[])', jsonb_build_array('b1bb5c73a1ee864fb4884528423e674b', 'ac0cb1141fcd2ace4a3de0143e15fe91'),
    'public.contatti_seguiti_da_me()', jsonb_build_array('6a1aae843f7af1e25e7cd99d7c9de9c0', '6c9822cefcaa274bcb5174471cf66dba'));
  v_firma text;
  v_impronta text;
begin
  if exists (select 1 from pg_attribute
              where attrelid = 'public.marketing_opportunities'::regclass
                and attname in ('created_at', 'updated_at')
                and not attnotnull) then
    raise exception 'created_at o updated_at di marketing_opportunities accettano NULL: l''ordinamento senza «nulls last» non sarebbe più equivalente';
  end if;
  for v_firma in select jsonb_object_keys(v_attese) loop
    select md5(p.prosrc) into v_impronta
      from pg_proc p
     where p.oid = v_firma::regprocedure;
    if not (v_attese -> v_firma) ? v_impronta then
      raise exception 'Funzione % cambiata dopo il censimento del 27/10/2026 (impronta %): rivedere prima di sostituirla', v_firma, v_impronta;
    end if;
  end loop;
end $$;

CREATE OR REPLACE FUNCTION public.opportunita_ordine_sql(p_ordine text, p_direzione text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  -- created_at e updated_at sono NOT NULL: senza «nulls first/last» l'ordine è
  -- lo stesso e l'indice (pipeline, fase, created_at desc) lo può fornire.
  select case p_ordine
    when 'name' then 'lower(coalesce(o.name, '''')) ' || case when lower(coalesce(p_direzione, 'desc')) = 'asc' then 'asc' else 'desc' end
    when 'value' then 'coalesce(o.value, 0) ' || case when lower(coalesce(p_direzione, 'desc')) = 'asc' then 'asc' else 'desc' end
    when 'updated_at' then 'o.updated_at ' || case when lower(coalesce(p_direzione, 'desc')) = 'asc' then 'asc' else 'desc' end
    else 'o.created_at ' || case when lower(coalesce(p_direzione, 'desc')) = 'asc' then 'asc' else 'desc' end
  end
$function$;

CREATE OR REPLACE FUNCTION public.opportunita_kanban(p_pipeline uuid, p_filtri jsonb DEFAULT '{}'::jsonb, p_fasi uuid[] DEFAULT NULL::uuid[], p_ordine text DEFAULT 'created_at'::text, p_direzione text DEFAULT 'desc'::text, p_quante integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_ids uuid[];
begin
  if coalesce(array_length(p_fasi, 1), 0) = 0 then
    return '{}'::jsonb;
  end if;

  -- Le prime p_quante di ogni colonna richiesta, in ordine: una ricerca per
  -- colonna, che con l'indice (pipeline, fase, created_at) si ferma appena
  -- ha le schede che servono.
  execute format(
    'select coalesce(array_agg(x.id order by f.fase, x.rn), ''{}'') '
    'from (select distinct unnest($3) as fase) f '
    'cross join lateral ('
    '  select o.id, row_number() over (order by %1$s, o.id) as rn '
    '    from public.opportunita_filtrate($1, $2) o '
    '   where o.stage_id = f.fase '
    '   order by %1$s, o.id '
    '   limit $4) x',
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
$function$;

-- La forma della scheda del kanban e della lista (la stessa di enrichPage).
-- Le regole RLS valgono come prima: la funzione resta SECURITY INVOKER.
CREATE OR REPLACE FUNCTION public.opportunita_schede(p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
 SET plan_cache_mode TO 'force_generic_plan'
AS $function$
declare
  v_schede jsonb;
begin
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
             'assigned_profile', persone.per_id -> o.assigned_to::text,
             'call_center_profile', persone.per_id -> o.call_center_id::text,
             'notes_count', (
               select count(*)
                 from public.marketing_contact_notes n
                where n.opportunity_id = o.id and n.company_id = o.company_id and not n.automatica),
             'documents_count', (
               select count(*)
                 from public.marketing_documents d
                where d.opportunity_id = o.id and d.company_id = o.company_id),
             'next_appointment', appuntamenti.prossimo,
             'agenda', (
               select jsonb_build_object(
                        'appuntamenti', appuntamenti.quanti,
                        'attivita', count(*),
                        'scadute', count(*) filter (where t.due_date < (now() at time zone 'Europe/Rome')::date))
                 from public.tasks t
                where t.company_id = o.company_id
                  and t.status <> 'completata'
                  and (t.opportunity_id = o.id
                       or (t.opportunity_id is null and t.contact_id = o.contact_id))),
             'richiesta_ripetuta', (
               select case when r.richieste > 0 or r.altre > 0
                           then jsonb_build_object('richieste', r.richieste, 'ultima', r.ultima, 'altre_opportunita', r.altre)
                      end
                 from (select richieste.quante as richieste,
                              richieste.ultima,
                              (select count(*) from public.marketing_opportunities o2
                                where o2.contact_id = o.contact_id and o2.id <> o.id and o2.deleted_at is null) as altre
                      ) r)
           )
           order by array_position(p_ids, o.id)), '[]'::jsonb)
    into v_schede
    from public.marketing_opportunities o
    -- Venditore e call center in una sola lettura dei profili.
    left join lateral (
      select jsonb_object_agg(p.id::text, jsonb_build_object('id', p.id, 'first_name', p.first_name,
                                                             'last_name', p.last_name, 'avatar_url', p.avatar_url)) as per_id
        from public.profiles p
       where p.id in (o.assigned_to, o.call_center_id)
    ) persone on true
    -- Il prossimo appuntamento e quanti ce ne sono, in una sola lettura.
    left join lateral (
      select (array_agg(jsonb_build_object('date', a.appointment_date, 'time', a.appointment_time)
                        order by a.appointment_date, a.appointment_time nulls last))[1] as prossimo,
             count(*) as quanti
        from public.appointments a
       where a.company_id = o.company_id
         and a.contact_id = o.contact_id
         and a.appointment_date >= (now() at time zone 'Europe/Rome')::date
         and a.status <> 'annullato'
    ) appuntamenti on true
    -- Le richieste dai moduli: quante e l'ultima, in una sola lettura.
    left join lateral (
      select count(*) as quante, max(a.created_at) as ultima
        from public.marketing_contact_activities a
       where a.contact_id = o.contact_id and a.activity_type = 'lead_form_submission'
    ) richieste on true
   where o.id = any (p_ids);

  return v_schede;
end;
$function$;

-- I contatti delle opportunità che seguo (venditore, call center, follower o
-- squadra), fuori dalle pipeline che non vedo.
CREATE OR REPLACE FUNCTION public.contatti_seguiti_da_me()
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_io uuid := auth.uid();
  v_nascoste uuid[] := public.pipeline_nascoste();
  v_squadra uuid[] := public.membri_mie_squadre();
begin
  if coalesce(cardinality(v_nascoste), 0) = 0 then
    -- Nessuna pipeline nascosta: bastano gli indici (persona, contatto).
    return query
      select o.contact_id from public.marketing_opportunities o
       where o.assigned_to = v_io and o.deleted_at is null and o.contact_id is not null
      union
      select o.contact_id from public.marketing_opportunities o
       where o.call_center_id = v_io and o.deleted_at is null and o.contact_id is not null
      union
      select o.contact_id from public.marketing_opportunities o
       where o.follower_id = v_io and o.deleted_at is null and o.contact_id is not null
      union
      select o.contact_id from public.marketing_opportunities o
       where o.assigned_to = any (v_squadra) and o.deleted_at is null and o.contact_id is not null;
  else
    return query
      select o.contact_id from public.marketing_opportunities o
       where o.assigned_to = v_io and o.deleted_at is null and o.contact_id is not null
         and not coalesce(o.pipeline_id = any (v_nascoste), false)
      union
      select o.contact_id from public.marketing_opportunities o
       where o.call_center_id = v_io and o.deleted_at is null and o.contact_id is not null
         and not coalesce(o.pipeline_id = any (v_nascoste), false)
      union
      select o.contact_id from public.marketing_opportunities o
       where o.follower_id = v_io and o.deleted_at is null and o.contact_id is not null
         and not coalesce(o.pipeline_id = any (v_nascoste), false)
      union
      select o.contact_id from public.marketing_opportunities o
       where o.assigned_to = any (v_squadra) and o.deleted_at is null and o.contact_id is not null
         and not coalesce(o.pipeline_id = any (v_nascoste), false);
  end if;
end;
$function$;
