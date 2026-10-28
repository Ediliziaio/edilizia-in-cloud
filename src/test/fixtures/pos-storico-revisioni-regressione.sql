begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
create temporary table pos_storico_prova(actor uuid,company_id uuid,order_id uuid,pos_id uuid,atteso timestamptz);
insert into pos_storico_prova select sp.user_id,sp.company_id,o.id,gen_random_uuid(),clock_timestamp()
from public.staff_permissions sp join public.orders o on o.company_id=sp.company_id where sp.can_view_sicurezza_cantiere and not sp.sola_lettura limit 1;
grant select on pos_storico_prova to authenticated;
do $$ begin if not exists(select 1 from pos_storico_prova) then raise exception 'Fixture aziendale assente'; end if; end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true) from pos_storico_prova;
insert into public.pos_documents(id,company_id,order_id,tipo_lavori,indirizzo_cantiere,status,revisione,contenuto,iter,updated_at)
select pos_id,company_id,order_id,'TEST ROLLBACK','Indirizzo sintetico','bozza',0,
'{"versione_modello":1,"versione_controlli":1,"formazione":[{"nominativo":"TEST","base":true,"verificata":true}]}'::jsonb,
'{"firma_datore_il":"2026-10-01","note":"TEST ITER ORIGINALE"}'::jsonb,atteso from pos_storico_prova;
-- Emulate the trusted approval endpoint inside the rolled-back fixture.
update public.pos_documents p set status='approvato',approvato_da=f.actor,approvato_il=f.atteso,approvato_da_nome='TEST APPROVATORE'
from pos_storico_prova f where p.id=f.pos_id;
do $$ declare f record; n int; begin
 select * into f from pos_storico_prova;
 select count(*) into n from public.pos_contenuti_archiviati where pos_id=f.pos_id and revisione=0;
 if n<>1 then raise exception 'ASSERT: snapshot approvazione assente o duplicato'; end if;
 begin
  update public.pos_documents set contenuto='{}' where id=f.pos_id;
  raise exception 'ASSERT: contenuto approvato modificabile';
 exception when raise_exception then if sqlerrm like 'ASSERT:%' then raise; end if; end;
 begin
  update public.pos_contenuti_archiviati set snapshot='{}' where pos_id=f.pos_id;
  raise exception 'ASSERT: snapshot modificabile';
 exception when raise_exception then if sqlerrm like 'ASSERT:%' then raise; end if; end;
end $$;
set local role authenticated;
do $$ declare f record; p record; snap jsonb; begin
 select * into f from pos_storico_prova;
 begin
  perform public.pos_apri_revisione(f.pos_id,'Prova revisione',f.atteso-interval '1 second');
  raise exception 'ASSERT: timestamp obsoleto accettato';
 exception when raise_exception then if sqlerrm like 'ASSERT:%' then raise; end if; if sqlerrm not like 'Il POS è cambiato%' then raise; end if; end;
 perform public.pos_apri_revisione(f.pos_id,'Prova revisione',f.atteso);
 select * into p from public.pos_documents where id=f.pos_id;
 if p.revisione<>1 or p.status<>'bozza' or p.iter<>'{}'::jsonb or p.approvato_da is not null or p.approvato_il is not null then raise exception 'ASSERT: firme/approvazioni ereditate'; end if;
 if p.contenuto->'versione_controlli'<>'2'::jsonb or p.contenuto#>'{formazione,0,verificata}'<>'false'::jsonb then raise exception 'ASSERT: nuova verifica non richiesta'; end if;
 select snapshot into snap from public.pos_contenuti_archiviati where pos_id=f.pos_id and revisione=0;
 if snap#>'{contenuto,versione_controlli}'<>'1'::jsonb or snap#>'{contenuto,formazione,0,verificata}'<>'true'::jsonb or snap#>>'{iter,note}'<>'TEST ITER ORIGINALE' then raise exception 'ASSERT: originale riscritto'; end if;
 begin
  perform public.pos_apri_revisione(f.pos_id,'Seconda richiesta concorrente',f.atteso);
  raise exception 'ASSERT: seconda apertura accettata';
 exception when raise_exception then if sqlerrm like 'ASSERT:%' then raise; end if; end;
 begin
  delete from public.pos_documents where id=f.pos_id;
  raise exception 'ASSERT: storico cancellato dal documento';
 exception when foreign_key_violation then null; when raise_exception then if sqlerrm not like 'Il POS ha un iter%' then raise;end if; end;
end $$;
reset role;
-- A v2 document cannot lose its review controls through an older editor.
do $$ begin
 begin
  update public.pos_documents p set contenuto=p.contenuto-'versione_controlli' from pos_storico_prova f where p.id=f.pos_id;
  raise exception 'ASSERT: editor precedente rimuove i controlli';
 exception when raise_exception then if sqlerrm not like 'Questo POS usa i controlli aggiornati%' then raise;end if;end;
end $$;
-- A separate original v1 document still supports the already published revision client.
alter table pos_storico_prova add column legacy_id uuid default gen_random_uuid();
insert into public.pos_documents(id,company_id,order_id,tipo_lavori,indirizzo_cantiere,status,revisione,contenuto,iter,document_type)
select f.legacy_id,f.company_id,f.order_id,'TEST LEGACY ROLLBACK','Sintetico','bozza',0,jsonb_set(p.contenuto,'{versione_controlli}','1'::jsonb),'{}','pos' from pos_storico_prova f join public.pos_documents p on p.id=f.pos_id;
update public.pos_documents p set status='approvato',approvato_da=f.actor,approvato_il=clock_timestamp() from pos_storico_prova f where p.id=f.legacy_id;
set local role authenticated;
update public.pos_documents p set status='bozza',revisione=1,iter='{}',approvato_da=null,approvato_da_nome=null,approvato_il=null from pos_storico_prova f where p.id=f.legacy_id;
do $$ begin if not exists(select 1 from public.pos_documents p join pos_storico_prova f on p.id=f.legacy_id where p.status='bozza' and p.revisione=1) then raise exception 'ASSERT: client precedente incompatibile'; end if; end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare f record; n int; begin
 select * into f from pos_storico_prova;
 select count(*) into n from public.pos_contenuti_archiviati where pos_id=f.pos_id;
 if n<>0 then raise exception 'ASSERT: snapshot visibile senza accesso'; end if;
end $$;
reset role;
rollback;
select 'PASS: snapshot immutabile, originale conservato, reset iter/verifiche, revisione atomica, timestamp obsoleto, doppia apertura e isolamento; fixture annullata' as risultato;
