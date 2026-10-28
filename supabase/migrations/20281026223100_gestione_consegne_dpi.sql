-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

set local lock_timeout='3s';set local statement_timeout='60s';
alter table public.employee_dpi_consegne add column if not exists versione integer not null default 1;
alter table public.employee_dpi_consegne add column if not exists aggiornato_il timestamptz not null default now();
alter table public.employee_dpi_consegne add column if not exists note text not null default '';
alter table public.employee_dpi_consegne add column if not exists annullata boolean not null default false;
alter table public.employee_dpi_consegne add column if not exists annullamento_motivo text;

create or replace function public.sicurezza_dpi_proiezione(d public.employee_dpi_consegne)
returns jsonb language sql immutable security invoker set search_path=public as $$
 select jsonb_build_object('id',d.id,'tipo',d.dpi_type,'marca',d.dpi_brand,'taglia',d.dpi_size,'matricola',d.dpi_serial,
 'consegnato_il',d.consegna_date,'scade_il',d.expiry_date,'stato',d.status,'restituito_il',d.return_date,
 'modulo_registrato',nullif(trim(d.modulo_consegna_path),'') is not null,'versione',d.versione,'aggiornato_il',d.aggiornato_il,
 'note',d.note,'annullata',d.annullata,'annullamento_motivo',d.annullamento_motivo);
$$;
revoke all on function public.sicurezza_dpi_proiezione(public.employee_dpi_consegne) from public,anon,authenticated;

create table if not exists public.employee_dpi_eventi (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 consegna_id uuid not null, employee_id uuid not null, versione integer not null,
 operazione text not null check(operazione in ('creata','rettificata','eliminata')),
 prima jsonb, dopo jsonb, motivo text not null,
 registrato_da uuid, registrato_il timestamptz not null default clock_timestamp(),
 richiesta_id uuid, richiesta jsonb,
 unique(company_id,consegna_id,versione)
);
create unique index if not exists employee_dpi_eventi_richiesta on public.employee_dpi_eventi(richiesta_id) where richiesta_id is not null;
create index if not exists employee_dpi_eventi_addetto on public.employee_dpi_eventi(company_id,employee_id,consegna_id,versione);
alter table public.employee_dpi_eventi enable row level security;
revoke all on public.employee_dpi_eventi from public,anon,authenticated;
grant select on public.employee_dpi_eventi to authenticated;
drop policy if exists dpi_eventi_lettura on public.employee_dpi_eventi;
create policy dpi_eventi_lettura on public.employee_dpi_eventi for select to authenticated using (
 public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',company_id)
 or public.has_permission_for_company((select auth.uid()),'can_view_employees',company_id)
 or public.has_permission_for_company((select auth.uid()),'can_view_operai',company_id));
create or replace function public.sicurezza_dpi_eventi_immutabili() returns trigger language plpgsql security invoker set search_path=public as $$begin
 raise exception 'Lo storico delle consegne DPI non si modifica: rettifica la registrazione corrente';
end$$;
revoke all on function public.sicurezza_dpi_eventi_immutabili() from public,anon,authenticated;
drop trigger if exists sicurezza_dpi_eventi_immutabili on public.employee_dpi_eventi;
create trigger sicurezza_dpi_eventi_immutabili before update or delete on public.employee_dpi_eventi for each row execute function public.sicurezza_dpi_eventi_immutabili();

-- A restrictive policy keeps the pre-existing tenant policy and blocked-user policy in force.
drop policy if exists dpi_permesso_pertinente on public.employee_dpi_consegne;
create policy dpi_permesso_pertinente on public.employee_dpi_consegne as restrictive for all to authenticated
 using (public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',company_id)
 or public.has_permission_for_company((select auth.uid()),'can_view_employees',company_id)
 or public.has_permission_for_company((select auth.uid()),'can_view_operai',company_id))
 with check (public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',company_id)
 or public.has_permission_for_company((select auth.uid()),'can_view_employees',company_id)
 or public.has_permission_for_company((select auth.uid()),'can_view_operai',company_id));

create or replace function public.sicurezza_dpi_guardia() returns trigger language plpgsql security invoker set search_path=public as $$
declare azienda uuid;
begin
 azienda:=case when tg_op='DELETE' then old.company_id else new.company_id end;
 if auth.uid() is not null and (public.utente_sola_lettura(azienda) or not (
 public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',azienda)
 or public.has_permission_for_company(auth.uid(),'can_view_employees',azienda)
 or public.has_permission_for_company(auth.uid(),'can_view_operai',azienda))) then
 raise exception 'Non puoi modificare il registro DPI di questa azienda' using errcode='42501';end if;
 if tg_op='DELETE' then return old;end if;
 if tg_op='UPDATE' and (new.id,new.company_id,new.employee_id) is distinct from (old.id,old.company_id,old.employee_id) then
  raise exception 'Una consegna DPI non si trasferisce a un altro addetto o azienda';end if;
 if not exists(select 1 from public.employees e where e.id=new.employee_id and e.company_id=new.company_id and coalesce(e.role_type,'')<>'subappaltatore') then
  raise exception 'Il dipendente non appartiene all’azienda della consegna';end if;
 if new.expiry_date<new.consegna_date or new.return_date<new.consegna_date then raise exception 'Le date DPI precedono la consegna';end if;
 if new.annullata and length(trim(coalesce(new.annullamento_motivo,'')))<3 then raise exception 'Motiva l’annullamento della consegna';end if;
 if not new.annullata then new.annullamento_motivo:=null;end if;
 if length(coalesce(new.note,''))>2000 or length(coalesce(new.annullamento_motivo,''))>2000 then raise exception 'Testo del registro DPI troppo lungo';end if;
 if length(coalesce(new.dpi_brand,''))>200 or length(coalesce(new.dpi_size,''))>200 or length(coalesce(new.dpi_serial,''))>200 then raise exception 'Marca, taglia o matricola troppo lunghe';end if;
 new.versione:=case when tg_op='INSERT' then 1 else old.versione+1 end;
 new.created_at:=case when tg_op='INSERT' then clock_timestamp() else old.created_at end;
 new.aggiornato_il:=clock_timestamp();
 return new;
end$$;
revoke all on function public.sicurezza_dpi_guardia() from public,anon,authenticated;
drop trigger if exists sicurezza_dpi_guardia on public.employee_dpi_consegne;
create trigger sicurezza_dpi_guardia before insert or update or delete on public.employee_dpi_consegne for each row execute function public.sicurezza_dpi_guardia();

create or replace function public.sicurezza_dpi_audit() returns trigger language plpgsql security definer set search_path=public as $$
declare prima jsonb;dopo jsonb;meta jsonb;azienda uuid;addetto uuid;consegna uuid;v integer;
begin
 meta:=nullif(current_setting('sicurezza.dpi_operazione',true),'')::jsonb;
 if tg_op<>'INSERT' then prima:=public.sicurezza_dpi_proiezione(old);end if;
 if tg_op<>'DELETE' then dopo:=public.sicurezza_dpi_proiezione(new);end if;
 if tg_op='DELETE' then azienda:=old.company_id;addetto:=old.employee_id;consegna:=old.id;v:=old.versione+1;
 else azienda:=new.company_id;addetto:=new.employee_id;consegna:=new.id;v:=new.versione;end if;
 insert into public.employee_dpi_eventi(company_id,employee_id,consegna_id,versione,operazione,prima,dopo,motivo,registrato_da,richiesta_id,richiesta)
 values(azienda,addetto,consegna,v,case tg_op when 'INSERT' then 'creata' when 'DELETE' then 'eliminata' else 'rettificata' end,prima,dopo,
 coalesce(meta->>'motivo','Operazione dal registro d’origine'),auth.uid(),(meta->>'id')::uuid,meta->'richiesta');
 if tg_op='DELETE' then return old;end if;return new;
end$$;
revoke all on function public.sicurezza_dpi_audit() from public,anon,authenticated;
drop trigger if exists sicurezza_dpi_audit on public.employee_dpi_consegne;
create trigger sicurezza_dpi_audit after insert or update or delete on public.employee_dpi_consegne for each row execute function public.sicurezza_dpi_audit();

create or replace function public.sicurezza_salva_dpi(_id uuid,_company uuid,_ordine uuid,_employee uuid,_data date,_fase uuid,_versione integer,_request uuid,_dati jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.employee_dpi_consegne;evento public.employee_dpi_eventi;quadro jsonb;richiesta jsonb;k text;motivo text;v_annullata boolean;crea boolean;
begin
 if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company) or public.utente_sola_lettura(_company) then
 raise exception 'Non puoi registrare consegne DPI in questa azienda' using errcode='42501';end if;
 perform set_config('lock_timeout','3s',true);
 if _id is null or _request is null or _employee is null or jsonb_typeof(_dati) is distinct from 'object' or length(_dati::text)>16000 then raise exception 'Richiesta DPI non valida';end if;
 for k in select jsonb_object_keys(_dati) loop
  if k not in ('tipo','marca','taglia','matricola','consegnato_il','scade_il','stato','restituito_il','note','annullata','motivo') then raise exception 'Campo DPI non consentito: %',k;end if;
  if k<>'annullata' and jsonb_typeof(_dati->k) not in ('string','null') then raise exception 'Campo DPI non testuale: %',k;end if;
 end loop;
 if jsonb_typeof(_dati->'annullata') is distinct from 'boolean' then raise exception 'Indica se la registrazione è annullata';end if;
 motivo:=trim(coalesce(_dati->>'motivo',''));v_annullata:=(_dati->>'annullata')::boolean;
 if length(motivo)<3 or length(motivo)>2000 then raise exception 'Indica il motivo della registrazione o rettifica (3–2000 caratteri)';end if;
 if coalesce(_dati->>'tipo','') not in ('casco','scarpe_antinfortunistiche','imbragatura','occhiali','guanti','mascherina_ffp','tappi_auricolari','giubbino_alta_visibilita','tuta_chimica','elmetto_arrampicata') then raise exception 'Scegli il tipo DPI';end if;
 if coalesce(_dati->>'stato','') not in ('in_use','damaged','lost','returned','expired') then raise exception 'Scegli lo stato del DPI';end if;
 if nullif(_dati->>'consegnato_il','') is null then raise exception 'Indica la data di consegna';end if;
 if _dati->>'stato'='returned' and nullif(_dati->>'restituito_il','') is null then raise exception 'Indica la data di restituzione';end if;
 if exists(select 1 from jsonb_each_text(_dati)x where x.key in ('marca','taglia','matricola') and length(x.value)>200) then raise exception 'Marca, taglia o matricola troppo lunghe';end if;
 quadro:=public.sicurezza_dpi_commessa(_company,_ordine,_data,_fase);
 if not exists(select 1 from jsonb_array_elements(quadro->'addetti')a where a->>'id'=_employee::text) then raise exception 'L’addetto non è collegato al contesto della commessa' using errcode='40001';end if;
 richiesta:=jsonb_build_object('id',_id,'company',_company,'ordine',_ordine,'employee',_employee,'data',_data,'fase',_fase,'versione',_versione,'dati',_dati);
 perform pg_advisory_xact_lock(hashtextextended('dpi_richiesta:'||_request::text,0));
 select * into evento from public.employee_dpi_eventi where richiesta_id=_request;
 if found then
  if evento.company_id=_company and evento.registrato_da=auth.uid() and evento.richiesta=richiesta then return evento.dopo;end if;
  raise exception 'Identificativo della richiesta già usato per altri dati' using errcode='40001';
 end if;
 select * into r from public.employee_dpi_consegne where id=_id and company_id=_company and employee_id=_employee for update;
 crea:=not found;
 if crea then
  if _versione is not null then raise exception 'Consegna non più disponibile: rileggi il registro' using errcode='40001';end if;
  if not exists(select 1 from public.employees e where e.id=_employee and e.company_id=_company and e.is_active is true) then raise exception 'Per una nuova consegna scegli un addetto attivo';end if;
  if exists(select 1 from public.employee_dpi_eventi where consegna_id=_id) then raise exception 'Identificativo di una consegna storica già utilizzato';end if;
 else
  if r.company_id<>_company or r.employee_id<>_employee then raise exception 'Consegna non disponibile per questo addetto' using errcode='42501';end if;
  if _versione is distinct from r.versione then raise exception 'La consegna è cambiata: rileggi il registro prima di rettificarla' using errcode='40001';end if;
 end if;
 perform set_config('sicurezza.dpi_operazione',jsonb_build_object('id',_request,'richiesta',richiesta,'motivo',motivo)::text,true);
 if crea then
  insert into public.employee_dpi_consegne(id,company_id,employee_id,dpi_type,dpi_brand,dpi_size,dpi_serial,consegna_date,expiry_date,status,return_date,note,annullata,annullamento_motivo)
  values(_id,_company,_employee,_dati->>'tipo',nullif(trim(_dati->>'marca'),''),nullif(trim(_dati->>'taglia'),''),nullif(trim(_dati->>'matricola'),''),(_dati->>'consegnato_il')::date,nullif(_dati->>'scade_il','')::date,_dati->>'stato',nullif(_dati->>'restituito_il','')::date,coalesce(_dati->>'note',''),v_annullata,case when v_annullata then motivo end) returning * into r;
 else
  update public.employee_dpi_consegne set dpi_type=_dati->>'tipo',dpi_brand=nullif(trim(_dati->>'marca'),''),dpi_size=nullif(trim(_dati->>'taglia'),''),dpi_serial=nullif(trim(_dati->>'matricola'),''),consegna_date=(_dati->>'consegnato_il')::date,expiry_date=nullif(_dati->>'scade_il','')::date,status=_dati->>'stato',return_date=nullif(_dati->>'restituito_il','')::date,note=coalesce(_dati->>'note',''),annullata=v_annullata,annullamento_motivo=case when v_annullata then motivo end where id=_id returning * into r;
 end if;
 perform set_config('sicurezza.dpi_operazione','',true);
 return public.sicurezza_dpi_proiezione(r);
end$$;
revoke all on function public.sicurezza_salva_dpi(uuid,uuid,uuid,uuid,date,uuid,integer,uuid,jsonb) from public,anon;
grant execute on function public.sicurezza_salva_dpi(uuid,uuid,uuid,uuid,date,uuid,integer,uuid,jsonb) to authenticated;

create or replace function public.sicurezza_dpi_commessa(_company uuid,_ordine uuid,_data date,_fase uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare risultato jsonb;
begin
 if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company) then
  raise exception 'Non puoi consultare i DPI di questa azienda' using errcode='42501';
 end if;
 if _data is null then raise exception 'Indica la data di riferimento';end if;
 if not exists(select 1 from public.orders o where o.id=_ordine and o.company_id=_company and o.deleted_at is null) then
  raise exception 'Commessa non disponibile in questa azienda' using errcode='42501';
 end if;
 if _fase is not null and not exists(select 1 from public.order_work_phases f where f.id=_fase and f.order_id=_ordine and f.company_id=_company) then
  raise exception 'La fase non appartiene alla commessa';
 end if;
 with assegnazioni as (
  select e.id employee_id,jsonb_build_object('fonte','commessa','dal',null,'al',null,'fase_id',oe.phase_id) dati
  from public.order_employees oe join public.employees e on e.id=oe.employee_id and e.company_id=_company and coalesce(e.role_type,'')<>'subappaltatore'
  where oe.order_id=_ordine and (_fase is null or oe.phase_id is null or oe.phase_id=_fase)
  union all
  select e.id,jsonb_build_object('fonte','campo','dal',a.data_inizio,'al',a.data_fine_prevista,'fase_id',null)
  from public.order_campo_assignments a join public.employees e on e.user_id=a.user_id and e.company_id=_company and coalesce(e.role_type,'')<>'subappaltatore'
  where a.company_id=_company and a.order_id=_ordine and a.role_type in ('employee','operaio','capocantiere')
   and (a.data_inizio is null or a.data_inizio<=_data) and (a.data_fine_prevista is null or a.data_fine_prevista>=_data)
 ), addetti as (
  select employee_id,jsonb_agg(distinct dati) assegnazioni from assegnazioni group by employee_id
 )
 select jsonb_build_object('data',_data,'fase_id',_fase,'addetti',coalesce((
  select jsonb_agg(jsonb_build_object('id',e.id,'nome',e.first_name,'cognome',e.last_name,'qualifica',e.qualifica,'attivo',e.is_active,'assegnazioni',a.assegnazioni,
   'consegne',coalesce((select jsonb_agg(public.sicurezza_dpi_proiezione(d) order by d.consegna_date desc,d.id)
    from public.employee_dpi_consegne d where d.company_id=_company and d.employee_id=e.id),'[]'::jsonb)) order by e.last_name,e.first_name,e.id)
  from addetti a join public.employees e on e.id=a.employee_id and e.company_id=_company and coalesce(e.role_type,'')<>'subappaltatore'),'[]'::jsonb),
 'esterni_legacy',(select count(distinct e.id) from public.employees e where e.company_id=_company and e.role_type='subappaltatore' and (exists(select 1 from public.order_employees oe where oe.employee_id=e.id and oe.order_id=_ordine and (_fase is null or oe.phase_id is null or oe.phase_id=_fase)) or exists(select 1 from public.order_campo_assignments ca where ca.company_id=_company and ca.order_id=_ordine and ca.user_id=e.user_id and (ca.data_inizio is null or ca.data_inizio<=_data) and (ca.data_fine_prevista is null or ca.data_fine_prevista>=_data)))),
 'campo_senza_dipendente',(select count(distinct a.user_id) from public.order_campo_assignments a
  where a.company_id=_company and a.order_id=_ordine and a.role_type in ('employee','operaio','capocantiere')
   and (a.data_inizio is null or a.data_inizio<=_data) and (a.data_fine_prevista is null or a.data_fine_prevista>=_data)
   and not exists(select 1 from public.employees e where e.user_id=a.user_id and e.company_id=_company and coalesce(e.role_type,'')<>'subappaltatore'))) into risultato;
 return risultato;
end$$;
revoke all on function public.sicurezza_dpi_commessa(uuid,uuid,date,uuid) from public,anon;
grant execute on function public.sicurezza_dpi_commessa(uuid,uuid,date,uuid) to authenticated;
