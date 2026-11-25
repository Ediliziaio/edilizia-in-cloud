-- Carico e scarico del rapportino trasporti con la posizione esatta (25/11/2026).
--
-- Il campo carico/scarico usa la stessa ricerca indirizzi del resto dell'app: scelto un indirizzo
-- dall'elenco, il viaggio del rapportino porta anche caricoLat/caricoLng e scaricoLat/scaricoLng.
-- Qui quelle coordinate arrivano fino alla mappa:
--   1. mezzi_viaggi_valida_tratte tiene da_lat/da_lng/a_lat/a_lng nelle tratte (prima le scartava:
--      ricostruisce ogni tratta coi soli campi noti);
--   2. private.rapportino_registro_viaggi le copia dalla voce del rapportino alla tratta del registro;
--   3. mezzi_storico_percorsi usa la posizione della tratta prima di cercare sede o cantiere per nome,
--      così «Via Roma 1, Morengo» ha un punto sulla mappa anche se non è un cantiere.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function private.viaggio_coordinate(p_viaggio jsonb, p_luogo text, p_lato text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_viaggio->(p_luogo || 'Lat')) = 'number' and jsonb_typeof(p_viaggio->(p_luogo || 'Lng')) = 'number'
     and (p_viaggio->>(p_luogo || 'Lat'))::numeric between -85 and 85
     and (p_viaggio->>(p_luogo || 'Lng'))::numeric between -180 and 180
    then jsonb_build_object(p_lato || '_lat', (p_viaggio->>(p_luogo || 'Lat'))::numeric,
                            p_lato || '_lng', (p_viaggio->>(p_luogo || 'Lng'))::numeric)
    else '{}'::jsonb end
$$;
revoke all on function private.viaggio_coordinate(jsonb, text, text) from public, anon, authenticated;

create or replace function public.mezzi_viaggi_valida_tratte()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare t jsonb; risultato jsonb:='[]'::jsonb; posizione jsonb;
begin
 if not exists(select 1 from public.mezzi m where m.id=new.mezzo_id and m.company_id=new.company_id) then raise exception 'Mezzo di altra azienda'; end if;
 if new.conducente_hr_id is not null and not exists(select 1 from public.hr_profili hp where hp.id=new.conducente_hr_id and hp.company_id=new.company_id) then raise exception 'Conducente di altra azienda'; end if;
 if jsonb_typeof(new.tratte) is distinct from 'array' or jsonb_array_length(new.tratte) not between 1 and 30 then raise exception 'Elenco tratte non valido'; end if;
 for t in select value from jsonb_array_elements(new.tratte) loop
  if jsonb_typeof(t) is distinct from 'object' or jsonb_typeof(t->'id') is distinct from 'string'
    or jsonb_typeof(t->'da') is distinct from 'string' or jsonb_typeof(t->'a') is distinct from 'string'
    or coalesce(jsonb_typeof(t->'order_id'),'null') not in ('string','null')
    or coalesce(jsonb_typeof(t->'km'),'null') not in ('number','null')
    or coalesce(jsonb_typeof(t->'minuti'),'null') not in ('number','null') then raise exception 'Formato della tratta non valido: km e minuti devono essere numeri, i luoghi devono essere testo'; end if;
  if nullif(t->>'order_id','') is not null and not exists(select 1 from public.orders o where o.id=(t->>'order_id')::uuid and o.company_id=new.company_id) then raise exception 'Commessa di altra azienda'; end if;
  -- La posizione scelta dalla ricerca indirizzi (25/11/2026): si tiene solo se entrambe le coordinate sono valide.
  posizione := '{}'::jsonb;
  if jsonb_typeof(t->'da_lat')='number' and jsonb_typeof(t->'da_lng')='number'
     and (t->>'da_lat')::numeric between -85 and 85 and (t->>'da_lng')::numeric between -180 and 180 then
    posizione := posizione || jsonb_build_object('da_lat',(t->>'da_lat')::numeric,'da_lng',(t->>'da_lng')::numeric);
  end if;
  if jsonb_typeof(t->'a_lat')='number' and jsonb_typeof(t->'a_lng')='number'
     and (t->>'a_lat')::numeric between -85 and 85 and (t->>'a_lng')::numeric between -180 and 180 then
    posizione := posizione || jsonb_build_object('a_lat',(t->>'a_lat')::numeric,'a_lng',(t->>'a_lng')::numeric);
  end if;
  risultato:=risultato||jsonb_build_array(jsonb_build_object('id',t->>'id','da',trim(t->>'da'),'a',trim(t->>'a'),
    'order_id',(t->>'order_id')::uuid,'km',(t->>'km')::numeric,'minuti',(t->>'minuti')::numeric,
    'destinazione',t->>'destinazione','fonte',t->>'fonte') || posizione);
 end loop;
 new.tratte:=risultato;
 return new;
end $function$;

create or replace function private.rapportino_registro_viaggi(p_rapportino uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.campo_rapportini;
  g record;
  v public.mezzi_viaggi;
  approvato boolean;
  autore uuid;
  minuti numeric;
  inizio timestamptz;
  fine timestamptz;
  tenuti uuid[] := '{}';
begin
  select * into r from public.campo_rapportini where id = p_rapportino;
  if not found then return; end if;
  approvato := r.annullato_at is null and (r.stato = 'approvato' or (r.stato is null and r.approvato is true));
  autore := coalesce((select auth.uid()), r.approvato_da, r.ufficio_created_by, r.user_id);

  if approvato and autore is not null and exists (select 1 from public.profiles p where p.id = autore) then
    for g in
      select mz.id mezzo_id,
        jsonb_agg(jsonb_build_object(
          'id', 'rapportino-' || vl.id::text,
          'da', left(coalesce(nullif(btrim(vl.viaggio->>'carico'), ''), 'Sede'), 250),
          'a', left(coalesce(nullif(btrim(vl.viaggio->>'scarico'), ''),
                 nullif(concat_ws(' · ', o.order_code, nullif(btrim(o.work_address), '')), ''), 'Cantiere'), 250),
          'order_id', r.order_id,
          'km', case when jsonb_typeof(vl.viaggio->'km') = 'number' and (vl.viaggio->>'km')::numeric between 0 and 10000
                     then (vl.viaggio->>'km')::numeric end,
          'minuti', case when jsonb_typeof(vl.viaggio->'oreMezzo') = 'number' and (vl.viaggio->>'oreMezzo')::numeric between 0 and 48
                         then round((vl.viaggio->>'oreMezzo')::numeric * 60) end,
          'destinazione', 'commessa',
          'fonte', 'dichiarati'
        ) || private.viaggio_coordinate(vl.viaggio, 'carico', 'da')
          || private.viaggio_coordinate(vl.viaggio, 'scarico', 'a') order by vl.created_at, vl.id) tratte,
        count(*) quante
      from public.rapportino_voci_libere vl
      join public.mezzi mz
        on mz.id::text = vl.viaggio->>'mezzoId' and mz.company_id = r.company_id and mz.deleted_at is null
       and mz.contatore_unita = 'km' and mz.tipo in ('autovettura', 'furgone', 'autocarro', 'altro')
      join public.orders o on o.id = r.order_id and o.company_id = r.company_id
      where vl.rapportino_id = r.id
        and jsonb_typeof(vl.viaggio) = 'object'
        and (vl.viaggio->>'mezzoId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      group by mz.id
    loop
      if g.quante > 30 then continue; end if;
      select coalesce(sum((t->>'minuti')::numeric), 0) into minuti
        from jsonb_array_elements(g.tratte) t where jsonb_typeof(t->'minuti') = 'number';
      inizio := (r.data_lavoro + time '07:00') at time zone 'Europe/Rome';
      fine := inizio + make_interval(mins => least(greatest(minuti, 30), 47 * 60)::int);

      select * into v from public.mezzi_viaggi where rapportino_id = r.id and mezzo_id = g.mezzo_id for update;
      if found then
        tenuti := tenuti || v.id;
        if v.stato = 'verificato' then continue; end if;
        if v.stato = 'inviato' and v.tratte = g.tratte and v.partenza = inizio and v.arrivo = fine then continue; end if;
        update public.mezzi_viaggi
           set tratte = g.tratte, partenza = inizio, arrivo = fine, stato = 'inviato',
               versione = versione + 1, ultimo_token = gen_random_uuid(), updated_at = now()
         where id = v.id returning * into v;
      else
        insert into public.mezzi_viaggi (id, company_id, mezzo_id, created_by, partenza, arrivo, tratte, note,
                                         stato, ultimo_token, ultima_richiesta, rapportino_id)
        values (gen_random_uuid(), r.company_id, g.mezzo_id, autore, inizio, fine, g.tratte,
                'Dal rapportino del ' || to_char(r.data_lavoro, 'DD/MM/YYYY'),
                'inviato', gen_random_uuid(), '{}'::jsonb, r.id)
        returning * into v;
        tenuti := tenuti || v.id;
      end if;
      insert into public.mezzi_viaggi_eventi (company_id, viaggio_id, actor, versione, azione, motivo, fotografia)
      values (v.company_id, v.id, autore, v.versione, 'invia', 'Dal rapportino approvato',
              to_jsonb(v) - 'ultima_richiesta' - 'ultimo_token');
    end loop;
  end if;

  -- Quello che il rapportino non porta più: annullato, salvo i viaggi già verificati dall'ufficio.
  for v in
    select * from public.mezzi_viaggi
     where rapportino_id = r.id and stato in ('bozza', 'inviato') and not (id = any(tenuti))
     for update
  loop
    update public.mezzi_viaggi
       set stato = 'annullato', versione = versione + 1, ultimo_token = gen_random_uuid(), updated_at = now()
     where id = v.id returning * into v;
    insert into public.mezzi_viaggi_eventi (company_id, viaggio_id, actor, versione, azione, motivo, fotografia)
    values (v.company_id, v.id, coalesce(autore, v.created_by), v.versione, 'annulla', 'Rapportino non più approvato o viaggio tolto',
            to_jsonb(v) - 'ultima_richiesta' - 'ultimo_token');
  end loop;
end
$$;
revoke all on function private.rapportino_registro_viaggi(uuid) from public, anon, authenticated;

do $$
declare
  definizione text := pg_get_functiondef('public.mezzi_storico_percorsi(uuid,uuid,date,date,integer)'::regprocedure);
  prima constant text := $s$case when lower(btrim(lato.nome)) in ('sede','sede operativa')$s$;
  dopo constant text := $s$case when jsonb_typeof(t.valore->(lato.campo||'_lat'))='number' and jsonb_typeof(t.valore->(lato.campo||'_lng'))='number'
        then jsonb_build_object('lat',(t.valore->>(lato.campo||'_lat'))::numeric,'lng',(t.valore->>(lato.campo||'_lng'))::numeric,'fonte','Indirizzo scelto')
        when lower(btrim(lato.nome)) in ('sede','sede operativa')$s$;
begin
  if strpos(definizione, dopo) > 0 then return; end if;
  if strpos(definizione, prima) = 0 then
    raise exception 'Non trovo il punto della sede in mezzi_storico_percorsi';
  end if;
  execute replace(definizione, prima, dopo);
end $$;
