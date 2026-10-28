-- Demo-only rollback verification. Never approves or emits a real POS.
begin;
set local lock_timeout='3s';set local statement_timeout='60s';

do $test$
declare p public.pos_documents;c jsonb;r jsonb;begin
select * into p from public.pos_documents where id='19d9252b-5395-4f39-b2eb-9317a6f8710b';
if p.contenuto->'procedure_psc'->'documento' is null then raise exception 'Manca il riferimento del collaudo';end if;
c:=jsonb_set(p.contenuto,'{versione_psc}','1'::jsonb);
r:=public.pos_psc_verifica(p.company_id,p.order_id,c,p.created_by);
if r is distinct from c->'procedure_psc'->'documento' then raise exception 'Fonte valida non riconosciuta';end if;
begin perform public.pos_psc_verifica(p.company_id,'ca271026-0002-4000-a000-000000000002',c,p.created_by);raise exception 'TEST mancante: altra commessa accettata';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
begin perform public.pos_psc_verifica(p.company_id,p.order_id,jsonb_set(c,'{procedure_psc,documento,titolo}','"TITOLO CAMBIATO"'::jsonb),p.created_by);raise exception 'TEST mancante: titolo cambiato accettato';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
begin perform public.pos_psc_verifica(p.company_id,p.order_id,c,null);raise exception 'TEST mancante: autore assente accettato';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
update public.pos_documents set contenuto=c where id=p.id;
begin update public.pos_documents set contenuto=c-'versione_psc' where id=p.id;raise exception 'TEST mancante: downgrade accettato';exception when serialization_failure then null;end;
if has_function_privilege('anon','public.pos_psc_verifica(uuid,uuid,jsonb,uuid)','EXECUTE') or has_function_privilege('authenticated','public.pos_psc_verifica(uuid,uuid,jsonb,uuid)','EXECUTE') then raise exception 'Helper PSC esposto';end if;
end $test$;
select 'PSC: 6 controlli nativi superati, transazione annullata' as esito;


create temporary table psc_pacchetto_test as select * from public.pos_emissioni with no data;
create trigger psc_test before insert on psc_pacchetto_test for each row execute function public.pos_psc_pacchetto_guardia();
do $test$
declare p public.pos_documents;r jsonb;m jsonb;bucket text;begin
select * into p from public.pos_documents where id='19d9252b-5395-4f39-b2eb-9317a6f8710b';
r:=p.contenuto->'procedure_psc'->'documento';
bucket:=case when r->>'archivio'='sicurezza_documenti' then 'sicurezza-documenti' else 'fascicoli-cantiere' end;
m:=jsonb_build_object('psc',r,'file',jsonb_build_array(jsonb_build_object('tipo','psc','ruolo','allegato','evidenza_id',r->>'id','sha256',r->>'sha256','fonte',jsonb_build_object('bucket',bucket,'path',r->>'file_path'))));
insert into psc_pacchetto_test(pos_id,stato,origine,emessa_da,manifest) values(p.id,'completa','approvazione_corrente',p.created_by,m);
begin insert into psc_pacchetto_test(pos_id,stato,origine,emessa_da,manifest)values(p.id,'completa','approvazione_corrente',p.created_by,jsonb_set(m,'{file}','[]'));raise exception 'TEST mancante: originale omesso accettato';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
begin insert into psc_pacchetto_test(pos_id,stato,origine,emessa_da,manifest)values(p.id,'completa','approvazione_corrente',p.created_by,jsonb_set(m,'{file,0,sha256}',to_jsonb(repeat('b',64))));raise exception 'TEST mancante: impronta alterata accettata';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
end $test$;
select 'PSC: pacchetto valido, originale omesso e SHA alterata verificati su tabella temporanea; nessuna emissione reale' as esito;

rollback;
