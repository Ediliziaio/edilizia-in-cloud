begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
create temporary table mensili_prova(actor uuid,company_id uuid,sub_id uuid,contratto_id uuid,documento_id uuid,path text);
insert into mensili_prova
select sp.user_id,sp.company_id,s.id,gen_random_uuid(),gen_random_uuid(),null
from public.staff_permissions sp join public.subappaltatori_sicurezza s on s.company_id=sp.company_id
where exists(select 1 from public.orders o where o.company_id=sp.company_id)
and sp.can_view_sicurezza_cantiere and not sp.sola_lettura limit 1;
insert into public.contratti_subappalto(id,company_id,subappaltatore_id,order_id,descrizione_lavori)
select f.contratto_id,f.company_id,f.sub_id,(select o.id from public.orders o where o.company_id=f.company_id limit 1),'TEST CONTRATTO DA ROLLBACK' from mensili_prova f;

update mensili_prova set path=company_id::text||'/'||documento_id::text||'/sintetico.pdf';
grant select on mensili_prova to authenticated;
do $$ begin if not exists(select 1 from mensili_prova) then raise exception 'Fixture aziendale assente'; end if; end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true) from mensili_prova;
update public.staff_permissions sp set can_view_subappaltatori_amministrazione=false from mensili_prova f where sp.user_id=f.actor and sp.company_id=f.company_id;
insert into public.subappaltatori_documenti_mensili(id,company_id,subappaltatore_id,contratto_id,competenza,tipo)
select documento_id,company_id,sub_id,contratto_id,'2026-10','lul' from mensili_prova;
-- Storage metadata fixture only, never a real uploaded payroll file. Rolled back below.
insert into storage.objects(bucket_id,name,metadata) select 'subappaltatori-amministrazione',path,'{"mimetype":"application/pdf"}'::jsonb from mensili_prova;
update public.subappaltatori_documenti_mensili d set file_path=f.path,file_name='sintetico.pdf',stato='ricevuto' from mensili_prova f where d.id=f.documento_id;
set local role authenticated;
do $$ declare f record; n int; begin
 select * into f from mensili_prova;
 if not public.has_permission_for_company(f.actor,'can_view_sicurezza_cantiere',f.company_id) then raise exception 'ASSERT: fixture sicurezza non abilitata'; end if;
 select count(*) into n from public.subappaltatori_documenti_mensili where id=f.documento_id;
 if n<>0 then raise exception 'ASSERT: permesso sicurezza legge documenti amministrativi'; end if;
 select count(*) into n from storage.objects where bucket_id='subappaltatori-amministrazione' and name=f.path;
 if n<>0 then raise exception 'ASSERT: file amministrativo leggibile con policy generica'; end if;
 select count(*) into n from public.subappaltatori_mensili_eventi where documento_id=f.documento_id;
 if n<>0 then raise exception 'ASSERT: audit amministrativo visibile senza permesso'; end if;
 begin
  insert into public.subappaltatori_documenti_mensili(company_id,subappaltatore_id,contratto_id,competenza,tipo)
  values(f.company_id,f.sub_id,f.contratto_id,'2026-11','lul');
  raise exception 'ASSERT: scrittura amministrativa concessa a sicurezza';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.staff_permissions sp set can_view_subappaltatori_amministrazione=true from mensili_prova f where sp.user_id=f.actor and sp.company_id=f.company_id;
set local role authenticated;
do $$ declare f record; n int; begin
 select * into f from mensili_prova;
 select count(*) into n from public.subappaltatori_documenti_mensili where id=f.documento_id;
 if n<>1 then raise exception 'ASSERT: amministrazione non legge documento'; end if;
 select count(*) into n from storage.objects where bucket_id='subappaltatori-amministrazione' and name=f.path;
 if n<>1 then raise exception 'ASSERT: amministrazione non legge file'; end if;
 update public.subappaltatori_documenti_mensili set stato='verificato' where id=f.documento_id;
 if not exists(select 1 from public.subappaltatori_documenti_mensili where id=f.documento_id and verificato_da=f.actor and verificato_il is not null) then raise exception 'ASSERT: verifica senza autore'; end if;
 update storage.objects set metadata='{}' where bucket_id='subappaltatori-amministrazione' and name=f.path;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'ASSERT: file sostituibile'; end if;
 begin
  insert into public.subappaltatori_documenti_mensili(company_id,subappaltatore_id,contratto_id,competenza,tipo)
  values(f.company_id,f.sub_id,f.contratto_id,'2026-10','lul');
  raise exception 'ASSERT: doppia voce mensile corrente';
 exception when unique_violation then null; end;
end $$;
reset role;
update public.staff_permissions sp set sola_lettura=true from mensili_prova f where sp.user_id=f.actor and sp.company_id=f.company_id;
set local role authenticated;
do $$ declare f record; n int; begin
 select * into f from mensili_prova;
 update public.subappaltatori_documenti_mensili set stato='integrazione' where id=f.documento_id;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'ASSERT: sola lettura modifica fascicolo amministrativo'; end if;
end $$;
reset role;
rollback;
select 'PASS: sicurezza non vede amministrazione, file privati e audit protetti, permesso dedicato, verifica attribuita, file non sostituibile, duplicati e sola lettura; fixture annullata' as risultato;
