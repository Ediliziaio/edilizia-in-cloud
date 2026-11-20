-- L'arrivo dichiarato è parte del rapportino e non valorizza contachilometri,
-- ore, rimborsi o costi.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function private.controlla_arrivo_rapportino() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  arrivi jsonb;
  precedente jsonb;
  arrivo jsonb;
  mezzo uuid;
  ufficio boolean;
begin
  arrivi := jsonb_path_query_array(new.campi_extra, '$[*] ? (@.chiave == "__arrivo_cantiere_v1")');
  if jsonb_array_length(arrivi) = 0 then return new; end if;
  if new.lavoro_completato is true or nullif(btrim(new.firma_cliente_url),'') is not null then
    raise exception 'L’arrivo si dichiara nel rapportino giornaliero.' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    precedente := jsonb_path_query_array(old.campi_extra, '$[*] ? (@.chiave == "__arrivo_cantiere_v1")');
    if arrivi = precedente and new.company_id = old.company_id and new.order_id = old.order_id
      and new.user_id = old.user_id then return new; end if;
  end if;
  if jsonb_array_length(arrivi) <> 1 then
    raise exception 'Indica un solo mezzo per l’arrivo di questo rapportino.' using errcode = '22023';
  end if;
  arrivo := arrivi->0;
  if arrivo->>'tipo' is distinct from 'arrivo_cantiere'
    or coalesce(arrivo->>'mezzo_id','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or coalesce(jsonb_typeof(arrivo->'partenza'),'null') not in ('string','null')
    or length(coalesce(arrivo->>'partenza','')) > 150
    or coalesce(jsonb_typeof(arrivo->'km'),'null') not in ('number','null')
    or coalesce((arrivo->>'km')::numeric,0) not between 0 and 10000 then
    raise exception 'Controlla mezzo, partenza e chilometri dell’arrivo.' using errcode = '22023';
  end if;
  mezzo := (arrivo->>'mezzo_id')::uuid;
  ufficio := public.has_permission_for_company(auth.uid(),'can_edit_orders',new.company_id) is true
    and public._order_visible_under_rls(new.order_id,true) is true;
  if auth.uid() is null or coalesce(public.utente_bloccato(),true) or public.chiamante_anonimo() is true
    or coalesce(public.utente_sola_lettura(new.company_id),true)
    or not exists (select 1 from public.orders o where o.id = new.order_id and o.company_id = new.company_id and o.deleted_at is null)
    or not exists (select 1 from public.mezzi m where m.id = mezzo and m.company_id = new.company_id
      and m.deleted_at is null and m.contatore_unita = 'km' and m.tipo in ('furgone','autovettura','autocarro','altro'))
    or (not ufficio and not (
      new.user_id = auth.uid() and public.campo_lavoro_su_commessa(new.order_id) is true
      and exists(select 1 from public.campo_mezzi_ammessi(new.order_id) a where a.mezzo_id = mezzo)
    )) then
    raise exception 'Il mezzo di arrivo non è disponibile per questa commessa.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.controlla_arrivo_rapportino() from public, anon, authenticated;
create or replace trigger campo_rapportino_arrivo_valido
  before insert or update of campi_extra, company_id, order_id, user_id, lavoro_completato, firma_cliente_url on public.campo_rapportini
  for each row execute function private.controlla_arrivo_rapportino();

create table if not exists public.mezzi_arrivi_viaggi (
  arrivo_id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  viaggio_id uuid not null references public.mezzi_viaggi(id) on delete cascade,
  collegato_da uuid references public.profiles(id) on delete set null,
  collegato_il timestamptz not null default now()
);
alter table public.mezzi_arrivi_viaggi enable row level security;
revoke all on public.mezzi_arrivi_viaggi from public, anon, authenticated;
create index if not exists mezzi_arrivi_viaggi_company_idx on public.mezzi_arrivi_viaggi(company_id);
create index if not exists mezzi_arrivi_viaggi_order_idx on public.mezzi_arrivi_viaggi(order_id);
create index if not exists mezzi_arrivi_viaggi_viaggio_idx on public.mezzi_arrivi_viaggi(viaggio_id);
create index if not exists mezzi_arrivi_viaggi_collegato_da_idx on public.mezzi_arrivi_viaggi(collegato_da);

-- Lettura interna autorizzata dal chiamante. Un arrivo per veicolo, cantiere e
-- giorno anche quando il viaggio è dichiarato da più persone.
create or replace function private.arrivi_dichiarati(p_company uuid, p_order uuid, p_dal date, p_al date)
returns table (id uuid, giorno date, mezzo_id uuid, nome_mezzo text, partenza text, km numeric, rapportini bigint, discordanti boolean)
language sql stable security invoker set search_path = '' as $$
  with dichiarati as (
    select r.id as rapporto, r.data_lavoro, m.id as mezzo_id,
      concat_ws(' · ',m.nome,nullif(m.targa,'')) as nome_mezzo,
      nullif(trim(f.dati->>'partenza'),'') as partenza,
      case when jsonb_typeof(f.dati->'km') = 'number' then (f.dati->>'km')::numeric end as km
    from public.campo_rapportini r
    cross join lateral jsonb_array_elements(r.campi_extra) f(dati)
    join public.mezzi m on m.id = case
      when coalesce(f.dati->>'mezzo_id','') ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then (f.dati->>'mezzo_id')::uuid end
      and m.company_id = r.company_id and m.contatore_unita = 'km'
      and m.tipo in ('furgone','autovettura','autocarro','altro')
    where r.company_id = p_company and r.order_id = p_order
      and r.data_lavoro between p_dal and p_al and r.stato in ('inviato','approvato') and r.annullato_at is null
      and r.lavoro_completato is not true and nullif(btrim(r.firma_cliente_url),'') is null
      and r.campi_extra @> '[{"chiave":"__arrivo_cantiere_v1"}]'
      and f.dati->>'chiave' = '__arrivo_cantiere_v1' and f.dati->>'tipo' = 'arrivo_cantiere'
  )
  select md5(concat_ws('|','arrivo-rapportino-v1',p_company,p_order,to_char(d.data_lavoro,'YYYY-MM-DD'),d.mezzo_id))::uuid,
    d.data_lavoro, d.mezzo_id, d.nome_mezzo,
    case when count(distinct lower(d.partenza)) = 1 then min(d.partenza) end,
    case when count(distinct d.km) = 1 then min(d.km) end,
    count(distinct d.rapporto), count(distinct lower(d.partenza)) > 1 or count(distinct d.km) > 1
  from dichiarati d
  group by d.data_lavoro, d.mezzo_id, d.nome_mezzo
$$;
revoke all on function private.arrivi_dichiarati(uuid,uuid,date,date) from public, anon, authenticated;

create or replace function private.azienda_registro_viaggi(p_order uuid, p_modifica boolean)
returns uuid language plpgsql stable security invoker set search_path = '' as $$
declare azienda uuid;
begin
  select o.company_id into azienda from public.orders o where o.id = p_order and o.deleted_at is null;
  if azienda is null or auth.uid() is null or coalesce(public.utente_bloccato(),true) or public.chiamante_anonimo() is true
    or public.has_permission_for_company(auth.uid(),'can_view_mezzi',azienda) is not true
    or public.has_permission_for_company(auth.uid(),'can_view_orders',azienda) is not true
    or public._order_visible_under_rls(p_order,true) is not true
    or (p_modifica and (coalesce(public.utente_sola_lettura(azienda),true)
      or public.has_permission_for_company(auth.uid(),'can_edit_mezzi',azienda) is not true)) then
    raise exception 'Registro viaggi non accessibile.' using errcode = '42501';
  end if;
  return azienda;
end;
$$;
revoke all on function private.azienda_registro_viaggi(uuid,boolean) from public, anon, authenticated;

create or replace function public.mezzi_arrivi_da_rapportini(p_order uuid, p_dal date, p_al date, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare azienda uuid := private.azienda_registro_viaggi(p_order,false);
  righe jsonb;
begin
  if p_dal is null or p_al is null or p_al < p_dal or p_al - p_dal > 366
    or p_offset is null or p_offset not between 0 and 100000 then
    raise exception 'Periodo del registro non valido.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(riga order by giorno desc,id),'[]') into righe
  from (
    select a.giorno, a.id, jsonb_build_object(
      'id',a.id,'giorno',a.giorno,'mezzoId',a.mezzo_id,'nomeMezzo',a.nome_mezzo,
      'partenza',a.partenza,'km',a.km,'rapportini',a.rapportini,'datiDiscordanti',a.discordanti,
      'viaggioId', v.id, 'viaggioStato', v.stato,
      'richiedeCollegamento',v.id is null and exists (select 1 from public.mezzi_viaggi x where x.id=a.id),
      'viaggiCompatibili',case when v.id is null then coalesce((
        select jsonb_agg(jsonb_build_object('id',c.id,'partenza',c.partenza,'arrivo',c.arrivo) order by c.partenza,c.id)
        from (
          select x.id,x.partenza,x.arrivo from public.mezzi_viaggi x
          where x.company_id = azienda and x.mezzo_id = a.mezzo_id and x.stato in ('inviato','verificato')
            and x.tratte @> jsonb_build_array(jsonb_build_object('order_id',p_order,'destinazione','commessa'))
            and (x.arrivo at time zone 'Europe/Rome')::date = a.giorno
          order by x.partenza,x.id limit 20
        ) c
      ),'[]') else '[]'::jsonb end
    ) as riga
    from private.arrivi_dichiarati(azienda,p_order,p_dal,p_al) a
    left join public.mezzi_arrivi_viaggi l on l.arrivo_id = a.id and l.company_id = azienda and l.order_id = p_order
    left join lateral (
      select x.id,x.stato from public.mezzi_viaggi x
      where x.id in (l.viaggio_id,a.id) and x.company_id = azienda and x.mezzo_id = a.mezzo_id
        and x.stato <> 'annullato' and (x.arrivo at time zone 'Europe/Rome')::date = a.giorno
        and x.tratte @> jsonb_build_array(jsonb_build_object('order_id',p_order,'destinazione','commessa'))
      order by (x.id = a.id) desc limit 1
    ) v on true
    order by a.giorno desc,a.id limit 51 offset p_offset
  ) elenco;
  return jsonb_build_object('items',case when jsonb_array_length(righe)>50 then righe-50 else righe end,
    'has_more',jsonb_array_length(righe)>50);
end;
$$;
revoke all on function public.mezzi_arrivi_da_rapportini(uuid,date,date,integer) from public, anon;
grant execute on function public.mezzi_arrivi_da_rapportini(uuid,date,date,integer) to authenticated;

create or replace function public.mezzi_collega_arrivo_rapportino(p_order uuid, p_giorno date, p_arrivo uuid, p_viaggio uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare azienda uuid := private.azienda_registro_viaggi(p_order,true);
  a record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_arrivo::text,0));
  select * into a from private.arrivi_dichiarati(azienda,p_order,p_giorno,p_giorno) x where x.id = p_arrivo;
  if not found or not exists (
    select 1 from public.mezzi_viaggi v where v.id = p_viaggio and v.company_id = azienda
      and v.mezzo_id = a.mezzo_id and v.stato in ('inviato','verificato')
      and v.tratte @> jsonb_build_array(jsonb_build_object('order_id',p_order,'destinazione','commessa'))
      and (v.arrivo at time zone 'Europe/Rome')::date = a.giorno
  ) then raise exception 'Il viaggio non corrisponde a questo arrivo.' using errcode = '22023'; end if;
  if exists (select 1 from public.mezzi_viaggi v where v.id=p_arrivo and v.company_id=azienda and v.mezzo_id=a.mezzo_id
    and v.stato <> 'annullato' and (v.arrivo at time zone 'Europe/Rome')::date=a.giorno
    and v.tratte @> jsonb_build_array(jsonb_build_object('order_id',p_order,'destinazione','commessa'))) then
    raise exception 'Questo arrivo ha già un viaggio registrato.' using errcode = '22023';
  end if;
  insert into public.mezzi_arrivi_viaggi(arrivo_id,company_id,order_id,viaggio_id,collegato_da)
    values(p_arrivo,azienda,p_order,p_viaggio,auth.uid())
    on conflict(arrivo_id) do update set viaggio_id=excluded.viaggio_id,collegato_da=excluded.collegato_da,collegato_il=now()
      where mezzi_arrivi_viaggi.company_id=azienda and mezzi_arrivi_viaggi.order_id=p_order;
end;
$$;
revoke all on function public.mezzi_collega_arrivo_rapportino(uuid,date,uuid,uuid) from public, anon;
grant execute on function public.mezzi_collega_arrivo_rapportino(uuid,date,uuid,uuid) to authenticated;


-- Mantiene il percorso di correzione, controllo versione e ripristino approvazione.
create or replace function public.rapportino_correggi(p_id uuid, p_updated_at timestamptz, p_campi jsonb, p_motivo text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  r public.campo_rapportini;
  v_assegnato uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_era_approvato boolean;
  v_nuova_approvazione boolean;
  v_riga jsonb;
begin
  select * into r from public.campo_rapportini where id = p_id for update;
  if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Rapportino non disponibile.' using errcode = '42501';
  end if;
  perform public.assert_company_access(r.company_id);
  select assigned_to into v_assegnato from public.orders where id = r.order_id and deleted_at is null;
  if not found or public.has_permission_for_company(auth.uid(), 'can_edit_orders', r.company_id) is not true
     or public.check_staff_visibility(auth.uid(), v_assegnato) is not true
     or public.campo_e_ufficio(r.company_id) is not true
     or public.has_permission_for_company(auth.uid(), 'can_view_orders', r.company_id) is not true then
    raise exception 'Non puoi correggere questo rapportino.' using errcode = '42501';
  end if;
  if r.annullato_at is not null then raise exception 'Rapportino annullato: scrivine uno nuovo.' using errcode = '23514'; end if;
  if r.ufficio_employee_id is not null and r.stato = 'rifiutato' then
    raise exception 'Queste ore sono state annullate dall’ufficio. Reinseriscile da Ore e persone.' using errcode = '23514';
  end if;
  if r.updated_at is distinct from p_updated_at then
    raise exception 'Il rapportino è cambiato: riaprilo prima di correggerlo.' using errcode = 'PT409';
  end if;
  if jsonb_typeof(p_campi) is distinct from 'object' then raise exception 'Correzione non valida.' using errcode = '22023'; end if;
  if p_campi ? 'arrivo_cantiere' and jsonb_typeof(p_campi->'arrivo_cantiere') not in ('object','null') then
    raise exception 'Arrivo non valido.' using errcode = '22023';
  end if;
  if p_campi ? 'presenze' then
    if jsonb_typeof(p_campi->'presenze') is distinct from 'array' then raise exception 'Presenze non valide.' using errcode = '22023'; end if;
    for v_riga in select value from jsonb_array_elements(p_campi->'presenze') loop
      if nullif(v_riga->>'employee_id', '') is not null and not exists (select 1 from public.employees e where e.id = (v_riga->>'employee_id')::uuid and e.company_id = r.company_id) then
        raise exception 'Operaio estraneo all’azienda.' using errcode = '42501';
      end if;
      if nullif(v_riga->>'subappaltatore_id', '') is not null and not exists (select 1 from public.subcontractors d where d.id = (v_riga->>'subappaltatore_id')::uuid and d.company_id = r.company_id) then
        raise exception 'Ditta estranea all’azienda.' using errcode = '42501';
      end if;
      if coalesce((v_riga->>'ore')::numeric, -1) not between 0 and 24 then raise exception 'Ore operaio non valide.' using errcode = '22023'; end if;
    end loop;
  end if;
  if p_campi ? 'mezzi_usati' then
    if jsonb_typeof(p_campi->'mezzi_usati') is distinct from 'array' then raise exception 'Mezzi non validi.' using errcode = '22023'; end if;
    for v_riga in select value from jsonb_array_elements(p_campi->'mezzi_usati') loop
      if nullif(v_riga->>'mezzo_id', '') is not null and not exists (select 1 from public.mezzi m where m.id = (v_riga->>'mezzo_id')::uuid and m.company_id = r.company_id) then
        raise exception 'Mezzo estraneo all’azienda.' using errcode = '42501';
      end if;
      if nullif(v_riga->>'ore', '') is not null and (v_riga->>'ore')::numeric not between 0 and 24 then raise exception 'Ore mezzo non valide.' using errcode = '22023'; end if;
    end loop;
  end if;
  if p_campi ? 'materiali_usati' then
    if jsonb_typeof(p_campi->'materiali_usati') is distinct from 'array' then raise exception 'Materiali non validi.' using errcode = '22023'; end if;
    for v_riga in select value from jsonb_array_elements(p_campi->'materiali_usati') loop
      if coalesce((v_riga->>'quantita')::numeric, -1) < 0 or (v_riga->>'quantita')::numeric::text in ('NaN', 'Infinity', '-Infinity') then
        raise exception 'Quantità materiale non valida.' using errcode = '22023';
      end if;
    end loop;
  end if;
  if p_campi ? 'ore_lavorate' and coalesce((p_campi->>'ore_lavorate')::numeric, -1) not between 0 and 24 then raise exception 'Ore non valide.' using errcode = '22023'; end if;
  if p_campi ? 'ore_straordinario' and coalesce((p_campi->>'ore_straordinario')::numeric, -1) not between 0 and 24 then raise exception 'Straordinario non valido.' using errcode = '22023'; end if;
  v_nuova_approvazione := coalesce(r.user_id = auth.uid(), false) and not coalesce(public.e_amministratore_di(r.company_id), false);
  v_era_approvato := coalesce(r.approvato, false);
  if v_era_approvato then
    if v_motivo is null then raise exception 'Scrivi il motivo della correzione.' using errcode = '22023'; end if;
  end if;
    if exists (select 1 from public.appalto_rendiconto_righe a
                where a.stato <> 'bozza'
                  and (a.rapportino_id = p_id or a.voce_libera_id in (select v.id from public.rapportino_voci_libere v where v.rapportino_id = p_id))) then
      raise exception 'Non si può correggere: è già in un rendiconto confermato.' using errcode = '23514';
    end if;
    if exists (select 1 from public.giornale_lavori g where g.order_id = r.order_id and g.stato = 'firmata' and p_id = any(g.source_rapportini_ids)) then
      raise exception 'Non si può correggere: è in una pagina firmata del giornale. Scrivi un''annotazione sul giornale.' using errcode = '23514';
    end if;
  perform set_config('app.motivo_modifica', coalesce(v_motivo, ''), true);

  if v_era_approvato then
    update public.campo_rapportini set stato = 'inviato', approvato = false, approvato_da = null, approvato_at = null where id = p_id;
    delete from public.avanzamento_dal_rapportino where rapportino_id = p_id;
  end if;

  update public.campo_rapportini set
    descrizione_lavori = case when p_campi ? 'descrizione_lavori' then p_campi->>'descrizione_lavori' else descrizione_lavori end,
    note = case when p_campi ? 'note' then p_campi->>'note' else note end,
    ore_lavorate = case when p_campi ? 'ore_lavorate' then (p_campi->>'ore_lavorate')::numeric else ore_lavorate end,
    ore_straordinario = case when p_campi ? 'ore_straordinario' then (p_campi->>'ore_straordinario')::numeric else ore_straordinario end,
    presenze = case when p_campi ? 'presenze' then p_campi->'presenze' else presenze end,
    fasi_lavorate = case when p_campi ? 'fasi_lavorate' then p_campi->'fasi_lavorate' else fasi_lavorate end,
    materiali_usati = case when p_campi ? 'materiali_usati' then p_campi->'materiali_usati' else materiali_usati end,
    mezzi_usati = case when p_campi ? 'mezzi_usati' then p_campi->'mezzi_usati' else mezzi_usati end,
    campi_extra = case when p_campi ? 'arrivo_cantiere' then
      coalesce((select jsonb_agg(campo) from jsonb_array_elements(campi_extra) campo
        where campo->>'chiave' is distinct from '__arrivo_cantiere_v1'),'[]')
      || case when p_campi->'arrivo_cantiere' = 'null'::jsonb then '[]'::jsonb
              else jsonb_build_array((p_campi->'arrivo_cantiere') || '{"chiave":"__arrivo_cantiere_v1"}'::jsonb) end
      else campi_extra end,
    stato = case when r.stato = 'rifiutato' then 'inviato' else stato end,
    motivo_rifiuto = case when r.stato = 'rifiutato' then null else motivo_rifiuto end,
    pdf_url = null, updated_at = clock_timestamp()
  where id = p_id;

  if v_era_approvato and not v_nuova_approvazione then
    update public.campo_rapportini
       set stato = 'approvato', approvato = true, approvato_da = r.approvato_da, approvato_at = r.approvato_at
     where id = p_id;
  end if;
  perform set_config('app.motivo_modifica', '', true);
end; $$;
revoke all on function public.rapportino_correggi(uuid, timestamptz, jsonb, text) from public, anon;
grant execute on function public.rapportino_correggi(uuid, timestamptz, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
