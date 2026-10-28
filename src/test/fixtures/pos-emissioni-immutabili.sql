begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
create temporary table prova_emissione(actor uuid,azienda uuid,ordine uuid,pos uuid,atteso timestamptz,e jsonb,m jsonb);
insert into prova_emissione select sp.user_id,sp.company_id,o.id,gen_random_uuid(),clock_timestamp(),null,null from public.staff_permissions sp join public.orders o on o.company_id=sp.company_id where sp.can_view_sicurezza_cantiere and not sp.sola_lettura and not public.has_permission_for_company(sp.user_id,'__solo_amministratori__',sp.company_id) limit 1;
grant select on prova_emissione to authenticated,service_role;
do $$ begin if not exists(select 1 from prova_emissione) then raise exception 'Fixture assente';end if;end $$;
insert into public.pos_documents(id,company_id,order_id,tipo_lavori,indirizzo_cantiere,status,revisione,contenuto,iter,updated_at,document_type) select pos,azienda,ordine,'TEST EMISSIONE ROLLBACK','Sintetico','bozza',0,'{"versione_modello":1,"versione_controlli":2}','{}',atteso,'pos' from prova_emissione;
update prova_emissione set e=public.pos_prenota_emissione(pos,actor,atteso);
do $$ declare f record; begin
 select * into f from prova_emissione;
 begin perform public.pos_prenota_emissione(f.pos,f.actor,f.atteso);raise exception 'ASSERT: seconda prenotazione concorrente concessa'; exception when lock_not_available then null;end;
end $$;
update prova_emissione set m=jsonb_build_object('emissioneId',e->>'id','companyId',azienda,'posId',pos,'revisione',0,'origine','approvazione_corrente','file',(select jsonb_agg(jsonb_build_object('nome',n,'path',azienda::text||'/'||(e->>'id')||'/'||(e->>'token')||'/'||n,'sha256',repeat('a',64),'dimensione',1)) from unnest(array['POS.pdf','modello.html','fonti.json'])n));
-- Storage metadata only: no bytes are claimed to be genuine by this transactional database fixture.
insert into storage.objects(bucket_id,name) select 'pos-emissioni',f.azienda::text||'/'||(f.e->>'id')||'/'||(f.e->>'token')||'/'||n from prova_emissione f cross join unnest(array['POS.pdf','modello.html','manifest.json','fascicolo.zip'])n;
do $$ declare f record; begin
 select * into f from prova_emissione;
 begin perform public.pos_completa_emissione((f.e->>'id')::uuid,(f.e->>'token')::uuid,f.actor,'TEST',f.m,repeat('b',64),repeat('c',64));raise exception 'ASSERT: file mancante non blocca emissione'; exception when raise_exception then if sqlerrm not like 'Il pacchetto non contiene%' then raise;end if;end;
 if exists(select 1 from public.pos_documents where id=f.pos and status='approvato') then raise exception 'ASSERT: approvazione parziale conservata';end if;
end $$;
insert into storage.objects(bucket_id,name) select 'pos-emissioni',azienda::text||'/'||(e->>'id')||'/'||(e->>'token')||'/fonti.json' from prova_emissione;
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true) from prova_emissione;
set local role authenticated;
do $$ declare f record; begin
 select * into f from prova_emissione;
 if exists(select 1 from storage.objects where bucket_id='pos-emissioni' and name like f.azienda::text||'/'||(f.e->>'id')||'/%') then raise exception 'ASSERT: file in preparazione visibile';end if;
 begin perform public.pos_completa_emissione((f.e->>'id')::uuid,(f.e->>'token')::uuid,f.actor,'TEST',f.m,repeat('b',64),repeat('c',64));raise exception 'ASSERT: client può completare emissione';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- A concurrent edit after reservation prevents approval and preserves the draft.
update public.pos_documents set updated_at=clock_timestamp()+interval '1 second' where id=(select pos from prova_emissione);
do $$ declare f record;begin
 select * into f from prova_emissione;
 begin perform public.pos_completa_emissione((f.e->>'id')::uuid,(f.e->>'token')::uuid,f.actor,'TEST',f.m,repeat('b',64),repeat('c',64));raise exception 'ASSERT: bozza modificata approvata';exception when serialization_failure then null;end;
end $$;
update public.pos_documents p set updated_at=f.atteso from prova_emissione f where p.id=f.pos;
select public.pos_completa_emissione((e->>'id')::uuid,(e->>'token')::uuid,actor,'TEST SINTETICO',m,repeat('b',64),repeat('c',64)) from prova_emissione;
do $$ declare f record;begin
 select * into f from prova_emissione;
 if not exists(select 1 from public.pos_documents where id=f.pos and status='approvato' and emissione_id=(f.e->>'id')::uuid) then raise exception 'ASSERT: collegamento approvazione assente';end if;
 if not exists(select 1 from public.pos_emissioni where id=(f.e->>'id')::uuid and stato='completa' and snapshot_id is not null) then raise exception 'ASSERT: contenuto storico non collegato';end if;
 begin update public.pos_emissioni set manifest='{}' where id=(f.e->>'id')::uuid;raise exception 'ASSERT: emissione modificabile';exception when raise_exception then if sqlerrm not like 'L’emissione POS completata%' then raise;end if;end;
 begin update storage.objects set metadata='{"alterato":true}' where bucket_id='pos-emissioni' and name=f.azienda::text||'/'||(f.e->>'id')||'/'||(f.e->>'token')||'/POS.pdf';raise exception 'ASSERT: file emesso sovrascrivibile';exception when raise_exception then if sqlerrm not like 'I file di un’emissione completata%' then raise;end if;end;
 begin delete from public.pos_emissioni where id=(f.e->>'id')::uuid;raise exception 'ASSERT: emissione cancellabile';exception when raise_exception then if sqlerrm not like 'L’emissione POS completata%' then raise;end if;end;
end $$;
set local role authenticated;
do $$ declare f record;begin
 select * into f from prova_emissione;
 if (select count(*) from storage.objects where bucket_id='pos-emissioni' and name like f.azienda::text||'/'||(f.e->>'id')||'/%')<>5 then raise exception 'ASSERT: file completi non leggibili dall’operatore';end if;
 perform public.pos_apri_revisione(f.pos,'TEST REVISIONE DOPO EMISSIONE',(select updated_at from public.pos_documents where id=f.pos));
 if exists(select 1 from public.pos_documents where id=f.pos and emissione_id is not null) then raise exception 'ASSERT: nuova bozza eredita emissione precedente';end if;
end $$;
reset role;
-- Read-only safety staff cannot start a new emission even through the trusted service RPC.
update public.staff_permissions sp set sola_lettura=true from prova_emissione f where sp.user_id=f.actor and sp.company_id=f.azienda;
do $$ declare f record;begin
 select * into f from prova_emissione;
 begin perform public.pos_prenota_emissione(f.pos,f.actor,(select updated_at from public.pos_documents where id=f.pos));raise exception 'ASSERT: sola lettura può preparare approvazioni';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin if exists(select 1 from public.pos_emissioni where id=(select (e->>'id')::uuid from prova_emissione)) then raise exception 'ASSERT: emissione visibile senza appartenenza';end if;
 if exists(select 1 from storage.objects where bucket_id='pos-emissioni' and name like (select azienda::text||'/'||(e->>'id')||'/%' from prova_emissione)) then raise exception 'ASSERT: file visibili senza appartenenza';end if;end $$;
reset role;
rollback;
select 'PASS: prenotazione concorrente, file mancanti, client escluso dal completamento, bozza cambiata, emissione/file immutabili, lettura autorizzata e nuova revisione senza eredità; tutto annullato' as risultato;
