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
do $$declare f record;d jsonb;c jsonb;r public.sicurezza_verifiche_itp;id2 uuid:=gen_random_uuid();id3 uuid:=gen_random_uuid();id4 uuid:=gen_random_uuid();begin
 select * into f from prova_itp;
 c:=jsonb_build_object('id','criterio','titolo','TEST solo tecnico','catalogo_id','visura','catalogo_versione',1,'applicabilita','applicabile','esito','conforme','riferimento','TEST senza valutazione normativa reale','note','','evidenze',jsonb_build_array(f.evidenza));
 d:=jsonb_build_object('fase_id',f.fase,'dal','2026-11-01','al','2026-11-30','esito','positivo','attivita','TEST ROLLBACK','responsabile','Tecnico di prova','ruolo_responsabile','TEST','motivazione','Solo verifica tecnica del software','completezza',true,'criteri',jsonb_build_array(c),'contesto_atteso',public.sicurezza_itp_contesto(f.azienda,f.ordine,f.sub,f.fase),'evidenze_attese',(select jsonb_build_object(id,updated_at) from public.sicurezza_fascicolo where id=f.evidenza));
 begin perform public.sicurezza_registra_itp(f.verifica,f.azienda,f.ordine,f.sub,null,jsonb_set(d,'{completezza}','false'));raise exception 'ASSERT: positivo senza completezza';exception when raise_exception then if sqlerrm not like 'Conferma di avere%' then raise;end if;end;
 begin perform public.sicurezza_registra_itp(f.verifica,f.azienda,f.ordine,f.sub,null,jsonb_set(d,'{evidenze_attese}','{}'));raise exception 'ASSERT: positivo senza token';exception when serialization_failure then null;end;
 begin perform public.sicurezza_registra_itp(f.verifica,f.azienda,f.ordine,f.sub,null,jsonb_set(d,'{contesto_atteso}','{}'));raise exception 'ASSERT: contesto ignorato';exception when serialization_failure then null;end;
 r:=public.sicurezza_registra_itp(f.verifica,f.azienda,f.ordine,f.sub,null,d);
 if r.versione<>1 or r.registrato_da<>f.actor or jsonb_array_length(r.evidenze)<>1 then raise exception 'ASSERT: registrazione non attribuita o senza snapshot';end if;
 if (public.sicurezza_registra_itp(f.verifica,f.azienda,f.ordine,f.sub,null,d)).id<>r.id or (select count(*) from public.sicurezza_verifiche_itp where subappaltatore_id=f.sub)<>1 then raise exception 'ASSERT: replay duplicato';end if;
 begin perform public.sicurezza_registra_itp(f.verifica,f.azienda,f.ordine,f.sub,null,jsonb_set(d,'{motivazione}','"diversa"'));raise exception 'ASSERT: riuso id con altri dati';exception when serialization_failure then null;end;
 begin perform public.sicurezza_registra_itp(id2,f.azienda,f.ordine,f.sub,null,d);raise exception 'ASSERT: storico obsoleto accettato';exception when serialization_failure then null;end;
 begin update public.sicurezza_verifiche_itp set motivazione='mutata' where id=f.verifica;raise exception 'ASSERT: update client accettato';exception when insufficient_privilege then null;end;
 -- Source edits must not rewrite the assessment or silently advance its review token.
 update public.sicurezza_fascicolo set stato='integrazione' where id=f.evidenza;
 -- now() is fixed inside this rollback transaction: explicitly provide an obsolete token.
 d:=jsonb_set(d,array['evidenze_attese',f.evidenza::text],to_jsonb('2000-01-01T00:00:00Z'::text));
 begin perform public.sicurezza_registra_itp(id2,f.azienda,f.ordine,f.sub,f.verifica,d);raise exception 'ASSERT: fonte cambiata accettata';exception when serialization_failure then null;end;
 if (select evidenze->0->>'stato' from public.sicurezza_verifiche_itp where id=f.verifica)<>'verificato' then raise exception 'ASSERT: storico riscritto';end if;
 d:=jsonb_set(d,'{evidenze_attese}',(select jsonb_build_object(id,updated_at) from public.sicurezza_fascicolo where id=f.evidenza));
 begin perform public.sicurezza_registra_itp(id2,f.azienda,f.ordine,f.sub,f.verifica,d);raise exception 'ASSERT: positivo con fonte non verificata';exception when raise_exception then if sqlerrm not like 'Per un esito positivo%' then raise;end if;end;
 d:=jsonb_set(jsonb_set(d,'{esito}','"negativo"'),'{criteri,0,esito}','"non_conforme"');
 r:=public.sicurezza_registra_itp(id2,f.azienda,f.ordine,f.sub,f.verifica,d);
 if r.versione<>2 or r.precedente_id<>f.verifica then raise exception 'ASSERT: concatenazione storico errata';end if;
 d:=jsonb_set(jsonb_set(jsonb_set(d,'{esito}','"non_applicabile"'),'{criteri,0,applicabilita}','"non_applicabile"'),'{criteri,0,esito}','"non_applicabile"');
 begin perform public.sicurezza_registra_itp(id3,f.azienda,f.ordine,f.sub,id2,d);raise exception 'ASSERT: NA senza motivazione';exception when raise_exception then if sqlerrm not like 'Motiva la non applicabilità%' then raise;end if;end;
 d:=jsonb_set(jsonb_set(d,'{criteri,0,note}','"TEST motivazione tecnica"'),'{criteri,0,evidenze}','[]');
 r:=public.sicurezza_registra_itp(id3,f.azienda,f.ordine,f.sub,id2,d);
 d:=jsonb_set(jsonb_set(d,'{esito}','"annullata"'),'{criteri}','[]');
 begin perform public.sicurezza_registra_itp(id4,f.azienda,f.ordine,f.sub,id3,jsonb_set(d,'{dal}','"2026-11-02"'));raise exception 'ASSERT: rettifica altro periodo';exception when raise_exception then if sqlerrm not like 'La rettifica deve riferirsi%' then raise;end if;end;
 r:=public.sicurezza_registra_itp(id4,f.azienda,f.ordine,f.sub,id3,d);
 if r.versione<>4 then raise exception 'ASSERT: rettifica non registrata';end if;
end$$;
-- An evidence limited to one phase cannot justify a case-wide positive outcome.
do $$declare f record;d jsonb;precedente uuid;begin
 select * into f from prova_itp;
 select id into precedente from public.sicurezza_verifiche_itp where subappaltatore_id=f.sub order by versione desc limit 1;
 update public.sicurezza_fascicolo set fase_id=f.fase,order_id=f.ordine where id=f.evidenza;
 update public.sicurezza_fascicolo set stato='verificato' where id=f.evidenza;
 d:=jsonb_build_object('fase_id',null,'dal','2026-11-01','esito','positivo','attivita','TEST','responsabile','TEST','ruolo_responsabile','TEST','motivazione','TEST','completezza',true,'criteri',jsonb_build_array(jsonb_build_object('id','test','titolo','TEST','applicabilita','applicabile','esito','conforme','riferimento','TEST','evidenze',jsonb_build_array(f.evidenza))),'contesto_atteso',public.sicurezza_itp_contesto(f.azienda,f.ordine,f.sub,null),'evidenze_attese',(select jsonb_build_object(id,updated_at) from public.sicurezza_fascicolo where id=f.evidenza));
 begin perform public.sicurezza_registra_itp(gen_random_uuid(),f.azienda,f.ordine,f.sub,precedente,d);raise exception 'ASSERT: evidenza di fase usata per la commessa intera';exception when raise_exception then if sqlerrm not like 'Un’evidenza limitata a una fase%' then raise;end if;end;
 update public.sicurezza_fascicolo set stato='integrazione' where id=f.evidenza;
 update public.sicurezza_fascicolo set fase_id=null,order_id=null,catalogo_id='durc',tipo='durc' where id=f.evidenza;
 update public.sicurezza_fascicolo set stato='verificato' where id=f.evidenza;
 d:=jsonb_set(d,'{evidenze_attese}',(select jsonb_build_object(id,updated_at) from public.sicurezza_fascicolo where id=f.evidenza));
 begin perform public.sicurezza_registra_itp(gen_random_uuid(),f.azienda,f.ordine,f.sub,precedente,d);raise exception 'ASSERT: DURC senza scadenza usato per positivo';exception when raise_exception then if sqlerrm not like 'Indica la scadenza effettiva del DURC%' then raise;end if;end;
end$$;
reset role;
-- Even privileged ordinary SQL cannot overwrite an existing assessment.
do $$begin
 begin delete from public.sicurezza_verifiche_itp where subappaltatore_id=(select sub from prova_itp);raise exception 'ASSERT: storico eliminabile';exception when raise_exception then if sqlerrm not like 'La verifica ITP registrata non si modifica%' then raise;end if;end;
end$$;
-- No unrelated authenticated user can read the case or call the context RPC.
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);set local role authenticated;
do $$declare f record;begin select * into f from prova_itp;
 if exists(select 1 from public.sicurezza_verifiche_itp where subappaltatore_id=f.sub) then raise exception 'ASSERT: fuga tenant';end if;
 begin perform public.sicurezza_itp_contesto(f.azienda,f.ordine,f.sub,f.fase);raise exception 'ASSERT: contesto esposto';exception when insufficient_privilege then null;end;
 begin perform public.sicurezza_registra_itp(gen_random_uuid(),f.azienda,f.ordine,f.sub,null,'{}');raise exception 'ASSERT: scrittura non autorizzata';exception when insufficient_privilege then null;end;
end$$;reset role;
select 'PASS: ITP criteri, fonti, contesto, idempotenza, versioni, annullamento, immutabilità e RLS' as esito;
rollback;
