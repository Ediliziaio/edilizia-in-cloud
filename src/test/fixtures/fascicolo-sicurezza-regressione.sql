-- Entire fixture is rolled back, including permissions and audit events.
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
create temporary table fascicolo_prova(actor uuid,company_id uuid,sub_id uuid,order_id uuid,operaio uuid,evidenza uuid);
insert into fascicolo_prova
select sp.user_id,sp.company_id,s.id,o.id,gen_random_uuid(),gen_random_uuid()
from public.staff_permissions sp
join public.subappaltatori_sicurezza s on s.company_id=sp.company_id
join public.orders o on o.company_id=sp.company_id
where sp.can_view_sicurezza_cantiere and not sp.sola_lettura limit 1;
grant select on fascicolo_prova to authenticated;
do $$ begin if not exists(select 1 from fascicolo_prova) then raise exception 'Nessuna fixture aziendale disponibile'; end if; end $$;
insert into public.subappaltatori_operai(id,company_id,subappaltatore_id,nome,cognome,mansione)
select operaio,company_id,sub_id,'TEST TRANSITORIO','DA ROLLBACK','Operaio' from fascicolo_prova;
insert into public.sicurezza_fascicolo(id,company_id,subappaltatore_id,tipo,titolo)
select evidenza,company_id,sub_id,'durc','TEST TRANSITORIO' from fascicolo_prova;
-- Constraints work independently of UI validation.
do $$ declare f record; begin
 select * into f from fascicolo_prova;
 begin
  insert into public.subappaltatori_assegnazioni(company_id,subappaltatore_id,operaio_id,order_id,dal,al,attivita)
  values(f.company_id,f.sub_id,f.operaio,f.order_id,'2026-10-26','2026-10-25','Prova');
  raise exception 'ASSERT: periodo inverso accettato';
 exception when check_violation then null; end;
 begin
  insert into public.sicurezza_incarichi(company_id,order_id,ruolo,nominativo,dal,stato)
  values(f.company_id,f.order_id,'preposto','TEST','2026-10-26','documentato');
  raise exception 'ASSERT: nomina senza evidenza accettata';
 exception when check_violation then null; end;
 begin
  update public.sicurezza_fascicolo set file_path=f.company_id::text||'/'||f.evidenza::text||'/inesistente.pdf',stato='ricevuto' where id=f.evidenza;
  raise exception 'ASSERT: file inesistente accettato';
 exception when raise_exception then
  if sqlerrm like 'ASSERT:%' then raise; end if;
  if sqlerrm not like 'Il file non è presente%' then raise; end if;
 end;
 if not exists(select 1 from public.sicurezza_fascicolo_eventi where record_id=f.evidenza and azione='INSERT') then raise exception 'ASSERT: audit assente'; end if;
end $$;
-- Authenticated without membership: no visibility and no insert.
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare n int; f record; begin
 select * into f from fascicolo_prova;
 select count(*) into n from public.subappaltatori_operai where id=f.operaio;
 if n<>0 then raise exception 'ASSERT: lettura senza appartenenza'; end if;
 begin
  insert into public.subappaltatori_operai(company_id,subappaltatore_id,nome,cognome,mansione)
  values(f.company_id,f.sub_id,'TEST','NEGATO','Operaio');
  raise exception 'ASSERT: scrittura senza permesso';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Authorized safety staff reads/writes its tenant, cannot hard-delete history.
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true) from fascicolo_prova;
set local role authenticated;
do $$ declare n int; f record; begin
 select * into f from fascicolo_prova;
 select count(*) into n from public.subappaltatori_operai where id=f.operaio;
 if n<>1 then raise exception 'ASSERT: operatore autorizzato non legge'; end if;
 update public.subappaltatori_operai set mansione='Test modifica' where id=f.operaio;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'ASSERT: operatore autorizzato non scrive'; end if;
 begin
  delete from public.subappaltatori_operai where id=f.operaio;
  raise exception 'ASSERT: cancellazione fisica concessa';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.staff_permissions sp set sola_lettura=true from fascicolo_prova f where sp.user_id=f.actor and sp.company_id=f.company_id;
set local role authenticated;
do $$ declare n int; f record; begin
 select * into f from fascicolo_prova;
 if not public.utente_sola_lettura(f.company_id) then raise exception 'ASSERT: fixture sola lettura non applicabile'; end if;
 select count(*) into n from public.subappaltatori_operai where id=f.operaio;
 if n<>1 then raise exception 'ASSERT: sola lettura non legge'; end if;
 update public.subappaltatori_operai set mansione='NON DEVE CAMBIARE' where id=f.operaio;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'ASSERT: sola lettura modifica'; end if;
 begin
  insert into public.sicurezza_fascicolo(company_id,subappaltatore_id,tipo,titolo) values(f.company_id,f.sub_id,'durc','NEGATO');
  raise exception 'ASSERT: sola lettura crea';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: vincoli, file reali, audit, isolamento, scrittura, sola lettura e divieto cancellazione; fixture annullata' as risultato;
