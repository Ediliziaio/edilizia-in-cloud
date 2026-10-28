-- No existing month is closed by this migration. All state changes require an admin action.
create schema if not exists private;
create table public.hr_chiusure_mensili (
  company_id uuid not null references public.companies(id) on delete cascade,
  mese date not null check(extract(day from mese)=1),
  stato text not null check(stato in ('aperto','chiuso')),
  revisione integer not null default 1,
  chiuso_il timestamptz, chiuso_da uuid, riaperto_il timestamptz,
  motivo text not null, snapshot jsonb not null default '{}'::jsonb,
  primary key(company_id,mese)
);
create table public.hr_chiusure_storico (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  mese date not null, revisione integer not null, stato text not null,
  attore uuid not null, registrato_il timestamptz not null default now(),
  motivo text not null, snapshot jsonb not null,
  unique(company_id,mese,revisione)
);
alter table public.hr_chiusure_mensili enable row level security;
alter table public.hr_chiusure_storico enable row level security;
create policy hr_mese_leggi on public.hr_chiusure_mensili for select to authenticated using (
  not public.utente_bloccato() and not public.utente_e_cliente_esterno() and
  (company_id=public.get_my_company_id() or public.has_role(auth.uid(),'super_admin'::public.app_role))
);
create policy hr_mese_inserisci on public.hr_chiusure_mensili for insert to authenticated with check (
  not public.utente_bloccato() and not public.utente_sola_lettura(company_id) and
  (public.e_amministratore_di(company_id) or public.has_role(auth.uid(),'super_admin'::public.app_role))
);
create policy hr_mese_aggiorna on public.hr_chiusure_mensili for update to authenticated using (
  not public.utente_bloccato() and not public.utente_sola_lettura(company_id) and
  (public.e_amministratore_di(company_id) or public.has_role(auth.uid(),'super_admin'::public.app_role))
) with check (
  not public.utente_bloccato() and not public.utente_sola_lettura(company_id) and
  (public.e_amministratore_di(company_id) or public.has_role(auth.uid(),'super_admin'::public.app_role))
);
create policy hr_mese_storico_leggi on public.hr_chiusure_storico for select to authenticated using (
  not public.utente_bloccato() and
  (public.e_amministratore_di(company_id) or public.has_role(auth.uid(),'super_admin'::public.app_role))
);
revoke all on public.hr_chiusure_mensili,public.hr_chiusure_storico from public,anon,authenticated;
-- Ordinary users can read only closure metadata, not snapshots or reasons.
grant select(company_id,mese,stato,revisione,chiuso_il,chiuso_da,riaperto_il) on public.hr_chiusure_mensili to authenticated;
grant insert(company_id,mese,stato,motivo) on public.hr_chiusure_mensili to authenticated;
grant update(stato,motivo,revisione) on public.hr_chiusure_mensili to authenticated;
grant select on public.hr_chiusure_storico to authenticated;

-- Private trigger: the only writer of immutable history/snapshot columns.
create function private.hr_mese_transizione()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_end date; v_actor uuid:=auth.uid();
begin
  if v_actor is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or public.utente_sola_lettura(new.company_id)
    or (public.e_amministratore_di(new.company_id) or public.has_role(v_actor,'super_admin'::public.app_role)) is distinct from true then
    raise exception 'Permessi insufficienti per la chiusura HR';
  end if;
  if tg_op='UPDATE' and (new.company_id<>old.company_id or new.mese<>old.mese) then raise exception 'Periodo e azienda non modificabili'; end if;
  if new.mese<>date_trunc('month',new.mese)::date or new.mese is null then raise exception 'Mese non valido'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hr-month:'||new.company_id::text||':'||to_char(new.mese,'YYYY-MM'),0));
  if nullif(btrim(new.motivo),'') is null or length(btrim(new.motivo))<5 or length(new.motivo)>2000 then raise exception 'Inserisci un motivo tra 5 e 2000 caratteri'; end if;
  if tg_op='INSERT' and new.stato<>'chiuso' then raise exception 'Non esiste un mese chiuso da riaprire'; end if;
  if tg_op='UPDATE' and new.stato=old.stato then raise exception 'Il mese è già in questo stato'; end if;
  new.revisione:=case when tg_op='INSERT' then 1 else old.revisione+1 end;
  new.motivo:=btrim(new.motivo);
  v_end:=(new.mese+interval '1 month'-interval '1 day')::date;
  if new.stato='chiuso' then
    if new.mese>=date_trunc('month',now() at time zone 'Europe/Rome')::date then raise exception 'Puoi chiudere soltanto un mese concluso'; end if;
    if not exists(select 1 from public.hr_giornate where company_id=new.company_id and data between new.mese and v_end) then raise exception 'Nessuna giornata HR da chiudere'; end if;
    if exists(select 1 from public.hr_giornate where company_id=new.company_id and data between new.mese and v_end
      and (coalesce(anomalia,false) or (prima_entrata is not null and ultima_uscita is null))) then raise exception 'Risolvi prima le anomalie HR'; end if;
    if exists(select 1 from public.hr_timbrature t where t.company_id=new.company_id and t.data_evento between new.mese and v_end
      and not exists(select 1 from public.hr_giornate g where g.company_id=t.company_id and g.profilo_id=t.profilo_id and g.data=t.data_evento)) then
      raise exception 'Ci sono timbrature senza giornata HR consolidata';
    end if;
    if exists(select 1 from public.hr_richieste where company_id=new.company_id and stato='in_attesa' and data_inizio<=v_end and data_fine>=new.mese) then raise exception 'Ci sono richieste HR in attesa nel mese'; end if;
    if exists(select 1 from public.hr_profili p where p.company_id=new.company_id and coalesce(p.attivo,false)
      and (p.data_assunzione is null or coalesce(cardinality(p.giorni_lavorativi),0)=0
        or exists(select 1 from unnest(p.giorni_lavorativi) x where x not in ('Lun','Mar','Mer','Gio','Ven','Sab','Dom')))) then
      raise exception 'Completa date di assunzione e calendari personali prima della chiusura';
    end if;
    if exists(select 1 from public.hr_profili p
      cross join lateral generate_series(greatest(new.mese,coalesce(p.data_assunzione,new.mese)),least(v_end,coalesce(p.data_cessazione,v_end)),interval '1 day') d
      where p.company_id=new.company_id and (p.attivo or p.data_cessazione is not null)
        and (array['Dom','Lun','Mar','Mer','Gio','Ven','Sab'])[extract(dow from d)::integer+1]=any(p.giorni_lavorativi)
        and not exists(select 1 from public.hr_festivita f where f.company_id=p.company_id and (f.data=d::date or (f.ricorrente and to_char(f.data,'MM-DD')=to_char(d,'MM-DD'))))
        and not exists(select 1 from public.hr_giornate g where g.company_id=p.company_id and g.profilo_id=p.id and g.data=d::date)) then
      raise exception 'Giornate lavorative senza registrazione: completa il registro o verifica il calendario';
    end if;
    select jsonb_build_object('giornate',coalesce(jsonb_agg(jsonb_build_object('id',id,'profilo_id',profilo_id,'data',data,'stato',stato,'ore_lavorate',ore_lavorate,'ore_straordinario',ore_straordinario) order by data,id),'[]'::jsonb),'rilevato_il',now())
      into new.snapshot from public.hr_giornate where company_id=new.company_id and data between new.mese and v_end;
    new.chiuso_il:=now();new.chiuso_da:=v_actor;
  elsif new.stato='aperto' then
    new.riaperto_il:=now();new.snapshot:=old.snapshot;new.chiuso_il:=old.chiuso_il;new.chiuso_da:=old.chiuso_da;
  else raise exception 'Stato non valido'; end if;
  insert into public.hr_chiusure_storico(company_id,mese,revisione,stato,attore,motivo,snapshot)
    values(new.company_id,new.mese,new.revisione,new.stato,v_actor,new.motivo,case when new.stato='chiuso' then new.snapshot else '{}'::jsonb end);
  return new;
end $$;
revoke all on function private.hr_mese_transizione() from public,anon,authenticated;
create trigger hr_mese_transizione before insert or update on public.hr_chiusure_mensili for each row execute function private.hr_mese_transizione();

create function public.hr_transizione_mese(p_company uuid,p_mese date,p_revisione integer,p_stato text,p_motivo text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_revision integer; v_result jsonb;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_sola_lettura(p_company)
    or (public.e_amministratore_di(p_company) or public.has_role(auth.uid(),'super_admin'::public.app_role)) is distinct from true then raise exception 'Operazione non consentita'; end if;
  if p_company is null or p_mese is null or p_revisione is null or p_revisione<0 or extract(day from p_mese)<>1
    or p_mese<date '1900-01-01' or p_mese>date '2199-12-01' or p_stato is null or p_stato not in ('chiuso','aperto') then raise exception 'Periodo o stato non valido'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hr-month:'||p_company::text||':'||to_char(p_mese,'YYYY-MM'),0));
  select revisione into v_revision from public.hr_chiusure_mensili where company_id=p_company and mese=p_mese for update;
  if coalesce(v_revision,0)<>p_revisione then raise exception 'Il mese è cambiato: aggiorna prima di proseguire'; end if;
  if v_revision is null then
    insert into public.hr_chiusure_mensili(company_id,mese,stato,motivo) values(p_company,p_mese,p_stato,p_motivo)
      returning jsonb_build_object('stato',stato,'revisione',revisione) into v_result;
  else
    update public.hr_chiusure_mensili set stato=p_stato,motivo=p_motivo where company_id=p_company and mese=p_mese
      returning jsonb_build_object('stato',stato,'revisione',revisione) into v_result;
    if not found then raise exception 'Mese non modificabile'; end if;
  end if;
  return v_result;
end $$;
revoke all on function public.hr_transizione_mese(uuid,date,integer,text,text) from public,anon;
grant execute on function public.hr_transizione_mese(uuid,date,integer,text,text) to authenticated;

-- Serialized with closing: neither ordinary clients nor background processors can silently change a closed month.
create function private.hr_blocca_mese_chiuso()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_rows jsonb:='[]'::jsonb; r record;
begin
  if tg_op<>'DELETE' and ((to_jsonb(new)->>tg_argv[1])::date-(to_jsonb(new)->>tg_argv[0])::date)>3660 then raise exception 'Periodo HR troppo esteso'; end if;
  if tg_op<>'INSERT' then v_rows:=v_rows||jsonb_build_array(to_jsonb(old)); end if;
  if tg_op<>'DELETE' then v_rows:=v_rows||jsonb_build_array(to_jsonb(new)); end if;
  for r in select distinct (x->>'company_id')::uuid company_id,d::date mese
    from jsonb_array_elements(v_rows) x cross join lateral generate_series(
      date_trunc('month',(x->>tg_argv[0])::date),date_trunc('month',(x->>tg_argv[1])::date),interval '1 month') d
    order by company_id,mese
  loop
    perform pg_advisory_xact_lock(hashtextextended('hr-month:'||r.company_id::text||':'||to_char(r.mese,'YYYY-MM'),0));
    if exists(select 1 from public.hr_chiusure_mensili c where c.company_id=r.company_id and c.mese=r.mese and c.stato='chiuso') then
      raise exception 'Mese HR % chiuso: serve una riapertura autorizzata con motivo',to_char(r.mese,'YYYY-MM');
    end if;
  end loop;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.hr_blocca_mese_chiuso() from public,anon,authenticated;
create trigger hr_guard_mese_giornate before insert or update or delete on public.hr_giornate for each row execute function private.hr_blocca_mese_chiuso('data','data');
create trigger hr_guard_mese_timbrature before insert or update or delete on public.hr_timbrature for each row execute function private.hr_blocca_mese_chiuso('data_evento','data_evento');
create trigger hr_guard_mese_richieste before insert or update or delete on public.hr_richieste for each row execute function private.hr_blocca_mese_chiuso('data_inizio','data_fine');
