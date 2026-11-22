set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.mappa_calendario_accesso(p_company uuid, p_tipo text)
returns boolean language sql stable security invoker set search_path = '' as $$
 select auth.uid() is not null
   and p_company = public.get_effective_company_id()
   and not public.utente_bloccato()
   and not public.utente_e_cliente_esterno()
   and case p_tipo
     when 'vendite' then public.has_permission_for_company(auth.uid(), 'can_view_marketing_appointments', p_company)
     when 'lavori' then public.has_permission_for_company(auth.uid(), 'can_view_calendar', p_company)
                         and public.has_permission_for_company(auth.uid(), 'can_view_orders', p_company)
     when 'campo' then exists (select 1 from public.profiles p where p.id=auth.uid() and p.company_id=p_company)
     else false end
$$;
revoke all on function public.mappa_calendario_accesso(uuid,text) from public,anon;
grant execute on function public.mappa_calendario_accesso(uuid,text) to authenticated;

-- L'effettiva visibilità del record è quella delle fonti originali, tramite RLS.
create or replace function public.mappa_record_visibile(p_company uuid, p_tipo text, p_record uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
 select case p_tipo
   when 'appuntamento' then public.mappa_calendario_accesso(p_company,'vendite') and exists (
     select 1 from public.appointments a where a.id=p_record and a.company_id=p_company
       and a.calendar_id is not null and public.check_staff_visibility(auth.uid(),a.assigned_to))
   when 'cantiere' then
     (public.mappa_calendario_accesso(p_company,'lavori') or public.mappa_calendario_accesso(p_company,'campo'))
     and exists (select 1 from public.orders o where o.id=p_record and o.company_id=p_company
       and o.deleted_at is null and (public.campo_lavoro_su_commessa(o.id)
       or (public.mappa_calendario_accesso(p_company,'lavori') and public.ufficio_vede_commessa(o.id))))
   else false end
$$;
revoke all on function public.mappa_record_visibile(uuid,text,uuid) from public,anon;
grant execute on function public.mappa_record_visibile(uuid,text,uuid) to authenticated;

create table if not exists public.mappa_posizioni (
 company_id uuid not null references public.companies(id) on delete cascade,
 tipo text not null check (tipo in ('appuntamento','cantiere')),
 record_id uuid not null,
 lat double precision not null check (lat between -85 and 85),
 lng double precision not null check (lng between -180 and 180),
 fonte text not null check (fonte in ('manuale','geocodifica confermata')),
 aggiornato_da uuid not null,
 aggiornato_il timestamptz not null default now(),
 primary key(company_id,tipo,record_id),
 check (lat <> 0 or lng <> 0)
);
alter table public.mappa_posizioni enable row level security;
revoke all on public.mappa_posizioni from public,anon,authenticated;
grant select on public.mappa_posizioni to authenticated;
drop policy if exists mappa_posizioni_lettura on public.mappa_posizioni;
create policy mappa_posizioni_lettura on public.mappa_posizioni for select to authenticated
 using(public.mappa_record_visibile(company_id,tipo,record_id));

create table if not exists private.mappa_posizioni_storico (
 id bigint generated always as identity primary key,
 company_id uuid not null references public.companies(id) on delete cascade,
 tipo text not null, record_id uuid not null, autore uuid, data timestamptz not null default now(),
 prima jsonb, dopo jsonb
);
alter table private.mappa_posizioni_storico enable row level security;
revoke all on private.mappa_posizioni_storico from public,anon,authenticated;

create or replace function private.mappa_posizione_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into private.mappa_posizioni_storico(company_id,tipo,record_id,autore,prima,dopo)
 values(coalesce(new.company_id,old.company_id),coalesce(new.tipo,old.tipo),
        coalesce(new.record_id,old.record_id),auth.uid(),
        case when tg_op<>'INSERT' then to_jsonb(old) end,
        case when tg_op<>'DELETE' then to_jsonb(new) end);
 return null;
end $$;
revoke all on function private.mappa_posizione_audit() from public,anon,authenticated;
drop trigger if exists mappa_posizione_audit on public.mappa_posizioni;
create trigger mappa_posizione_audit after insert or update or delete on public.mappa_posizioni
 for each row execute function private.mappa_posizione_audit();

create or replace function private.mappa_posizione_invalida()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 delete from public.mappa_posizioni m where m.company_id=old.company_id and m.record_id=old.id
   and m.tipo=tg_argv[0];
 return null;
end $$;
revoke all on function private.mappa_posizione_invalida() from public,anon,authenticated;
drop trigger if exists mappa_appuntamento_cambio_indirizzo on public.appointments;
create trigger mappa_appuntamento_cambio_indirizzo after update on public.appointments for each row
 when ((old.formatted_address,old.address_line,old.address_postal_code,old.address_city,old.address_province,old.address_country,old.lat,old.lng,old.company_id)
   is distinct from (new.formatted_address,new.address_line,new.address_postal_code,new.address_city,new.address_province,new.address_country,new.lat,new.lng,new.company_id))
 execute function private.mappa_posizione_invalida('appuntamento');
drop trigger if exists mappa_cantiere_cambio_indirizzo on public.orders;
create trigger mappa_cantiere_cambio_indirizzo after update on public.orders for each row
 when ((old.indirizzo_lavori,old.work_address,old.work_lat,old.work_lng,old.company_id)
    is distinct from (new.indirizzo_lavori,new.work_address,new.work_lat,new.work_lng,new.company_id))
 execute function private.mappa_posizione_invalida('cantiere');

create or replace function public.mappa_salva_posizione(
 p_company uuid,p_tipo text,p_record uuid,p_lat double precision,p_lng double precision,
 p_fonte text,p_indirizzo text
) returns void language plpgsql security definer set search_path = '' as $$
declare indirizzo text;
begin
 if not coalesce(public.mappa_record_visibile(p_company,p_tipo,p_record),false)
    or public.utente_sola_lettura(p_company) then raise insufficient_privilege; end if;
 if p_tipo='appuntamento' and (public.has_permission_for_company(auth.uid(),'can_edit_marketing',p_company)
          or public.has_permission_for_company(auth.uid(),'can_edit_marketing_opportunities',p_company)) then
   select coalesce(nullif(btrim(a.formatted_address),''),nullif(concat_ws(', ',nullif(btrim(a.address_line),''),nullif(btrim(a.address_postal_code),''),
      nullif(btrim(a.address_city),''),nullif(btrim(a.address_province),''),nullif(btrim(a.address_country),'')),''),'')
     into indirizzo from public.appointments a where a.company_id=p_company and a.id=p_record for update;
 elsif p_tipo='cantiere' and public.mappa_calendario_accesso(p_company,'lavori')
       and public.has_permission_for_company(auth.uid(),'can_edit_orders',p_company) then
   select coalesce(nullif(btrim(o.indirizzo_lavori),''),nullif(btrim(o.work_address),''),'')
     into indirizzo from public.orders o where o.company_id=p_company and o.id=p_record and o.deleted_at is null for update;
 else raise insufficient_privilege;
 end if;
 if not found or indirizzo is distinct from p_indirizzo then
   raise exception 'L’indirizzo è cambiato. Aggiorna la mappa e riprova.';
 end if;
 insert into public.mappa_posizioni(company_id,tipo,record_id,lat,lng,fonte,aggiornato_da)
 values(p_company,p_tipo,p_record,p_lat,p_lng,p_fonte,auth.uid())
 on conflict(company_id,tipo,record_id) do update
 set lat=excluded.lat,lng=excluded.lng,fonte=excluded.fonte,aggiornato_da=auth.uid(),aggiornato_il=now();
end $$;
revoke all on function public.mappa_salva_posizione(uuid,text,uuid,double precision,double precision,text,text) from public,anon;
grant execute on function public.mappa_salva_posizione(uuid,text,uuid,double precision,double precision,text,text) to authenticated;

create or replace function public.mappa_presenze(p_company uuid,p_giorno date,p_ordini uuid[],p_personale boolean)
returns table(order_id uuid,user_id uuid,nome text,tipo text,ora timestamptz,fonte text)
language sql stable security invoker set search_path = '' as $$
 with accesso as (
   select public.mappa_calendario_accesso(p_company,'lavori')
      and public.has_permission_for_company(auth.uid(),'can_view_persone',p_company)
      and public.has_permission_for_company(auth.uid(),'can_view_all_team_calendar',p_company)
      and not p_personale as squadra
 ), eventi as (
   select t.* from public.campo_timbrature t cross join accesso a
   where t.company_id=p_company and t.order_id=any(p_ordini) and cardinality(p_ordini)<=250
     and (a.squadra or t.user_id=auth.uid())
     and (public.mappa_calendario_accesso(p_company,'lavori') or public.mappa_calendario_accesso(p_company,'campo'))
     and public.mappa_record_visibile(p_company,'cantiere',t.order_id)
     and t.timestamp_evento >= p_giorno::timestamp at time zone 'Europe/Rome'
     and t.timestamp_evento < (p_giorno+1)::timestamp at time zone 'Europe/Rome'
     and t.tipo in ('entrata','uscita','pausa_inizio','pausa_fine','inizio_pausa','fine_pausa')
 )
 select t.order_id,t.user_id,nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),t.tipo,t.timestamp_evento,
   case t.fonte when 'app' then 'App operaio' when 'kiosk' then 'Chiosco' when 'ufficio' then 'Ufficio'
        when 'manuale' then 'Registrazione manuale' else coalesce(t.fonte,'Timbratura') end
 from eventi t left join public.profiles p on p.id=t.user_id and p.company_id=p_company
 order by t.timestamp_evento,t.id
$$;
revoke all on function public.mappa_presenze(uuid,date,uuid[],boolean) from public,anon;
grant execute on function public.mappa_presenze(uuid,date,uuid[],boolean) to authenticated;

create or replace function public.mappa_km_effettivi(p_company uuid,p_giorno date,p_personale boolean)
returns table(id uuid,mezzo text,metri double precision,fonte text,partenza timestamptz,arrivo timestamptz,aggiornato timestamptz)
language sql stable security definer set search_path = '' as $$
 select v.id,m.nome,(coalesce(v.contatore_fine-v.contatore_inizio,d.km)*1000)::double precision,
   concat(case when v.contatore_inizio is null then 'Dichiarazione registrata' else 'Contachilometri' end,
      case when v.stato='verificato' then ' · verificato' else ' · inviato' end),
   v.partenza,v.arrivo,v.updated_at
 from public.mezzi_viaggi v join public.mezzi m on m.id=v.mezzo_id and m.company_id=v.company_id
 left join lateral (
   select sum(case when jsonb_typeof(t->'km')='number' then (t->>'km')::numeric end) km
   from jsonb_array_elements(v.tratte) t
   having bool_and(coalesce(t->>'fonte'='dichiarati' and jsonb_typeof(t->'km')='number',false))
 ) d on v.contatore_inizio is null
 where v.company_id=p_company and m.contatore_unita='km' and v.stato in ('inviato','verificato')
   and (v.contatore_fine>=v.contatore_inizio or (v.contatore_inizio is null and d.km>=0))
   and v.partenza >= p_giorno::timestamp at time zone 'Europe/Rome'
   and v.partenza < (p_giorno+1)::timestamp at time zone 'Europe/Rome'
   and (public.mappa_calendario_accesso(p_company,'lavori') or public.mappa_calendario_accesso(p_company,'vendite')
     or public.mappa_calendario_accesso(p_company,'campo'))
   and (v.created_by=auth.uid() or (not p_personale and public.has_permission_for_company(auth.uid(),'can_view_mezzi',p_company)))
 order by v.partenza,v.id
$$;
revoke all on function public.mappa_km_effettivi(uuid,date,boolean) from public,anon;
grant execute on function public.mappa_km_effettivi(uuid,date,boolean) to authenticated;

create table if not exists private.mappa_consumo (
 company_id uuid not null references public.companies(id) on delete cascade,
 provider text not null, voce text not null, minuto timestamptz not null, unita integer not null check(unita>0),
 primary key(company_id,provider,voce,minuto)
);
alter table private.mappa_consumo enable row level security;
revoke all on private.mappa_consumo from public,anon,authenticated;

create or replace function public.mappa_conta(p_company uuid,p_provider text,p_voce text,p_unita integer,p_minuto integer,p_mese integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare minuto_corrente timestamptz := date_trunc('minute',now()); consumo integer;
begin
 if p_unita not between 1 and 100 or p_unita>p_minuto or p_unita>p_mese then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(':',p_company,p_provider,p_voce),29));
 select coalesce(sum(unita),0) into consumo from private.mappa_consumo
  where company_id=p_company and provider=p_provider and voce=p_voce
    and minuto>=date_trunc('month',now() at time zone 'Europe/Rome') at time zone 'Europe/Rome';
 if consumo+p_unita>p_mese then return false; end if;
 select coalesce(sum(unita),0) into consumo from private.mappa_consumo
   where company_id=p_company and provider=p_provider and voce=p_voce and minuto=minuto_corrente;
 if consumo+p_unita>p_minuto then return false; end if;
 insert into private.mappa_consumo values(p_company,p_provider,p_voce,minuto_corrente,p_unita)
 on conflict(company_id,provider,voce,minuto) do update set unita=private.mappa_consumo.unita+excluded.unita;
 return true;
end $$;
revoke all on function public.mappa_conta(uuid,text,text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.mappa_conta(uuid,text,text,integer,integer,integer) to service_role;

create or replace function public.mappa_consumo_mese(p_company uuid)
returns table(provider text,voce text,unita bigint) language sql stable security definer set search_path = '' as $$
 select c.provider,c.voce,sum(c.unita) from private.mappa_consumo c
 where c.company_id=p_company and public.mappa_calendario_accesso(p_company,'lavori')
   and public.e_amministratore_di(p_company)
   and c.minuto >= date_trunc('month',now() at time zone 'Europe/Rome') at time zone 'Europe/Rome'
 group by c.provider,c.voce
$$;
revoke all on function public.mappa_consumo_mese(uuid) from public,anon;
grant execute on function public.mappa_consumo_mese(uuid) to authenticated;

create table if not exists private.mappa_richieste (
 company_id uuid not null references public.companies(id) on delete cascade,
 chiave text not null, proprietario uuid not null, scadenza timestamptz not null, risposta jsonb,
 primary key(company_id,chiave)
);
alter table private.mappa_richieste enable row level security;
revoke all on private.mappa_richieste from public,anon,authenticated;

create or replace function public.mappa_richiesta_inizia(p_company uuid,p_chiave text,p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r private.mappa_richieste;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':'||p_chiave,31));
 select * into r from private.mappa_richieste where company_id=p_company and chiave=p_chiave;
 if found and r.scadenza>now() then return jsonb_build_object('stato',case when r.risposta is null then 'attesa' else 'pronta' end,'risposta',r.risposta); end if;
 delete from private.mappa_richieste where company_id=p_company and scadenza<now();
 insert into private.mappa_richieste values(p_company,p_chiave,p_token,now()+interval '35 seconds',null)
 on conflict(company_id,chiave) do update set proprietario=excluded.proprietario,scadenza=excluded.scadenza,risposta=null;
 return '{"stato":"nuova"}'::jsonb;
end $$;
create or replace function public.mappa_richiesta_chiudi(p_company uuid,p_chiave text,p_token uuid,p_risposta jsonb,p_secondi integer)
returns void language sql security definer set search_path = '' as $$
 update private.mappa_richieste set risposta=p_risposta,scadenza=now()+make_interval(secs=>least(greatest(p_secondi,1),86400))
 where company_id=p_company and chiave=p_chiave and proprietario=p_token
$$;
revoke all on function public.mappa_richiesta_inizia(uuid,text,uuid),public.mappa_richiesta_chiudi(uuid,text,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.mappa_richiesta_inizia(uuid,text,uuid),public.mappa_richiesta_chiudi(uuid,text,uuid,jsonb,integer) to service_role;

create or replace function public.mappa_candidati(
 p_company uuid,p_tipo text,p_giorno date,p_inizio time,p_fine time,p_qualifica text default null,p_escludi uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare oggi date := (now() at time zone 'Europe/Rome')::date;
  da timestamp := p_giorno+p_inizio; a timestamp := p_giorno+p_fine;
  da_utc timestamptz := da at time zone 'Europe/Rome'; a_utc timestamptz := a at time zone 'Europe/Rome';
  vede_team boolean; vede_vendite boolean; adesso integer;
begin
 if p_tipo not in ('vendite','operai','squadre') or p_giorno is null or p_inizio is null or p_fine is null
   or p_giorno<oggi or p_giorno>oggi+365 or p_inizio>=p_fine or da_utc<now()
   or (da_utc at time zone 'Europe/Rome')<>da or (a_utc at time zone 'Europe/Rome')<>a
   or length(coalesce(p_qualifica,''))>100 then raise invalid_parameter_value; end if;
 vede_vendite:=coalesce(public.mappa_calendario_accesso(p_company,'vendite'),false);
 vede_team:=coalesce(public.mappa_calendario_accesso(p_company,'lavori')
   and public.has_permission_for_company(auth.uid(),'can_view_all_team_calendar',p_company)
   and public.has_permission_for_company(auth.uid(),'can_view_persone',p_company),false);
 if (p_tipo='vendite' and not vede_vendite) or (p_tipo<>'vendite' and not vede_team) then
   raise insufficient_privilege;
 end if;
 if p_escludi is not null and not coalesce(public.mappa_record_visibile(p_company,'appuntamento',p_escludi),false) then
   raise insufficient_privilege;
 end if;
 adesso:=case when p_giorno=oggi then floor(extract(epoch from (now() at time zone 'Europe/Rome')::time)/60) else 0 end;
 return (
 with anagrafiche as (
   select h.id,h.user_id,h.nome,h.cognome,h.sede_id,h.mansione,h.orario_inizio,h.orario_fine,h.giorni_lavorativi,
      e.qualifica,h.data_assunzione,h.data_cessazione
   from public.hr_profili h left join public.employees e on e.id=h.employee_id and e.company_id=p_company
   where h.company_id=p_company and h.attivo and h.user_id is not null and h.lavora_in_cantiere
     and (h.data_assunzione is null or h.data_assunzione<=p_giorno)
     and (h.data_cessazione is null or h.data_cessazione>=p_giorno)
 ), persone as (
   select distinct on (c.owner_id) c.owner_id uid, c.owner_id gruppo, concat_ws(' ',p.first_name,p.last_name) nome,
     c.base_lat bl,c.base_lng bg,c.base_place_id place_id,'Sede del calendario' origine_base,
     c.buffer_before_min prima,c.buffer_after_min dopo,null::uuid hr_id,true orario,true competente
   from public.marketing_calendars c join public.profiles p on p.id=c.owner_id
   where p_tipo='vendite' and c.company_id=p_company and c.is_active and c.calendar_type='personal'
     and public.check_staff_visibility(auth.uid(),c.owner_id)
     and public.has_permission_for_company(c.owner_id,'can_view_marketing_appointments',p_company)
     and not coalesce(p.is_blocked,false) and p.deleted_at is null
     and nullif(btrim(p_qualifica),'') is null
     and public.calendar_window_available(c.id,p_giorno,p_inizio,p_fine,false)
   order by c.owner_id, (c.base_lat is not null and c.base_lng is not null) desc,c.id
 ), lavoratori as (
   select h.user_id uid,case when p_tipo='squadre' then s.id else h.user_id end gruppo,
     case when p_tipo='squadre' then s.name else concat_ws(' ',h.nome,h.cognome) end nome,
     sede.lat bl,sede.lng bg,null::text place_id,'Sede assegnata' origine_base,0 prima,0 dopo,h.id hr_id,
     coalesce(
       h.orario_inizio<=p_inizio and h.orario_fine>=p_fine
       and (array['Dom','Lun','Mar','Mer','Gio','Ven','Sab'])[extract(dow from p_giorno)::integer+1]=any(h.giorni_lavorativi)
       and not coalesce(p.is_blocked,false) and p.deleted_at is null,false) orario,
     coalesce(nullif(btrim(p_qualifica),'') is null or
       lower(btrim(p_qualifica)) in (lower(btrim(h.mansione)),lower(btrim(h.qualifica))),false) competente
   from anagrafiche h join public.profiles p on p.id=h.user_id and p.company_id=p_company
   left join public.hr_sedi sede on sede.id=h.sede_id and sede.company_id=p_company and sede.attiva
   left join public.squadre_componenti sc on sc.hr_profilo_id=h.id and sc.company_id=p_company and p_tipo='squadre'
   left join public.external_teams s on s.id=sc.squadra_id and s.company_id=p_company and s.is_active and s.kind='interna'
   where p_tipo in ('operai','squadre') and (p_tipo='operai' or s.id is not null)
 ), tutti as (
   select * from persone union all select * from lavoratori
 ), assegnazioni as (
   select c.uid,o.id,o.work_start_time,o.work_end_time,
     coalesce(x.data_inizio,o.work_start_date) dal,
     coalesce(x.data_fine_prevista,o.work_end_date,x.data_inizio,o.work_start_date) al
   from tutti c join public.order_campo_assignments x on x.user_id=c.uid and x.company_id=p_company
   join public.orders o on o.id=x.order_id and o.company_id=p_company and o.deleted_at is null
   where coalesce(x.data_inizio,o.work_start_date)<=p_giorno
     and coalesce(x.data_fine_prevista,o.work_end_date,x.data_inizio,o.work_start_date)>=p_giorno-1
 ), impegni as (
   select x.assigned_to uid,x.id,x.order_id,
      x.appointment_date+coalesce(x.appointment_time,time '00:00') iniz,
      case when x.appointment_time is null then (x.appointment_date+1)::timestamp
           when x.appointment_end_time is null then x.appointment_date+x.appointment_time+interval '1 hour'
           when x.appointment_end_time<=x.appointment_time then x.appointment_date+x.appointment_end_time+interval '1 day'
           else x.appointment_date+x.appointment_end_time end fine,
      case when coalesce(x.meeting_provider,'none')='none' and x.meeting_url is null
        and (m.lat is not null or nullif(x.place_id,'') is null)
        and public.check_staff_visibility(auth.uid(),x.assigned_to)
        then coalesce(m.lat,x.lat) end lat,
      case when coalesce(x.meeting_provider,'none')='none' and x.meeting_url is null
        and (m.lat is not null or nullif(x.place_id,'') is null)
        and public.check_staff_visibility(auth.uid(),x.assigned_to)
        then coalesce(m.lng,x.lng) end lng
   from public.appointments x
   left join public.mappa_posizioni m on m.company_id=x.company_id and m.record_id=x.id and m.tipo='appuntamento'
   where x.company_id=p_company and x.assigned_to in (select uid from tutti) and x.id is distinct from p_escludi
      and x.appointment_date between p_giorno-1 and p_giorno+1
      and x.cancelled_at is null and lower(x.status) not in ('annullato','annullata','cancelled','canceled','cancellato','cancellata','disdetto','no_show')
   union all
   select x.uid,x.id,x.id,gg.giorno+coalesce(x.work_start_time,time '00:00'),
       case when x.work_end_time is null then (gg.giorno+1)::timestamp
            when x.work_end_time<=coalesce(x.work_start_time,time '00:00') then gg.giorno+x.work_end_time+interval '1 day'
            else gg.giorno+x.work_end_time end,
       case when vede_team and public.ufficio_vede_commessa(o.id) then coalesce(m.lat,o.work_lat) end,
       case when vede_team and public.ufficio_vede_commessa(o.id) then coalesce(m.lng,o.work_lng) end
   from assegnazioni x join public.orders o on o.id=x.id
   left join public.mappa_posizioni m on m.company_id=o.company_id and m.record_id=o.id and m.tipo='cantiere'
   cross join lateral (values (p_giorno-1),(p_giorno)) as gg(giorno)
   where gg.giorno between x.dal and x.al
 ), valutati as (
   select t.*,
     not t.orario or (p_tipo='operai' and not t.competente)
     or exists(select 1 from public.hr_richieste r where r.company_id=p_company and (r.user_id=t.uid or r.profilo_id=t.hr_id)
       and lower(r.stato) in ('approvata','approvato') and p_giorno between r.data_inizio::date and r.data_fine::date)
     or exists(select 1 from impegni i where i.uid=t.uid and i.iniz< a+make_interval(mins=>t.dopo)
       and i.fine>da-make_interval(mins=>t.prima))
     or exists(select 1 from public.impegni_interni_persona b where b.company_id=p_company and b.user_id=t.uid
       and b.fonte='cantiere' and b.start_at<a_utc and b.end_at>da_utc
       and not exists(select 1 from assegnazioni w where w.uid=t.uid and p_giorno between w.dal and w.al))
     or exists(select 1 from public.google_calendar_busy_slots b where b.company_id=p_company and b.user_id=t.uid and b.start_at<a_utc and b.end_at>da_utc)
     or exists(select 1 from public.apple_calendar_busy_slots b where b.company_id=p_company and b.user_id=t.uid and b.start_at<a_utc and b.end_at>da_utc)
     or exists(select 1 from public.outlook_calendar_busy_slots b where b.company_id=p_company and b.user_id=t.uid and b.start_at<a_utc and b.end_at>da_utc)
     as indisponibile
   from tutti t
 ), origini as (
   select v.*,
     case when ultima.tipo in ('entrata','pausa_fine','fine_pausa') and ultima.lat is not null and ultima.lng is not null then ultima.lat
          when precedente.fine is not null then precedente.lat when place_id is null then bl end lat,
     case when ultima.tipo in ('entrata','pausa_fine','fine_pausa') and ultima.lat is not null and ultima.lng is not null then ultima.lng
          when precedente.fine is not null then precedente.lng when place_id is null then bg end lng,
     case when ultima.tipo in ('entrata','pausa_fine','fine_pausa') and ultima.lat is not null and ultima.lng is not null then 'Timbratura di cantiere'
          when precedente.fine is not null then 'Attività precedente' else origine_base end fonte,
     case when ultima.tipo in ('entrata','pausa_fine','fine_pausa') and ultima.lat is not null and ultima.lng is not null then ultima.ora
          when precedente.fine is not null then precedente.fine at time zone 'Europe/Rome' end aggiornato,
     greatest(adesso,coalesce(extract(epoch from (precedente.fine-p_giorno::timestamp))/60+v.prima,0)) partenza,
     prossimo.lat next_lat,prossimo.lng next_lng,
     extract(epoch from (prossimo.iniz-p_giorno::timestamp))/60-v.dopo next_start
   from valutati v
   left join lateral(select i.* from impegni i where i.uid=v.uid and i.fine<=da and i.fine>p_giorno::timestamp order by i.fine desc,i.id limit 1) precedente on true
   left join lateral(select i.* from impegni i where i.uid=v.uid and i.iniz>=a order by i.iniz,i.id limit 1) prossimo on true
   left join lateral(
     select t.tipo,t.timestamp_evento ora,
       case when public.ufficio_vede_commessa(o.id) then coalesce(m.lat,o.work_lat) end lat,
       case when public.ufficio_vede_commessa(o.id) then coalesce(m.lng,o.work_lng) end lng
     from public.campo_timbrature t left join public.orders o on o.id=t.order_id and o.company_id=p_company and o.deleted_at is null
     left join public.mappa_posizioni m on m.company_id=p_company and m.record_id=o.id and m.tipo='cantiere'
     where vede_team and p_tipo<>'vendite' and p_giorno=oggi and t.company_id=p_company and t.user_id=v.uid
       and t.timestamp_evento between now()-interval '90 minutes' and now()
       and (precedente.fine is null or t.timestamp_evento>=precedente.fine at time zone 'Europe/Rome')
     order by t.timestamp_evento desc,t.id desc limit 1
   ) ultima on true
   where not v.indisponibile and not exists(select 1 from valutati b where b.gruppo=v.gruppo and b.indisponibile)
     and (p_tipo<>'squadre' or exists(select 1 from valutati c where c.gruppo=v.gruppo and c.competente))
 ), raggruppati as (
   select gruppo,min(nome) nome, case when bool_and(lat is not null and lng is not null)
       and count(distinct (lat,lng))=1 then min(lat) end lat,
     case when bool_and(lat is not null and lng is not null) and count(distinct (lat,lng))=1 then min(lng) end lng,
     min(fonte) fonte,max(aggiornato) aggiornato,max(partenza) partenza,
     case when count(distinct (next_lat,next_lng)) filter(where next_start is not null)=1 then min(next_lat) end next_lat,
     case when count(distinct (next_lat,next_lng)) filter(where next_start is not null)=1 then min(next_lng) end next_lng,
     min(next_start) next_start from origini group by gruppo order by nome,gruppo
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',gruppo,'nome',nome,
   'origine',case when lat is not null and lng is not null then jsonb_build_object('lat',lat,'lng',lng) end,
   'fonte',fonte,'aggiornato',aggiornato,'partenza',partenza,
   'prossimo',case when next_lat is not null and next_lng is not null then jsonb_build_object('lat',next_lat,'lng',next_lng) end,
   'prossimoInizio',next_start)), '[]'::jsonb) from raggruppati);
end $$;
revoke all on function public.mappa_candidati(uuid,text,date,time,time,text,uuid) from public,anon;
grant execute on function public.mappa_candidati(uuid,text,date,time,time,text,uuid) to authenticated;

create or replace function public.mappa_assegnati(p_company uuid,p_giorno date,p_ordini uuid[])
returns table(order_id uuid,user_id uuid,nome text,squadra_id uuid,employee_id uuid,mezzo_id uuid,mezzo text)
language sql stable security invoker set search_path = '' as $$
 select distinct a.order_id,a.user_id,
   nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),a.da_squadra_id,e.id,mezzi.id,mezzi.nome
 from public.order_campo_assignments a
 join public.orders o on o.id=a.order_id and o.company_id=p_company
 join public.profiles p on p.id=a.user_id and p.company_id=p_company
 left join public.employees e on e.company_id=p_company and e.user_id=a.user_id and e.is_active
 left join lateral (
   select min(m.id::text)::uuid id,min(m.nome) nome
   from public.mezzi m join public.hr_profili h on h.id=m.assegnato_hr_profilo_id and h.company_id=p_company
   where m.company_id=p_company and m.deleted_at is null and m.contatore_unita='km' and h.user_id=a.user_id
     and (m.assegnato_order_id is null or m.assegnato_order_id=a.order_id)
     and public.has_permission_for_company(auth.uid(),'can_view_mezzi',p_company)
   having count(*)=1
 ) mezzi on true
 where a.company_id=p_company and a.order_id=any(p_ordini) and cardinality(p_ordini)<=250
   and public.mappa_calendario_accesso(p_company,'lavori')
   and public.has_permission_for_company(auth.uid(),'can_view_all_team_calendar',p_company)
   and public.has_permission_for_company(auth.uid(),'can_view_persone',p_company)
   and public.mappa_record_visibile(p_company,'cantiere',a.order_id)
   and p_giorno >= coalesce(a.data_inizio,o.work_start_date)
   and p_giorno <= coalesce(a.data_fine_prevista,o.work_end_date,a.data_inizio,o.work_start_date)
$$;
revoke all on function public.mappa_assegnati(uuid,date,uuid[]) from public,anon;
grant execute on function public.mappa_assegnati(uuid,date,uuid[]) to authenticated;
