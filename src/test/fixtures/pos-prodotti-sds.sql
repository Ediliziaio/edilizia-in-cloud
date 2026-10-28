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
-- Mark the actual SDS verified, then explicitly refresh the inventory snapshot.
update public.sicurezza_fascicolo set stato='verificato' where id=(select e1 from prova_sds);
set local role authenticated;
do $$declare f record;q jsonb;d jsonb;begin
 select * into f from prova_sds;q:=public.sicurezza_prodotti_quadro(f.azienda,f.ordine,'2026-11-15',null);
 d:=f.payload||jsonb_build_object('evidenza_impronta',(select x->>'impronta' from jsonb_array_elements(q->'documenti')x where x->>'id'=f.e1::text));
 perform public.sicurezza_prodotto_salva(f.p1,f.azienda,f.ordine,1,gen_random_uuid(),'2026-11-15',d);
 perform public.sicurezza_prodotto_salva(f.p2,f.azienda,f.ordine,1,gen_random_uuid(),'2026-11-15',d||jsonb_build_object('materiale_id',f.m2,'materiale_impronta',(select x->>'impronta' from jsonb_array_elements(q->'materiali')x where x->>'id'=f.m2::text),'nome','TEST SDS Prodotto due','fase_id',f.fase2,'evidenza_id',null,'evidenza_impronta',null,'corrispondenza_confermata',false,'sds_necessaria','no','motivo_non_necessaria','Valutazione sintetica non necessaria'));
end$$;
reset role;
create temporary table prova_pos_sds(pos uuid default gen_random_uuid(),contenuto jsonb,prova jsonb,e jsonb,m jsonb,atteso timestamptz);
grant select on prova_pos_sds to authenticated;
insert into prova_pos_sds(contenuto) select jsonb_build_object('versione_modello',1,'versione_controlli',2,'versione_prodotti',1,'opera',jsonb_build_object('data_inizio','2026-11-01','data_fine','2026-11-30'),'lavorazioni',(select jsonb_agg(jsonb_build_object('id',p.id,'titolo',p.nome,'fase_id',p.fase_id,'sostanze',case when p.sds_necessaria='si' then 'Sigillante' else 'Nessuna' end,'prodotti_riesaminati',true,'prodotti',jsonb_build_array(public.pos_prodotto_fotografia(p))) order by p.id) from public.sicurezza_prodotti_impieghi p where p.id in(f.p1,f.p2))) from prova_sds f;
insert into public.pos_documents(id,company_id,order_id,tipo_lavori,indirizzo_cantiere,status,revisione,document_type,contenuto) select t.pos,f.azienda,f.ordine,'TEST POS SDS ROLLBACK','Indirizzo sintetico','bozza',0,'pos',t.contenuto from prova_pos_sds t cross join prova_sds f;
update prova_pos_sds t set atteso=p.updated_at from public.pos_documents p where p.id=t.pos;
do $$declare f record;t record;q jsonb;begin
 select * into f from prova_sds;select * into t from prova_pos_sds;
 q:=public.pos_prodotti_fonti_emissione(t.pos,f.actor);
 if jsonb_array_length(q->'prodotti')<>2 or jsonb_array_length(q->'allegati')<>1 or q->'allegati'->0->>'evidenza_id'<>f.e1::text then raise exception 'ASSERT: fotografie o allegati non esatti';end if;
 begin perform public.pos_prodotti_verifica(f.azienda,f.ordine,jsonb_set(t.contenuto,'{lavorazioni,0,prodotti,0,nome}','"Fotografia falsa"'));raise exception 'ASSERT: fotografia client alterabile';exception when serialization_failure then null;end;
 begin perform public.pos_prodotti_verifica(f.azienda,f.ordine,jsonb_set(t.contenuto,'{lavorazioni,0,prodotti_riesaminati}','false'));raise exception 'ASSERT: elenco non riesaminato';exception when raise_exception then if sqlerrm not like 'Riesamina i prodotti%' then raise;end if;end;
 begin perform public.pos_prodotti_verifica(f.azienda,f.ordine,jsonb_set(t.contenuto,'{lavorazioni,0,prodotti}','[]'));raise exception 'ASSERT: prodotto omesso';exception when raise_exception then if sqlerrm not like 'Impiego proprio nel periodo non collegato%' then raise;end if;end;
 begin update public.pos_documents set contenuto=contenuto-'versione_prodotti' where id=t.pos;raise exception 'ASSERT: vecchio editor può cancellare protocollo';exception when serialization_failure then null;end;
 update prova_pos_sds set prova=q;
end$$;
set local role authenticated;
do $$begin begin perform public.pos_prodotti_fonti_emissione((select pos from prova_pos_sds),(select actor from prova_sds));raise exception 'ASSERT: client risolve file per emissione';exception when insufficient_privilege then null;end;end$$;
reset role;
-- A document covering the reference day alone cannot cover a longer POS usage interval.
do $$declare f record;t record;d jsonb;c jsonb;begin
 select * into f from prova_sds;select * into t from prova_pos_sds;
 begin
  update public.sicurezza_fascicolo set stato='integrazione' where id=f.e1;
  update public.sicurezza_fascicolo set applicabile_al='2026-11-20' where id=f.e1;
  update public.sicurezza_fascicolo set stato='verificato' where id=f.e1;
  d:=f.payload||jsonb_build_object('evidenza_impronta',(select public.sicurezza_sds_documento(e)->>'impronta' from public.sicurezza_fascicolo e where e.id=f.e1));
  perform public.sicurezza_prodotto_salva(f.p1,f.azienda,f.ordine,2,gen_random_uuid(),'2026-11-15',d);
  c:=jsonb_set(t.contenuto,'{lavorazioni}',(select jsonb_agg(jsonb_build_object('id',p.id,'titolo',p.nome,'fase_id',p.fase_id,'prodotti_riesaminati',true,'prodotti',jsonb_build_array(public.pos_prodotto_fotografia(p))) order by p.id) from public.sicurezza_prodotti_impieghi p where p.id in(f.p1,f.p2)));
  begin perform public.pos_prodotti_verifica(f.azienda,f.ordine,c);raise exception 'ASSERT: copertura parziale periodo accettata';exception when raise_exception then if sqlerrm not like 'SDS non disponibile per l’intero periodo%' then raise;end if;end;
  raise exception 'ROLLBACK SUBTEST PERIODO SDS';
 exception when raise_exception then if sqlerrm<>'ROLLBACK SUBTEST PERIODO SDS' then raise;end if;end;
end$$;
-- The final approval gate must require both photographs and the matching stored SDS.
update prova_pos_sds t set e=public.pos_prenota_emissione(t.pos,f.actor,t.atteso,null) from prova_sds f;
update prova_pos_sds t set m=jsonb_build_object('emissioneId',t.e->>'id','companyId',f.azienda,'posId',t.pos,'revisione',0,'origine','approvazione_corrente','file',(select jsonb_agg(jsonb_build_object('nome',n,'path',f.azienda::text||'/'||(t.e->>'id')||'/'||(t.e->>'token')||'/'||n,'sha256',repeat('a',64),'dimensione',1)) from unnest(array['POS.pdf','modello.html','fonti.json'])n)) from prova_sds f;
insert into storage.objects(bucket_id,name) select 'pos-emissioni',f.azienda::text||'/'||(t.e->>'id')||'/'||(t.e->>'token')||'/'||n from prova_pos_sds t cross join prova_sds f cross join unnest(array['POS.pdf','modello.html','fonti.json','manifest.json','fascicolo.zip','SDS.pdf'])n;
do $$declare f record;t record;begin select * into f from prova_sds;select * into t from prova_pos_sds;
 begin perform public.pos_completa_emissione((t.e->>'id')::uuid,(t.e->>'token')::uuid,f.actor,'TEST',t.m,repeat('b',64),repeat('c',64));raise exception 'ASSERT: vecchio pacchetto approva prodotti';exception when raise_exception then if sqlerrm<>'Il pacchetto non conserva le fotografie prodotto riesaminate' then raise;end if;end;
 t.m:=t.m||jsonb_build_object('prodotti_sds',jsonb_build_object('versione',1,'prodotti',t.prova->'prodotti'));
 begin perform public.pos_completa_emissione((t.e->>'id')::uuid,(t.e->>'token')::uuid,f.actor,'TEST',t.m,repeat('b',64),repeat('c',64));raise exception 'ASSERT: file SDS non dichiarato nel pacchetto';exception when raise_exception then if sqlerrm<>'SDS specifica non conservata nel pacchetto' then raise;end if;end;
 if exists(select 1 from public.pos_documents where id=t.pos and status='approvato') then raise exception 'ASSERT: approvazione parziale';end if;
 update prova_pos_sds set m=t.m||jsonb_build_object('file',(t.m->'file')||jsonb_build_array(jsonb_build_object('nome','SDS.pdf','path',f.azienda::text||'/'||(t.e->>'id')||'/'||(t.e->>'token')||'/SDS.pdf','sha256',repeat('d',64),'dimensione',1,'ruolo','allegato','tipo','scheda_sicurezza','evidenza_id',f.e1,'impronta_metadati',t.prova->'allegati'->0->>'impronta','fonte',jsonb_build_object('bucket','fascicoli-cantiere','path',t.prova->'allegati'->0->>'path'))));
end$$;
-- A same-transaction source edit still invalidates approval.
update public.sicurezza_fascicolo set titolo='TEST SDS CAMBIATA DURANTE EMISSIONE' where id=(select e1 from prova_sds);
do $$declare f record;t record;begin select * into f from prova_sds;select * into t from prova_pos_sds;
 begin perform public.pos_completa_emissione((t.e->>'id')::uuid,(t.e->>'token')::uuid,f.actor,'TEST',t.m,repeat('b',64),repeat('c',64));raise exception 'ASSERT: fonte cambiata durante emissione';exception when serialization_failure then null;end;
end$$;
update public.sicurezza_fascicolo set titolo='TEST SDS File' where id=(select e1 from prova_sds);
select public.pos_completa_emissione((t.e->>'id')::uuid,(t.e->>'token')::uuid,f.actor,'TEST SINTETICO',t.m,repeat('b',64),repeat('c',64)) from prova_pos_sds t cross join prova_sds f;
do $$begin if not exists(select 1 from public.pos_documents where id=(select pos from prova_pos_sds) and status='approvato') then raise exception 'ASSERT: flusso corretto non completa';end if;end$$;
select 'PASS fotografie prodotto, copertura, sorgenti e gate atomico SDS (solo metadati)' risultato;
rollback;
