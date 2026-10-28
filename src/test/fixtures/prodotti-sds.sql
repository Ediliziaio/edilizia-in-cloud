-- Synthetic metadata, no physical files. All source and audit writes roll back.
begin;set local lock_timeout='3s';set local statement_timeout='60s';
create temporary table prova_sds(actor uuid,azienda uuid,ordine uuid,altro_ordine uuid,sub uuid,fase uuid,fase2 uuid,m1 uuid,m2 uuid,m3 uuid,m4 uuid,e1 uuid,e2 uuid,e3 uuid,e4 uuid,p1 uuid,p2 uuid,req uuid,payload jsonb,prima jsonb);
insert into prova_sds select sp.user_id,sp.company_id,o.id,o2.id,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,null from public.staff_permissions sp join public.orders o on o.company_id=sp.company_id and o.deleted_at is null join public.orders o2 on o2.company_id=sp.company_id and o2.deleted_at is null and o2.id<>o.id where sp.can_view_sicurezza_cantiere and not sp.sola_lettura limit 1;
grant select,update on prova_sds to authenticated;
do $$begin if not exists(select 1 from prova_sds) then raise exception 'Fixture SDS non disponibile';end if;end$$;
insert into public.subappaltatori_sicurezza(id,company_id,order_id,ragione_sociale) select sub,azienda,ordine,'TEST SDS IMPRESA' from prova_sds;
insert into public.order_work_phases(id,company_id,order_id,name,position) select x.id,f.azienda,f.ordine,'TEST SDS FASE',x.pos from prova_sds f cross join lateral(values(f.fase,998),(f.fase2,999))x(id,pos);
insert into public.order_items(id,order_id,name,natura_riga,phase_id) select x.id,x.ordine,'TEST SDS Prodotto omonimo',x.natura,x.fase from prova_sds f cross join lateral(values(f.m1,f.ordine,'materiale',f.fase),(f.m2,f.ordine,'materiale',f.fase2),(f.m3,f.altro_ordine,'materiale',null::uuid),(f.m4,f.ordine,'lavorazione',f.fase))x(id,ordine,natura,fase);
insert into storage.objects(bucket_id,name) select 'fascicoli-cantiere',f.azienda::text||'/'||x.id::text||'/sds-sintetica.pdf' from prova_sds f cross join lateral(values(f.e1),(f.e2),(f.e3),(f.e4))x(id);
insert into public.sicurezza_fascicolo(id,company_id,subappaltatore_id,order_id,fase_id,tipo,titolo,file_path,file_name,stato,revisione,data_rilascio)
 select x.id,f.azienda,x.sub,x.ordine,x.fase,'sds','TEST SDS File',f.azienda::text||'/'||x.id::text||'/sds-sintetica.pdf','sds-sintetica.pdf','ricevuto','1.0','2026-10-01' from prova_sds f cross join lateral(values(f.e1,null::uuid,f.ordine,null::uuid),(f.e2,f.sub,f.ordine,null::uuid),(f.e3,null::uuid,f.altro_ordine,null::uuid),(f.e4,null::uuid,f.ordine,f.fase2))x(id,sub,ordine,fase);
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true) from prova_sds;set local role authenticated;
do $$declare f record;q jsonb;d jsonb;r jsonb;begin
 select * into f from prova_sds;q:=public.sicurezza_prodotti_quadro(f.azienda,f.ordine,'2026-11-15',f.fase);
 if exists(select 1 from jsonb_array_elements(q->'materiali')x where x->>'id' in (f.m3::text,f.m4::text)) then raise exception 'ASSERT: altra commessa o lavorazione tra i materiali';end if;
 if not exists(select 1 from jsonb_array_elements(q->'materiali')x where x->>'id'=f.m1::text) or not exists(select 1 from jsonb_array_elements(q->'materiali')x where x->>'id'=f.m2::text) then raise exception 'ASSERT: materiali omonimi fusi';end if;
 if q::text like '%file_path%' or q::text like '%purchase_price%' or q::text like '%unit_cost%' then raise exception 'ASSERT: proiezione troppo ampia';end if;
 if exists(select 1 from jsonb_array_elements(q->'documenti')x where x->>'id'=f.e3::text) then raise exception 'ASSERT: SDS altra commessa proposta';end if;
 d:=jsonb_build_object('materiale_id',f.m1,'materiale_impronta',(select x->>'impronta' from jsonb_array_elements(q->'materiali')x where x->>'id'=f.m1::text),'subappaltatore_id',null,'fase_id',f.fase,'nome','TEST SDS Prodotto uno','produttore','Fabbricante','codice','P1','impiego','Sigillatura giunti','area','Piano terra','dal','2026-11-01','al','2026-11-30','sds_necessaria','si','motivo_non_necessaria',null,'evidenza_id',f.e1,'evidenza_impronta',(select x->>'impronta' from jsonb_array_elements(q->'documenti')x where x->>'id'=f.e1::text),'corrispondenza_confermata',true,'note','TEST SDS ROLLBACK','annullato',false,'motivo','Prova registrazione prodotto');
 begin perform public.sicurezza_prodotto_salva(f.p1,f.azienda,f.ordine,null,f.req,'2026-11-15',d||jsonb_build_object('evidenza_id',f.e2));raise exception 'ASSERT: file impresa esterna';exception when raise_exception then if sqlerrm not like 'SDS non pertinente%' then raise;end if;end;
 begin perform public.sicurezza_prodotto_salva(f.p1,f.azienda,f.ordine,null,f.req,'2026-11-15',d||jsonb_build_object('evidenza_id',f.e4));raise exception 'ASSERT: file altra fase';exception when raise_exception then if sqlerrm not like 'SDS non pertinente%' then raise;end if;end;
 begin perform public.sicurezza_prodotto_salva(f.p1,f.azienda,f.ordine,null,f.req,'2026-11-15',d||jsonb_build_object('dal','tomorrow'));raise exception 'ASSERT: data relativa';exception when raise_exception then if sqlerrm<>'Indica date ISO valide' then raise;end if;end;
 begin perform public.sicurezza_prodotto_salva(f.p1,f.azienda,f.ordine,null,f.req,'2026-11-15',d||jsonb_build_object('sds_necessaria','no'));raise exception 'ASSERT: non necessaria senza motivo';exception when raise_exception then if sqlerrm<>'Motiva perché la SDS non è necessaria' then raise;end if;end;
 begin perform public.sicurezza_prodotto_salva(f.p1,f.azienda,f.ordine,null,f.req,'2026-11-15',d||jsonb_build_object('evidenza_id',f.e3));raise exception 'ASSERT: SDS di altra commessa accettata';exception when raise_exception then if sqlerrm not like 'SDS non pertinente%' then raise;end if;end;
 begin perform public.sicurezza_prodotto_salva(f.p1,f.azienda,f.ordine,null,f.req,'2026-11-15',d||jsonb_build_object('registrato_da',f.actor));raise exception 'ASSERT: autore client accettato';exception when raise_exception then if sqlerrm not like 'Campo prodotto non consentito%' then raise;end if;end;
 r:=public.sicurezza_prodotto_salva(f.p1,f.azienda,f.ordine,null,f.req,'2026-11-15',d);
 if (r->>'versione')::int<>1 or r->'evidenza_snapshot'->>'revisione'<>'1.0' then raise exception 'ASSERT: versione o revisione SDS persa';end if;
 if public.sicurezza_prodotto_salva(f.p1,f.azienda,f.ordine,null,f.req,'2026-11-15',d)<>r or (select count(*) from public.sicurezza_prodotti_eventi where impiego_id=f.p1)<>1 then raise exception 'ASSERT: retry duplicato';end if;
 begin perform public.sicurezza_prodotto_salva(f.p1,f.azienda,f.ordine,null,f.req,'2026-11-15',d||jsonb_build_object('nome','Altro'));raise exception 'ASSERT: nonce per altri dati';exception when serialization_failure then null;end;
 begin perform public.sicurezza_prodotto_salva(f.p1,f.azienda,f.ordine,0,gen_random_uuid(),'2026-11-15',d);raise exception 'ASSERT: base superata';exception when serialization_failure then null;end;
 if public.sicurezza_sds_apri(f.azienda,f.ordine,f.p1,'2026-11-15',d->>'evidenza_impronta') is null then raise exception 'ASSERT: apertura autorizzata';end if;
 -- Second product stays visibly without a file; a generic SDS is never auto-assigned.
 perform public.sicurezza_prodotto_salva(f.p2,f.azienda,f.ordine,null,gen_random_uuid(),'2026-11-15',d||jsonb_build_object('materiale_id',f.m2,'materiale_impronta',(select x->>'impronta' from jsonb_array_elements(q->'materiali')x where x->>'id'=f.m2::text),'nome','TEST SDS Prodotto due','fase_id',f.fase2,'evidenza_id',null,'evidenza_impronta',null,'corrispondenza_confermata',false));
 q:=public.sicurezza_prodotti_quadro(f.azienda,f.ordine,'2026-11-15',f.fase);
 if not exists(select 1 from jsonb_array_elements(q->'impieghi')x where x->>'id'=f.p2::text and x->>'evidenza_id' is null and not (x->>'pertinente')::boolean) then raise exception 'ASSERT: prodotto mancante nascosto o coperto genericamente';end if;
 begin update public.sicurezza_prodotti_impieghi set nome='Bypass' where id=f.p1;raise exception 'ASSERT: scrittura diretta API';exception when insufficient_privilege then null;end;
 begin delete from public.sicurezza_prodotti_eventi where impiego_id=f.p1;raise exception 'ASSERT: eventi cancellabili da API';exception when insufficient_privilege then null;end;
 update prova_sds set payload=d,prima=r;
end$$;
reset role;
update public.order_items set name='TEST SDS Nuovo nome' where id=(select m1 from prova_sds);
update public.sicurezza_fascicolo set revisione='2.0' where id=(select e1 from prova_sds);
set local role authenticated;
do $$declare f record;q jsonb;x jsonb;d jsonb;r jsonb;begin
 select * into f from prova_sds;q:=public.sicurezza_prodotti_quadro(f.azienda,f.ordine,'2026-11-15',f.fase);x:=(select y from jsonb_array_elements(q->'impieghi')y where y->>'id'=f.p1::text);
 if not (x->>'materiale_cambiato')::boolean or not (x->>'documento_cambiato')::boolean then raise exception 'ASSERT: fonte cambiata nascosta';end if;
 begin perform public.sicurezza_prodotto_salva(f.p1,f.azienda,f.ordine,1,gen_random_uuid(),'2026-11-15',f.payload);raise exception 'ASSERT: fonte vecchia accettata';exception when serialization_failure then null;end;
 begin perform public.sicurezza_sds_apri(f.azienda,f.ordine,f.p1,'2026-11-15',f.payload->>'evidenza_impronta');raise exception 'ASSERT: apertura vecchia SDS';exception when raise_exception then if sqlerrm not like 'SDS cambiata%' then raise;end if;end;
 if (select dopo from public.sicurezza_prodotti_eventi where impiego_id=f.p1 and versione=1)<>f.prima then raise exception 'ASSERT: storico riscritto';end if;
 r:=public.sicurezza_prodotto_salva(f.p1,f.azienda,f.ordine,1,gen_random_uuid(),'2026-11-15',f.payload||jsonb_build_object('annullato',true));
 if r->'evidenza_snapshot'<>f.prima->'evidenza_snapshot' then raise exception 'ASSERT: annullamento perde vecchia SDS';end if;
 begin perform public.sicurezza_prodotto_salva(f.p1,f.azienda,f.ordine,2,gen_random_uuid(),'2026-11-15',f.payload);raise exception 'ASSERT: ripristino senza rilettura';exception when serialization_failure then null;end;
 d:=f.payload||jsonb_build_object('materiale_impronta',(select y->>'impronta' from jsonb_array_elements(q->'materiali')y where y->>'id'=f.m1::text),'evidenza_impronta',(select y->>'impronta' from jsonb_array_elements(q->'documenti')y where y->>'id'=f.e1::text));
 r:=public.sicurezza_prodotto_salva(f.p1,f.azienda,f.ordine,2,gen_random_uuid(),'2026-11-15',d);
 if (r->>'versione')::int<>3 or r->'evidenza_snapshot'->>'revisione'<>'2.0' then raise exception 'ASSERT: ripristino non aggiornato';end if;
 update prova_sds set payload=d;
end$$;
reset role;
-- Removing a source material must preserve its inventory snapshot and expose the missing source.
delete from public.order_items where id=(select m2 from prova_sds);
set local role authenticated;
do $$declare f record;q jsonb;begin
 select * into f from prova_sds;q:=public.sicurezza_prodotti_quadro(f.azienda,f.ordine,'2026-11-15',null);
 if not exists(select 1 from jsonb_array_elements(q->'impieghi')x where x->>'id'=f.p2::text and (x->>'materiale_cambiato')::boolean and x->'materiale_snapshot'->>'id'=f.m2::text) then raise exception 'ASSERT: origine rimossa senza lacuna';end if;
end$$;
reset role;
do $$begin
 begin update public.sicurezza_prodotti_eventi set motivo='Bypass' where impiego_id=(select p1 from prova_sds);raise exception 'ASSERT: evento mutabile';exception when raise_exception then if sqlerrm<>'Gli eventi dei prodotti non si modificano o eliminano' then raise;end if;end;
end$$;
update public.staff_permissions set sola_lettura=true where user_id=(select actor from prova_sds) and company_id=(select azienda from prova_sds);
set local role authenticated;
do $$declare f record;begin select * into f from prova_sds;perform public.sicurezza_prodotti_quadro(f.azienda,f.ordine,'2026-11-15',null);
 begin perform public.sicurezza_prodotto_salva(f.p1,f.azienda,f.ordine,3,gen_random_uuid(),'2026-11-15',f.payload);raise exception 'ASSERT: sola lettura scrive';exception when insufficient_privilege then null;end;
end$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
set local role authenticated;
do $$declare f record;begin select * into f from prova_sds;
 begin perform public.sicurezza_prodotti_quadro(f.azienda,f.ordine,'2026-11-15',null);raise exception 'ASSERT: utente estraneo legge';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.sicurezza_prodotti_eventi where company_id=f.azienda) then raise exception 'ASSERT: RLS storico estraneo';end if;
end$$;
reset role;
select 'PASS prodotti, SDS specifiche, fonti/versioni, audit e permessi' risultato;
rollback;
