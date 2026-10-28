begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
create temporary table prova_modello(actor uuid,azienda uuid,modello uuid);
insert into prova_modello select user_id,company_id,gen_random_uuid() from public.staff_permissions where can_view_sicurezza_cantiere and not sola_lettura limit 1;
grant select on prova_modello to authenticated;
do $$ begin if not exists(select 1 from prova_modello) then raise exception 'Fixture non disponibile';end if;end $$;
insert into public.pos_modelli_aziendali(id,company_id,nome,ambito,versione,contenuto,created_by)
select modello,azienda,'TEST TRANSITORIO','Solo regressione',1,'{"versione_modello":1,"lavorazioni":[{"titolo":"Test"}]}',actor from prova_modello;
do $$ declare f record;begin
 select * into f from prova_modello;
 begin
  insert into public.pos_modelli_aziendali(company_id,nome,ambito,versione,contenuto,created_by) values(f.azienda,'TEST TRANSITORIO','Test',1,'{"versione_modello":1,"lavorazioni":[{}]}',f.actor);
  raise exception 'ASSERT: versione duplicata accettata';
 exception when unique_violation then null;end;
 begin
  insert into public.pos_modelli_aziendali(company_id,nome,ambito,versione,contenuto,created_by) values(f.azienda,'NEGATO','Test',1,'{"versione_modello":1,"lavorazioni":[{}],"formazione":[{"nominativo":"PRIVATO"}]}',f.actor);
  raise exception 'ASSERT: intero POS archiviato come modello';
 exception when check_violation then null;end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin if exists(select 1 from public.pos_modelli_aziendali where id=(select modello from prova_modello)) then raise exception 'ASSERT: modello visibile senza appartenenza';end if;end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true) from prova_modello;
set local role authenticated;
do $$ declare f record;begin
 select * into f from prova_modello;
 if not exists(select 1 from public.pos_modelli_aziendali where id=f.modello) then raise exception 'ASSERT: modello aziendale non leggibile';end if;
 begin
  update public.pos_modelli_aziendali set contenuto='{}' where id=f.modello;
  raise exception 'ASSERT: versione alterabile dal client';
 exception when insufficient_privilege then null;end;
 begin
  delete from public.pos_modelli_aziendali where id=f.modello;
  raise exception 'ASSERT: cancellazione dal client concessa';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.pos_modelli_aziendali(company_id,nome,ambito,versione,contenuto,created_by) values(f.azienda,'NEGATO','Test',1,'{"versione_modello":1,"lavorazioni":[{}]}',f.actor);
  raise exception 'ASSERT: creazione client senza sanitizzazione';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: isolamento aziendale, versioni univoche, contenuto limitato e divieto scritture client; tutto annullato' as risultato;
