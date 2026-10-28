-- Synthetic records and storage metadata only; all writes, including audit, roll back.
begin;set local lock_timeout='3s';set local statement_timeout='60s';
create temporary table prova_itp(actor uuid,azienda uuid,ordine uuid,sub uuid,fase uuid,evidenza uuid,verifica uuid);
insert into prova_itp select sp.user_id,sp.company_id,o.id,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid() from public.staff_permissions sp join public.orders o on o.company_id=sp.company_id where sp.can_view_sicurezza_cantiere and not sp.sola_lettura and o.deleted_at is null limit 1;
grant select on prova_itp to authenticated;
do $$begin if not exists(select 1 from prova_itp) then raise exception 'Fixture autorizzata non disponibile';end if;end$$;
insert into public.subappaltatori_sicurezza(id,company_id,order_id,ragione_sociale) select sub,azienda,ordine,'TEST ITP ROLLBACK' from prova_itp;
insert into public.order_work_phases(id,company_id,order_id,name,position,start_date,end_date) select fase,azienda,ordine,'TEST ITP FASE',999,'2026-11-01','2026-11-30' from prova_itp;
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true) from prova_itp;set local role authenticated;
insert into public.sicurezza_fascicolo(id,company_id,subappaltatore_id,tipo,titolo,catalogo_id,catalogo_versione) select evidenza,azienda,sub,'visura','TEST ITP VISURA','visura',1 from prova_itp;
reset role;
insert into storage.objects(bucket_id,name) select 'fascicoli-cantiere',azienda::text||'/'||evidenza::text||'/sintetico.pdf' from prova_itp;
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true) from prova_itp;set local role authenticated;
update public.sicurezza_fascicolo e set file_path=f.azienda::text||'/'||f.evidenza::text||'/sintetico.pdf',file_name='sintetico.pdf',stato='verificato' from prova_itp f where e.id=f.evidenza;
do $$declare f record;p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();r1 uuid:=gen_random_uuid();r2 uuid:=gen_random_uuid();d jsonb;itp jsonb;criteri jsonb;p public.sicurezza_profili_requisiti;v public.sicurezza_verifiche_itp;begin
 select * into f from prova_itp;
 d:=jsonb_build_object('nome','TEST PROFILO ROLLBACK','attivita','Lavorazioni di prova','ruoli','Impresa e preposto','limiti','Solo test tecnico, non requisiti reali','testi_generici',true,'criteri',jsonb_build_array(jsonb_build_object('id',r1,'titolo','Visura camerale','catalogo_id','visura','catalogo_versione',1,'riferimento','Riferimento di prova','indicazioni','Indicazione da valutare'),jsonb_build_object('id',r2,'titolo','Criterio libero','catalogo_id',null,'catalogo_versione',null,'riferimento','','indicazioni','Non è una motivazione di non applicabilità')));
 begin perform public.sicurezza_salva_profilo(p1,f.azienda,null,jsonb_set(d,'{testi_generici}','false'));raise exception 'ASSERT: conferma testi mancante';exception when raise_exception then if sqlerrm not like 'Conferma che i testi%' then raise;end if;end;
 begin perform public.sicurezza_salva_profilo(p1,f.azienda,null,jsonb_set(d,'{criteri,0,catalogo_id}','"doma"'));raise exception 'ASSERT: voce riservata nel profilo';exception when raise_exception then if sqlerrm not like 'Voce del catalogo non disponibile%' then raise;end if;end;
 begin perform public.sicurezza_salva_profilo(p1,f.azienda,null,jsonb_set(d,'{criteri,0,esito}','"conforme"'));raise exception 'ASSERT: profilo memorizza un esito';exception when raise_exception then if sqlerrm not like 'Criteri del profilo non validi%' then raise;end if;end;
 begin perform public.sicurezza_salva_profilo(p1,f.azienda,null,jsonb_set(d,'{criteri,0,indicazioni}','true'));raise exception 'ASSERT: indicazioni non testuali';exception when raise_exception then if sqlerrm not like 'Titolo, riferimento e indicazioni%' then raise;end if;end;
 p:=public.sicurezza_salva_profilo(p1,f.azienda,null,d);
 if p.versione<>1 or p.famiglia_id<>p1 or p.creato_da<>f.actor then raise exception 'ASSERT: creazione profilo errata';end if;
 if (public.sicurezza_salva_profilo(p1,f.azienda,null,d)).id<>p1 or (select count(*) from public.sicurezza_profili_eventi where profilo_id=p1)<>1 then raise exception 'ASSERT: replay non idempotente';end if;
 p:=public.sicurezza_salva_profilo(p2,f.azienda,p1,jsonb_set(d,'{limiti}','"Versione due"'));
 if p.versione<>2 or p.famiglia_id<>p1 or p.precedente_id<>p1 or (select limiti from public.sicurezza_profili_requisiti where id=p1)<>'Solo test tecnico, non requisiti reali' then raise exception 'ASSERT: versione precedente riscritta';end if;
 begin perform public.sicurezza_salva_profilo(gen_random_uuid(),f.azienda,p1,d);raise exception 'ASSERT: nuova versione da base obsoleta';exception when serialization_failure then null;end;
 begin update public.sicurezza_profili_requisiti set nome='Alterato' where id=p1;raise exception 'ASSERT: scrittura diretta client';exception when insufficient_privilege then null;end;
 select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'titolo',c->>'titolo','catalogo_id',c->>'catalogo_id','catalogo_versione',c->'catalogo_versione','riferimento',c->>'riferimento','note','','applicabilita','da_chiarire','esito','da_verificare','evidenze','[]'::jsonb,'profilo_id',p1,'profilo_versione',1,'requisito_id',c->>'id','profilo_snapshot',jsonb_build_object('nome','FALSO'))) into criteri from jsonb_array_elements(d->'criteri')c;
 itp:=jsonb_build_object('fase_id',f.fase,'dal','2026-11-01','esito','da_integrare','attivita','TEST PROFILI ROLLBACK','responsabile','TEST','ruolo_responsabile','TEST','motivazione','TEST senza giudizio reale','completezza',false,'criteri',criteri,'contesto_atteso',public.sicurezza_itp_contesto(f.azienda,f.ordine,f.sub,f.fase),'evidenze_attese','{}'::jsonb);
 begin perform public.sicurezza_registra_itp(f.verifica,f.azienda,f.ordine,f.sub,null,jsonb_set(itp,'{criteri}',jsonb_build_array(criteri->0)));raise exception 'ASSERT: profilo applicato parzialmente';exception when raise_exception then if sqlerrm not like 'Mantieni tutti i criteri%' then raise;end if;end;
 begin perform public.sicurezza_registra_itp(f.verifica,f.azienda,f.ordine,f.sub,null,jsonb_set(itp,'{criteri,0,titolo}','"Titolo alterato"'));raise exception 'ASSERT: provenienza falsa';exception when raise_exception then if sqlerrm not like 'Il criterio non corrisponde%' then raise;end if;end;
 v:=public.sicurezza_registra_itp(f.verifica,f.azienda,f.ordine,f.sub,null,itp);
 if v.criteri->0->'profilo_snapshot'->>'nome'<>'TEST PROFILO ROLLBACK' or v.criteri->0->'profilo_snapshot'->>'limiti'<>'Solo test tecnico, non requisiti reali' or v.criteri->0->'profilo_snapshot'->>'versione'<>'1' then raise exception 'ASSERT: snapshot forgiato o aggiornamento automatico alla v2';end if;
 p:=public.sicurezza_archivia_profilo(p1,f.azienda,true,false);
 if not p.archiviato then raise exception 'ASSERT: archiviazione fallita';end if;
 begin perform public.sicurezza_registra_itp(gen_random_uuid(),f.azienda,f.ordine,f.sub,f.verifica,itp);raise exception 'ASSERT: versione archiviata riusata';exception when raise_exception then if sqlerrm not like 'Profilo non disponibile o archiviato%' then raise;end if;end;
 if (select t.criteri->0->'profilo_snapshot'->>'versione' from public.sicurezza_verifiche_itp t where t.id=f.verifica)<>'1' then raise exception 'ASSERT: archiviazione modifica lo storico';end if;
 perform public.sicurezza_archivia_profilo(p1,f.azienda,true,false);
 if (select count(*) from public.sicurezza_profili_eventi where profilo_id=p1)<>2 then raise exception 'ASSERT: duplicazione evento archiviazione';end if;
 perform public.sicurezza_archivia_profilo(p1,f.azienda,false,true);
 if (select count(*) from public.sicurezza_profili_eventi where profilo_id=p1)<>3 then raise exception 'ASSERT: ripristino non tracciato';end if;
end$$;
reset role;
do $$begin
 begin update public.sicurezza_profili_requisiti set nome='Sovrascritto' where nome='TEST PROFILO ROLLBACK';raise exception 'ASSERT: profilo sovrascritto';exception when raise_exception then if sqlerrm not like 'I contenuti del profilo%' then raise;end if;end;
 begin delete from public.sicurezza_profili_eventi where profilo_id in(select p.id from public.sicurezza_profili_requisiti p where p.nome='TEST PROFILO ROLLBACK' and p.company_id=(select azienda from prova_itp));raise exception 'ASSERT: eventi modificabili';exception when raise_exception then if sqlerrm not like 'La verifica ITP registrata non si modifica%' then raise;end if;end;
end$$;
-- A real profile row from a different company cannot be referenced through the current company.
with esterno as (select gen_random_uuid() as id,c.id as azienda from public.companies c where c.id<>(select azienda from prova_itp) limit 1)
insert into public.sicurezza_profili_requisiti(id,company_id,famiglia_id,versione,nome,attivita,ruoli,limiti,criteri,richiesta,creato_da)
select e.id,e.azienda,e.id,1,'TEST PROFILO ESTRANEO','TEST','TEST','TEST',p.criteri,'{}',p.creato_da from esterno e cross join lateral(select * from public.sicurezza_profili_requisiti where company_id=(select azienda from prova_itp) and nome='TEST PROFILO ROLLBACK' limit 1)p;
create temporary table profilo_estraneo_test as select id from public.sicurezza_profili_requisiti where nome='TEST PROFILO ESTRANEO';grant select on profilo_estraneo_test to authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true) from prova_itp;set local role authenticated;
do $$declare f record;estraneo uuid;d jsonb;begin
 select * into f from prova_itp;
 select id into estraneo from profilo_estraneo_test;
 if estraneo is null then raise exception 'Fixture altra azienda non disponibile';end if;
 begin perform public.sicurezza_salva_profilo(gen_random_uuid(),f.azienda,estraneo,'{"nome":"TEST","attivita":"TEST","ruoli":"TEST","limiti":"TEST","testi_generici":true,"criteri":[{"id":"f3548b94-b0de-409b-a26c-5f85b37371dc","titolo":"TEST","catalogo_id":null,"catalogo_versione":null,"riferimento":"","indicazioni":""}]}');raise exception 'ASSERT: famiglia estranea';exception when raise_exception then if sqlerrm not like 'Profilo di partenza non disponibile%' then raise;end if;end;
 begin perform public.sicurezza_archivia_profilo(estraneo,f.azienda,true,false);raise exception 'ASSERT: archivio azienda estranea';exception when raise_exception then if sqlerrm not like 'Profilo non disponibile%' then raise;end if;end;
end$$;reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);set local role authenticated;
do $$declare f record;begin select * into f from prova_itp;
 if exists(select 1 from public.sicurezza_profili_requisiti where company_id=f.azienda) or exists(select 1 from public.sicurezza_profili_eventi where company_id=f.azienda) then raise exception 'ASSERT: fuga aziendale profili';end if;
 begin perform public.sicurezza_salva_profilo(gen_random_uuid(),f.azienda,null,'{}');raise exception 'ASSERT: creazione non autorizzata';exception when insufficient_privilege then null;end;
end$$;reset role;
select 'PASS: profili versionati, catalogo, attestazione, idempotenza, provenienza ITP, copertura criteri, archivio reversibile, storico e isolamento' as esito;
rollback;
