set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.mezzi add column if not exists noleggio_dedicato boolean not null default false;

alter table public.mezzi_piani_cantiere
  add column if not exists origine_computo_id uuid,
  add column if not exists origine_noleggio_id text,
  add column if not exists fornitore_id uuid references public.suppliers(id) on delete set null,
  add column if not exists fornitore_noleggio text,
  add column if not exists riferimento_noleggio text,
  add column if not exists al_concordato date;

create unique index if not exists mezzi_piani_origine_noleggio
  on public.mezzi_piani_cantiere(order_id, origine_computo_id, origine_noleggio_id)
  where origine_computo_id is not null;

alter table public.mezzi_piani_costi
  add column if not exists per_unita boolean not null default false,
  add column if not exists trasporto numeric not null default 0 check (trasporto between 0 and 1000000000),
  add column if not exists montaggio numeric not null default 0 check (montaggio between 0 and 1000000000),
  add column if not exists smontaggio numeric not null default 0 check (smontaggio between 0 and 1000000000);

alter table public.mezzi_allocazioni
  add column if not exists piano_id uuid references public.mezzi_piani_cantiere(id) on delete set null;
create unique index if not exists mezzi_allocazione_aperta_per_piano
  on public.mezzi_allocazioni(piano_id) where piano_id is not null and al is null;

create or replace function private.mezzi_allocazione_verifica_piano()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.piano_id is not null and not exists (
    select 1 from public.mezzi_piani_cantiere p where p.id = new.piano_id and p.company_id = new.company_id
      and p.order_id = new.order_id and p.mezzo_id = new.mezzo_id
  ) then raise exception 'L’assegnazione non appartiene alla prenotazione.' using errcode = '23514'; end if;
  return new;
end;
$$;
revoke all on function private.mezzi_allocazione_verifica_piano() from public, anon, authenticated;
create or replace trigger trg_mezzi_verifica_piano before insert or update of piano_id,company_id,order_id,mezzo_id
  on public.mezzi_allocazioni for each row execute function private.mezzi_allocazione_verifica_piano();

create or replace function public.salva_piano_mezzo_operativo(p_dati jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce((p_dati->>'id')::uuid,gen_random_uuid());
  v_order uuid := (p_dati->>'order_id')::uuid;
  v_mezzo uuid := nullif(p_dati->>'mezzo_id','')::uuid;
  v_dal date := nullif(p_dati->>'dal','')::date;
  v_al date := nullif(p_dati->>'al','')::date;
  v_quantita numeric := (p_dati->>'quantita')::numeric;
  v_annullato boolean := coalesce((p_dati->>'annullato')::boolean,false);
  v_arrivo boolean := coalesce((p_dati->>'arrivato_oggi')::boolean,false);
  v_costo jsonb := p_dati->'costo';
  v_nuovo jsonb := p_dati->'nuovo_noleggio';
  v_origine uuid := nullif(p_dati->>'origine_computo_id','')::uuid;
  v_proposta text := nullif(p_dati->>'origine_noleggio_id','');
  v_fornitore uuid := nullif(p_dati->>'fornitore_id','')::uuid;
  v_nome_fornitore text := nullif(btrim(p_dati->>'fornitore_noleggio'),'');
  v_riferimento text := nullif(btrim(p_dati->>'riferimento_noleggio'),'');
  v_resp uuid := nullif(p_dati->>'responsabile_hr_id','')::uuid;
  oggi date := (now() at time zone 'Europe/Rome')::date;
  v_company uuid;
  v_fasi uuid[];
  v_p public.mezzi_piani_cantiere%rowtype;
  v_m public.mezzi%rowtype;
  v_nome text;
  v_tipo text;
  v_unita text;
begin
  select company_id into v_company from public.orders where id=v_order and deleted_at is null;
  if auth.uid() is null or v_company is null or coalesce(public.utente_bloccato(),true) or public.chiamante_anonimo() is true
    or public.has_permission_for_company(auth.uid(),'can_view_mezzi',v_company) is not true
    or public.has_permission_for_company(auth.uid(),'can_edit_mezzi',v_company) is not true
    or public.has_permission_for_company(auth.uid(),'can_view_orders',v_company) is not true
    or public._order_visible_under_rls(v_order,true) is not true or coalesce(public.utente_sola_lettura(v_company),true) then
    raise exception 'Non puoi modificare i mezzi di questa commessa' using errcode = '42501';
  end if;
  if p_dati ? 'costo' and public.puo_vedere_costi(auth.uid(),v_company) is not true then
    raise exception 'Non puoi modificare i costi' using errcode = '42501';
  end if;
  if v_dal is null or v_quantita is null or v_quantita not between 0.01 and 9999999999.99
    or (v_al is not null and v_al < v_dal) or (v_arrivo and (v_dal > oggi or v_al < oggi or v_annullato)) then
    raise exception 'Controlla periodo e quantità';
  end if;
  select coalesce(array_agg(distinct x::uuid),'{}') into v_fasi
    from jsonb_array_elements_text(coalesce(p_dati->'fase_ids','[]')) x;
  if exists (select 1 from unnest(v_fasi) f where not exists (
    select 1 from public.order_work_phases p where p.id=f and p.order_id=v_order and p.company_id=v_company
  )) then raise exception 'Le fasi devono appartenere a questa commessa'; end if;
  if v_resp is not null and not exists (select 1 from public.hr_profili h where h.id=v_resp and h.company_id=v_company and h.attivo) then
    raise exception 'Responsabile non disponibile per questa azienda';
  end if;
  if v_fornitore is not null then
    select s.name into v_nome_fornitore from public.suppliers s where s.id=v_fornitore and s.company_id=v_company and s.is_active;
    if not found then raise exception 'Fornitore non disponibile per questa azienda'; end if;
  end if;
  if length(v_riferimento) > 200 or length(v_nome_fornitore) > 200 then
    raise exception 'Riferimento o nome del fornitore troppo lungo.';
  end if;
  if nullif(v_costo->>'supplier_id','') is not null and not exists (
    select 1 from public.suppliers x where x.id=(v_costo->>'supplier_id')::uuid and x.company_id=v_company and x.is_active
  ) then raise exception 'Fornitore non disponibile per questa azienda'; end if;
  if v_costo is not null and v_costo <> 'null'::jsonb and (
    jsonb_typeof(v_costo) <> 'object'
    or coalesce((v_costo->>'tariffa')::numeric,-1) not between 0 and 1000000000
    or coalesce((v_costo->>'extra')::numeric,0) not between 0 and 1000000000
  ) then raise exception 'Controlla l’importo del noleggio.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_id::text,0));
  select * into v_p from public.mezzi_piani_cantiere where id=v_id;
  if v_p.id is not null and (v_p.company_id <> v_company or v_p.order_id <> v_order
    or (v_mezzo is not null and v_p.mezzo_id <> v_mezzo)) then raise exception 'Assegnazione non modificabile'; end if;
  if (v_origine is null) <> (v_proposta is null)
    or (v_p.id is not null and p_dati ? 'origine_computo_id' and (
      v_origine is distinct from v_p.origine_computo_id or v_proposta is distinct from v_p.origine_noleggio_id
    )) then raise exception 'Il collegamento con il computo non può essere modificato.'; end if;
  if v_origine is not null and v_p.id is null then
    if not exists (select 1 from public.computo_uploads c join public.computo_voci_estratte v on v.computo_id=c.id
      where c.id=v_origine and c.company_id=v_company and c.order_id=v_order and c.stato <> 'archiviato'
        and v_proposta = 'nolo:' || v.id::text) then raise exception 'Voce del computo non disponibile per questa commessa.'; end if;
    if exists (select 1 from public.mezzi_piani_cantiere where order_id=v_order and origine_computo_id=v_origine and origine_noleggio_id=v_proposta)
      then raise exception 'Questo noleggio ha già una prenotazione. Riaprila dal computo.'; end if;
  end if;

  if v_nuovo is not null then
    if jsonb_typeof(v_nuovo) <> 'object' or v_mezzo is not null then raise exception 'Scegli una sola risorsa per il noleggio.'; end if;
    v_nome := nullif(btrim(v_nuovo->>'nome'),'');
    v_tipo := v_nuovo->>'tipo';
    v_unita := nullif(v_nuovo->>'unita','');
    if v_nome is null or length(v_nome) > 160 or v_tipo is null or (v_unita is not null and (
      v_tipo <> 'attrezzatura' or v_unita not in ('mq','pz','ml','mc','kg') or round(v_quantita,2) <> v_quantita
      or (v_unita = 'pz' and trunc(v_quantita) <> v_quantita)
    )) then raise exception 'Controlla nome, tipo, unità e quantità della risorsa.'; end if;
    if v_p.id is not null then
      if not exists (select 1 from public.mezzi m where m.id=v_p.mezzo_id and m.company_id=v_company and m.deleted_at is null
        and m.nome=v_nome and m.tipo=v_tipo and m.possesso='noleggio_breve' and m.unita_misura is not distinct from v_unita)
        then raise exception 'La risorsa di questa prenotazione è già stata registrata.'; end if;
      v_mezzo := v_p.mezzo_id;
    else
      insert into public.mezzi(company_id,nome,tipo,possesso,contatore_unita,gestione,unita_misura,quantita_totale,created_by,noleggio_dedicato)
        values(v_company,v_nome,v_tipo,'noleggio_breve',
          case when v_tipo in ('autovettura','furgone','autocarro') then 'km' else 'ore' end,
          case when v_unita is null then 'singola' else 'quantita' end, v_unita,
          case when v_unita is not null then v_quantita end, auth.uid(),true)
        returning id into v_mezzo;
    end if;
  end if;

  -- Stesso ordine di lock per le prenotazioni e i rientri.
  select * into v_m from public.mezzi where id=v_mezzo and company_id=v_company and deleted_at is null for update;
  if not found then raise exception 'Mezzo non disponibile per questa azienda'; end if;
  if v_m.noleggio_dedicato and v_p.id is null and v_nuovo is null then
    raise exception 'La risorsa è legata a un noleggio. Riapri la sua prenotazione per cambiare le date.';
  end if;
  if v_origine is not null and v_p.id is null and v_m.possesso not in ('noleggio_breve','noleggio_lungo') then
    raise exception 'Scegli la risorsa noleggiata per questa voce.';
  end if;
  if not v_annullato and v_p.rientrato_il is null and v_m.stato='fuori_servizio' then raise exception 'La risorsa è fuori servizio'; end if;
  if not v_annullato and coalesce(v_m.gestione,'singola')='singola' and v_quantita<>1 then raise exception 'Per una risorsa singola la quantità deve essere 1'; end if;
  if not v_annullato and v_m.gestione='quantita' and (
    round(v_quantita,2) <> v_quantita or (v_m.unita_misura='pz' and trunc(v_quantita) <> v_quantita)
  ) then raise exception 'Usa una quantità compatibile con l’unità della risorsa.'; end if;
  if not v_annullato and v_p.rientrato_il is null and coalesce(v_m.gestione,'singola')='singola' and exists(
    select 1 from public.mezzi_piani_cantiere p where p.mezzo_id=v_mezzo and p.id<>v_id and not p.annullato and p.rientrato_il is null
      and daterange(p.dal,p.al,'[]') && daterange(v_dal,v_al,'[]')
  ) then raise exception 'Risorsa già pianificata in questo periodo: modifica le date o l’assegnazione esistente'; end if;
  if not v_annullato and v_m.gestione='quantita' and v_quantita>coalesce(v_m.quantita_totale,0) then
    raise exception 'Quantità superiore al totale del parco';
  end if;
  if not v_annullato and v_p.rientrato_il is null and v_m.gestione='quantita' and exists (
    select 1 from (
      select v_dal as giorno union select p.dal from public.mezzi_piani_cantiere p
      where p.mezzo_id=v_mezzo and p.id<>v_id and not p.annullato and p.rientrato_il is null and p.dal>=v_dal and (v_al is null or p.dal<=v_al)
    ) d where v_quantita + coalesce((select sum(p.quantita) from public.mezzi_piani_cantiere p
      where p.mezzo_id=v_mezzo and p.id<>v_id and not p.annullato and p.rientrato_il is null
        and p.dal<=d.giorno and (p.al is null or p.al>=d.giorno)),0)>coalesce(v_m.quantita_totale,0)
  ) then raise exception 'Quantità già pianificata nel periodo: supera il totale del parco'; end if;

  insert into public.mezzi_piani_cantiere(id,company_id,order_id,mezzo_id,fase_ids,dal,al,quantita,note,annullato,responsabile_hr_id,
    origine_computo_id,origine_noleggio_id,fornitore_id,fornitore_noleggio,riferimento_noleggio)
  values(v_id,v_company,v_order,v_mezzo,v_fasi,v_dal,v_al,v_quantita,nullif(p_dati->>'note',''),v_annullato,v_resp,
    v_origine,v_proposta,v_fornitore,v_nome_fornitore,v_riferimento)
  on conflict(id) do update set fase_ids=excluded.fase_ids,dal=excluded.dal,al=excluded.al,quantita=excluded.quantita,
    note=excluded.note,annullato=excluded.annullato,
    responsabile_hr_id=case when p_dati ? 'responsabile_hr_id' then excluded.responsabile_hr_id else mezzi_piani_cantiere.responsabile_hr_id end,
    fornitore_id=case when p_dati ? 'fornitore_id' then excluded.fornitore_id else mezzi_piani_cantiere.fornitore_id end,
    fornitore_noleggio=case when p_dati ? 'fornitore_noleggio' then excluded.fornitore_noleggio else mezzi_piani_cantiere.fornitore_noleggio end,
    riferimento_noleggio=case when p_dati ? 'riferimento_noleggio' then excluded.riferimento_noleggio else mezzi_piani_cantiere.riferimento_noleggio end,
    updated_at=now();
  if p_dati ? 'costo' then
    if v_costo='null'::jsonb then delete from public.mezzi_piani_costi where piano_id=v_id;
    else
      insert into public.mezzi_piani_costi(piano_id,company_id,tariffa,base,extra,fornitore,supplier_id,per_unita,trasporto,montaggio,smontaggio)
      values(v_id,v_company,(v_costo->>'tariffa')::numeric,v_costo->>'base',coalesce((v_costo->>'extra')::numeric,0),
        nullif(v_costo->>'fornitore',''),nullif(v_costo->>'supplier_id','')::uuid,
        coalesce((v_costo->>'per_unita')::boolean,false),coalesce((v_costo->>'trasporto')::numeric,0),
        coalesce((v_costo->>'montaggio')::numeric,0),coalesce((v_costo->>'smontaggio')::numeric,0))
      on conflict(piano_id) do update set tariffa=excluded.tariffa,base=excluded.base,extra=excluded.extra,fornitore=excluded.fornitore,
        supplier_id=case when v_costo ? 'supplier_id' then excluded.supplier_id else mezzi_piani_costi.supplier_id end,
        per_unita=case when v_costo ? 'per_unita' then excluded.per_unita else mezzi_piani_costi.per_unita end,
        trasporto=case when v_costo ? 'trasporto' then excluded.trasporto else mezzi_piani_costi.trasporto end,
        montaggio=case when v_costo ? 'montaggio' then excluded.montaggio else mezzi_piani_costi.montaggio end,
        smontaggio=case when v_costo ? 'smontaggio' then excluded.smontaggio else mezzi_piani_costi.smontaggio end;
    end if;
  end if;
  if v_arrivo then
    if v_p.rientrato_il is not null then raise exception 'La prenotazione è già conclusa.'; end if;
    if v_m.gestione='quantita' then
      if not exists (select 1 from public.mezzi_allocazioni where piano_id=v_id and (al is null or al>oggi)) then
        insert into public.mezzi_allocazioni(company_id,mezzo_id,order_id,quantita,dal,piano_id)
          values(v_company,v_mezzo,v_order,v_quantita,oggi,v_id);
      end if;
    else
      if v_m.assegnato_order_id is not null and v_m.assegnato_order_id <> v_order then
        raise exception 'La risorsa risulta ancora su un altro cantiere. Registra prima il rientro.';
      end if;
      if v_m.assegnato_order_id is distinct from v_order then
        update public.mezzi set assegnato_order_id=v_order where id=v_mezzo and company_id=v_company;
      end if;
    end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.salva_piano_mezzo_operativo(jsonb) from public, anon;
grant execute on function public.salva_piano_mezzo_operativo(jsonb) to authenticated, service_role;

create or replace function public.salva_piano_mezzo(p_dati jsonb)
returns uuid language sql security invoker set search_path = '' as $$
  select public.salva_piano_mezzo_operativo(p_dati);
$$;
revoke all on function public.salva_piano_mezzo(jsonb) from public, anon;
grant execute on function public.salva_piano_mezzo(jsonb) to authenticated, service_role;

create or replace function public.registra_rientro_piano_mezzo(p_piano uuid,p_allocazione uuid,p_quantita numeric,p_presente numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p public.mezzi_piani_cantiere%rowtype;
  m public.mezzi%rowtype;
  a public.mezzi_allocazioni%rowtype;
  quanto numeric;
  oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  if auth.uid() is null or coalesce(public.utente_bloccato(),true) or public.chiamante_anonimo() is true then raise exception 'Accesso negato' using errcode = '42501'; end if;
  if p_piano is null then
    select * into a from public.mezzi_allocazioni where id=p_allocazione and piano_id is null;
    p.company_id := a.company_id;
    p.order_id := a.order_id;
    p.mezzo_id := a.mezzo_id;
  else
    perform pg_advisory_xact_lock(hashtextextended(p_piano::text,0));
    select * into p from public.mezzi_piani_cantiere where id=p_piano;
  end if;
  if p.order_id is null or public.has_permission_for_company(auth.uid(),'can_view_mezzi',p.company_id) is not true
    or public.has_permission_for_company(auth.uid(),'can_edit_mezzi',p.company_id) is not true
    or public.has_permission_for_company(auth.uid(),'can_view_orders',p.company_id) is not true
    or public._order_visible_under_rls(p.order_id,true) is not true or coalesce(public.utente_sola_lettura(p.company_id),true) then
    raise exception 'Non puoi registrare il rientro di questa risorsa' using errcode = '42501';
  end if;
  select * into m from public.mezzi where id=p.mezzo_id and company_id=p.company_id and deleted_at is null for update;
  if m.id is null then raise exception 'Risorsa non disponibile'; end if;
  if p_piano is not null then
    select * into strict p from public.mezzi_piani_cantiere where id=p_piano for update;
  end if;
  if p.rientrato_il is not null then return; end if;
  if p.annullato or p.dal>oggi then raise exception 'Questa prenotazione non è iniziata o è annullata'; end if;
  if coalesce(m.gestione,'singola')='quantita' then
    select * into a from public.mezzi_allocazioni where id=p_allocazione for update;
    if a.id is null or a.company_id<>p.company_id or a.order_id is distinct from p.order_id
      or a.mezzo_id<>p.mezzo_id or a.dal>oggi or (a.al is not null and a.al<=oggi) then
      raise exception 'Il montaggio non corrisponde alla prenotazione: verifica cantiere e risorsa';
    end if;
    if a.piano_id is distinct from p.id and (
      a.piano_id is not null or a.dal<p.dal or (p.al is not null and a.dal>p.al) or (
        select count(*) from public.mezzi_piani_cantiere x where x.mezzo_id=p.mezzo_id and x.order_id=p.order_id
          and not x.annullato and x.rientrato_il is null and x.dal<=a.dal and (x.al is null or x.al>=a.dal)
      )<>1
    ) then raise exception 'Verifica a quale prenotazione appartiene il montaggio.'; end if;
    quanto := coalesce(p_quantita,a.quantita);
    if (p_quantita is not null and p_presente is distinct from a.quantita)
      or quanto not between 0.01 and a.quantita or round(quanto,2)<>quanto
      or (m.unita_misura='pz' and trunc(quanto)<>quanto) then
      raise exception 'Controlla la quantità rimasta sul cantiere e riprova.';
    end if;
    perform public.mezzi_rientro(a.id,quanto,oggi);
    if p.id is null then return; end if;
    if quanto<a.quantita then
      update public.mezzi_allocazioni set piano_id=p.id where id=a.id and piano_id is null;
      return;
    end if;
  else
    if p.id is null or p_allocazione is not null or p_quantita is not null or m.assegnato_order_id is distinct from p.order_id then
      raise exception 'La risorsa non risulta su questa commessa';
    end if;
    if not exists (
      select 1 from public.mezzi_assegnazioni x where x.mezzo_id=p.mezzo_id and x.order_id=p.order_id and x.al is null
        and (x.dal at time zone 'Europe/Rome')::date >= p.dal
        and (p.al is null or (x.dal at time zone 'Europe/Rome')::date <= p.al)
    ) then raise exception 'Controlla che il mezzo presente corrisponda alla prenotazione.'; end if;
    update public.mezzi set assegnato_order_id=null where id=m.id and company_id=p.company_id;
  end if;
  update public.mezzi_piani_cantiere set al_concordato=al,al=oggi,rientrato_il=now(),updated_at=now() where id=p.id;
  if m.noleggio_dedicato then
    update public.mezzi set stato='fuori_servizio' where id=m.id and company_id=p.company_id;
  end if;
end;
$$;
revoke all on function public.registra_rientro_piano_mezzo(uuid,uuid,numeric,numeric) from public, anon;
grant execute on function public.registra_rientro_piano_mezzo(uuid,uuid,numeric,numeric) to authenticated, service_role;

create or replace function public.rientra_piano_mezzo(p_piano uuid, p_allocazione uuid default null)
returns void language sql security invoker set search_path = '' as $$
  select public.registra_rientro_piano_mezzo(p_piano,p_allocazione,null,null);
$$;
revoke all on function public.rientra_piano_mezzo(uuid,uuid) from public, anon;
grant execute on function public.rientra_piano_mezzo(uuid,uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
