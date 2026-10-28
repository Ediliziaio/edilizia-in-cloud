-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

-- No historical amounts, eligibility or benefits are populated by this migration.
create table public.hr_paghe_movimenti (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 profilo_id uuid not null references public.hr_profili(id), data date not null,
 tipo text not null check(tipo in ('tfr_iniziale','tfr_quota','tfr_rivalutazione','tfr_anticipo','tfr_liquidazione','tfr_rettifica','welfare_budget','welfare_utilizzo','welfare_rettifica','tredicesima','quattordicesima','cassa_edile','fondo','trasferta','premio','storno')),
 importo numeric(12,2) not null check(importo<>0), riferimento text not null check(length(btrim(riferimento)) between 5 and 1000),
 fonte text not null check(fonte in ('azienda','consulente')), destinazione text,
 storno_di uuid unique references public.hr_paghe_movimenti(id),
 richiesta_id uuid not null, created_by uuid not null, created_at timestamptz not null default now(),
 unique(company_id,richiesta_id), check ((tipo='storno')=(storno_di is not null))
);
create index hr_paghe_movimenti_periodo on public.hr_paghe_movimenti(company_id,data,id);
create index hr_paghe_movimenti_persona on public.hr_paghe_movimenti(company_id,profilo_id,data);
create table public.hr_paghe_riconciliazioni (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 movimento_id uuid not null unique references public.hr_paghe_movimenti(id),
 documento_id uuid not null references public.hr_paghe_documenti(id),
 motivo text not null check(length(btrim(motivo)) between 5 and 1000),
 created_by uuid not null, created_at timestamptz not null default now()
);
create index hr_paghe_riconciliazioni_azienda on public.hr_paghe_riconciliazioni(company_id,movimento_id);
create table public.hr_benefit_storico (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
 tabella text not null,record_id uuid not null,prima jsonb,dopo jsonb,attore uuid,registrato_il timestamptz not null default now()
);
create index hr_benefit_storico_azienda on public.hr_benefit_storico(company_id,registrato_il desc,id);
alter table public.hr_paghe_movimenti enable row level security;
alter table public.hr_paghe_riconciliazioni enable row level security;
alter table public.hr_benefit_storico enable row level security;
create policy hr_movimenti_leggi on public.hr_paghe_movimenti for select to authenticated using (
 not public.utente_bloccato() and not public.utente_e_cliente_esterno() and (public.e_amministratore_di(company_id) or public.has_role(auth.uid(),'super_admin'::public.app_role)));
create policy hr_movimenti_scrivi on public.hr_paghe_movimenti for insert to authenticated with check (
 not public.utente_bloccato() and not public.utente_sola_lettura(company_id) and (public.e_amministratore_di(company_id) or public.has_role(auth.uid(),'super_admin'::public.app_role)));
create policy hr_riconciliazioni_leggi on public.hr_paghe_riconciliazioni for select to authenticated using (
 not public.utente_bloccato() and not public.utente_e_cliente_esterno() and (public.e_amministratore_di(company_id) or public.has_role(auth.uid(),'super_admin'::public.app_role)));
create policy hr_riconciliazioni_scrivi on public.hr_paghe_riconciliazioni for insert to authenticated with check (
 not public.utente_bloccato() and not public.utente_sola_lettura(company_id) and (public.e_amministratore_di(company_id) or public.has_role(auth.uid(),'super_admin'::public.app_role)));
create policy hr_benefit_storico_leggi on public.hr_benefit_storico for select to authenticated using (
 not public.utente_bloccato() and (public.e_amministratore_di(company_id) or public.has_role(auth.uid(),'super_admin'::public.app_role)));
revoke all on public.hr_paghe_movimenti,public.hr_paghe_riconciliazioni,public.hr_benefit_storico from public,anon,authenticated;
grant select,insert on public.hr_paghe_movimenti,public.hr_paghe_riconciliazioni to authenticated;
grant select on public.hr_benefit_storico to authenticated;

-- All append-only entries, including direct REST inserts, are checked on the server.
create function private.hr_paghe_valida_movimento()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare p record; v_parent record; v_m record;
begin
 if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or public.utente_sola_lettura(new.company_id)
   or (public.e_amministratore_di(new.company_id) or public.has_role(auth.uid(),'super_admin'::public.app_role)) is distinct from true then raise exception 'Operazione non consentita'; end if;
 new.created_by:=auth.uid();new.created_at:=now();
 if tg_table_name='hr_paghe_riconciliazioni' then
   select * into v_m from public.hr_paghe_movimenti where id=new.movimento_id and company_id=new.company_id;
   if not found then raise exception 'Movimento non accessibile'; end if;
   perform pg_advisory_xact_lock(hashtextextended('hr-month:'||new.company_id::text||':'||to_char(v_m.data,'YYYY-MM'),0));
   if exists(select 1 from public.hr_chiusure_mensili where company_id=new.company_id and mese=date_trunc('month',v_m.data)::date and stato='chiuso') then raise exception 'Mese HR chiuso: serve riapertura autorizzata'; end if;
   select * into p from public.hr_profili where id=v_m.profilo_id and company_id=new.company_id;
   if not exists(select 1 from public.hr_paghe_documenti d where d.id=new.documento_id and d.company_id=new.company_id
     and d.sostituito_da is null and (d.hr_profilo_id=p.id or (p.employee_id is not null and d.employee_id=p.employee_id))
     and d.anno=extract(year from v_m.data)::integer and (d.mese is null or d.mese=extract(month from v_m.data)::integer)) then
     raise exception 'Documento non coerente con azienda, persona o periodo'; end if;
   return new;
 end if;
 select * into p from public.hr_profili where id=new.profilo_id and company_id=new.company_id;
 if not found then raise exception 'Persona non appartenente all’azienda'; end if;
 if new.tipo='storno' then
   select * into v_parent from public.hr_paghe_movimenti where id=new.storno_di and company_id=new.company_id;
   if not found or v_parent.profilo_id<>new.profilo_id or v_parent.tipo='storno' then raise exception 'Storno non valido'; end if;
   if date_trunc('year',new.data)<>date_trunc('year',v_parent.data) then raise exception 'Storno in altro anno: serve una rettifica documentata'; end if;
   new.importo:=-v_parent.importo;
 elsif new.tipo in ('tfr_anticipo','tfr_liquidazione','welfare_utilizzo') and new.importo>=0 then raise exception 'La voce deve ridurre il saldo';
 elsif new.tipo not in ('tfr_iniziale','tfr_rettifica','welfare_rettifica') and new.importo<=0 then raise exception 'La voce deve incrementare il saldo'; end if;
 return new;
end $$;
revoke all on function private.hr_paghe_valida_movimento() from public,anon,authenticated;
create trigger hr_paghe_valida_movimento before insert on public.hr_paghe_movimenti for each row execute function private.hr_paghe_valida_movimento();
create trigger hr_paghe_valida_riconciliazione before insert on public.hr_paghe_riconciliazioni for each row execute function private.hr_paghe_valida_movimento();
create trigger hr_guard_mese_movimenti before insert on public.hr_paghe_movimenti for each row execute function private.hr_blocca_mese_chiuso('data','data');

create function public.hr_paghe_registra(p_company uuid,p_richiesta uuid,p_profilo uuid,p_data date,p_tipo text,p_importo numeric,p_riferimento text,p_fonte text,p_destinazione text default null,p_storno uuid default null)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id uuid; v_old public.hr_paghe_movimenti;
begin
 if auth.uid() is null or public.utente_sola_lettura(p_company) or (public.e_amministratore_di(p_company) or public.has_role(auth.uid(),'super_admin'::public.app_role)) is distinct from true then raise exception 'Operazione non consentita'; end if;
 if p_richiesta is null or p_data is null or p_data<date '1900-01-01' or p_data>date '2199-12-31' or p_importo is null or p_importo=0 or abs(p_importo)>=10000000000 or p_importo<>round(p_importo,2) then raise exception 'Dati o importo non validi'; end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-payroll-request:'||p_company::text||p_richiesta::text,0));
 select * into v_old from public.hr_paghe_movimenti where company_id=p_company and richiesta_id=p_richiesta;
 if found then
   if v_old.profilo_id is distinct from p_profilo or v_old.data is distinct from p_data or v_old.tipo is distinct from p_tipo or v_old.riferimento is distinct from btrim(p_riferimento)
     or v_old.importo is distinct from p_importo or v_old.fonte is distinct from p_fonte or v_old.storno_di is distinct from p_storno or v_old.destinazione is distinct from nullif(btrim(p_destinazione),'') then raise exception 'Richiesta già usata con altri dati'; end if;
   return v_old.id;
 end if;
 insert into public.hr_paghe_movimenti(company_id,profilo_id,data,tipo,importo,riferimento,fonte,destinazione,storno_di,richiesta_id,created_by)
 values(p_company,p_profilo,p_data,p_tipo,p_importo,btrim(p_riferimento),p_fonte,nullif(btrim(p_destinazione),''),p_storno,p_richiesta,auth.uid()) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.hr_paghe_registra(uuid,uuid,uuid,date,text,numeric,text,text,text,uuid) from public,anon;
grant execute on function public.hr_paghe_registra(uuid,uuid,uuid,date,text,numeric,text,text,text,uuid) to authenticated;

-- Existing benefit records: no silent cross-company edits, read-only writes or changes after settlement.
create function private.hr_benefit_valida()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_company uuid; v_person uuid; v_day date; v_self boolean; v_terminal boolean;
begin
 if tg_op='DELETE' then raise exception 'Conserva lo storico: annulla il movimento, non cancellarlo'; end if;
 v_company:=new.company_id;
 if tg_op='UPDATE' and (new.company_id<>old.company_id or new.profilo_id<>old.profilo_id or new.giorno<>old.giorno) then raise exception 'Azienda, persona e giorno non modificabili'; end if;
 if not exists(select 1 from public.hr_profili where id=new.profilo_id and company_id=v_company) then raise exception 'Persona non appartenente all’azienda'; end if;
 if auth.uid() is not null then
   if public.utente_bloccato() or public.utente_sola_lettura(v_company) or public.utente_e_cliente_esterno() then raise exception 'Operazione non consentita'; end if;
   v_self:=new.profilo_id=public.hr_profilo_da_user(auth.uid(),v_company);
   if tg_op='INSERT' and pg_trigger_depth()=1 and (public.e_amministratore_di(v_company) or public.has_role(auth.uid(),'super_admin'::public.app_role)) is distinct from true
     and not exists(select 1 from public.hr_profili p where p.id=new.profilo_id and p.company_id=v_company and case when tg_table_name='hr_buoni_pasto' then p.buono_pasto_abilitato else p.rimborso_km_abilitato end) then raise exception 'Diritto al benefit non abilitato: chiedi verifica all’ufficio'; end if;
   if (public.e_amministratore_di(v_company) or public.has_role(auth.uid(),'super_admin'::public.app_role)) is distinct from true
     and not (coalesce(v_self,false) and ((tg_op='INSERT' and tg_table_name='hr_buoni_pasto' and to_jsonb(new)->>'tipo'='ricevuta' and new.stato='maturato') or (tg_op='INSERT' and tg_table_name='hr_rimborsi_km' and new.stato='da_confermare') or (pg_trigger_depth()>1 and tg_table_name='hr_buoni_pasto' and to_jsonb(new)->>'tipo'='fisso'))) then raise exception 'Operazione non consentita'; end if;
 elsif coalesce(current_setting('role',true),'none') not in ('none','postgres','service_role') then raise exception 'Operazione non consentita'; end if;
 if new.importo<0 or new.importo='NaN'::numeric then raise exception 'Importo non valido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-month:'||v_company::text||':'||to_char(new.giorno,'YYYY-MM'),0));
 if tg_table_name='hr_buoni_pasto' and new.stato<>'annullato' and exists(select 1 from public.hr_buoni_pasto b where b.company_id=v_company and b.profilo_id=new.profilo_id and b.giorno=new.giorno and b.id<>new.id
   and b.tipo<>(to_jsonb(new)->>'tipo') and b.stato<>'annullato' and (new.stato in ('da_erogare','erogato') or b.stato in ('da_erogare','erogato'))) then raise exception 'Possibile doppio conteggio pasto: verifica buono fisso e ricevuta prima di procedere'; end if;
 if tg_op='UPDATE' and new.stato<>old.stato and new.stato not in ('maturato','annullato') and length(btrim(coalesce(to_jsonb(new)->>'note','')))<5 then raise exception 'Indica il riferimento della verifica o dell’erogazione esterna'; end if;
 if tg_op='UPDATE' and old.stato in ('erogato','rimborsato') and (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then raise exception 'Movimento già erogato: serve una rettifica separata'; end if;
 if tg_table_name='hr_rimborsi_km' then
   if tg_op='INSERT' and length(btrim(coalesce(to_jsonb(new)->>'note','')))<5 then raise exception 'Indica il riferimento del percorso e della spesa'; end if;
   if new.km<0 or new.km='NaN'::numeric or new.tariffa_eur_km<=0 or new.tariffa_eur_km='NaN'::numeric then raise exception 'Km e tariffa non validi'; end if;
   new.importo:=round(new.km*new.tariffa_eur_km,2);
   if tg_op='INSERT' and new.stato not in ('da_confermare','da_rimborsare') then raise exception 'Inserisci prima una richiesta di rimborso'; end if;
 elsif tg_op='INSERT' and new.stato<>'maturato' then raise exception 'Inserisci prima una maturazione'; end if;
 return new;
end $$;
revoke all on function private.hr_benefit_valida() from public,anon,authenticated;
create trigger hr_benefit_valida_pasto before insert or update or delete on public.hr_buoni_pasto for each row execute function private.hr_benefit_valida();
create trigger hr_benefit_valida_km before insert or update or delete on public.hr_rimborsi_km for each row execute function private.hr_benefit_valida();
create trigger hr_guard_mese_pasto before insert or update or delete on public.hr_buoni_pasto for each row execute function private.hr_blocca_mese_chiuso('giorno','giorno');
create trigger hr_guard_mese_km before insert or update or delete on public.hr_rimborsi_km for each row execute function private.hr_blocca_mese_chiuso('giorno','giorno');
create function private.hr_benefit_audit()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='INSERT' or (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then
   insert into public.hr_benefit_storico(company_id,tabella,record_id,prima,dopo,attore)
   values(new.company_id,tg_table_name,case when tg_table_name='hr_impostazioni_benefit' then new.company_id else (to_jsonb(new)->>'id')::uuid end,case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new),auth.uid());
 end if;
 return null;
end $$;
revoke all on function private.hr_benefit_audit() from public,anon,authenticated;
create trigger hr_benefit_audit_pasto after insert or update on public.hr_buoni_pasto for each row execute function private.hr_benefit_audit();
create trigger hr_benefit_audit_km after insert or update on public.hr_rimborsi_km for each row execute function private.hr_benefit_audit();

-- Reconcile only a selected OPEN month. Existing paid/settled rows are never rewritten.
create function public.hr_pasti_riconcilia(p_company uuid,p_mese date)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_cfg record; v_end date; v_count integer; v_cancel integer;
begin
 if auth.uid() is null or public.utente_bloccato() or public.utente_sola_lettura(p_company) or (public.e_amministratore_di(p_company) or public.has_role(auth.uid(),'super_admin'::public.app_role)) is distinct from true then raise exception 'Operazione non consentita'; end if;
 if p_mese is null or extract(day from p_mese)<>1 or p_mese<date '1900-01-01' or p_mese>date '2199-12-01' then raise exception 'Mese non valido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-month:'||p_company::text||':'||to_char(p_mese,'YYYY-MM'),0));
 if exists(select 1 from public.hr_chiusure_mensili where company_id=p_company and mese=p_mese and stato='chiuso') then raise exception 'Mese HR chiuso: serve riapertura autorizzata'; end if;
 select * into v_cfg from public.hr_impostazioni_benefit where company_id=p_company;
 if not found or v_cfg.buono_pasto_valore<=0 or v_cfg.buono_pasto_soglia_ore<=0 or v_cfg.buono_pasto_soglia_ore>24 then raise exception 'Configura prima le regole aziendali dei buoni pasto'; end if;
 v_end:=(p_mese+interval '1 month'-interval '1 day')::date;
 insert into public.hr_buoni_pasto(company_id,profilo_id,giorno,tipo,importo,stato)
 select p_company,p.id,g.data,'fisso',v_cfg.buono_pasto_valore,'maturato' from public.hr_profili p join public.hr_giornate g on g.profilo_id=p.id and g.company_id=p.company_id
 where p.company_id=p_company and p.buono_pasto_abilitato and v_cfg.buono_pasto_attivo and v_cfg.buono_pasto_modalita<>'ricevuta'
 and g.data between p_mese and v_end and g.ore_lavorate>=v_cfg.buono_pasto_soglia_ore
 and not exists(select 1 from public.hr_buoni_pasto r where r.company_id=p_company and r.profilo_id=p.id and r.giorno=g.data and r.tipo='ricevuta' and r.stato<>'annullato')
 on conflict(profilo_id,giorno) where tipo='fisso' do update set importo=excluded.importo,stato='maturato'
 where hr_buoni_pasto.stato in ('maturato','annullato');
 get diagnostics v_count=row_count;
 update public.hr_buoni_pasto b set stato='annullato'
 where b.company_id=p_company and b.giorno between p_mese and v_end and b.tipo='fisso' and b.stato='maturato'
 and not exists(select 1 from public.hr_profili p join public.hr_giornate g on g.profilo_id=p.id and g.company_id=p.company_id
   where p.id=b.profilo_id and p.company_id=p_company and g.data=b.giorno and p.buono_pasto_abilitato and v_cfg.buono_pasto_attivo and v_cfg.buono_pasto_modalita<>'ricevuta' and g.ore_lavorate>=v_cfg.buono_pasto_soglia_ore
   and not exists(select 1 from public.hr_buoni_pasto r where r.company_id=p_company and r.profilo_id=p.id and r.giorno=g.data and r.tipo='ricevuta' and r.stato<>'annullato'));
 get diagnostics v_cancel=row_count;
 return jsonb_build_object('verificati',v_count,'annullati',v_cancel,'erogazioni',0);
end $$;
revoke all on function public.hr_pasti_riconcilia(uuid,date) from public,anon;
grant execute on function public.hr_pasti_riconcilia(uuid,date) to authenticated;

-- Automatic maturity uses configured rights only. No defaults and no physical deletions.
create or replace function public.matura_buono_pasto_da_giornata()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare c record;p record;v_day date;v_company uuid;v_person uuid;v_ore numeric;v_ok boolean;
begin
 if tg_op='UPDATE' and (old.profilo_id<>new.profilo_id or old.data<>new.data or old.company_id<>new.company_id) then
   update public.hr_buoni_pasto set stato='annullato' where company_id=old.company_id and profilo_id=old.profilo_id and giorno=old.data and tipo='fisso' and stato='maturato';
 end if;
 if tg_op='DELETE' then v_day:=old.data;v_company:=old.company_id;v_person:=old.profilo_id;v_ore:=0;
 else v_day:=new.data;v_company:=new.company_id;v_person:=new.profilo_id;v_ore:=new.ore_lavorate; end if;
 select * into c from public.hr_impostazioni_benefit where company_id=v_company;
 if not found then if tg_op='DELETE' then return old; else return new; end if; end if;
 select buono_pasto_abilitato into p from public.hr_profili where id=v_person and company_id=v_company;
 v_ok:=tg_op<>'DELETE' and coalesce(p.buono_pasto_abilitato,false) and c.buono_pasto_attivo and c.buono_pasto_modalita<>'ricevuta' and v_ore>=c.buono_pasto_soglia_ore;
 v_ok:=v_ok and not exists(select 1 from public.hr_buoni_pasto r where r.company_id=v_company and r.profilo_id=v_person and r.giorno=v_day and r.tipo='ricevuta' and r.stato<>'annullato');
 if v_ok then
   insert into public.hr_buoni_pasto(company_id,profilo_id,giorno,tipo,importo,stato) values(v_company,v_person,v_day,'fisso',c.buono_pasto_valore,'maturato')
   on conflict(profilo_id,giorno) where tipo='fisso' do update set importo=excluded.importo,stato='maturato' where hr_buoni_pasto.stato in ('maturato','annullato');
 else update public.hr_buoni_pasto set stato='annullato' where company_id=v_company and profilo_id=v_person and giorno=v_day and tipo='fisso' and stato='maturato'; end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.matura_buono_pasto_da_giornata() from public,anon,authenticated;
drop trigger if exists trg_matura_buono_pasto on public.hr_giornate;
create trigger trg_matura_buono_pasto after insert or update of ore_lavorate,profilo_id,data,company_id or delete on public.hr_giornate for each row execute function public.matura_buono_pasto_da_giornata();

create function private.hr_benefit_config_valida()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or public.utente_bloccato() or public.utente_sola_lettura(new.company_id) or public.utente_e_cliente_esterno()
   or (public.e_amministratore_di(new.company_id) or public.has_role(auth.uid(),'super_admin'::public.app_role)) is distinct from true then raise exception 'Operazione non consentita'; end if;
 if tg_op='UPDATE' and new.company_id<>old.company_id then raise exception 'Azienda non modificabile'; end if;
 if new.buono_pasto_valore is null or new.buono_pasto_valore<=0 or new.buono_pasto_valore>10000 or new.buono_pasto_soglia_ore is null or new.buono_pasto_soglia_ore<=0 or new.buono_pasto_soglia_ore>24 or new.km_tariffa_eur is null or new.km_tariffa_eur<=0 or new.km_tariffa_eur>100 then raise exception 'Verifica valore, soglia ore e tariffa chilometrica'; end if;
 return new;
end $$;
revoke all on function private.hr_benefit_config_valida() from public,anon,authenticated;
create trigger hr_benefit_config_valida before insert or update on public.hr_impostazioni_benefit for each row execute function private.hr_benefit_config_valida();
create trigger hr_benefit_config_audit after insert or update on public.hr_impostazioni_benefit for each row execute function private.hr_benefit_audit();

create function private.hr_benefit_diritti_audit()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if (new.buono_pasto_abilitato,new.rimborso_km_abilitato) is distinct from (old.buono_pasto_abilitato,old.rimborso_km_abilitato) then
   if auth.uid() is not null and (public.utente_bloccato() or public.utente_sola_lettura(new.company_id) or public.utente_e_cliente_esterno()
     or (public.e_amministratore_di(new.company_id) or public.has_role(auth.uid(),'super_admin'::public.app_role)) is distinct from true) then raise exception 'Modifica diritti riservata agli amministratori autorizzati'; end if;
   insert into public.hr_benefit_storico(company_id,tabella,record_id,prima,dopo,attore) values(new.company_id,'hr_profili_diritti',new.id,
     jsonb_build_object('buono_pasto',old.buono_pasto_abilitato,'rimborso_km',old.rimborso_km_abilitato),
     jsonb_build_object('buono_pasto',new.buono_pasto_abilitato,'rimborso_km',new.rimborso_km_abilitato),auth.uid());
 end if;
 return null;
end $$;
revoke all on function private.hr_benefit_diritti_audit() from public,anon,authenticated;
create trigger hr_benefit_diritti_audit after update of buono_pasto_abilitato,rimborso_km_abilitato on public.hr_profili for each row execute function private.hr_benefit_diritti_audit();

create function public.hr_paghe_saldi(p_company uuid,p_data date)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from (
   select m.profilo_id,
     coalesce(sum(m.importo) filter(where coalesce(o.tipo,m.tipo) like 'tfr_%'),0) tfr_registrato,
     coalesce(sum(m.importo) filter(where coalesce(o.tipo,m.tipo) like 'welfare_%' and extract(year from m.data)=extract(year from p_data)),0) welfare_anno_registrato
   from public.hr_paghe_movimenti m left join public.hr_paghe_movimenti o on o.id=m.storno_di and o.company_id=m.company_id
   where m.company_id=p_company and m.data<=p_data and auth.uid() is not null group by m.profilo_id
 ) s;
$$;
revoke all on function public.hr_paghe_saldi(uuid,date) from public,anon;
grant execute on function public.hr_paghe_saldi(uuid,date) to authenticated;
