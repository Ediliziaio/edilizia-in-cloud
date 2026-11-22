-- Più trasporti sullo stesso rapportino, con lettura delle dichiarazioni già salvate.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function private.controlla_arrivo_rapportino() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  arrivi jsonb;
  precedente jsonb;
  arrivo jsonb;
  mezzo uuid;
  visti uuid[] := '{}';
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
  if jsonb_array_length(arrivi) > 10 then
    raise exception 'Indica fino a 10 mezzi di trasporto per rapportino.' using errcode = '22023';
  end if;
  ufficio := public.has_permission_for_company(auth.uid(),'can_edit_orders',new.company_id) is true
    and public._order_visible_under_rls(new.order_id,true) is true;
  for arrivo in select value from jsonb_array_elements(arrivi) loop
    if arrivo->>'tipo' is distinct from 'arrivo_cantiere'
      or coalesce(arrivo->>'mezzo_id','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      or coalesce(jsonb_typeof(arrivo->'partenza'),'null') not in ('string','null')
      or length(coalesce(arrivo->>'partenza','')) > 150
      or coalesce(jsonb_typeof(arrivo->'km'),'null') not in ('number','null')
      or coalesce((arrivo->>'km')::numeric,0) not between 0 and 10000 then
      raise exception 'Controlla mezzo, partenza e chilometri dell’arrivo.' using errcode = '22023';
    end if;
    mezzo := (arrivo->>'mezzo_id')::uuid;
    if mezzo=any(visti) then raise exception 'Indica ogni mezzo di trasporto una sola volta.' using errcode='22023'; end if;
    visti := array_append(visti,mezzo);
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
  end loop;
  return new;
end;
$$;
revoke all on function private.controlla_arrivo_rapportino() from public, anon, authenticated;

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
      'viaggioGiorno',(v.partenza at time zone 'Europe/Rome')::date,
      'richiedeCollegamento',v.id is null and exists (select 1 from public.mezzi_viaggi x where x.id=a.id),
      'viaggiCompatibili',case when v.id is null then coalesce((
        select jsonb_agg(jsonb_build_object('id',c.id,'partenza',c.partenza,'arrivo',c.arrivo) order by c.partenza,c.id)
        from (
          select x.id,x.partenza,x.arrivo from public.mezzi_viaggi x
          where x.company_id = azienda and x.mezzo_id = a.mezzo_id and x.stato in ('bozza','inviato','verificato')
            and x.tratte @> jsonb_build_array(jsonb_build_object('order_id',p_order,'destinazione','commessa'))
            and x.partenza < ((a.giorno+1)::timestamp at time zone 'Europe/Rome')
            and x.arrivo >= (a.giorno::timestamp at time zone 'Europe/Rome')
          order by x.partenza,x.id limit 20
        ) c
      ),'[]') else '[]'::jsonb end
    ) as riga
    from private.arrivi_dichiarati(azienda,p_order,p_dal,p_al) a
    left join public.mezzi_arrivi_viaggi l on l.arrivo_id = a.id and l.company_id = azienda and l.order_id = p_order
    left join lateral (
      select x.id,x.stato,x.partenza from public.mezzi_viaggi x
      where x.id in (l.viaggio_id,a.id) and x.company_id = azienda and x.mezzo_id = a.mezzo_id
        and x.stato <> 'annullato' and x.partenza < ((a.giorno+1)::timestamp at time zone 'Europe/Rome')
            and x.arrivo >= (a.giorno::timestamp at time zone 'Europe/Rome')
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
      and v.mezzo_id = a.mezzo_id and v.stato in ('bozza','inviato','verificato')
      and v.tratte @> jsonb_build_array(jsonb_build_object('order_id',p_order,'destinazione','commessa'))
      and v.partenza < ((a.giorno+1)::timestamp at time zone 'Europe/Rome')
            and v.arrivo >= (a.giorno::timestamp at time zone 'Europe/Rome')
  ) then raise exception 'Il viaggio non corrisponde a questo arrivo.' using errcode = '22023'; end if;
  if exists (select 1 from public.mezzi_viaggi v where v.id=p_arrivo and v.company_id=azienda and v.mezzo_id=a.mezzo_id
    and v.stato <> 'annullato' and v.partenza < ((a.giorno+1)::timestamp at time zone 'Europe/Rome')
    and v.arrivo >= (a.giorno::timestamp at time zone 'Europe/Rome')
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
  if p_campi ? 'arrivo_cantiere' and jsonb_typeof(p_campi->'arrivo_cantiere') not in ('object','array','null') then
    raise exception 'Arrivo non valido.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_campi->'arrivo_cantiere') = 'array' then
    if jsonb_array_length(p_campi->'arrivo_cantiere') > 10
      or exists(select 1 from jsonb_array_elements(p_campi->'arrivo_cantiere') a where jsonb_typeof(a) <> 'object') then
      raise exception 'Arrivi non validi.' using errcode = '22023';
    end if;
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
      || coalesce((
        select jsonb_agg(arrivo || '{"chiave":"__arrivo_cantiere_v1"}'::jsonb order by n)
        from jsonb_array_elements(case jsonb_typeof(p_campi->'arrivo_cantiere')
          when 'array' then p_campi->'arrivo_cantiere'
          when 'object' then jsonb_build_array(p_campi->'arrivo_cantiere')
          else '[]'::jsonb end) with ordinality a(arrivo,n)
      ),'[]'::jsonb)
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
